// Permanent items' activations against the stand-in for Foundry: the sheet's Activate button (its request to the GM's
// client) posts that activation's card and counts its use against its frequency.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { activationButtonsHTML, periodOf, usesNow, withUse } from "../src/live/activations-card.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 80 squares down.)
const foundry = await fakeFoundry();
const elf = foundry.makeActor({ id: "activate-elf", name: "Elf", owners: ["player"] });
foundry.place(elf, 0, 8000);

// A sheet's Activate button pressed by the player (sent to the GM's client by socket).
async function activate(item, index = 0, userId = "player") {
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: index, userId });
    await settle();
    return foundry.messages.slice(count);
}

test("uses counted per period of world time", () => {
    const daily = { max: 1, per: "day" };
    assert.equal(periodOf(daily, { worldTime: 86_400 * 3 + 5 }), "day:3");
    let record = withUse({}, 0, daily, { worldTime: 100 });
    assert.equal(usesNow(record, 0, daily, { worldTime: 200 }), 1);
    assert.equal(usesNow(record, 0, daily, { worldTime: 86_500 }), 0, "a new day");
    record = withUse(record, 0, daily, { worldTime: 300 });
    assert.equal(usesNow(record, 0, daily, { worldTime: 400 }), 2);
    assert.equal(periodOf({ max: 1, per: "encounter" }, { combatId: "c1" }), "combat:c1");
});

test("the sheet's buttons: one per activation, its time, frequency and uses in the tooltip", () => {
    const html = activationButtonsHTML([{ index: 0, name: null, time: "2", frequency: { max: 1, per: "day" } }], { itemName: "Cloak of Elvenkind", record: { 0: { period: "day:0", count: 1 } }, now: { worldTime: 100 } });
    assert.match(html, /data-air-activate="0"/);
    assert.match(html, /Activate: Cloak of Elvenkind \(2 actions, once per day; used 1 of 1 this day\)/);
});

test("a cloak of elvenkind's Activate button: its activation's card (a cast of Invisibility), its daily use counted, a warning over it", async () => {
    const cloak = foundry.giveItem(elf, source("Cloak of Elvenkind"));
    const posted = await activate(cloak, 0);
    const cast = posted.find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    assert.ok(cast, "the activation's own card: a cast");
    assert.equal(cast.flags[MODULE_ID].card.plan.spell.name, "Invisibility");
    assert.equal(cast.flags[MODULE_ID].card.item.name, "Cloak of Elvenkind");
    assert.equal(cloak.getFlag(MODULE_ID, "activationUses")[0].count, 1);
    // Again the same day: a warning to the GM, still activated (the GM's call).
    const again = await activate(cloak, 0);
    const warning = again.find((message) => /activated again, though it&#39;s once per day/.test(message.content) || /activated again, though it's once per day/.test(message.content));
    assert.ok(warning, "the GM's warning");
    assert.deepEqual(warning.whisper, ["gm"]);
    assert.ok(again.some((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast"));
});

test("only the item's owner or the GM activates it; an item with nothing read has nothing to activate", async () => {
    const stranger = foundry.makeActor({ id: "activate-stranger", name: "Stranger" });
    const cloak = foundry.giveItem(stranger, source("Cloak of Elvenkind"));
    assert.deepEqual(await activate(cloak, 0, "player"), [], "not the player's");
    assert.ok((await activate(cloak, 0, "gm")).some((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast"), "the GM's");
    const plain = foundry.giveItem(elf, { ...source("Cloak of Elvenkind"), _id: "plainCloak1234567", system: { ...source("Cloak of Elvenkind").system, description: { value: "<p>No activation.</p>" } } });
    const errors = foundry.notifications.length;
    assert.deepEqual(await activate(plain, 0), []);
    assert.ok(foundry.notifications.slice(errors).some((text) => /isn't there any more/.test(text)));
});

test("Urn of Ashes: its bolt at its user's spell attack or its own +15, whichever is higher", async () => {
    const mystic = foundry.makeActor({ id: "activate-mystic", name: "Mystic", owners: ["player"] });
    foundry.place(mystic, 300, 8000);
    const urn = foundry.giveItem(mystic, source("Urn of Ashes"));
    // No spell attack, or a lower one: the urn's +15.
    let [card] = (await activate(urn, 1)).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices, [{ kind: "spell", label: "The item's +15", modifier: 15 }]);
    mystic.spellcasting = { contents: [{ statistic: { check: { mod: 12 } } }] };
    [card] = (await activate(urn, 1)).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices.map((choice) => choice.modifier), [15]);
    // A higher one: its own.
    mystic.spellcasting = { contents: [{ statistic: { check: { mod: 19 } } }] };
    [card] = (await activate(urn, 1)).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices, [{ kind: "spell", label: "Spell attack +19", modifier: 19 }]);
    assert.deepEqual([card.flags[MODULE_ID].card.plan.resolution.sharedDamage.components[0].formula, card.flags[MODULE_ID].card.plan.targeting.range], ["4d4", "30 feet"]);
});

test("Clockwork Helm: its beam at its user's spell attack or best ranged Strike, the card's pick", async () => {
    const tinker = foundry.makeActor({ id: "activate-tinker", name: "Tinker", owners: ["player"] });
    foundry.place(tinker, 400, 8000);
    tinker.spellcasting = { contents: [{ statistic: { check: { mod: 11 } } }] };
    tinker.system.actions = [{ item: { isRanged: true }, totalModifier: 13 }, { item: { isRanged: false }, totalModifier: 16 }];
    const helm = foundry.giveItem(tinker, source("Clockwork Helm"));
    const [card] = (await activate(helm, 0)).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices.map((choice) => choice.label), ["Spell attack +11", "Ranged attack +13"]);
});

test("Words of Wisdom: the phrase's skill picked on the card — its +1 item bonus and \"a critical failure becomes a failure\" on that skill and Diplomacy, for the minute; the plan whole", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const plan = compileActivations(source("Words of Wisdom (Lesser)"))[0].plan;
    assert.deepEqual([plan.item.skillPick.skills, plan.item.skillPick.modifier, plan.item.skillPick.degree.selectors, plan.partial], [["intimidation", "deception", "performance"], { value: 1, type: "item" }, ["diplomacy"], undefined]);
    const speaker = foundry.makeActor({ id: "activate-speaker", name: "Speaker", owners: ["player"] });
    foundry.place(speaker, 500, 8000);
    const tattoo = foundry.giveItem(speaker, source("Words of Wisdom (Lesser)"));
    const [card] = (await activate(tattoo, 0)).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /Its skill: <select data-air-field="skillPick">/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, skillPick: 1, userId: "player" });
    await settle();
    const effect = speaker.itemTypes.effect.find((entry) => entry.flags?.[MODULE_ID]?.skillPick);
    assert.deepEqual(effect?.system.rules.map((rule) => [rule.key, rule.selector]), [["FlatModifier", "deception"], ["AdjustDegreeOfSuccess", "diplomacy"], ["AdjustDegreeOfSuccess", "deception"]]);
});

test("Smoldering Armor's second activation recharges its first: the fire shield activation's use today given back on the item's record", async () => {
    const armor = foundry.giveItem(elf, source("Smoldering Armor"));
    await activate(armor, 0);
    assert.equal(armor.getFlag(MODULE_ID, "activationUses")[0].count, 1, "Fire Shield used");
    const posted = await activate(armor, 1);
    const card = posted.find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.ok(card, "the recharge's item card");
    assert.match(card.content, /The fire shield activation recharges/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.deepEqual([armor.getFlag(MODULE_ID, "activationUses")[0], armor.getFlag(MODULE_ID, "activationUses")[1]?.count], [undefined, 1], "the first given back, the second counted");
});

test("an activation's own wait (src/compiler/cooldown.js): Storm Hammer's 10 minutes kept on the item and told, the GM warned on a use before then; Retrieval Belt's shared by both activations", async () => {
    const { rechargeLeft, waitText } = await import("../src/live/activations-card.js");
    const hammer = foundry.giveItem(elf, source("Storm Hammer"));
    const first = await activate(hammer, 0);
    const waits = hammer.getFlag(MODULE_ID, "activationRecharges");
    assert.equal(rechargeLeft(waits, 0, globalThis.game.time.worldTime), 600);
    assert.ok(first.some((message) => /usable again in 10 minutes/.test(message.content)), "told when it's usable again");
    const again = await activate(hammer, 0);
    assert.ok(again.some((message) => /activated again, though it(?:&#39;|')s usable again only in 10 minutes/.test(message.content)), "the GM's warning");
    const belt = foundry.giveItem(elf, source("Retrieval Belt"));
    await activate(belt, 0);
    const shared = belt.getFlag(MODULE_ID, "activationRecharges");
    assert.deepEqual([rechargeLeft(shared, 0, globalThis.game.time.worldTime), rechargeLeft(shared, 1, globalThis.game.time.worldTime)], [60, 60]);
    assert.equal(waitText(7), "2 rounds");
});

test("the waits read (src/compiler/cooldown.js): each as the text says, rolled ones as formulas; not one that starts as the effect ends", async () => {
    const { readCooldown } = await import("../src/compiler/cooldown.js");
    assert.deepEqual(readCooldown("Neither Store Item nor Retrieve Item can be activated again for 1 minute."), { value: 1, unit: "minutes", names: ["Store Item", "Retrieve Item"] });
    assert.deepEqual(readCooldown("Regardless of the result, the rod of cancellation can't be activated again for 2d6 hours."), { formula: "2d6", unit: "hours" });
    assert.deepEqual(readCooldown("After you activate the bow, you can't activate it again for 7 days."), { value: 7, unit: "days" });
    assert.deepEqual(readCooldown("You can't Retrieve Item again for 1 minute."), { value: 1, unit: "minutes", names: ["Retrieve Item"] });
    assert.equal(readCooldown("Once deactivated, the forge can't be activated again for 4 hours."), null);
    assert.equal(readCooldown("When the activation ends, the broom floats to the ground and can't be activated again for 1 hour."), null);
});
