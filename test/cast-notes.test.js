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
