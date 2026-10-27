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

// The user's answers of 2026-10-27: leftovers that are only out of combat or objects (or those beside speech, minds, information) a line of
// the card, counted done — never a unique item's or an artifact's, nor words that act on a creature in a fight; a one-off rule
// (src/compiler/one-offs.js) its card's line, kept to build later.
test("card lines: out of combat and objects counted done, their words on the card — Everyneed Pack, Timeless Salts, Tentacle Potion's limb", () => {
    const pack = compileItem(item("Everyneed Pack (Greater)")) ?? compileActivations(item("Everyneed Pack (Greater)"))[0].plan;
    assert.deepEqual([pack.decided, pack.partial, pack.noteOnly, routeOf(pack)], ["card-line", undefined, undefined, "item"]);
    assert.match(pack.notes[0], /mundane gear from the pack/);
    const salts = compileItem(item("Timeless Salts"));
    assert.deepEqual([salts.decided, salts.builtin, salts.item.type], ["card-line", undefined, "consumable"]);
    assert.match(salts.notes[0], /preserve it for 1 week/);
    const tentacle = compileItem(item("Tentacle Potion (Greater)"));
    assert.deepEqual([tentacle.decided, tentacle.partial, tentacle.unread], ["card-line", undefined, undefined]);
    assert.ok(tentacle.notes.some((note) => /simple Interact actions/.test(String(note))));
});

test("card lines: not a unique item's or an artifact's (The Trader, Deck of Many Things), nor words that act in a fight (Aether Appendage's Strikes)", () => {
    const trader = compileItem(item("The Trader")) ?? compileActivations(item("The Trader"))[0]?.plan;
    assert.notEqual(trader?.decided, "card-line");
    assert.notEqual(compileActivations(item("Deck of Many Things"))[0]?.plan?.decided, "card-line");
    assert.notEqual(compileActivations(item("Aether Appendage"))[0]?.plan?.decided, "card-line");
});

test("one-offs: Baleblood Draft's next-elixir rule a line of its card, kept to build later", () => {
    const draft = compileItem(item("Baleblood Draft"));
    assert.deepEqual([draft.decided, draft.partial, draft.builtin], ["one-off", undefined, undefined]);
    assert.match(draft.notes[0], /duration extended by 50%/);
});

test("one-offs on a card of their own (a counteract's, a zone's, a cast's): its notes its lines already — Reflecting Shield, Pheromone Flare, Leydroth Spellbreaker; a checked one nothing read, Serum of Sex Shift", () => {
    const reflect = activation("Reflecting Shield", "Reflect Spell");
    assert.deepEqual([reflect.decided, reflect.partial, reflect.builtin], ["one-off", undefined, "counteract"]);
    assert.ok(reflect.item.counteract.notes.some((note) => /turned back on its caster/.test(note)));
    const flare = compileItem(item("Pheromone Flare (Lesser)"));
    assert.deepEqual([flare.decided, flare.partial, flare.builtin], ["one-off", undefined, "zone"]);
    assert.equal(activation("Leydroth Spellbreaker", "Dispelling Blast").decided, "one-off");
    const serum = compileItem(item("Serum of Sex Shift"));
    assert.deepEqual([serum.decided, serum.partial, routeOf(serum)], ["checked", undefined, "item"]);
    assert.match(serum.notes[0], /sexual characteristics of your choice/);
});
