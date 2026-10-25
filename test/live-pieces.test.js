// Live-play pieces for docs/needs.md (2026-10-25), against the stand-in for Foundry: a Mythic Point given back once the card applies (Preordained
// Spear), the allies' own Effect within its feet of the user (Belt of the Five Kings), a rage-long retaliation refused once the rage is over
// (Instinct Crown (Dragon)), and a light placed in its user's square, gone when its time is up (Flare Beacon).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { expireLights, placeLight } from "../scripts/placed-light.js";
import { placeAfterApplied } from "../scripts/placed-moves.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 330 squares down.)
const foundry = await fakeFoundry();
const lancer = foundry.makeActor({ id: "pieces-lancer", name: "Lancer", owners: ["player"] });
const near = foundry.makeActor({ id: "pieces-near", name: "Near Ally" });
const far = foundry.makeActor({ id: "pieces-far", name: "Far Ally" });
foundry.place(lancer, 0, 33000);
foundry.place(near, 200, 33000);
foundry.place(far, 1000, 33000);

async function activated(actor, name, index = 0) {
    const item = foundry.giveItem(actor, source(name));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: index, userId: "player" });
    await settle();
    return foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card);
}

test("Preordained Spear: its doomed lowered and its Mythic Point given back once the card applies, up to the maximum", async () => {
    lancer.conditions.set("doomed", 2);
    lancer.system.resources.mythicPoints = { value: 1, max: 3 };
    const card = await activated(lancer, "Preordained Spear");
    assert.match(card.content, /Gives back 1 Mythic Point/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.deepEqual([lancer.conditions.get("doomed"), lancer.system.resources.mythicPoints.value], [1, 2]);
    assert.ok(foundry.messages.some((message) => /Lancer regains 1 Mythic Point \(2 of 3\)/.test(message.content)));
    // (At its maximum: none regained, and said so.)
    lancer.system.resources.mythicPoints.value = 3;
    const again = await activated(lancer, "Preordained Spear");
    await foundry.socket(SOCKET)({ action: "apply", messageId: again.id, userId: "player" });
    await settle();
    assert.equal(lancer.system.resources.mythicPoints.value, 3);
    assert.ok(foundry.messages.some((message) => /Mythic Points are full \(3 of 3\): none regained/.test(message.content)));
});

test("Belt of the Five Kings: its wearer's Effect, and the allies' own on each ally within 20 feet of it", async () => {
    const plan = compileActivations(source("Belt of the Five Kings"))[0].plan;
    assert.deepEqual([plan.allyLinks.map((link) => [link.label, link.radius]), plan.partial], [[["Belt of the Five Kings (Allies)", 20]], undefined]);
    const card = await activated(lancer, "Belt of the Five Kings");
    assert.match(card.content, /Belt of the Five Kings \(Allies\) on each ally within 20 feet of you/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const has = (actor, name) => actor.created.some((entry) => entry.name === name);
    assert.deepEqual([has(lancer, "Effect: Belt of the Five Kings (Wearer)"), has(near, "Effect: Belt of the Five Kings (Allies)"), has(far, "Effect: Belt of the Five Kings (Allies)"), has(lancer, "Effect: Belt of the Five Kings (Allies)")], [true, true, false, false]);
});

test("Instinct Crown (Dragon): its retaliation card is open while its user rages, refused once the rage is over", async () => {
    const card = await activated(lancer, "Instinct Crown (Dragon)", 1);
    assert.equal(card.flags[MODULE_ID].card.plan.retaliation.untilRage, true);
    assert.match(card.content, /It stays open until Lancer(?:'|&#39;)s rage ends/);
    // (Not raging: Apply refuses, and the card closes.)
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [near.token.uuid] });
    await settle();
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
    assert.match(card.flags[MODULE_ID].card.results.at(-1), /Lancer isn't raging: Instinct Crown \(Dragon\)'s retaliation is over/);
});

test("Flare Beacon: its light, bright and dim in feet, at its user's square for its minute; gone once the world's time passes that", async () => {
    const plan = compileItem(source("Flare Beacon (Lesser)"));
    assert.deepEqual([plan.item.placedLight.bright, plan.item.placedLight.dim, plan.item.placedLight.duration.value, plan.partial, plan.notes], [20, 40, 1, undefined, undefined]);
    // (A scene of its own, as Foundry's: its lights, made and deleted.)
    const lights = [];
    const scene = {
        id: "pieces-scene",
        grid: { size: 100 },
        lights: { contents: lights },
        async createEmbeddedDocuments(type, data) {
            const made = data.map((entry, index) => ({ ...structuredClone(entry), id: `light${lights.length + index}`, type }));
            lights.push(...made);
            return made;
        },
        async deleteEmbeddedDocuments(type, ids) {
            for (const id of ids) lights.splice(lights.findIndex((entry) => entry.id === id), 1);
        }
    };
    const token = { document: { parent: scene, x: 300, y: 400, width: 1, height: 1, name: "Lancer" } };
    globalThis.game.time.worldTime = 1000;
    await placeLight(plan.item.placedLight, { token, actor: lancer, item: { name: "Flare Beacon (Lesser)" } });
    assert.deepEqual([lights.length, lights[0].x, lights[0].y, lights[0].config, lights[0].flags[MODULE_ID].placedLight.endsAt], [1, 350, 450, { bright: 20, dim: 40 }, 1060]);
    assert.ok(foundry.messages.some((message) => /its light \(bright 20 feet, dim 40 feet\) is placed at Lancer's square for 1 minute/.test(message.content)));
    const scenes = globalThis.game.scenes;
    globalThis.game.scenes = [scene];
    await expireLights(1059);
    assert.equal(lights.length, 1);
    await expireLights(1060);
    assert.equal(lights.length, 0);
    globalThis.game.scenes = scenes;
});

test("Spirit Fan: its living target healed instead of a save, its undead one's save card; Lance of Sun's Radiance's dragons at 6d12 spirit", async () => {
    const { planFor } = await import("../src/live/if-target.js");
    const fan = compileActivations(source("Spirit Fan"))[0].plan;
    assert.deepEqual([fan.ifTarget, fan.partial], [[{ living: true, heal: "3d8+8" }], undefined]);
    const living = foundry.makeActor({ id: "pieces-living", name: "Living Ally", hp: 10, max: 30 });
    const undead = foundry.makeActor({ id: "pieces-undead", name: "Ghoul", undead: true });
    foundry.place(living, 300, 34000);
    foundry.place(undead, 400, 34000);
    const card = await activated(lancer, "Spirit Fan");
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [living.token.uuid, undead.token.uuid] });
    await settle();
    // (The stand-in's dice total 7.)
    assert.equal(living.system.attributes.hp.value, 17);
    const cards = foundry.posted.slice(before);
    assert.deepEqual([cards.length, cards[0].tokens.map((token) => token.actor?.name ?? token.name), cards[0].plan.kindHeal], [1, ["Ghoul"], undefined]);
    assert.ok(card.flags[MODULE_ID].card.results.some((line) => /^Living Ally regains 7 Hit Points.*instead of the save/.test(line)), card.flags[MODULE_ID].card.results.join(" | "));
    const lance = compileActivations(source("Lance of Sun's Radiance"))[1].plan;
    assert.deepEqual([lance.partial, planFor(lance, { system: { traits: { value: ["dragon"] } } }).resolution.sharedDamage.components[0].formula, planFor(lance, { system: { traits: { value: ["humanoid"] } } }).resolution.sharedDamage.components[0].formula], [undefined, "6d12[spirit]", "6d8[spirit]"]);
});

test("Pharasmin Visor: its user Dazzled until the start of its next turn as it's used, beside the undead's save card", async () => {
    const visor = compileActivations(source("Pharasmin Visor"))[0].plan;
    assert.deepEqual([visor.userEffects, visor.partial], [[{ slug: "dazzled", value: null, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" } }], undefined]);
    const before = foundry.applied.length;
    await activated(lancer, "Pharasmin Visor");
    const change = foundry.applied.slice(before).find((entry) => entry.change.op === "condition")?.change;
    assert.deepEqual([change?.slug, change?.target, change?.duration?.expiry], ["dazzled", "source", "turn-start"]);
});

test("Staff of Sun Wukong's Meteor Slam: its damage and Enfeebled on the creature targeted, and the save card for the others within 10 feet but its wielder", async () => {
    const slam = compileActivations(source("Staff of Sun Wukong"))[0].plan;
    assert.deepEqual([slam.resolution.check.roll, slam.resolution.sharedDamage.components[0].formula, slam.resolution.outcomes.success.effects[0].slug, slam.around[0].radius, slam.around[0].notUser, slam.partial], ["automatic", "10d10[bludgeoning]", "enfeebled", 10, true, undefined]);
    const wielder = foundry.makeActor({ id: "pieces-wielder", name: "Wielder", owners: ["player"] });
    const struck = foundry.makeActor({ id: "pieces-struck", name: "Struck" });
    const beside = foundry.makeActor({ id: "pieces-beside", name: "Beside" });
    foundry.place(wielder, 0, 35000);
    foundry.place(struck, 100, 35000);
    foundry.place(beside, 200, 35000);
    const card = await activated(wielder, "Staff of Sun Wukong");
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [struck.token.uuid] });
    await settle();
    const cards = foundry.posted.slice(before);
    assert.deepEqual(cards.map((entry) => [entry.plan.resolution.check.roll, entry.tokens.map((token) => token.actor?.name ?? token.name)]), [["automatic", ["Struck"]], ["save", ["Beside"]]]);
});

test("Horned Lion Amulet: two ways, its triggering damage plain fire (its Effect) or persistent fire (both Effects and the DC 10 flat check)", () => {
    const amulet = compileItem(source("Horned Lion Amulet"));
    assert.deepEqual([amulet.builtin, amulet.once, amulet.partial], ["ways", true, undefined]);
    assert.deepEqual(amulet.ways.map((way) => [way.name, way.plan.resolution.applications.map((entry) => entry.label), way.plan.item.recovery ?? null]), [["Fire damage", ["Effect: Horned Lion Amulet"], null], ["Persistent fire damage", ["Effect: Horned Lion Amulet", "Effect: Horned Lion Amulet Recovery"], { types: ["fire"], dc: 10 }]]);
});

test("Steamflight Pack: its fly Speed of 20 feet on, for its 20 minutes of water; its switch again turns it off", async () => {
    const pilot = foundry.makeActor({ id: "pieces-pilot", name: "Pilot", owners: ["player"] });
    foundry.place(pilot, 0, 36000);
    const pack = foundry.giveItem(pilot, source("Steamflight Pack"));
    const press = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: pack.uuid, activation: 1, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const on = await press();
    assert.match(on.content, /A fly Speed of 20 feet for 20 minutes \(the item&#39;s next activation turns it off\)|A fly Speed of 20 feet for 20 minutes \(the item's next activation turns it off\)/);
    const speed = () => pilot.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.speed === "fly");
    assert.equal(speed().length, 1);
    const off = await press();
    assert.equal(speed().length, 0);
    assert.ok(off.flags[MODULE_ID].card.results.some((line) => /Steamflight Pack(?:: On\/Off Switch)?'s fly Speed turned off/.test(line)), off.flags[MODULE_ID].card.results.join(" | "));
});

test("a creature moved to a space its user picks: once the ability module's card is applied, the teleport card for each creature whose degree moves it — its user the presser", async () => {
    const archer = foundry.makeActor({ id: "pieces-archer", name: "Roc Archer", owners: ["player"] });
    const mark = foundry.makeActor({ id: "pieces-mark", name: "Roc Mark" });
    const held = foundry.makeActor({ id: "pieces-held", name: "Roc Holder" });
    foundry.place(archer, 0, 34000);
    foundry.place(mark, 300, 34000);
    foundry.place(held, 600, 34000);
    const arrow = compileItem(source("Roc-Shaft Arrow (Lesser)"));
    const state = { plan: arrow.strike.save, ability: { name: "Roc-Shaft Arrow (Lesser)", uuid: null }, source: { actorUuid: archer.uuid, tokenUuid: archer.token.uuid, name: "Roc Archer" } };
    const count = foundry.messages.length;
    const posted = await placeAfterApplied({ state, targets: [{ id: "a", tokenUuid: mark.token.uuid, actorUuid: mark.uuid, name: "Roc Mark", degree: "criticalFailure" }, { id: "b", tokenUuid: held.token.uuid, actorUuid: held.uuid, name: "Roc Holder", degree: "success" }] });
    assert.equal(posted.length, 1, "the critical failure's, not the success's");
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "teleport").flags[MODULE_ID].card;
    assert.deepEqual([card.user.name, card.presser.name, card.plan.teleport.within, card.plan.teleport.place.by.name], ["Roc Mark", "Roc Archer", 20, "Roc Archer"]);
    assert.match(foundry.messages.at(-1).content, /Move Roc Mark: Up to 20 feet\./);
    assert.match(foundry.messages.at(-1).content, /Into a hazardous space, this has the incapacitation trait/);
    // (Not one of the item module's: nothing.)
    assert.deepEqual(await placeAfterApplied({ state: { plan: { resolution: {} }, source: state.source }, targets: [{ degree: "failure", tokenUuid: mark.token.uuid }] }), []);
});

test("a second card beside the first: Thunder Mail's retaliation for the next minute beside its 6d6 around its user; Panacea Fruit's counteract rank and modifier said again, not left over", () => {
    const thunder = compileActivations({ ...source("Thunder Mail"), ownerLevel: 15 })[0].plan;
    assert.deepEqual([thunder.partial, thunder.notes, thunder.alsoRetaliation.retaliation, thunder.alsoRetaliation.resolution.sharedDamage.components[0].formula], [undefined, undefined, { adjacentMelee: true, rounds: 10 }, "1d8[electricity]"]);
    const fruit = compileItem({ ...source("Panacea Fruit"), ownerLevel: 19 });
    assert.deepEqual([fruit.partial, fruit.notes, fruit.item.counteract.rank, fruit.item.counteract.modifier], [undefined, undefined, 9, 30]);
});
