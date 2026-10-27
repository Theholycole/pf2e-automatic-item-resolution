// Moving creatures and the user (2026-10-27, docs/needs.md "Moving creatures and the user"): its user's own moves as lines of the card
// (src/compiler/own-moves.js), the falls they ease (src/compiler/falls.js), the teleports they read (src/compiler/teleport.js), on PF2e's
// own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { fallEffectSource, fallLine } from "../src/live/card.js";
import { teleportLines } from "../src/live/teleport-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => {
    const entries = compileActivations(item(name));
    return (which === null ? entries[0] : entries.find((entry) => entry.activation.name === which)).plan;
};
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("a glide down is its user's own move, a line of the card — Eagle Wing's Soar 30 feet forward, the Gliding rune's 25", () => {
    const soar = activation("Eagle Wing", "Soar");
    assert.ok(done(soar));
    assert.deepEqual(soar.notes, ["Glide 5 feet down and up to 30 feet forward through the air; having glided this turn and not yet reached the ground, it stays in the air at the end of its turn; otherwise it falls (its own move on the map)."]);
    const gliding = activation("Gliding");
    assert.ok(done(gliding));
    assert.match(gliding.notes[0], /^Glide 5 feet down and up to 25 feet forward/);
});

test("moves while time pauses, and Sustained skating: Pocket Watch of Stethelos' Step Between the Ticks, Gadget Skates — every sentence on the card", () => {
    const watch = activation("Pocket Watch of Stethelos", "Step Between the Ticks");
    assert.ok(done(watch));
    assert.match(watch.notes[0], /^Take 3 actions at once, each a Leap, Stand, Step or Stride, or a Burrow, Climb, Fly or Swim with that Speed, while time pauses; .*it seems to have teleported \(its own move on the map\)\.$/);
    const skates = compileItem(item("Gadget Skates"));
    assert.ok(done(skates));
    assert.equal(skates.notes.length, 1);
    for (const words of [/twice its Speed/, /DC 20 Acrobatics/, /can't Stride, Step or otherwise move on the ground/, /High Jump's or Long Jump's Stride/, /Sustained up to 1 minute/, /first Sustain each turn/]) assert.match(skates.notes[0], words);
});

test("a long Leap beside a harmless fall: Emerald Grasshopper's Leap a line, its flutter and 60-foot fall the environment module's no-damage Effect until the end of its next turn", () => {
    const grasshopper = compileItem(item("Emerald Grasshopper"));
    assert.ok(done(grasshopper));
    assert.deepEqual(grasshopper.fall, { noDamage: true, rate: 60, flutter: true, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } });
    assert.deepEqual(grasshopper.notes, ["Leap up to 40 feet horizontally and up to 10 feet vertically (its own move on the map)."]);
    assert.equal(fallLine(grasshopper.fall), "It flutters in the air until the end of its turn; then it falls 60 feet a round; it takes no damage from a fall for 1 round");
    assert.deepEqual(fallEffectSource(grasshopper.fall, { item: { name: "Emerald Grasshopper" } }).flags["pf2e-automatic-environment-resolution"].fall, { noDamage: true, source: "Emerald Grasshopper" });
    // (The greater one's other Leaps that turn: said too, not dropped.)
    const greater = compileItem(item("Emerald Grasshopper (Greater)"));
    assert.ok(done(greater));
    assert.deepEqual(greater.notes, ["Leap up to 100 feet horizontally and up to 30 feet vertically, and so can its other Leaps before the end of its turn (its own move on the map)."]);
});

test("a teleport beside the other wearer, and out of a fire: Headbands of Translocation from the creature targeted, Fire-Jump Ring 100 feet after its own Stride", () => {
    const headbands = activation("Headbands of Translocation");
    assert.ok(done(headbands));
    assert.equal(headbands.builtin, "teleport");
    assert.deepEqual([headbands.teleport.within, headbands.teleport.from], [5, "target"]);
    assert.deepEqual(teleportLines(headbands.teleport), ["The creature targeted: the other invested wearer, within 1 mile of its user"]);
    const ring = activation("Fire-Jump Ring", "Fire Jump");
    assert.ok(done(ring));
    assert.deepEqual([ring.teleport.within, ring.teleport.from, ring.notes], [100, "self", undefined]);
    assert.equal(teleportLines(ring.teleport).length, 3);
    assert.match(teleportLines(ring.teleport)[0], /^First its own Stride \(or Burrow or Fly, with that Speed\) into a fire/);
});

test("difficult terrain ignored till its turn's end: Feather Step Stone's PF2e terrain rules on its user's Effect", () => {
    const stone = compileItem(item("Feather Step Stone"));
    assert.ok(done(stone));
    const [effect] = stone.item.ruleEffects;
    assert.deepEqual(effect.rules.map((rule) => rule.path), ["system.movement.terrain.difficult.ignored", "system.movement.terrain.greater.ignored"]);
    assert.deepEqual(effect.duration, { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" });
});

test("a fall eased by the height it's deployed at: Parachute Mail's ways, no damage above 100 feet, half below (the environment module's halved flag)", () => {
    const parachute = activation("Parachute Mail", "Deploy Parachute");
    assert.ok(done(parachute));
    assert.equal(parachute.builtin, "ways");
    assert.deepEqual(parachute.ways.map((way) => way.plan.fall), [{ noDamage: true, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } }, { halved: true, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } }]);
    assert.deepEqual(parachute.ways[0].plan.notes, ["It deploys fully within 1 round.", "Used, it deploys again only once repacked: 10 minutes and a DC 15 Crafting check (its user's own)."]);
    const half = parachute.ways[1].plan.fall;
    assert.equal(fallLine(half), "It takes half the damage from a fall for 1 round");
    assert.deepEqual(fallEffectSource(half, { item: { name: "Parachute Mail" } }).flags["pf2e-automatic-environment-resolution"].fall, { halved: true, source: "Parachute Mail" });
});

test("note-only moves checked as having nothing a card plays: Frog Chair's Frog Hop, Compass of Transpositional Awareness' Triangulate", () => {
    for (const [name, which] of [["Frog Chair", "Frog Hop"], ["Compass of Transpositional Awareness", "Triangulate"]]) {
        const plan = activation(name, which);
        assert.deepEqual([plan.noteOnly, plan.decided, plan.automation.level], [undefined, "checked", "automatic"], name);
    }
});
