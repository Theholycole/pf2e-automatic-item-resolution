// Who sees whom, and several creatures at once (2026-10-27, docs/needs.md "Hidden, undetected, invisible, cover", "Several creatures at
// once"): the readings of src/compiler/visibility.js — note Effects on the creature it's about, PF2e's cover and toggled bonuses as their
// rules, the card's lines, whispers, a cast —, Guiding Starknife's damage by its striking rune, and what the user's rulings make of the rest
// (notes checked, one-offs).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const notes = (plan) => plan.resolution.outcomes.success.noteEffects;
const minutes = (value) => ({ mode: "fixed", value, unit: "minutes", expiry: "turn-start", anchor: "effect-start" });

test("hiding without cover, never Sneaking without it: the Chameleon Suits' and Camouflaging Chromatophores' note Effect for their time", () => {
    const suits = ["Chameleon Suit", "Chameleon Suit (Greater)", "Chameleon Suit (Major)"].map((name) => compileItem(item(name), options));
    assert.deepEqual(suits.map((plan) => notes(plan)[0].duration), [minutes(1), minutes(10), { ...minutes(1), unit: "hours" }]);
    for (const plan of suits) {
        assert.ok(done(plan));
        assert.deepEqual(notes(plan).map((note) => note.label), ["Blending in"]);
        assert.match(notes(plan)[0].text, /can't Sneak without ending its movement in cover/);
        assert.ok(plan.notes.some((line) => /falls apart/.test(line)));
    }
    for (const grade of ["Lesser", "Greater"]) {
        const plan = activation(`Camouflaging Chromatophores (${grade})`, "Background Adaptation");
        assert.ok(done(plan));
        assert.deepEqual([notes(plan)[0].label, notes(plan)[0].duration, plan.trigger.frequency.per], ["Blending in", minutes(1), grade === "Lesser" ? "day" : "hour"]);
    }
});

test("each creature in the area: Glimmering Missive's dust for an hour and Revealing Mist's minute, on the creatures its presser targets", () => {
    const missive = compileItem(item("Glimmering Missive"), options);
    assert.deepEqual([missive.item.recipient, missive.targeting.area, notes(missive)[0].duration.value, notes(missive)[0].duration.unit], ["targets", { type: "burst", value: 10 }, 1, "hours"]);
    assert.match(notes(missive)[0].text, /Concealed rather than Undetected/);
    assert.ok(done(missive));
    for (const [grade, cone] of [["Lesser", 15], ["Greater", 30]]) {
        const mist = compileItem(item(`Revealing Mist (${grade})`), options);
        assert.deepEqual([mist.item.recipient, mist.targeting.area, notes(mist)[0].duration], ["targets", { type: "cone", value: cone }, minutes(1)]);
        assert.ok(mist.notes.some((line) => /wind disperses it early/.test(line)));
        assert.ok(done(mist));
    }
});

test("the drinker's scent, an undead's attacks, a powdered creature: words on whom they're for, for their time", () => {
    const [lesser, greater] = ["Lesser", "Greater"].map((grade) => compileItem(item(`Olfactory Obfuscator (${grade})`), options));
    assert.deepEqual([lesser.item.recipient, notes(lesser)[0].duration, notes(greater)[0].duration.value, notes(greater)[0].duration.unit], ["drinker", minutes(10), 8, "hours"]);
    assert.match(notes(lesser)[0].text, /\+4 item bonus against a Seek/);
    assert.ok(!notes(lesser).some((note) => note.reminder));
    const peach = compileItem(item("Peachwood Talisman"), options);
    assert.deepEqual([notes(peach)[0].label, notes(peach)[0].duration, done(peach)], ["Senses undead", minutes(1), true]);
    const powder = compileItem(item("Powder"), options);
    assert.deepEqual([powder.item.recipient, powder.targeting.range, notes(powder)[0].duration], ["targets", "5 feet", { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }]);
});

test("a bonus only in a situation: Phantom Roll's Avoid Notice (PF2e's own option, or its toggle) and Aroma Concealer's smell, on their note Effect", () => {
    const roll = compileItem(item("Phantom Roll"), options);
    const [note] = notes(roll);
    assert.deepEqual([roll.partial, roll.unread, roll.resolution.outcomes.success.modifiers, note.duration.value, note.duration.unit], [undefined, undefined, [], 24, "hours"]);
    assert.deepEqual(note.rules[1], { key: "FlatModifier", selector: "stealth", type: "item", value: 1, predicate: [{ or: ["action:avoid-notice", "phantom-roll-avoid-notice"] }] });
    assert.equal(note.rules[0].toggleable, true);
    const aroma = compileItem(item("Aroma Concealer"), options);
    const [masked] = notes(aroma);
    assert.deepEqual([aroma.partial, aroma.resolution.outcomes.success.modifiers, masked.duration.value, masked.duration.unit], [undefined, [], 1, "hours"]);
    assert.deepEqual(masked.rules[1].predicate, ["aroma-concealer-smell", { or: ["action:hide", "action:sneak"] }]);
    assert.ok(aroma.notes.some((line) => /Medium or smaller creature/.test(line)));
});

test("what a creature's sight changes once is the card's line: Lion Claw's Strike after its Stride, Hunter's Bane, Goblin-Eye Orb, Ghostshot Wrapping", () => {
    const claw = compileItem(item("Lion Claw"), options);
    assert.deepEqual([claw.builtin, claw.teleport.move.verb, claw.partial], ["teleport", "Stride", undefined]);
    assert.ok(claw.notes.some((line) => /Undetected by it until after that Strike/.test(line)));
    for (const name of ["Hunter's Bane", "Goblin-Eye Orb", "Ghostshot Wrapping"]) {
        const plan = compileItem(item(name), options);
        assert.ok(done(plan), name);
        assert.equal(plan.notes.length, 2, name);
    }
    assert.ok(compileItem(item("Hunter's Bane"), options).notes.some((line) => /behind lead/.test(line)));
});

test("a holly bush's berries: 2d4 in its user's inventory, each eaten for 1 Hit Point (Verdant Branch's fruit), the token fired or not", () => {
    const token = compileItem(item("Feather Token (Holly Bush)"), options);
    const shot = activations("Feather Token (Holly Bush) (Ammunition)")[0];
    for (const plan of [token, shot]) {
        assert.deepEqual(plan.item.creates, { name: "Holly Berry", count: "2d4", heal: "@Damage[1[healing]]" });
        assert.ok(done(plan));
        assert.ok(plan.notes.some((line) => /withers within 1d4 days/.test(line)));
    }
    assert.ok(shot.notes.some((line) => /where the shot lands/.test(line)));
    assert.ok(!token.notes.some((line) => /where the shot lands/.test(line)));
});

test("Siege Shield's cover by the creature's size: the ways card's two, PF2e's cover rules at standard and lesser on the creature in its square", () => {
    const shield = activation("Siege Shield", "Plant Cover");
    assert.deepEqual([shield.builtin, shield.once, routeOf(shield), shield.ways.length], ["ways", true, "ways", 2]);
    const [standard, lesser] = shield.ways.map((way) => way.plan.item.ruleEffects[0]);
    assert.deepEqual(standard.rules.find((rule) => rule.selector === "ac"), { key: "FlatModifier", selector: "ac", type: "circumstance", value: 2 });
    assert.deepEqual(lesser.rules.find((rule) => rule.selector === "ac").value, 1);
    assert.ok(standard.rules.some((rule) => rule.option === "self:cover-level:standard"));
    assert.ok(shield.ways.every((way) => way.plan.item.recipient === "targets"));
});

test("on the creature it's about: Shadowmist Cape's Hidden on the creature that missed, Mirror Robe's diverted foe, Lady's Knife's link both ways", () => {
    const cape = activations("Shadowmist Cape")[0];
    assert.equal(cape.partial, undefined);
    for (const degree of ["success", "criticalSuccess"]) {
        const row = cape.resolution.outcomes[degree];
        assert.deepEqual([row.manualInstructions, row.noteEffects[0].duration.expiry], [undefined, "turn-end"]);
    }
    assert.match(cape.resolution.outcomes.success.noteEffects[0].text, /hostile action against it/);
    const robe = activations("Mirror Robe")[1];
    assert.deepEqual([robe.item.recipient, notes(robe)[0].duration.expiry, done(robe)], ["targets", "turn-start", true]);
    assert.match(notes(robe)[0].text, /not to the wearer/);
    const knife = activations("Lady's Knife")[0];
    assert.deepEqual([knife.item.recipient, notes(knife)[0].duration.value, notes(knife)[0].duration.unit], ["targets", 24, "hours"]);
});

test("Guiding Starknife's Points of Light: its damage by the weapon's striking rune, the target outlined to its user's next turn, the knife back a line", () => {
    const base = activation("Guiding Starknife", "Points of Light");
    assert.equal(base.resolution.sharedDamage.components[0].formula, "4[piercing],1d4[spirit]");
    assert.deepEqual([base.partial, base.resolution.outcomes.success.manualInstructions], [undefined, undefined]);
    assert.deepEqual(base.resolution.outcomes.success.noteEffects[0].duration, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" });
    assert.ok(base.notes.some((line) => /returns to its user's hand/.test(line)));
    const knife = item("Guiding Starknife");
    const greater = compileActivations({ ...knife, system: { ...knife.system, runes: { ...knife.system.runes, striking: 2 } } }, options).find((entry) => entry.activation.name === "Points of Light").plan;
    assert.equal(greater.resolution.sharedDamage.components[0].formula, "6[piercing],1d4[spirit]");
});

test("what it tells, whispered: Detector Stone's two activations and Singing Stone's Stone's Sight", () => {
    const [glow, auras] = activations("Detector Stone");
    assert.deepEqual([glow.builtin, auras.builtin, routeOf(glow)], ["whisper", "whisper", "whisper"]);
    assert.match(glow.whisper.text, /DC 23 \(not 20\)/);
    assert.match(auras.whisper.text, /within 30 feet/);
    const sight = activation("Singing Stone", "Stone's Sight");
    assert.equal(sight.builtin, "whisper");
    assert.match(sight.whisper.text, /15 feet deep and 5 feet across/);
});

test("one-offs beside a cast: Rhyton's Command at every hostile creature (its Fatigued a line), Fulu of Concealment's hour", () => {
    const command = activation("Rhyton of the Radiant Ifrit", "Ifrit's Command");
    assert.deepEqual([command.builtin, command.spell.name, command.rank, command.targets, command.decided, routeOf(command)], ["cast-spell", "Command", 6, true, "one-off", "cast"]);
    assert.ok(command.notes.some((line) => /Fatigued for as long as the command/.test(line)));
    const fulu = compileItem(item("Fulu of Concealment"), options);
    assert.deepEqual([fulu.builtin, fulu.decided, fulu.castDuration.value, fulu.castDuration.unit, fulu.partial], ["cast-spell", "one-off", 1, "hours", undefined]);
    for (const name of ["Rhyton of the Radiant Ifrit: Ifrit's Command", "Fulu of Concealment", "Exploitative Wealth: Enforce Competition", "Accursed Fame: Entreat Crowd", "Faydhaan's Dallah: Faydhaan's Hospitality", "Toshigami Blossom"]) assert.ok(ONE_OFFS.has(name), name);
});

test("the user's rulings for the rest: one-offs' card lines, and notes checked as holding nothing to play", () => {
    for (const plan of [activation("Exploitative Wealth", "Enforce Competition"), activation("Accursed Fame", "Entreat Crowd"), activation("Faydhaan's Dallah", "Faydhaan's Hospitality"), activations("Toshigami Blossom")[2]]) assert.deepEqual([plan.decided, done(plan)], ["one-off", true]);
    assert.deepEqual(activations("Toshigami Blossom").slice(0, 2).map((plan) => plan.decided), [undefined, undefined]);
    const checked = [...["Lesser", "Moderate", "Greater"].map((grade) => activations(`Ring of Observation (${grade})`)[0]), ...["Tlil Mask", "Tlil Mask (Greater)"].map((name) => activations(name)[0]), activation("Silent Bell", "Ring in the Quiet"), activation("Twilight Tattoo", "Fade"), activation("Ally's Kerchief", "Identify Allies"), activation("Mirrorblade", "Scryshield"), ...["Ectoplasmic Tracer", "Lover's Ink", "Parchment of Secrets", "Moonlit Ink"].map((name) => compileItem(item(name), options))];
    for (const plan of checked) assert.deepEqual([plan.decided, done(plan)], ["checked", true], plan.source?.name);
});
