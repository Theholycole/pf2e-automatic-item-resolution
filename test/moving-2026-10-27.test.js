// Moving creatures and the user (2026-10-27, docs/needs.md "Moving creatures and the user"): its user's own moves as lines of the card
// (src/compiler/own-moves.js), the falls they ease (src/compiler/falls.js), the teleports they read (src/compiler/teleport.js), on PF2e's
// own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { fallEffectSource, fallLine } from "../src/live/card.js";
import { freeSpacesBeside, squaresAlong, teleportLines, teleportText } from "../src/live/teleport-card.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
// (PF2e's spells, for the casts' and the one-offs' readings as live play has them.)
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => {
    const entries = compileActivations(item(name), options);
    return (which === null ? entries[0] : entries.find((entry) => entry.activation.name === which)).plan;
};
const compileItemWith = (doc) => compileItem(doc, options);
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
    const skates = compileItemWith(item("Gadget Skates"));
    assert.ok(done(skates));
    assert.equal(skates.notes.length, 1);
    for (const words of [/twice its Speed/, /DC 20 Acrobatics/, /can't Stride, Step or otherwise move on the ground/, /High Jump's or Long Jump's Stride/, /Sustained up to 1 minute/, /first Sustain each turn/]) assert.match(skates.notes[0], words);
});

test("a long Leap beside a harmless fall: Emerald Grasshopper's Leap a line, its flutter and 60-foot fall the environment module's no-damage Effect until the end of its next turn", () => {
    const grasshopper = compileItemWith(item("Emerald Grasshopper"));
    assert.ok(done(grasshopper));
    assert.deepEqual(grasshopper.fall, { noDamage: true, rate: 60, flutter: true, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } });
    assert.deepEqual(grasshopper.notes, ["Leap up to 40 feet horizontally and up to 10 feet vertically (its own move on the map)."]);
    assert.equal(fallLine(grasshopper.fall), "It flutters in the air until the end of its turn; then it falls 60 feet a round; it takes no damage from a fall for 1 round");
    assert.deepEqual(fallEffectSource(grasshopper.fall, { item: { name: "Emerald Grasshopper" } }).flags["pf2e-automatic-environment-resolution"].fall, { noDamage: true, source: "Emerald Grasshopper" });
    // (The greater one's other Leaps that turn: said too, not dropped.)
    const greater = compileItemWith(item("Emerald Grasshopper (Greater)"));
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
    const stone = compileItemWith(item("Feather Step Stone"));
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

test("one-offs of the moving group: their words the card's lines, counted done and kept to build later (Crown of the Companion's cast too)", () => {
    for (const name of ["Firefoot Popcorn", "Sargassum Phial", "Colorful Coating (Red)", "Dimensional Cleavestone"]) {
        const plan = compileItemWith(item(name));
        assert.deepEqual([plan.decided, Boolean(plan.noteOnly), Boolean(plan.partial)], ["one-off", false, false], name);
        assert.ok(ONE_OFFS.get(name).build, name);
    }
    for (const name of ["Bola Shot", "Tidal Fishhook", "Planar Tunnel"]) {
        const plan = item(name).type === "consumable" ? compileItemWith(item(name)) : activation(name);
        assert.equal(plan.decided, "one-off", name);
        assert.ok(done(plan), name);
    }
    // (A partial cast with a one-off rule beside it: its notes the card's lines, the cast kept.)
    const crown = activation("Crown of the Companion");
    assert.deepEqual([crown.builtin, crown.decided, Boolean(crown.partial)], ["cast-spell", "one-off", false]);
    assert.equal(crown.notes.length, 2);
});

test("a weapon that reshapes into one of a list: Twining Staff's staff or bo staff, its disk form and its expanding jump lines of the objects card", () => {
    const staff = activation("Twining Staff", "Form Staff");
    assert.ok(done(staff));
    assert.deepEqual([staff.builtin, staff.objects], ["objects", { op: "reshape", self: true, forms: ["staff", "bo staff"] }]);
    assert.equal(staff.notes.length, 3);
    assert.match(staff.notes[2], /the staff's own Athletics check, 1d20\+15 \(its own action\)\.$/);
});

test("off the map and objects moving by themselves: lines of the card or whispered — Homeward Wayfinder, Cube of Recall, the Paired runes, Magnet Coin, Predictable Silver Piece, Cipher of Elemental Planes, Track Teleportation, Voyager's Pack", () => {
    const wayfinder = activation("Homeward Wayfinder");
    assert.ok(done(wayfinder));
    assert.match(wayfinder.notes[0], /^Its user teleports back to the attuned Pathfinder Lodge from up to 100 miles away, alone/);
    const cube = compileActivations(item("Cube of Recall"), options)[1].plan;
    assert.ok(done(cube));
    assert.match(cube.notes[0], /within 100 feet of the location attuned/);
    assert.deepEqual(["Paired", "Paired (Greater)", "Paired (Major)"].map((name) => /both invested and ([^:]+):/.exec(activation(name).notes[0])[1]), ["within 100 feet of each other", "within 1 mile of each other", "on the same plane"]);
    assert.match(activation("Magnet Coin").notes[0], /up to 3d10 other coins/);
    assert.match(activation("Predictable Silver Piece", "Cheat Fate").notes[0], /always lands with the side its user rubbed face up/);
    for (const [name, which] of [["Cipher of Elemental Planes", "Align to Plane"], ["Compass of Transpositional Awareness", "Track Teleportation"]]) {
        const plan = activation(name, which);
        assert.deepEqual([plan.builtin, plan.decided], ["whisper", "information"], name);
    }
    const pack = activation("Voyager's Pack", "Group Voyage");
    assert.deepEqual([pack.builtin, Boolean(pack.partial), pack.notes.length], ["cast-spell", false, 4]);
    assert.match(pack.notes[1], /DC 45 Survival check/);
});

test("teleports with others along, a creature brought, smoke: Transposition Ammunition (Greater) 2, Bring Me Near 4 within 5 miles, Blink Blade's target and smoke, Whistle of Calling's attuned creature within 30 feet", () => {
    const ammo = activation("Transposition Ammunition (Greater)");
    assert.ok(done(ammo));
    assert.deepEqual([ammo.teleport.with, ammo.teleport.weaponRange, ammo.notes], [{ count: 2 }, true, undefined]);
    const spyglass = activation("Bring Me Near");
    assert.ok(done(spyglass));
    // (All or none of them since the live check's reading, 2026-10-27: "If there's not enough room for everyone, only you are transported".)
    assert.deepEqual([spyglass.teleport.within, spyglass.teleport.with], [26400, { count: 4, allOrNone: true }]);
    assert.equal(teleportLines(spyglass.teleport).length, 4);
    const blade = compileActivations(item("Blink Blade"), options)[1].plan;
    assert.ok(done(blade));
    assert.deepEqual([blade.teleport.within, blade.teleport.with, blade.teleport.smoke.notes], [10, { count: 1, target: true }, ["A strong wind disperses it at once."]]);
    const whistle = compileActivations(item("Whistle of Calling"), options)[1].plan;
    assert.ok(done(whistle));
    assert.deepEqual([whistle.teleport.summon, whistle.teleport.within, whistle.targeting.target], [true, 30, "1 creature"]);
    assert.equal(teleportText(whistle.teleport), "The creature targeted, to a space within 30 feet of its user");
});

test("the free spaces beside a creature's landing space: touching it, none taken, the nearest to where the other stood first", () => {
    const grid = 100;
    const space = { x: 500, y: 500, w: 100, h: 100 };
    const all = freeSpacesBeside(space, { w: 100, h: 100 }, [], { grid });
    assert.equal(all.length, 8);
    // (One taken, east of it; the other stood to its east: the next nearest, north-east or south-east.)
    const spots = freeSpacesBeside(space, { w: 100, h: 100 }, [{ x: 600, y: 500, w: 100, h: 100 }], { grid, prefer: { x: 650, y: 550 } });
    assert.equal(spots.length, 7);
    assert.ok([600].includes(spots[0].x) && [400, 600].includes(spots[0].y));
    // (A Large one beside a Medium space: 12 corners around it; the scene's edge cuts some.)
    assert.equal(freeSpacesBeside(space, { w: 200, h: 200 }, [], { grid }).length, 12);
    assert.equal(freeSpacesBeside(space, { w: 100, h: 100 }, [], { grid, bounds: { x: 500, y: 500, width: 1000, height: 1000 } }).length, 3);
});

test("what holds a creature or a way in place, words on its user's note Effect: Magnetizing, Immovable Arm, Warding Escutcheon's door (the shield's own numbers, an hour)", () => {
    const magnet = activation("Magnetizing");
    assert.ok(done(magnet));
    assert.match(magnet.resolution.outcomes.success.noteEffects[0].text, /each square is difficult terrain/);
    assert.match(magnet.notes[0], /^The GM decides/);
    const arm = activation("Immovable Arm");
    assert.ok(done(arm));
    assert.match(arm.resolution.outcomes.success.noteEffects[0].text, /8,000 pounds of pressure or a DC 40 Athletics check to Force Open it moves the arm; a DC 25 Perception check to Seek/);
    for (const [name, numbers, dc] of [["Warding Escutcheon", "Hardness 10, HP 40, BT 20", 25], ["Warding Escutcheon (Greater)", "Hardness 20, HP 80, BT 40", 43]]) {
        const door = activation(name);
        assert.ok(done(door), name);
        const [note] = door.resolution.outcomes.success.noteEffects;
        assert.ok(note.text.includes(numbers) && note.text.includes(`DC ${dc} Athletics`), name);
        assert.deepEqual(note.duration, { mode: "fixed", value: 1, unit: "hours", expiry: "turn-start", anchor: "effect-start" });
    }
});

test("stepping stones, oiled feet, the guangu's two Effects: Stepping Stone Shot's lines, Oil of Skating's Balance one degree worse, Guangu of the Steppe's ways", () => {
    assert.deepEqual(["Stepping Stone Shot", "Stepping Stone Shot (Greater)"].map((name) => /up to (\d+) feet long.*They last until ([^.]+?) unless/.exec(activation(name).notes[0]).slice(1)), [["100", "the end of its user's next turn"], ["250", "1 minute"]]);
    const oil = compileItemWith(item("Oil of Skating"));
    assert.ok(done(oil));
    assert.deepEqual(oil.item.ruleEffects[0].rules, [{ key: "AdjustDegreeOfSuccess", selector: "acrobatics", predicate: ["action:balance"], adjustment: { criticalSuccess: "one-degree-worse", success: "one-degree-worse", failure: "one-degree-worse" } }]);
    assert.match(oil.item.ruleEffects[0].words, /doubles downhill/);
    const guangu = activation("Guangu of the Steppe", "The Hammer of Hooves");
    assert.ok(done(guangu));
    assert.deepEqual(guangu.ways.map((way) => [way.plan.resolution.applications[0].label, way.plan.resolution.applications[0].duration, way.plan.item.recipient]), [["Effect: The Hammer of Hooves", { value: 10, unit: "minutes" }, "targets"], ["Effect: The Hammer of Hooves (Mount Speed)", { value: 10, unit: "minutes" }, "targets"]]);
});

test("a Stride's trail, a ride, the tome's Netherworld, a trap near its square, a drenching: Hellfire Boots, Hippogriff in a Jar, Maw of Hungry Shadows, Devil's Trap, Puddle Shove Snare", () => {
    const boots = activation("Hellfire Boots", "Devil's Dance");
    assert.ok(done(boots));
    assert.deepEqual(boots.teleport.move.trail, { formula: "3d6[fire]", lasts: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } });
    assert.match(teleportLines(boots.teleport).join(" "), /hazardous terrain for 1 minute: 3d6 fire damage/);
    const jar = compileItemWith(item("Hippogriff in a Jar"));
    assert.ok(done(jar));
    assert.deepEqual([jar.teleport.within, jar.teleport.move.verb, jar.teleport.with], [65, "Fly", { count: 1 }]);
    const maw = activation("Maw of Hungry Shadows");
    assert.ok(done(maw));
    assert.match(maw.resolution.outcomes.criticalFailure.noteEffects.at(-1).text, /on the Netherworld; its token leaves the scene\.$/);
    const trap = compileItemWith(item("Devil's Trap"));
    assert.ok(done(trap));
    assert.deepEqual([trap.item.counteract.within, trap.item.counteract.afterFree.words, trap.targeting.range], [35, "It can't use actions with the teleportation trait", 35]);
    const puddle = compileItemWith(item("Puddle Shove Snare"));
    assert.ok(done(puddle));
    const soaked = puddle.zone.saves[0].plan.resolution.outcomes.criticalFailure;
    assert.deepEqual([soaked.manualInstructions, soaked.modifiers[0].predicate, soaked.forcedMovement.distance], [undefined, ["item:trait:electricity"], 15]);
    assert.ok(puddle.zone.notes.some((note) => /way the blast of water goes/.test(note)));
});

test("the squares a straight move crosses: not the one it starts on, a Large token's too", () => {
    assert.deepEqual(squaresAlong({ x: 0, y: 0 }, { x: 300, y: 0 }, { w: 100, h: 100 }, 100), [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 }]);
    assert.equal(squaresAlong({ x: 0, y: 0 }, { x: 200, y: 200 }, { w: 100, h: 100 }, 100).at(-1).x, 200);
    assert.equal(squaresAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, { w: 200, h: 200 }, 100).length, 2);
});

test("cast lines and the last readings: Bewitching Bloom (Purple Iris)'s Command from the ally, Drop Prone; Starshot Arrow (Greater)'s range lines; Demon-Hunting Bands a one-off", () => {
    const bloom = activation("Bewitching Bloom (Purple Iris)");
    assert.deepEqual([bloom.builtin, bloom.spell.name, Boolean(bloom.partial)], ["cast-spell", "Command", false]);
    assert.deepEqual(bloom.notes, ["Its targets are picked within the spell's range of the ally chosen, not of its user.", "Its command: Drop Prone, paying homage to the ally."]);
    const star = activation("Starshot Arrow (Greater)");
    assert.ok(done(star));
    assert.equal(star.strike.requires.length, 4);
    const bands = compileItemWith(item("Demon-Hunting Bands"));
    assert.deepEqual([bands.decided, done(bands)], ["one-off", true]);
});
