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
