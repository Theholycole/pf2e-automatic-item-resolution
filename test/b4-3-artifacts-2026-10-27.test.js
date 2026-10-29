// Unique items and artifacts built whole (2026-10-27, the fourth batch's third list; the user: their unique effects all automated): the readings
// of src/compiler/whole-artifacts.js and the mechanisms they feed — Sphere of Annihilation's sphere card (src/live/sphere-card.js) first.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { spellIndex } from "../src/compiler/index.js";
import { contractChoices, contractRefusal, withContractCast } from "../src/live/contract-spells.js";
import { withPlace } from "../src/live/embedded-places.js";
import { swapRules, swapWords } from "../src/live/skill-swap.js";
import { adjacentBonus, isAdjacent } from "../src/live/adjacent-bonus.js";
import { drainCandidates, pickDrain } from "../src/live/arcane-drain.js";
import { portalRegion } from "../src/live/portals.js";
import { laterRefusal, triggeringRoll, withLaterUse } from "../src/live/reroll-card.js";
import { soulAmount, soulCounts, soulRules, withSoul, withoutSoul } from "../src/live/souls.js";
import { fillable } from "../src/live/reservoir.js";
import { routeOf } from "../src/live/route.js";
import { createSphereCard, sphereCardHTML, sphereDC, sphereRow, stepToward, touchedOn } from "../src/live/sphere-card.js";
import { aroundZone, createInertCard, exemptSpec, inertCardHTML, namedInert, squareCellsAround } from "../src/live/cube.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);
const activation = (name, which, options = {}) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("Sphere of Annihilation: the sphere card — its control check, its Sustain, its moves and what it destroys", () => {
    const [plan] = activations("Sphere of Annihilation");
    assert.deepEqual([done(plan), plan.builtin, routeOf(plan)], [true, "sphere", "sphere"]);
    const sphere = plan.sphere;
    assert.deepEqual([sphere.skills, sphere.dc, sphere.within, sphere.keep, sphere.destroys, sphere.deity, sphere.talisman.by], [["arcana", "occultism"], 30, 40, 80, true, true, 10]);
    assert.deepEqual([sphereRow(sphere, "take", "success"), sphereRow(sphere, "take", "criticalFailure"), sphereRow(sphere, "sustain", "criticalSuccess"), sphereRow(sphere, "sustain", "failure")], [{ control: true }, { closer: 20 }, { move: 20 }, { lose: true, closer: 10 }]);
    // (Its controller's Will DC when higher, only to take control; the talisman 10 lower.)
    assert.deepEqual([sphereDC(sphere, { phase: "take", controllers: [34] }).dc, sphereDC(sphere, { phase: "sustain", controllers: [34] }).dc, sphereDC(sphere, { phase: "take", talisman: true }).dc], [34, 30, 20]);
    const card = createSphereCard({ plan, item: { name: "Sphere of Annihilation" }, user: { name: "Ezren", actorUuid: "Actor.a" } });
    assert.match(sphereCardHTML(card, { canApply: true }), /Roll to take control/);
    assert.match(sphereCardHTML({ ...card, phase: "move", allowed: 20 }, { canApply: true }), /up to 20 feet away/);
});

test("the sphere's steps toward its user, by PF2e's grid, and the creatures in its way", () => {
    const grid = { size: 100, gridFeet: 5 };
    const sphere = { x: 0, y: 0, w: 100, h: 100 };
    // (Straight: 10 feet is two squares.)
    const straight = stepToward(sphere, { x: 500, y: 0, w: 100, h: 100 }, 10, grid);
    assert.deepEqual([straight.x, straight.y, straight.path.length, straight.spent], [200, 0, 2, 10]);
    // (Diagonal: a first diagonal 5 feet, a second 10 — so 10 feet is a diagonal then a straight step.)
    const diagonal = stepToward(sphere, { x: 500, y: 500, w: 100, h: 100 }, 10, grid);
    assert.deepEqual([diagonal.path.length, diagonal.spent], [2, 10]);
    // (It stops once it touches its user: 20 feet with its user two squares off.)
    const touching = stepToward(sphere, { x: 200, y: 0, w: 100, h: 100 }, 20, grid);
    assert.deepEqual([touching.x, touching.path.length], [200, 2]);
    const others = [{ id: "a", x: 100, y: 0, w: 100, h: 100 }, { id: "b", x: 100, y: 300, w: 100, h: 100 }, { id: "c", x: 200, y: 0, w: 100, h: 100 }];
    assert.deepEqual(touchedOn(touching.path.map((place) => ({ ...place, w: 100, h: 100 })), others), ["a", "c"]);
});

test("Cube of Nex: its face picked on the ways card — zones round its user, the counteract card, crossing saves, walls of force; its other activation makes a cube inert", () => {
    const [walls, inert] = activations("Cube of Nex");
    // (2026-10-28: whole now — the ability module's exit saves and only.notTraits, the environment module's invisible walls, are built.)
    assert.deepEqual([walls.builtin, walls.partial, walls.ways.length, walls.trigger.frequency.per], ["ways", undefined, 5, "hour"]);
    const [gas, nonliving, living, magic, force] = walls.ways.map((way) => way.plan);
    // (Its walls' route renamed at the merge, beside the Guiding Chisel's structure card — 2026-10-27.)
    assert.deepEqual([routeOf(gas), routeOf(force)], ["zone", "walls-around"]);
    assert.deepEqual([gas.zone.area, gas.zone.centre, gas.zone.lasts, gas.item.counteract.modifier, gas.item.counteract.rank, magic.item.counteract.free.name], [{ type: "square", value: 10 }, "around", null, 20, 13, "the magical effect crossing its walls"]);
    // (2026-10-28: a save for crossing in, one for crossing out — pushed back out, or pulled back in; its walls transparent, not invisible.)
    const save = nonliving.zone.saves[0];
    assert.deepEqual([save.when, save.only, save.plan.resolution.check.against.value, save.plan.resolution.outcomes.failure.forcedMovement.distance], [["enter"], { traits: ["construct", "undead"] }, 30, 5]);
    assert.deepEqual(living.zone.saves.map((entry) => [entry.when, entry.only]), [[["enter"], { notTraits: ["construct", "undead"] }], [["exit"], { notTraits: ["construct", "undead"] }]]);
    assert.deepEqual([force.structure.stats, force.structure.feet, force.structure.pushOut, force.structure.transparent], [{ hardness: 30, hp: 60 }, 10, false, true]);
    assert.deepEqual([inert.builtin, routeOf(inert), inert.inert.within, done(inert)], ["inert", "inert", 60, true]);
    assert.ok(namedInert(inert.inert, "Cube of Force") && namedInert(inert.inert, "Lesser Cube of Nex") && !namedInert(inert.inert, "Cube of Nex"));
    assert.match(inertCardHTML(createInertCard({ plan: inert, item: { name: "Cube of Nex" }, user: { name: "Ezren" }, candidates: [{ itemUuid: "x", name: "Cube of Force", holder: "Seelah" }] }), { canApply: true }), /Make it inert/);
    // (Its squares as the environment module lays a square out: a Medium user's space and the squares to its right and below.)
    const grid = { size: 100, gridFeet: 5 };
    assert.deepEqual(squareCellsAround({ x: 300, y: 300, w: 100, h: 100 }, 10, grid), [{ x: 300, y: 300 }, { x: 300, y: 400 }, { x: 400, y: 300 }, { x: 400, y: 400 }]);
    assert.equal(aroundZone(gas.zone, { x: 300, y: 300, w: 100, h: 100 }, grid).area.type, "squares");
});

test("Dragon-Lotus Drum: its army a Gargantuan marker, its Arrive's save at its enemies (its own traits), its Depart's later card — the charge's basic Reflex, its type picked, Prone on a critical failure; once every 20 years", () => {
    const plan = activation("Dragon-Lotus Drum", "Summon Dragon-Lotus Army");
    assert.deepEqual([done(plan), routeOf(plan), plan.spend.mythicPoints, plan.trigger.recharge], [true, "save", 1, { value: 7300, unit: "days" }]);
    assert.ok(["emotion", "fear", "mental", "sonic"].every((trait) => plan.traits.includes(trait)));
    const army = plan.item.alsoConjure;
    assert.deepEqual([army.builtin, army.creatures[0].size, army.creatures[0].stats.speeds.land, army.lasts.expiry], ["conjure", "gargantuan", 60, "turn-end"]);
    const depart = plan.again.plan;
    assert.deepEqual([plan.again.later, depart.resolution.check.statistic, depart.resolution.check.against.value, depart.resolution.sharedDamage.components[0].formula], [true, "reflex", 48, "20d8[bludgeoning]"]);
    assert.deepEqual(depart.damageChoices.map((choice) => choice.formula), ["20d8[bludgeoning]", "20d8[piercing]", "20d8[slashing]"]);
    assert.deepEqual([depart.resolution.outcomes.criticalFailure.effects[0].slug, depart.resolution.outcomes.criticalFailure.damage.multiplier], ["prone", 2]);
});

test("Limitless Power's Unleash Power: the cast card of every common divine cantrip (10th rank) and spell of 1st to 9th, DC 40 and +30; the first cast of each slot its signer's selection, each non-cantrip once a day", () => {
    const plan = activation("Limitless Power", "Unleash Power", { spells });
    assert.deepEqual([done(plan), routeOf(plan), plan.dc, plan.attack, plan.contract.slots.length], [true, "cast", 40, 30, 10]);
    const cantrip = plan.choices.find((choice) => choice.slot === "cantrip");
    const heal = plan.choices.find((choice) => choice.spell.name === "Heal");
    const bless = plan.choices.find((choice) => choice.spell.name === "Bless");
    assert.deepEqual([cantrip.rank, heal.slot, heal.rank, bless.slot], [10, "1", 1, "1"]);
    assert.ok(plan.choices.every((choice) => choice.slot === "cantrip" || (choice.rank >= 1 && choice.rank <= 9)));
    const record = withContractCast(null, heal, 5);
    // (No dot in a key of its record: Foundry's flag update would read the uuid as a path.)
    assert.ok(Object.keys(record.used).every((key) => !key.includes(".")) && Object.keys(record.used).length === 1);
    const now = contractChoices(plan, record, 5);
    assert.ok(!now.some((choice) => choice.slot === "1"));
    assert.ok(contractChoices(plan, record, 6).filter((choice) => choice.slot === "1").every((choice) => choice.spell.name === "Heal"));
    assert.match(contractRefusal(plan, record, bless, 6), /another/);
    assert.match(contractRefusal(plan, record, heal, 5), /today/);
    assert.equal(contractRefusal(plan, withContractCast(record, cantrip, 5), cantrip, 5), null);
});

test("Shadewither Key's Umbral Double: a note Effect for the minute, its flat check's DC on PF2e's RollOption for the live hook, the key's Stealth bonus suppressed while it lasts", () => {
    const plan = activation("Shadewither Key", "Umbral Double");
    const note = plan.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(plan), routeOf(plan), note.duration.value, note.duration.unit], [true, "item", 1, "minutes"]);
    assert.deepEqual(note.rules, [{ key: "RollOption", domain: "all", option: "air-decoy-double:11" }, { key: "AdjustModifier", selector: "stealth", slug: "shadewither-key", suppress: true }]);
});

test("Jahan Waystone: the save card at the creatures in the stone's 10-foot light, Will DC 45, those that fail teleported to the paired stone (within 30 feet of it)", () => {
    const [plan] = activations("Jahan Waystone");
    assert.deepEqual([done(plan), routeOf(plan), plan.resolution.check.statistic, plan.resolution.check.against.value, plan.targeting.area], [true, "save", "will", 45, { type: "emanation", value: 10 }]);
    assert.deepEqual([plan.pairedStone, plan.activation.time, plan.item.activation.time], [{ within: 30, degrees: ["failure", "criticalFailure"], slug: "jahan-waystone" }, "1 minute", "1 minute"]);
});

test("The Eye of the Slumberer's Vortex: a 30-foot zone placed on the Eye, difficult terrain for swimming — the water trait's creatures spared by the core's selective terrain — until used again", () => {
    const plan = activation("The Eye of the Slumberer", "Vortex");
    // (A burst of the emanation's size since 2026-10-28: the ability module put an emanation round its user, not where placed.)
    assert.deepEqual([done(plan), routeOf(plan), plan.zone.area, plan.zone.centre, plan.zone.untilReused, plan.zone.terrain, plan.zone.exceptTraits], [true, "zone", { type: "burst", value: 30 }, "placed", true, [{ movement: ["swim"], difficulty: 2 }], ["water"]]);
    assert.deepEqual(exemptSpec(plan.zone, [{ actorUuid: "Actor.eel", traits: ["animal", "water"] }, { actorUuid: "Actor.pc", traits: ["humanoid"] }]), { actions: ["swim"], default: 2, creatures: [{ actorUuid: "Actor.eel", difficulty: 1 }] });
});

test("Guiding Star Orb (Heroic)'s Embed Location: its user's place kept on the orb, three at most, the oldest replaced", () => {
    const plan = activation("Guiding Star Orb (Heroic)", "Embed Location");
    assert.deepEqual([done(plan), routeOf(plan), plan.embed.max], [true, "embed", 3]);
    const four = [1, 2, 3, 4].reduce((record, n) => withPlace(record, { sceneName: `s${n}` }, plan.embed.max), []);
    assert.deepEqual(four.map((place) => place.sceneName), ["s2", "s3", "s4"]);
});

test("Phoenix Necklace: the willing creatures targeted get a note Effect whose toggle gives their Strikes the nonlethal trait, no penalty; it ends when the necklace is used again", () => {
    const [plan] = activations("Phoenix Necklace");
    const note = plan.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(plan), routeOf(plan), plan.item.recipient, plan.item.endsPrevious, note.duration], [true, "item", "targets", "Nonlethal without penalty", null]);
    assert.deepEqual(note.rules[1], { key: "AdjustStrike", mode: "add", property: "weapon-traits", value: "nonlethal", predicate: ["phoenix-necklace-nonlethal"] });
});

test("Soulheart (Pure)'s Restore Life: the dead creature it's held to back with 1 Hit Point and none of its daily resources, none above 20th level, the soulheart destroyed", () => {
    const plan = activation("Soulheart (Pure)", "Restore Life");
    assert.deepEqual([done(plan), routeOf(plan), plan.item.recipient, plan.item.revive.hp, plan.item.revive.maxLevel, plan.item.revive.destroysItem, plan.activation.time], [true, "item", "drinker", 1, 20, true, "1 minute"]);
});

test("The Big Sky: its user and up to four touched creatures ignore difficult terrain (greater too from its user's 17th level) and circumstance penalties to Speed for 10 minutes", () => {
    const low = compileActivations({ ...item("The Big Sky"), ownerLevel: 12 })[0].plan;
    const high = compileActivations({ ...item("The Big Sky"), ownerLevel: 17 })[0].plan;
    const [lowNote, highNote] = [low, high].map((plan) => plan.resolution.outcomes.success.noteEffects[0]);
    assert.deepEqual([done(low), routeOf(low), low.item.recipient, lowNote.duration.value, lowNote.rules.length, highNote.rules.length], [true, "item", "targets", 10, 2, 3]);
    assert.deepEqual(lowNote.rules[1].predicate, ["penalty:type:circumstance"]);
    assert.equal(highNote.rules[1].path, "system.movement.terrain.greater.ignored");
});

test("The Trader: two skills picked on its card, their proficiency ranks swapped for the hour (PF2e's ActiveEffectLike overrides)", () => {
    const [plan] = activations("The Trader");
    assert.deepEqual([done(plan), routeOf(plan), plan.swap.duration], [true, "skill-swap", { value: 1, unit: "hours" }]);
    assert.deepEqual(swapRules("athletics", "crafting", 3, 0).map((rule) => [rule.path, rule.value]), [["system.skills.athletics.rank", 0], ["system.skills.crafting.rank", 3]]);
    assert.equal(swapWords("athletics", "crafting", 3, 0), "Athletics untrained (was master), Crafting master (was untrained)");
});

test("The Eclipse: its aura the ability module's zone on its user (−2 item to the foes' saves and Strikes inside), the triggering foe's note Effect (its critical success a success, −3 instead), for the minute — partial till the zone's foes-only rules", () => {
    const [plan] = activations("The Eclipse");
    const note = plan.resolution.outcomes.success.noteEffects[0];
    const zone = plan.item.alsoZone.zone;
    // (Done since the ability module's zone.inside who "foes" — 2026-10-28.)
    assert.deepEqual([done(plan), routeOf(plan), plan.item.recipient, note.rules.map((rule) => rule.value), note.duration.value], [true, "item", "targets", [-3, -3], 1]);
    assert.deepEqual([zone.area, zone.centre, zone.inside[0].who, zone.inside[0].rules.map((rule) => [rule.selector, rule.value]), zone.lasts.unit], [{ type: "emanation", value: 30 }, "self", "foes", [["saving-throw", -2], ["strike-attack-roll", -2]], "minutes"]);
});

test("Vambrace of Gorum's Blade of Iron: a +3 major striking high-grade adamantine greatsword in its user's hand for the minute, and +1 circumstance to AC for each adjacent enemy up to +4", () => {
    const plan = activation("Vambrace of Gorum", "Blade of Iron");
    const objects = plan.objects;
    assert.deepEqual([done(plan), routeOf(plan), objects.weapon, objects.potency, objects.striking, objects.material, objects.lasts], [true, "objects", "greatsword", 3, 3, { type: "adamantine", grade: "high" }, { value: 1, unit: "minutes" }]);
    assert.deepEqual([adjacentBonus(objects.effect.adjacent, 2), adjacentBonus(objects.effect.adjacent, 6)], [2, 4]);
    assert.deepEqual([isAdjacent({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 100, w: 100, h: 100 }, 100), isAdjacent({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 100, h: 100 }, 100)], [true, false]);
});

test("Belimarius's Invidious Halberd's Absorb Arcana: the save card at the creature struck (Will DC 37), a failure losing it an arcane spell or slot of its highest rank up to 6th, the wielder Quickened for 1 round", () => {
    const plan = activation("Belimarius's Invidious Halberd", "Absorb Arcana");
    assert.deepEqual([done(plan), routeOf(plan), plan.resolution.check.against.value, plan.drainSlot, plan.resolution.outcomes.failure.effects[0].recipient], [true, "save", 37, { tradition: "arcane", maxRank: 6, degrees: ["failure", "criticalFailure"] }, "self"]);
    const entries = [
        { id: "w", tradition: "arcane", prepared: "prepared", flexible: false, slots: { slot7: { max: 1, prepared: [{ id: "a" }] }, slot6: { max: 2, prepared: [{ id: "b", expended: true }, { id: "c" }] }, slot5: { max: 1, prepared: [{ id: "d" }] } } },
        { id: "s", tradition: "arcane", prepared: "spontaneous", flexible: false, slots: { slot6: { max: 2, value: 1 } } },
        { id: "o", tradition: "occult", prepared: "spontaneous", flexible: false, slots: { slot6: { max: 2, value: 2 } } }
    ];
    const found = drainCandidates(entries, { tradition: "arcane", maxRank: 6 });
    assert.deepEqual(found, [{ entryId: "w", rank: 6, at: 1 }, { entryId: "s", rank: 6, at: null }]);
    assert.deepEqual(pickDrain(found, 0.9), { entryId: "s", rank: 6, at: null });
});

test("Mountain to the Sky: the climb's DC 35 Athletics check card at the climbers, a success reaching the summit (plane-shifted to Heaven with no help from flight or magic)", () => {
    const [plan] = activations("Mountain to the Sky");
    assert.deepEqual([done(plan), routeOf(plan), plan.resolution.check.statistic, plan.resolution.check.against.value, plan.activation.time], [true, "save", "athletics", 35, "1 minute"]);
    assert.match(plan.resolution.outcomes.success.noteEffects[0].text, /Heaven/);
});

test("Mountebank's Passage: a white portal and a black one, each a Region whose teleportToken behaviour leads to the other, within 120 feet, while it isn't loaded", () => {
    const [onyx, pearl] = [activation("Mountebank's Passage", "Doorway to Onyx"), activation("Mountebank's Passage", "Doorway to Pearl")];
    assert.deepEqual([done(onyx), done(pearl), routeOf(onyx), onyx.portal, pearl.portal.color], [true, true, "portal", { color: "white", other: "black", within: 120, unloaded: true }, "black"]);
    const region = portalRegion({ name: "white portal", square: { x: 100, y: 200 }, size: 100, color: "white", other: "Scene.a.Region.b", flags: {} });
    assert.deepEqual([region.shapes[0].x, region.behaviors[0].type, region.behaviors[0].system.destinations], [100, "teleportToken", ["Scene.a.Region.b"]]);
});

test("Scene Stealer's Tunic's Look At Me!: PF2e's Effect: Look at Me! on a success or worse, Off-Guard on a failure or worse and Slowed 1 on a critical failure, for the minute", () => {
    const plan = activation("Scene Stealer's Tunic", "Look At Me!");
    const rows = plan.resolution.outcomes;
    assert.deepEqual([done(plan), routeOf(plan), rows.success.nativeEffects[0].label, rows.failure.effects.map((effect) => effect.slug), rows.criticalFailure.effects.map((effect) => [effect.slug, effect.duration.value]), rows.success.manualInstructions], [true, "save", "Effect: Look at Me!", ["off-guard"], [["off-guard", 1], ["slowed", 1]], undefined]);
});

test("Old Tillimaquin's Luck of the Mascot: the reroll card kept for 24 hours, the latest failed save of the creature targeted, once a month for each creature", () => {
    const plan = activation("Old Tillimaquin", "Luck of the Mascot");
    assert.deepEqual([done(plan), routeOf(plan), plan.reroll.who, plan.reroll.failed, plan.reroll.keep, plan.trigger.frequency], [true, "reroll", "target", true, "new", undefined]);
    const day = 86_400;
    assert.match(laterRefusal(plan.reroll, { at: 0, now: day + 1 }), /over/);
    const record = withLaterUse(null, plan.reroll, { now: 100, actorUuid: "Actor.a" });
    // (No dot in its key: Foundry's flag update would read the uuid as a path.)
    assert.deepEqual(Object.keys(record), ["Actor|a"]);
    assert.match(laterRefusal(plan.reroll, { at: 0, now: 200, record, actorUuid: "Actor.a" }), /this month/);
    assert.equal(laterRefusal(plan.reroll, { at: 0, now: 200, record, actorUuid: "Actor.b" }), null);
    const messages = [{ id: "1", type: "saving-throw", actorUuid: "Actor.a", outcome: "failure" }, { id: "2", type: "saving-throw", actorUuid: "Actor.a", outcome: "success" }];
    assert.equal(triggeringRoll(messages, plan.reroll, { actorUuid: "Actor.a" }), "1");
});

test("Reaper's Grasp: its kills' souls kept (sapient, living or undead, ten at most); Soul Shot's twice the level in void damage on its next Strike, Devour Captured Soul's three times in temporary Hit Points", () => {
    const [shot, devour] = activations("Reaper's Grasp");
    assert.deepEqual([done(shot), done(devour), routeOf(shot), shot.souls, devour.souls], [true, true, "souls", { op: "strike", type: "void", times: 2 }, { op: "temp-hp", times: 3 }]);
    const record = withSoul([], { name: "Ogre", level: 3 }, 10);
    assert.deepEqual([soulCounts({ traits: ["mindless", "undead"], modeOfBeing: "undead" }, record, 10), soulCounts({ traits: ["humanoid"], modeOfBeing: "living" }, record, 10), soulCounts({ traits: [], modeOfBeing: "construct" }, record, 10)], [false, true, false]);
    assert.deepEqual([soulAmount(shot.souls, record[0]), soulAmount(devour.souls, record[0]), withoutSoul(record, 0)], [6, 9, []]);
    assert.deepEqual(soulRules(shot.souls, 6, "w1"), [{ key: "FlatModifier", selector: "w1-damage", damageType: "void", value: 6, label: "Soul Shot" }]);
});

test("Crimson Fulcrum Lens's possession: its own melee spell attack (+18), a hit giving the target PF2e's Effect: Crimson Fulcrum Lens and the possession's note Effect (the lens inert while it lasts)", () => {
    const plan = activations("Crimson Fulcrum Lens")[1];
    const hit = plan.resolution.outcomes.success;
    // (2026-10-28: the three fulcrum lenses' one reading, src/compiler/possession.js — plan.possess, scripts/possession.js; its note Effect's
    // RollOption the possession's mark, no longer plan.possession and scripts/lens-possession.js.)
    assert.deepEqual([done(plan), routeOf(plan), plan.resolution.check.modifier, hit.nativeEffects[0].label, hit.noteEffects[0].label, plan.possess.option, plan.traits.includes("possession")], [true, "save", 18, "Effect: Crimson Fulcrum Lens", "Possessed by Nhimbaloth's splinter", "air-possessed-by:crimson-fulcrum-lens", true]);
});

test("The Hollow Star: its reaction's note Effect for the turn (+1 item to linguistic spell attacks, their DC 1 higher), and its conjured aberration (a common one of level 3 or lower, picked)", () => {
    const [words, , summon] = activations("The Hollow Star");
    const note = words.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(words), routeOf(words), note.rules.map((rule) => [rule.selector, rule.value, rule.predicate[0]])], [true, "item", [["spell-attack-roll", 1, "item:trait:linguistic"], ["spell-dc", 1, "item:trait:linguistic"]]]);
    assert.deepEqual([done(summon), routeOf(summon), summon.pick, summon.lasts.value, summon.trigger.frequency.per], [true, "conjure", { any: ["aberration"], maxLevel: 3, rarity: "common" }, 1, "day"]);
});

test("Reaper's Lancet: its reservoir card — filled from its user's injury poisons, one poison and 3 doses at most — poisoning the creature targeted with a dose", () => {
    const [plan] = activations("Reaper's Lancet");
    assert.deepEqual([done(plan), routeOf(plan), plan.reservoir], [true, "reservoir", { max: 3, delivery: "injury" }]);
    assert.deepEqual([fillable(null, { name: "Giant Wasp Venom" }, 3, 5), fillable({ poison: { name: "Giant Wasp Venom" }, doses: 2 }, { name: "Giant Wasp Venom" }, 3, 5), fillable({ poison: { name: "Giant Wasp Venom" }, doses: 1 }, { name: "Black Adder Venom" }, 3, 5)], [3, 1, 0]);
});
