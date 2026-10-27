// Areas items make, and what their words leave beside them (2026-10-27, docs/needs.md "Light, darkness, smoke, terrain and walls"): the
// readings of src/compiler/area-readings.js — zones, note Effects with PF2e's toggles, whispers, the card's lines —, Diver's Gloves' fall
// (src/compiler/falls.js), Goz Mask's fog (src/compiler/weather.js), and what the user's rulings make of the rest (notes checked, one-offs).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { fallEffectSource, fallLine } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;

test("Diver's Gloves: a fall into water at half the damage (as from half as far, 5 feet at least) for the reaction's round, then its own Swim", () => {
    for (const name of ["Diver's Gloves (Lesser)", "Diver's Gloves (Moderate)", "Diver's Gloves (Greater)"]) {
        const [gloves] = activations(name);
        assert.ok(done(gloves), name);
        assert.deepEqual(gloves.fall, { halved: true, minFeet: 5, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } });
        assert.deepEqual(gloves.notes, ["Then its user Swims as on a critical success at the check (its own move on the map)."]);
    }
    const [gloves] = activations("Diver's Gloves (Lesser)");
    assert.match(fallLine(gloves.fall), /^It takes half the damage from a fall \(as if it fell half as far, 5 feet at least\) for 1 round$/);
    assert.deepEqual(fallEffectSource(gloves.fall, { item: { name: "Diver's Gloves (Lesser)" } }).flags["pf2e-automatic-environment-resolution"].fall, { halved: true, minFeet: 5, source: "Diver's Gloves (Lesser)" });
});

test("Resonant Guitar's Chord of Protection: the barrier its first sentence pictures is the readied bonus, no note left", () => {
    const chord = activation("Resonant Guitar", "Chord of Protection");
    assert.deepEqual([chord.builtin, done(chord), chord.notes, chord.bonus.onAttack.hit.damage.formula], ["readied-bonus", true, undefined, "3d10"]);
});

test("Goz Mask: the weather's fog and mist ignored for its time through the environment module, smoke and vapors on its words", () => {
    for (const [name, minutes] of [["Goz Mask", 1], ["Goz Mask (Greater)", 10]]) {
        const [mask] = activations(name);
        assert.ok(done(mask), name);
        assert.deepEqual([mask.weatherIgnores.ignores, mask.weatherIgnores.duration.value, success(mask).noteEffects], [["fog-mist"], minutes, undefined]);
        assert.match(mask.weatherIgnores.more, /smoke and other obscuring vapors/);
    }
});

test("a bonus only for some checks, PF2e's toggle on the note Effect: Mantle of Far Horizons' hour of Perception, Echo Token's next Recall Knowledge", () => {
    const gaze = activation("Mantle of Far Horizons", "Gaze upon the Horizon");
    const note = success(gaze).noteEffects[0];
    assert.deepEqual([done(gaze), note.duration.value, note.duration.unit, note.rules.map((rule) => rule.key)], [true, 1, "hours", ["RollOption", "FlatModifier"]]);
    assert.deepEqual(note.rules[1], { key: "FlatModifier", selector: "perception", type: "item", value: 1, predicate: ["far-horizons-gaze"] });
    const token = compileItem(item("Echo Token"));
    const echo = success(token).noteEffects[0];
    assert.deepEqual([done(token), echo.duration.value, echo.duration.unit, echo.rules[1].removeAfterRoll, echo.rules[1].value], [true, 365, "days", "if-enabled", 1]);
    assert.match(token.notes[0], /the GM's call/);
});

test("words on its user for its time: Spectacles of Piercing Sight's minute, Effervescent Ampoule's water walking to its turn's end", () => {
    const [spectacles] = activations("Spectacles of Piercing Sight");
    assert.deepEqual([done(spectacles), success(spectacles).noteEffects[0].duration.value, success(spectacles).noteEffects[0].duration.unit], [true, 1, "minutes"]);
    assert.match(success(spectacles).noteEffects[0].text, /thin sheet of lead/);
    const ampoule = compileItem(item("Effervescent Ampoule"));
    assert.deepEqual([done(ampoule), success(ampoule).noteEffects[0].duration.value, success(ampoule).noteEffects[0].duration.expiry], [true, 0, "turn-end"]);
});

test("what it tells, whispered: Detector Stone's two activations, Earthsight Box, Sighting Shot", () => {
    const [near, auras] = activations("Detector Stone");
    for (const plan of [near, auras, activation("Earthsight Box", "Replicate Earth"), activations("Sighting Shot")[0]]) assert.deepEqual([plan.builtin, routeOf(plan), done(plan)], ["whisper", "whisper", true], plan.source?.name);
    assert.match(near.whisper.text, /within 60 feet/);
    assert.match(near.whisper.text, /DC 23/);
    assert.match(auras.whisper.text, /evil undead within 30 feet/);
});

test("notes checked for the areas' leftovers: a light's look, objects, the map and what's out of combat", () => {
    for (const name of ["Prismatic Dust", "Ruby String", "Colorful Coating (Blue)", "Mutator Onyx", "Blooming Lotus Seed Pod"]) assert.deepEqual([compileItem(item(name)).decided, done(compileItem(item(name)))], ["checked", true], name);
    for (const plan of [activations("Cube of Recall")[0], activations("Preserving Shot")[0], activation("Explorer's Yurt", "Unroll"), activations("Insistent Door Knocker (Greater)")[0], activations("Private Workshop")[0], activation("Sandcastle", "Shape the Castle"), activation("Spider Chair", "Web Swing")]) assert.deepEqual([plan.decided, done(plan)], ["checked", true], plan.source?.name);
});

test("areas of light and darkness, zones with their lighting in their notes: Sun Slayer's Sunset, Undertaker's Manifest, Bottled Night", () => {
    const sunset = activation("Sun Slayer", "Sunset");
    const [manifest] = activations("Undertaker's Manifest");
    const night = compileItem(item("Bottled Night"));
    for (const plan of [sunset, manifest, night]) assert.deepEqual([plan.builtin, routeOf(plan), done(plan)], ["zone", "zone", true], plan.source?.name);
    assert.deepEqual([sunset.zone.area, sunset.zone.centre, sunset.zone.lasts.value, sunset.zone.lasts.unit], [{ type: "emanation", value: 60 }, "self", 1, "minutes"]);
    assert.deepEqual([manifest.zone.area.value, manifest.zone.lasts.value, manifest.zone.lasts.unit], [30, 3, "rounds"]);
    assert.match(manifest.zone.notes[0], /shadow or void spell/);
    assert.deepEqual([night.zone.area, night.zone.centre, night.zone.range, night.zone.lasts.value], [{ type: "burst", value: 15 }, "placed", 20, 1]);
});

test("Ghost Lantern: ghost touch for each creature in its bright light, PF2e's AdjustStrike as the zone's rule inside, for 5 minutes", () => {
    const [lantern] = activations("Ghost Lantern");
    assert.deepEqual([lantern.builtin, done(lantern), lantern.zone.area, lantern.zone.lasts.value, lantern.trigger.frequency.per], ["zone", true, { type: "emanation", value: 30 }, 5, "day"]);
    assert.deepEqual(lantern.zone.inside, [{ rules: [{ key: "AdjustStrike", mode: "add", property: "property-runes", value: "ghostTouch", definition: [] }] }]);
});

test("Inspiring Spotlight: its burst lit (zone.light) and the counteract card against the magical darkness it meets", () => {
    for (const [name, modifier, rank] of [["Inspiring Spotlight (Portable)", 17, 5], ["Inspiring Spotlight (Mounted)", 25, 8]]) {
        const spotlight = activation(name, "Light It Up");
        assert.deepEqual([done(spotlight), spotlight.zone.light, spotlight.item.counteract.modifier, spotlight.item.counteract.rank, spotlight.item.counteract.free.name], [true, { bright: 5, dim: 5 }, modifier, rank, "the magical darkness"], name);
        assert.ok(!spotlight.zone.notes.some((note) => /by hand\)\.$/.test(note) && /counteract/.test(note)));
    }
});

test("terrain an item makes: Spill Sand's square and the jar's shared minute, Fleshgem's two ways, Swamp Lily Quilt, Colorful Coating (Yellow)'s Climb", () => {
    const [avalanche, spill] = activations("Jar of Shifting Sands");
    assert.deepEqual([spill.builtin, done(spill), spill.zone.terrain, spill.zone.area, spill.trigger.recharge], ["zone", true, [{ movement: ["walk"], difficulty: 2 }], { type: "square", value: 5 }, { value: 1, unit: "minutes", shared: ["Avalanche of Sand"] }]);
    assert.deepEqual(avalanche.trigger.recharge, { value: 1, unit: "minutes", shared: ["Spill Sand"] });
    const [fleshgem] = activations("Fleshgem (Earthspeaker)");
    assert.deepEqual([fleshgem.builtin, routeOf(fleshgem), fleshgem.ways.map((way) => [way.plan.zone.lasts.value, way.plan.zone.lasts.unit, way.plan.activation.time])], ["ways", "ways", [[1, "rounds", "1"], [1, "minutes", "2"]]]);
    assert.deepEqual([fleshgem.ways[0].plan.zone.hazard, fleshgem.ways[0].plan.zone.others], [{ formulas: ["2[piercing]"] }, true]);
    const quilt = compileItem(item("Swamp Lily Quilt"));
    assert.deepEqual([quilt.builtin, done(quilt), quilt.zone.area, quilt.zone.lasts], ["zone", true, { type: "square", value: 10 }, null]);
    const yellow = compileItem(item("Colorful Coating (Yellow)"));
    assert.deepEqual([yellow.builtin, done(yellow), yellow.zone.modifiers], ["zone", true, [{ selector: "athletics", value: 2, type: "circumstance", predicate: ["action:climb"] }]]);
});

test("Flask of Elemental Earth: its basic Reflex save as it explodes, then an hour of hazardous terrain dealing persistent bleed", () => {
    const flask = compileItem(item("Flask of Elemental Earth"));
    assert.deepEqual([flask.builtin, done(flask), flask.zone.range, flask.zone.saves[0].when, flask.zone.saves[0].plan.resolution.check.basic, flask.zone.hazard, flask.zone.damage], ["zone", true, 60, ["initial"], true, { formulas: ["1d6[persistent,bleed]"] }, [{ when: "end", formulas: ["1d6[persistent,bleed]"] }]]);
});

test("zones for those inside: Healing Vapor's save bonus against diseases and poisons, Lambent Perfume's new save at a turn's end, Candle of Revealing", () => {
    for (const [name, value] of [["Healing Vapor (Lesser)", 1], ["Healing Vapor (Moderate)", 1], ["Healing Vapor (Greater)", 2], ["Healing Vapor (Major)", 3]]) {
        const vapor = compileItem(item(name));
        assert.deepEqual([vapor.builtin, done(vapor), vapor.zone.lasts.value, vapor.zone.modifiers[0].value, vapor.zone.modifiers[0].predicate], ["zone", true, 10, value, [{ or: ["item:trait:disease", "item:trait:poison"] }]], name);
    }
    const perfume = activation("Lambent Perfume", "Light Incense");
    assert.deepEqual([perfume.builtin, done(perfume), perfume.zone.saves[0].when, perfume.zone.saves[0].plan], ["zone", true, ["end"], null]);
    assert.match(perfume.zone.saves[0].note, /24 hours/);
    const candle = compileItem(item("Candle of Revealing"));
    assert.deepEqual([candle.builtin, done(candle), candle.zone.lasts.value, candle.zone.inside[0].rules[0].predicate], ["zone", true, 1, ["self:condition:invisible"]]);
});

test("Alchemical Atomizer's cloud in a square until its user's next turn, and Biting Snare's critical failure: the Speed penalty until healed", () => {
    const cloud = activations("Alchemical Atomizer")[1];
    assert.deepEqual([cloud.builtin, done(cloud), cloud.zone.range, cloud.zone.lasts.value, cloud.zone.saves[0].when], ["zone", true, 30, 1, ["enter"]]);
    const snare = compileItem(item("Biting Snare"));
    const critical = snare.zone.saves[0].plan.resolution.outcomes.criticalFailure;
    assert.deepEqual([done(snare), critical.manualInstructions, critical.noteEffects[0].rules, critical.noteEffects[0].duration], [true, undefined, [{ key: "FlatModifier", selector: "all-speeds", type: "status", value: -10 }], null]);
});
