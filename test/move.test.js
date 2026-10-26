// Its user's own move on the map (src/compiler/move.js, 2026-10-25): a Stride, Step, Leap or Burrow read off the activation onto the teleport
// card as a move — its range, what it ignores or how it must end as the card's lines; a Strike along the way and what isn't about the move
// left as notes; the move beside a plan that reads the rest.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readMove } from "../src/compiler/move.js";
import { createTeleportCard, teleportCardHTML, teleportRange, teleportText } from "../src/live/teleport-card.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => (which ? entry.activation.name === which : entry.plan?.teleport?.move))?.plan;

test("the reading: its verb, its range, the card's lines", () => {
    assert.deepEqual(readMove("You Step twice."), { verb: "Step", within: 10, lines: [], said: ["You Step twice."], sentences: ["You Step twice."] });
    const stride = readMove("You Stride up to twice your speed, ignoring difficult terrain, but your movement must end adjacent to an ally.");
    assert.deepEqual([stride.verb, stride.speedTimes, stride.lines], ["Stride", 2, ["Ignoring difficult terrain", "Your movement must end adjacent to an ally"]]);
    assert.deepEqual([readMove("You Stride up to half your Speed.").speedTimes, readMove("You Leap.").leapTimes, readMove("You Leap up to 40 feet in any direction.").within], [0.5, 1, 40]);
    // (Its alternative after "or", where it goes through.)
    assert.deepEqual(readMove("You Stride up to twice your speed or Leap up to 20 feet horizontally.").lines, ["Or Leap up to 20 feet horizontally"]);
    assert.deepEqual(readMove("You Burrow through loose sand up to your land Speed.").lines, ["Through loose sand"]);
    // (A Strike along the way and what isn't about the move: not lines.)
    const strike = readMove("You Fly up to your Speed, making a Strike once during the movement.");
    assert.deepEqual([strike.lines, strike.strikes], [[], ["Making a Strike once during the movement."]]);
    assert.deepEqual(readMove("You Stride and glow brightly, becoming Dazzled.").others, ["Glow brightly.", "Becoming Dazzled."]);
    assert.equal(readMove("You attempt a Stealth check."), null);
});

test("an activation that moves its user: the move card's, fully read", () => {
    const advancing = compileActivations(item("Advancing (Greater)"))[0].plan;
    assert.deepEqual([routeOf(advancing), advancing.teleport.speedTimes, advancing.teleport.move.verb, advancing.partial], ["teleport", 1, "Stride", undefined]);
    assert.ok(advancing.teleport.move.lines.includes("This movement doesn't trigger reactions"));
    assert.deepEqual(activation("Boots of Quick Marching", "Big Step").teleport, { within: 10, from: "self", move: { verb: "Step", lines: [] } });
    assert.deepEqual(activation("Staff of Sun Wukong", "Cloud Somersault").teleport, { within: 50, from: "self", move: { verb: "Leap", lines: ["In any direction"] } });
    // (A doubled Leap: twice its user's own Leap, 30 feet at a Speed of 30.)
    const paws = activation("Paws of the Grogrisant", "Grogrisant Leap");
    assert.deepEqual([paws.teleport.leapTimes, teleportRange(paws.teleport, { speed: 30 }), teleportRange(paws.teleport, { speed: 25 }), paws.partial], [2, 30, 20, true], "its Strike on landing is a note");
    // (Its movement ends beside an ally; again for each action more.)
    assert.equal(activation("Squire's Tabard", "At Your Aid").teleport.move.endsBeside, "ally");
    const footing = activation("Spleen Bloodstone of Arazni", "Sure Footing");
    assert.deepEqual([footing.teleport.move.again, footing.partial], [true, undefined]);
    assert.ok(footing.teleport.move.lines.includes("With a climb or fly Speed, it can be a Climb or Fly instead"));
});

test("not a move: a Trigger that's a Stride, a Strike along the way left as a note", () => {
    assert.ok(!compileActivations(item("Demon-Hunting Bands")).some((entry) => entry.plan?.teleport?.move), "its Trigger, not its Effect");
    const sword = compileActivations(item("Skyrider Sword")).find((entry) => entry.plan?.teleport?.move).plan;
    assert.deepEqual([sword.teleport.move.verb, sword.partial], ["Fly", true]);
    assert.ok(sword.notes.some((note) => /\bmelee Strike\b/.test(note)));
    const claw = compileItem(item("Lion Claw"));
    assert.deepEqual([claw.builtin, claw.teleport.move.verb, claw.partial], ["teleport", "Stride", true]);
});

test("the move beside the rest: Phase Spike's resistance during its Stride; Invisible Chain Shirt's Concealed, its hostile-action end a note Effect (2026-10-26)", () => {
    const spike = activation("Phase Spike", "Incorporeal Stride");
    assert.deepEqual([routeOf(spike), spike.item.move.speedTimes, spike.item.move.move.verb, spike.item.resist?.[0]?.value, spike.partial, spike.unread], ["item", 1, "Stride", 10, undefined, undefined]);
    assert.deepEqual(spike.item.move.move.lines, ["Through solid objects and creatures, ending in neither"]);
    const shirt = activation("Invisible Chain Shirt", "Obscured Approach");
    assert.deepEqual([shirt.item.move.move.verb, shirt.resolution.outcomes.success.effects[0].slug, Boolean(shirt.partial)], ["Stride", "concealed", false]);
    assert.equal((shirt.unread ?? []).length, 0);
});

test("the card: its verb and range, again for each action more", () => {
    const cape = compileActivations(item("Cape of the Open Sky"))[1].plan;
    assert.equal(teleportText(cape.teleport, { speed: 25 }), "Up to its user's Speed + 15 feet (40 feet)");
    const whirl = activation("Chimera Flail", "Pouncing Whirl");
    assert.equal(teleportText(whirl.teleport, { speed: 25 }), "Up to half its user's Speed (10 feet)");
    const footing = activation("Spleen Bloodstone of Arazni", "Sure Footing");
    const state = createTeleportCard({ plan: footing, item: { name: "Spleen Bloodstone of Arazni" }, user: { name: "Mover" }, speed: 25 });
    const html = teleportCardHTML(state, { canApply: true });
    assert.match(html, /Stride: Up to its user&#39;s Speed \(25 feet\)\./);
    assert.match(html, /the space it moves to/);
    assert.match(html, />Pick</);
    assert.match(teleportCardHTML({ ...state, results: ["Mover strides (within 25 feet)."] }, { canApply: true }), /Pick again \(another action\)/);
});

test("a move said other ways: Umbral Armor's \"allowing you to Stride twice your speed\" and its Concealed after, Nightmare Cudgel's Strides, Dancing Scarf's beside its Concealed", () => {
    const shroud = activation("Umbral Armor", "Shroud Stride");
    assert.deepEqual([shroud.teleport.speedTimes, shroud.teleport.move.lines, shroud.userEffects.map((entry) => [entry.slug, entry.duration.value, entry.duration.expiry]), shroud.partial], [2, ["This movement doesn't trigger reactions and ignores difficult and hazardous terrain"], [["concealed", 1, "turn-start"]], undefined]);
    const cudgel = compileActivations(item("Nightmare Cudgel"))[0].plan;
    assert.deepEqual([cudgel.teleport.speedTimes, cudgel.partial], [2, true], "its Demoralize after a hit is a note");
    const scarf = activation("Dancing Scarf (Greater)", "Swirling Scarf");
    assert.deepEqual([scarf.item.move.speedTimes, scarf.item.move.move.lines, scarf.resolution.outcomes.success.effects[0].slug, scarf.partial], [0.5, ["Or Step"], "concealed", undefined]);
});

test("a check's success that pulls the creature toward its user: Tentacle Cannon's Grasping Deep Shot, within 15 feet — the ability module's card at the creature targeted", async () => {
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const shot = compileActivations(item("Tentacle Cannon"), { basicActions }).find((entry) => entry.activation.name === "Grasping Deep Shot").plan;
    assert.equal(routeOf(shot), "save");
    const pull = { kind: "pull", distance: 10, upTo: true, optional: false, direction: "toward" };
    assert.deepEqual([shot.resolution.outcomes.success.forcedMovement, shot.resolution.outcomes.criticalSuccess.forcedMovement, shot.resolution.outcomes.failure.forcedMovement], [pull, pull, undefined]);
    assert.deepEqual([shot.targeting.range, shot.notes, shot.partial], [15, undefined, undefined]);
});

test("Transposition Ammunition: its user teleported into the square shot, within the first range increment of the weapon it's loaded in", () => {
    const shot = compileActivations(item("Transposition Ammunition"))[0].plan;
    assert.deepEqual([routeOf(shot), shot.teleport.weaponRange, shot.teleport.alone, shot.notes, shot.partial], ["teleport", true, { used: false }, undefined, undefined]);
    assert.deepEqual([teleportRange(shot.teleport, { weaponRange: 60 }), teleportText(shot.teleport, { weaponRange: 60 }), teleportText(shot.teleport)], [60, "Within its weapon's first range increment (60 feet)", "Within its weapon's first range increment (no ranged weapon loaded with it)"]);
    // (The greater one's two willing creatures along: notes.)
    const greater = compileActivations(item("Transposition Ammunition (Greater)"))[0].plan;
    assert.deepEqual([greater.teleport.weaponRange, greater.partial, greater.notes.length], [true, true, 2]);
});

test("Emergency Escape Shield's Desperate Flight: \"to an unoccupied space that you can see within 20 feet\" — the teleport card's 20 feet", () => {
    const flight = activation("Emergency Escape Shield", "Desperate Flight");
    assert.deepEqual([routeOf(flight), flight.teleport.within, flight.teleport.from, flight.partial], ["teleport", 20, "self", undefined]);
});
