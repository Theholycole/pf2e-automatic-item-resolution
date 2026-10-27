// The user's answers 2 and 3 (2026-10-26): a spell-cast card counts partial when a note adds a rule the cast doesn't play
// (src/compiler/honest.js withCastNotes), not when it only restates the spell; a note-only item counts done once its text was checked
// for anything a card could play (src/compiler/notes-checked.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const first = (name) => compileActivations(item(name), options)[0].plan;

test("a cast's note adding a rule makes it partial — The Winged Serpent's Foresight for only 10 minutes", () => {
    const serpent = first("The Winged Serpent");
    assert.equal(serpent.builtin, "cast-spell");
    assert.equal(serpent.partial, true);
});

test("a note only restating the spell doesn't — Satchel of Numberless Seeds' Protector Tree within its own 30 feet", () => {
    const satchel = first("Satchel of Numberless Seeds");
    assert.equal(satchel.builtin, "cast-spell");
    assert.ok(satchel.notes.some((note) => /within 30 feet/.test(note)));
    assert.equal(satchel.partial, undefined);
});

test("a note-only item checked as having nothing to play counts done — Spyglass Eye", () => {
    const eye = first("Spyglass Eye");
    assert.deepEqual([eye.noteOnly, eye.decided, eye.automation.level], [undefined, "checked", "automatic"]);
});

test("a counteract modifier in other words is the cast's, and saying it again isn't a rule — Chalice of Ozem's +19, Rod of Negation's 1d20+23", () => {
    const chalice = first("Chalice of Ozem");
    assert.deepEqual([chalice.attack, chalice.partial], [19, undefined]);
    const rod = first("Rod of Negation");
    assert.deepEqual([rod.attack, rod.partial], [23, undefined]);
});

test("the cast's own rank said again isn't a rule — Cultist Cowl (Major)'s Crisis of Faith heightened to 7th rank", () => {
    const cowl = first("Cultist Cowl (Major)");
    assert.deepEqual([cowl.rank, cowl.partial], [7, undefined]);
});

test("a cast's own duration: Dust of Disappearance's 1-minute Invisibility, The Mountain Man's hour from 15th level; the card says it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { castDurationAt } = await import("../src/compiler/cast-duration.js");
    const { lastsWords } = await import("../src/live/cast-card.js");
    const dust = compileItem(item("Dust of Disappearance"), options);
    assert.deepEqual([dust.castDuration.value, dust.castDuration.unit, dust.partial], [1, "minutes", undefined]);
    const man = first("The Mountain Man");
    assert.deepEqual(castDurationAt(man.castDuration, 14), { value: 5, unit: "minutes" });
    assert.deepEqual(castDurationAt(man.castDuration, 15), { value: 1, unit: "hours" });
    assert.equal(lastsWords(man.castDuration), "lasts 5 minutes (1 hour from level 15)");
    // (Not the spell's own: Spectacles of Understanding's hour of Translate.)
    assert.equal(first("Spectacles of Understanding").castDuration, undefined);
});

test("a cast's own range: Medusa's Scream's 30-foot Petrify (the spell's is 120), Tiger Shield's melee reach; the card says it", async () => {
    const { rangeWords } = await import("../src/compiler/cast-range.js");
    const scream = first("Medusa's Scream");
    assert.deepEqual([scream.castRange.feet, scream.partial], [30, undefined]);
    assert.equal(rangeWords(scream.castRange), "range 30 feet");
    assert.equal(first("Tiger Shield").castRange.reach, true);
});

test("healing at the end of each turn beside a cast, for the item's time: Enveloping Light's 1d4 for 5 rounds", () => {
    const light = first("Enveloping Light");
    assert.deepEqual([light.turnHeal.formula, light.castDuration.value, light.castDuration.unit, light.partial], ["1d4", 5, "rounds", undefined]);
});

test("a bonus beside the cast: Psyche Salts (Moderate)'s +2 item bonus to saves against mental effects for 10 minutes, PF2e's rule for it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const salts = compileItem(item("Psyche Salts (Moderate)"), options);
    assert.deepEqual([salts.attack, salts.castBonus.modifiers[0].selector, salts.castBonus.modifiers[0].value, salts.castBonus.modifiers[0].predicate, salts.partial], [17, "saving-throw", 2, ["item:trait:mental"], undefined]);
});

test("a zone's save checked for what it leaves (2026-10-27): Tar Rocket Snare's partial save makes the zone partial; Spark Wafer's column for a round is the zone's own", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    assert.equal(compileItem(item("Tar Rocket Snare"), options).partial, true);
    assert.equal(compileItem(item("Spark Wafer"), options).partial, undefined);
    // (An example isn't a rule: Trip Snare's "For example, three trip snares …".)
    assert.equal(compileItem(item("Trip Snare"), options).partial, undefined);
});

test("a snare that strikes again for a while: Bleeding Spines Snare's area for 1 minute after it's set off, the same save on entering or ending a turn there", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const spines = compileItem(item("Bleeding Spines Snare"), options);
    assert.deepEqual([spines.zone.once, spines.zone.then.lasts.value, spines.zone.then.lasts.unit, spines.zone.then.saves[0].when], [true, 1, "minutes", ["enter", "end"]]);
    assert.equal(spines.zone.then.saves[0].plan.resolution.check.basic, true);
});

test("a conjured creature as its item's text has it (2026-10-27): Fossil Fragment's traits for its type and its immunities, the Petrified Wood tree Immobilized with no weaknesses; a creature rule left makes the card partial", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [tree] = activations(item("Fossil Fragment (Petrified Wood)"), options);
    const creature = tree.plan.creatures[0];
    assert.deepEqual([creature.replaceType, creature.immunities.includes("death-effects"), creature.own, tree.plan.partial], [true, true, { noWeaknesses: true, conditions: ["immobilized"] }, undefined]);
    const [dog] = activations(item("Wondrous Figurine (Onyx Dog)"), options);
    assert.deepEqual([dog.plan.creatures[0].own.rules[0].predicate, dog.plan.partial], [["action:track"], true]);
});

test("how a creature ends an item's effect early (2026-10-27): Fire-Douse Snare's DC 10, then DC 5, then outright; Grease Snare's three Interact actions", async () => {
    const { readEndEarly } = await import("../src/compiler/end-early.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const douse = readEndEarly(plainText(item("Fire-Douse Snare").system.description.value));
    assert.deepEqual([douse.how, douse.conditions], [{ kind: "flat", steps: [10, 5, "auto"] }, ["blinded", "dazzled"]]);
    assert.deepEqual(readEndEarly(plainText(item("Grease Snare").system.description.value)).how, { kind: "actions", count: 3 });
    const { compileItem } = await import("../src/compiler/index.js");
    assert.equal(compileItem(item("Fire-Douse Snare"), options).partial, undefined);
});

test("an affliction under its own heading, handed over by the activation that names it: Devil's Trident's sewer haze — the DC 25 exposure, the disease's own name and traits", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [critical] = activations(item("Devil's Trident"), options);
    const resolution = critical.plan.resolution;
    assert.deepEqual([resolution.check.against.value, resolution.afflictionHandoff.name, resolution.afflictionHandoff.traits, resolution.afflictionHandoff.dc, resolution.outcomes.criticalFailure.affliction.stage], [25, "Sewer Haze", ["disease", "virulent"], 23, 2]);
});

test("a longer reach for the item's own Strikes: Soulpiercer's Extend, an Effect saying the 15 feet until the end of its user's next turn (PF2e has no rule for it)", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { weaponEffectSource } = await import("../src/live/card.js");
    const [extend] = activations(item("Soulpiercer"), options);
    const reach = extend.plan.item.weapon[0];
    assert.deepEqual([reach.property, reach.value, reach.duration.expiry, extend.plan.partial], ["reach", 15, "turn-end", undefined]);
    const source = weaponEffectSource(reach, { item: { name: "Soulpiercer", uuid: "Actor.a.Item.b" } });
    assert.deepEqual([source.system.rules, /reach of 15 feet/.test(source.system.description.value)], [[], true]);
});

test("a square that only makes a noise when set off (2026-10-27): Alarm Snare's and Popdust's zone, gone once a creature enters, its set-off a note to the GM; Alarm Snare's size the GM's", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { zoneActions, zoneSetOff } = await import("../../pf2e-automatic-ability-resolution/src/live/zones.js");
    const snare = compileItem(item("Alarm Snare"), options);
    assert.deepEqual([snare.builtin, snare.zone.once, snare.partial], ["zone", true, true]);
    assert.match(snare.zone.saves[0].note, /\(100 to 500 feet\)/);
    const popdust = compileItem(item("Popdust"), options);
    const actions = zoneActions(popdust.zone, "tokenEnter", {});
    assert.deepEqual([actions.map((action) => action.kind), zoneSetOff(popdust.zone, actions), popdust.partial], [["note"], true, undefined]);
});

test("a wider scatter for the next Strike (2026-10-27): Magnetite Scope's Expansion, an Effect saying the 5 feet for the turn that a Strike with a scatter weapon ends (PF2e has no rule for a scatter radius)", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { weaponEffectSource } = await import("../src/live/card.js");
    const [expansion] = activations(item("Magnetite Scope"), options);
    const scatter = expansion.plan.item.weapon[0];
    assert.deepEqual([scatter.property, scatter.value, scatter.duration.expiry, expansion.plan.partial], ["scatter", 5, "turn-end", undefined]);
    const source = weaponEffectSource(scatter, { item: { name: "Magnetite Scope", uuid: "Actor.a.Item.b" } });
    assert.deepEqual([source.system.rules, source.flags["pf2e-automatic-item-resolution"].endsOnStrike], [[], { trait: "scatter" }]);
    assert.match(source.system.description.value, /scatter radius 5 feet wider/);
    assert.equal(activations(item("Magnetite Scope (Greater)"), options)[0].plan.item.weapon[0].value, 10);
});

test("an Effect a Strike with a weapon of a trait ends: only that Strike (scripts/ends-on-strike.js)", async () => {
    const { endOnStrike } = await import("../scripts/ends-on-strike.js");
    const deleted = [];
    const actor = { itemTypes: { effect: [{ id: "scatter", flags: { "pf2e-automatic-item-resolution": { endsOnStrike: { trait: "scatter" } } } }, { id: "other", flags: {} }] }, deleteEmbeddedDocuments: async (type, ids) => deleted.push(...ids) };
    const strike = (traits) => ({ actor, flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: ["action:strike", ...traits.map((trait) => `item:trait:${trait}`)] } } } });
    assert.deepEqual(await endOnStrike(strike(["agile"])), []);
    assert.deepEqual(await endOnStrike(strike(["concussive", "scatter-10"])), ["scatter"]);
    assert.deepEqual(deleted, ["scatter"]);
});

test("a light's radius its user picks (2026-10-27): Twilight Lantern's dim moonlight, 60 feet standard, from 5 feet up to double (Lesser) or quadruple (Major) it", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { lightText, lightEffectSource } = await import("../src/live/card.js");
    const [lesser] = activations(item("Twilight Lantern (Lesser)"), options);
    const [light] = lesser.plan.item.light;
    assert.deepEqual([light.bright, light.dim, light.pick, lesser.plan.partial], [0, 60, { min: 5, max: 120 }, undefined]);
    assert.equal(activations(item("Twilight Lantern (Major)"), options)[0].plan.item.light[0].pick.max, 240);
    assert.match(lightText({ ...light, dim: 15 }), /^Dim light in 15 feet \(its radius picked, 5 to 120 feet\), until put out/);
    assert.deepEqual(lightEffectSource({ ...light, dim: 15 }, { item: { name: "Twilight Lantern (Lesser)" } }).system.rules[0].value, { bright: 0, dim: 15 });
});

test("its user's own actions as the whole of an activation (2026-10-27): Swiftmount Saddle's Mount, Spangled Rider's Suit's dismount, Maestro's Chair's Stride and Sustain, Sandals of the Stag's jump — a line of the card", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const lines = ["Swiftmount Saddle", "Spangled Rider's Suit", "Maestro's Chair", "Sandals of the Stag"].map((name) => activations(item(name), options).find((entry) => entry.plan?.notes?.length)?.plan);
    assert.ok(lines.every((plan) => plan && /\(its own (?:actions?|action on the map|move on the map)\)\.$/.test(plan.notes[0]) && !plan.partial && !plan.noteOnly));
    assert.equal(lines[0].notes[0], "Mount the creature wearing it (its own action on the map).");
});
