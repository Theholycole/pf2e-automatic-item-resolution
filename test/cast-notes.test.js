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
