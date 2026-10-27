// Unique items and artifacts built whole (2026-10-27, the fourth batch's third list; the user: their unique effects all automated): the readings
// of src/compiler/artifact-readings.js and the mechanisms they feed — Sphere of Annihilation's sphere card (src/live/sphere-card.js) first.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { spellIndex } from "../src/compiler/index.js";
import { contractChoices, contractRefusal, withContractCast } from "../src/live/contract-spells.js";
import { routeOf } from "../src/live/route.js";
import { createSphereCard, sphereCardHTML, sphereDC, sphereRow, stepToward, touchedOn } from "../src/live/sphere-card.js";
import { aroundZone, createInertCard, inertCardHTML, namedInert, squareCellsAround } from "../src/live/cube.js";

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
    assert.deepEqual([walls.builtin, walls.partial, walls.ways.length, walls.trigger.frequency.per], ["ways", true, 5, "hour"]);
    const [gas, nonliving, living, magic, force] = walls.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(gas), routeOf(force)], ["zone", "structure"]);
    assert.deepEqual([gas.zone.area, gas.zone.centre, gas.zone.lasts, gas.item.counteract.modifier, gas.item.counteract.rank, magic.item.counteract.free.name], [{ type: "square", value: 10 }, "around", null, 20, 13, "the magical effect crossing its walls"]);
    const save = nonliving.zone.saves[0];
    assert.deepEqual([save.when, save.only, save.plan.resolution.check.against.value, save.plan.resolution.outcomes.failure.forcedMovement.distance], [["enter", "exit"], { traits: ["construct", "undead"] }, 30, 5]);
    assert.deepEqual(living.zone.saves[0].only, { notTraits: ["construct", "undead"] });
    assert.deepEqual([force.structure.stats, force.structure.feet, force.structure.pushOut, force.structure.invisible], [{ hardness: 30, hp: 60 }, 10, false, true]);
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
