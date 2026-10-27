// Sustained, repeating and later effects (2026-10-27, docs/needs.md "lasting"): the readings of src/compiler/lasting.js — note Effects, the
// creatures' conditions, casts, a whisper and the card's lines, every sentence read —, Blakenshipper's Sustain card kept open for its minute,
// Troll Hide's healing paused by electricity or fire, and what the user's rulings make of the rest (notes checked, one-offs, card lines).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { needsOf } from "../src/compiler/needs.js";
import { routeOf } from "../src/live/route.js";
import { deactivatedEffectSource, installedEffectSource } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("what doesn't go on isn't lasting: Atlas Arcane's intel that 'does not update afterward' is whispered", () => {
    assert.deepEqual(needsOf({ result: "none", kind: "activation", text: "Effect This intel is current the moment the phrase is spoken but does not update afterward." }), ["no-rules"]);
    const atlas = activation("Atlas Arcane", "Situation Report");
    assert.deepEqual([atlas.builtin, atlas.decided, routeOf(atlas)], ["whisper", "information", "whisper"]);
    assert.match(atlas.whisper.text, /troop movements/);
});

test("food that sustains and a time to the next daily preparations are out of combat: Campaign Stable and Mender's Soup, card lines", () => {
    assert.deepEqual([compileActivations(item("Campaign Stable"))[0].plan.decided, compileItem(item("Mender's Soup")).decided], ["card-line", "card-line"]);
});

test("note-only and checked as having nothing to play: Bracelet of Buoyancy, War Mage's Buckler, Trackless (Greater), Kaiju Fulu and the others", () => {
    for (const plan of [activation("Bracelet of Buoyancy", "Float"), activation("War Mage's Buckler", "Spell Amp"), activations("Trackless (Greater)")[0]]) assert.deepEqual([plan.decided, plan.noteOnly, done(plan)], ["checked", undefined, true]);
    for (const name of ["Kaiju Fulu", "Instant Spy", "Colorful Coating (Indigo)", "Banquet of Hungry Ghosts", "Feast of Hungry Ghosts"]) assert.equal(compileItem(item(name)).decided, "checked", name);
});

test("one-offs, their card's lines: Sea Retrieval Line, Kizidhar's Shield's Repair, Duchy Defender's Declare Judgment, Breech Ejectors, Shifter Prosthesis, Called (Lastwall)", () => {
    const plans = [activations("Sea Retrieval Line")[0], activation("Kizidhar's Shield", "Repair"), activation("Duchy Defender", "Declare Judgment"), compileItem(item("Breech Ejectors")), ...activations("Shifter Prosthesis"), ...activations("Called (Lastwall)")];
    for (const plan of plans) assert.deepEqual([plan.decided, done(plan)], ["one-off", true], plan.source?.name);
    assert.match(activation("Duchy Defender", "Declare Judgment").notes[0], /additional 2d8 precision damage/);
});

test("a note Effect for its time, a Dismiss its user removing it: Patchwork Double's 30 minutes, Inscribe with no time, Charm of the Ordinary's 10 minutes", () => {
    const double = activation("Hat of Many Minds", "Patchwork Double");
    const note = double.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(double), note.duration.value, note.duration.unit, double.item.activation.name, double.trigger.frequency.per, routeOf(double)], [true, 30, "minutes", "Patchwork Double", "day", "item"]);
    assert.match(note.text, /a task of 10 minutes for its user at most/);
    const inscribe = activation("Twilight Tattoo", "Inscribe");
    assert.deepEqual([done(inscribe), inscribe.resolution.outcomes.success.noteEffects[0].duration], [true, null]);
    const charm = compileItem(item("Charm of the Ordinary"));
    const merged = charm.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(charm), merged.duration.value, charm.item.type, charm.item.uses.autoDestroy], [true, 10, "consumable", true]);
    assert.match(merged.text, /can't cast spells/);
    assert.match(merged.text, /10d6 damage/);
    assert.equal(charm.notes.length, 1);
});

test("sound, messages and languages a note Effect: Clockwork Recorder, Pathfinder's Coin, Aeon Stone (Eastern Star), Spectacles of Understanding (Greater) over its Translate cast", () => {
    for (const plan of [activations("Clockwork Recorder")[0], activations("Pathfinder's Coin")[0], activation("Aeon Stone (Eastern Star)", "Absorb Language")]) assert.deepEqual([done(plan), plan.resolution.outcomes.success.noteEffects.length], [true, 1]);
    const spectacles = activations("Spectacles of Understanding (Greater)")[0];
    assert.deepEqual([spectacles.builtin, done(spectacles)], [undefined, true]);
    assert.match(spectacles.resolution.outcomes.success.noteEffects[0].text, /every language it sees/);
});

test("objects and out of combat, the card's lines: Everlasting Adhesive's DC 50, Librarian's Baton's attunement, Bivouac Targe's tent, Pathfinder's Pouch", () => {
    const adhesive = compileItem(item("Everlasting Adhesive"));
    assert.deepEqual([done(adhesive), adhesive.notes.length], [true, 3]);
    assert.match(adhesive.notes[1], /DC 50 Athletics/);
    const [attune, point] = activations("Librarian's Baton");
    assert.deepEqual([done(attune), attune.notes.length, point.builtin, routeOf(point)], [true, 2, "whisper", "whisper"]);
    assert.match(point.whisper.text, /within 25 miles/);
    assert.match(point.whisper.text, /Sustained \(up to 1 minute\)/);
    assert.ok(done(activation("Bivouac Targe", "Deploy Encampment")));
    assert.ok(done(activations("Pathfinder's Pouch")[0]));
});

test("engulfed on the plunge: Lily Pad Platform's creatures Grabbed and Slowed 1 for the hour, each ended by an Escape (DC 19)", () => {
    const plunge = activation("Lily Pad Platform", "Plunge");
    const [grabbed, slowed] = plunge.resolution.outcomes.success.effects;
    assert.deepEqual([grabbed.slug, slowed.slug, slowed.value, grabbed.duration.value, grabbed.duration.unit, grabbed.duration.escape, done(plunge), routeOf(plunge)], ["grabbed", "slowed", 1, 1, "hours", { dc: 19 }, true, "save"]);
});

test("a coffee for each drinker: Faydhaan's Dallah's water breathing for 8 hours, on the creatures targeted", () => {
    const brew = activation("Faydhaan's Dallah", "Brew");
    const [breathing] = brew.item.ruleEffects;
    assert.deepEqual([brew.item.recipient, breathing.name, breathing.duration.value, breathing.duration.unit, done(brew)], ["targets", "water breathing", 8, "hours", true]);
});

test("casts: Horrific Effigy's Nightmare at DC 30, Primeval Mistletoe's Field of Life; Silver Snake Cane's giant viper, its Strikes silver", () => {
    const leng = activation("Horrific Effigy", "Whispers of Leng");
    assert.deepEqual([leng.builtin, leng.spell.name, leng.rank, leng.dc, leng.targets, leng.partial, routeOf(leng)], ["cast-spell", "Nightmare", 4, 30, true, undefined, "cast"]);
    const field = activation("Primeval Mistletoe (Greater)", "Cultivate");
    assert.deepEqual([field.builtin, field.spell.name, field.rank, field.area, field.item.activation.name], ["cast-spell", "Field of Life", 6, true, "Cultivate"]);
    const snake = activation("Silver Snake Cane", "True Silver Snake");
    const [viper] = snake.creatures;
    assert.deepEqual([snake.builtin, viper.from, viper.initiative, viper.own.rules[0].value, snake.partial], ["conjure", { name: "Giant Viper" }, "roll", "silver", undefined]);
});

test("a Sustain that gives again: Blakenshipper's 15 temporary Hit Points, then its card for the Sustain's 5, kept open for the minute", () => {
    const band = activation("Blakenshipper", "Be the Band");
    assert.deepEqual([band.partial, band.notes, band.resolution.outcomes.success.effects[0].amount, routeOf(band)], [undefined, undefined, 15, "save"]);
    const { again } = band;
    assert.deepEqual([again.later, again.repeat, again.time, again.plan.resolution.outcomes.success.effects[0].amount, again.plan.allyArea, again.plan.again], [true, true, { value: 1, unit: "minutes" }, 5, true, undefined]);
    assert.match(again.when, /Sustains it/);
});

test("healing a damage type pauses: Troll Hide's installed elixirs, off to the end of the next turn after electricity or fire damage", () => {
    const hide = activations("Troll Hide")[0];
    assert.deepEqual([hide.partial, hide.item.installed.deactivatedBy, hide.notes.length], [undefined, { types: ["electricity", "fire"] }, 4]);
    const item = { name: "Troll Hide", slug: "troll-hide", uuid: "Actor.a.Item.b" };
    const effect = installedEffectSource(hide.item.installed, { name: "Elixir of Life (Greater)", level: 13, bonus: 3 }, { item, moduleId: "m" });
    assert.deepEqual(effect.system.rules, [{ key: "FastHealing", value: 13, predicate: [{ not: "self:effect:air-deactivated-troll-hide" }] }]);
    assert.deepEqual(effect.flags.m.deactivatedBy, { types: ["electricity", "fire"], slug: "air-deactivated-troll-hide" });
    assert.match(effect.system.description.value, /off to the end of its wearer&#39;s next turn after electricity or fire damage/);
    const paused = deactivatedEffectSource({ name: "Troll Hide", slug: "air-deactivated-troll-hide", types: ["electricity", "fire"] }, { moduleId: "m" });
    assert.deepEqual([paused.system.slug, paused.system.duration, paused.flags.m.deactivated], ["air-deactivated-troll-hide", { value: 1, unit: "rounds", expiry: "turn-end", sustained: false }, "air-deactivated-troll-hide"]);
});
