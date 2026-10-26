// The user's rulings for what has no game numbers (src/compiler/decided.js, 2026-10-25): speech and minds a note Effect, counted done;
// information whispered to the GM and the user, counted done — never one with numbers or rules of its own, nor the spell module's items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;

test("speech: a note Effect of its words, done — Codebreaker's Parchment, Bookthief Brew without its Activate line", () => {
    const decode = activation("Codebreaker's Parchment", "Decode Writing");
    assert.deepEqual([decode.decided, decode.noteOnly, decode.partial, decode.builtin, routeOf(decode)], ["speech", undefined, undefined, undefined, "item"]);
    assert.match(decode.resolution.outcomes.success.noteEffects[0].text, /^The scrambled words align/);
    const brew = compileItem(item("Bookthief Brew"));
    assert.deepEqual([brew.decided, brew.item.type], ["speech", "consumable"]);
    assert.doesNotMatch(brew.resolution.outcomes.success.noteEffects[0].text, /^Activate/);
});

test("information: whispered to the GM and the user — Navigator's Star, Ring of Sigils", () => {
    const star = compileActivations(item("Navigator's Star"))[0].plan;
    assert.deepEqual([star.builtin, star.decided, routeOf(star)], ["whisper", "information", "whisper"]);
    assert.match(star.whisper.text, /you learn which direction you're facing/);
    assert.equal(compileActivations(item("Ring of Sigils"))[0].plan.builtin, "whisper");
});

test("minds: a GM's line on a row a note Effect on that row, done on its own — Spider Lily Tattoo's undead that believes you're undead", () => {
    const lily = activation("Spider Lily Tattoo", "Dead Like You");
    assert.deepEqual([lily.decided, lily.partial], ["mind", undefined]);
    assert.ok(Object.values(lily.resolution.outcomes).some((row) => (row?.noteEffects ?? []).some((note) => /believes you're undead/.test(note.text))));
    assert.ok(Object.values(lily.resolution.outcomes).every((row) => !(row?.manualInstructions ?? []).some((line) => /believes you're undead/.test(line))));
});

test("not decided: words with game numbers stay work to build (Comprehension Elixir's check, Laboratory Coat's 20-foot transport); the spell module's catalysts untouched", () => {
    assert.equal(compileItem(item("Comprehension Elixir (Lesser)"))?.decided, undefined);
    assert.equal(activation("Laboratory Coat", "Quick Escape")?.decided, undefined);
    assert.equal(compileItem(item("Feral Linguist")), null);
});
