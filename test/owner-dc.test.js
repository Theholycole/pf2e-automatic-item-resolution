// Saves against the owner's own DC (PF2e's "@Check[reflex|against:class-spell]": the harrow cards, Penultimate Heartbeat,
// Lung Bloodstone's Admonish): read with a stand-in, then the core's against { dc: "owner" }, and live play fills in the
// owner's class DC or spell DC from PF2e's attributes.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { fillOwnerDCs, hasOwnerDC, withItemData } from "../src/compiler/item-data.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const activation = (name, which = null) => compileActivations(source(name)).find((entry) => !which || entry.activation.name === which);

// (Shared with the other flow tests: these creatures stand 250 squares down.)
const foundry = await fakeFoundry();
const reader = foundry.makeActor({ id: "owner-reader", name: "Reader", owners: ["player"] });
const foe = foundry.makeActor({ id: "owner-foe", name: "Foe" });
const nobody = foundry.makeActor({ id: "owner-nobody", name: "Nobody", owners: ["player"] });
foundry.place(reader, 0, 25000);
foundry.place(foe, 100, 25000);
foundry.place(nobody, 200, 25000);
reader.system.attributes.classDC = { value: 24 };
reader.system.attributes.spellDC = { value: 27 };

test("the reading: the owner's DC as the core's { dc: \"owner\" }, with the item's rows read in full", () => {
    assert.match(withItemData("<p>@Check[will|against:class|basic]</p>"), /@Check\[will\|dc:9001\|basic\]/);
    // (A save link with its DC first and its type named, as some modules write it: put in PF2e's order.)
    assert.equal(withItemData("<p>@Check[dc:28|type:fortitude|basic] and @Check[dc:21|type:will]</p>"), "<p>@Check[fortitude|dc:28|basic] and @Check[will|dc:21]</p>");
    // The Avalanche: a Reflex save against the class or spell DC, its damage, push, prone and restrained.
    const avalanche = activation("The Avalanche").plan;
    assert.deepEqual(avalanche.resolution.check.against, { dc: "owner", statistic: "class-spell" });
    assert.deepEqual(avalanche.resolution.outcomes.failure.effects.map((effect) => effect.slug), ["prone", "restrained"]);
    assert.equal(/900[123]/.test(JSON.stringify(avalanche)), false, "no stand-in left");
    assert.equal(routeOf(avalanche, plainText(activation("The Avalanche").activation.html)), "save");
    // Lung Bloodstone of Arazni's Admonish: the class DC alone.
    assert.deepEqual(activation("Lung Bloodstone of Arazni", "Admonish").plan.resolution.check.against, { dc: "owner", statistic: "class" });
    // A consumable too: Penultimate Heartbeat's frightened.
    const heartbeat = compileItem(source("Penultimate Heartbeat"));
    assert.deepEqual([heartbeat.resolution.check.against, heartbeat.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.value])], [{ dc: "owner", statistic: "class-spell" }, [["frightened", 2]]]);
    // A spell cast at the owner's DC (The Cyclone): the cast's DC, filled in live.
    const cyclone = activation("The Cyclone").plan;
    assert.deepEqual([cyclone.builtin, cyclone.dc, cyclone.ownerDC], ["cast-spell", null, "class-spell"]);
});

test("filling in: the higher of the class and spell DCs, the class DC alone, or none", () => {
    const avalanche = activation("The Avalanche").plan;
    assert.equal(hasOwnerDC(avalanche), true);
    assert.deepEqual(fillOwnerDCs(avalanche, { class: 24, spell: 27 }).plan.resolution.check.against, { dc: "fixed", value: 27 });
    assert.deepEqual(fillOwnerDCs(activation("Lung Bloodstone of Arazni", "Admonish").plan, { class: 24, spell: 27 }).plan.resolution.check.against, { dc: "fixed", value: 24 });
    assert.equal(fillOwnerDCs(avalanche, { class: null, spell: null }).missing, true);
    assert.deepEqual([fillOwnerDCs(activation("The Cyclone").plan, { class: 24, spell: 27 }).plan.dc, fillOwnerDCs(activation("The Cyclone").plan, {}).missing], [27, false], "a cast without one: the spell module's own DC");
});

test("live: the card's save is at the owner's DC; with no DC of theirs, the GM is told", async () => {
    const use = async (actor, id) => {
        const item = foundry.giveItem(actor, { ...source("Penultimate Heartbeat"), _id: id });
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: null, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        return message;
    };
    const message = await use(reader, "ownerHeartbeat01");
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.equal(card.flags[MODULE_ID].card.plan.resolution.check.against.value, 27);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [foe.token.uuid] });
    await settle();
    assert.deepEqual(foundry.posted.slice(before)[0].plan.resolution.check.against, { dc: "fixed", value: 27 });
    const none = await use(nobody, "ownerHeartbeat02");
    const told = foundry.messages[foundry.messages.indexOf(none) + 1];
    assert.match(told.content, /has neither\. Roll it by hand/);
});

test("the world setting for item DCs: each save others attempt against the item's own DC, and a cast's DC, at its user's class or spell DC when higher — a note saying so — never a flat check, nor a DC already higher", async () => {
    const { raiseItemDCs } = await import("../src/compiler/item-data.js");
    const plan = { resolution: { kind: "save", check: { roll: "save", statistic: "reflex", against: { dc: "fixed", value: 18 } } }, strike: { save: { resolution: { check: { roll: "save", against: { dc: "fixed", value: 25 } } } } }, flat: { check: { roll: "flat", against: { dc: "fixed", value: 5 } } } };
    const { plan: raised, raised: changes } = raiseItemDCs(plan, { class: 22, spell: 20 });
    assert.deepEqual([raised.resolution.check.against.value, raised.strike.save.resolution.check.against.value, raised.flat.check.against.value, changes], [22, 25, 5, [{ from: 18, to: 22, which: "class" }]]);
    assert.deepEqual(raised.notes, ["Its DC is 22, its user's class DC, over the item's own 18 (the world setting)."]);
    const cast = raiseItemDCs({ builtin: "cast-spell", dc: 19, choices: [{ dc: 19 }, { dc: null }] }, { spell: 24 }).plan;
    assert.deepEqual([cast.dc, cast.choices.map((choice) => choice.dc)], [24, [24, null]]);
    assert.equal(raiseItemDCs(plan, {}).plan, plan, "no DC of its user's: the same plan");
});

test("live, the setting on: Spark Wafer's DC 14 Reflex save posted at its user's spell DC 27; off, the item's 14", async () => {
    const use = async (actor, id) => {
        const item = foundry.giveItem(actor, { ...source("Spark Wafer"), _id: id });
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: null, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        return foundry.messages[foundry.messages.indexOf(message) + 1];
    };
    const settings = globalThis.game.settings;
    globalThis.game.settings = { get: (module, key) => module === MODULE_ID && key === "itemDCsFromUser" };
    try {
        const card = await use(reader, "ownerWafer000001");
        assert.equal(card.flags[MODULE_ID].card.plan.resolution.check.against.value, 27);
        assert.ok(card.flags[MODULE_ID].card.plan.notes.some((note) => /its user's spell DC, over the item's own 14/.test(note)));
    } finally {
        globalThis.game.settings = settings;
    }
    const off = await use(reader, "ownerWafer000002");
    assert.equal(off.flags[MODULE_ID].card.plan.resolution.check.against.value, 14);
});

test("poisons and alchemists: the setting raises Black Adder Venom's 18 to its user's spell DC 27, and to 31 with Potent Poisoner's +4; setting or not, an alchemist's infused item saves at their alchemist class DC (PF2e's Powerful Alchemy)", async () => {
    const { isPoison } = await import("../scripts/item-dcs.js");
    assert.deepEqual([isPoison(source("Black Adder Venom")), isPoison(source("Spark Wafer")), isPoison({ system: { traits: { value: ["poison", "inhaled"] } } })], [true, false, true]);
    const post = async (actor, data) => {
        const item = foundry.giveItem(actor, data);
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: null, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        const plan = foundry.messages[foundry.messages.indexOf(message) + 1].flags[MODULE_ID].card.plan;
        return { dc: Number(JSON.stringify(plan).match(/"dc":"fixed","value":(\d+)/)?.[1]), notes: plan.notes ?? [] };
    };
    const venom = (id, traits = null) => ({ ...source("Black Adder Venom"), _id: id, ...(traits ? { system: { ...source("Black Adder Venom").system, traits: { ...source("Black Adder Venom").system.traits, value: [...source("Black Adder Venom").system.traits.value, ...traits] } } } : {}) });
    const settings = globalThis.game.settings;
    globalThis.game.settings = { get: (module, key) => module === MODULE_ID && key === "itemDCsFromUser" };
    try {
        assert.equal((await post(reader, venom("ownerVenom000001"))).dc, 27);
        reader.created.push({ id: "feat-potent", type: "feat", name: "Potent Poisoner", system: { slug: "potent-poisoner" } });
        const potent = await post(reader, venom("ownerVenom000002"));
        assert.equal(potent.dc, 31);
        assert.ok(potent.notes.includes("Its DC is 31, its user's spell DC 27 + 4 (Potent Poisoner), over the item's own 18 (the world setting)."), JSON.stringify(potent.notes));
        // (Not a poison: no +4.)
        reader.created = reader.created.filter((entry) => entry.id !== "feat-potent");
    } finally {
        globalThis.game.settings = settings;
    }
    // The setting off: the printed DC, unless it's an alchemist's infused item.
    const alchemist = foundry.makeActor({ id: "owner-alchemist", name: "Alchemist", owners: ["player"] });
    foundry.place(alchemist, 200, 12000);
    alchemist.classDCs = { alchemist: { dc: { value: 25 } } };
    assert.equal((await post(alchemist, venom("ownerVenom000003", ["infused"]))).dc, 18, "without Powerful Alchemy");
    alchemist.created.push({ id: "feature-powerful", type: "feat", name: "Powerful Alchemy", system: { slug: "powerful-alchemy" } });
    const infused = await post(alchemist, venom("ownerVenom000004", ["infused"]));
    assert.equal(infused.dc, 25);
    assert.ok(infused.notes.includes("Its DC is 25, its user's alchemist class DC, over the item's own 18 (Powerful Alchemy, an infused item)."), JSON.stringify(infused.notes));
    assert.equal((await post(alchemist, venom("ownerVenom000005"))).dc, 18, "not infused");
});
