// The 2026-10-28 batch's leftovers group: PF2e's own last items, and readings two groups built twice.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";
import { routeOf } from "../src/live/route.js";
import { commandsOf, createStructureCard, keepsWatch, opensOrBreaks, placedRecord, sideFacing, structureCardHTML, structureTemplate } from "../src/live/structure-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, index = 0) => compileActivations(item(name), options)[index].plan;
const done = (plan) => !plan.partial && !plan.noteOnly && !plan.unread?.length && plan.builtin !== "no-effect";

// --- Structures placed where the user clicks (src/compiler/placed-structures.js) ---

test("Instant Fortress: the structure card's adamantine fortress, 20 feet square and 30 high, its door facing its user (DC 40), commanded open or locked within 100 feet, folded up with its 4 hours' wait", () => {
    const fortress = activation("Instant Fortress");
    assert.equal(routeOf(fortress), "structure");
    assert.ok(done(fortress));
    assert.equal(ONE_OFFS.has("Instant Fortress"), false);
    const { structure } = fortress;
    assert.deepEqual([structure.kind, structure.material, structure.sizes[0].feet, structure.sizes[0].height], ["wall-iron", "adamantine-high", 20, 30]);
    assert.deepEqual(structure.door, { kind: "door-iron", material: "adamantine-high", side: "facing", lock: { dc: 40 }, forceOpen: 40, locked: false, command: { within: 100 } });
    assert.deepEqual(structure.ends.wait, { value: 4, unit: "hours" });
    assert.deepEqual(commandsOf(structure).map((command) => command.key), ["open", "lock", "end"]);
    // (Its cover, shaft, stairs and repair the card's lines.)
    assert.ok(fortress.notes.some((note) => /standard cover/.test(note)));
    assert.ok(fortress.notes.some((note) => /Remake/.test(note)));
    // (The user stands west of the point clicked: the door's on the west side; the creatures in it pushed out; the command not the env's.)
    const state = createStructureCard({ plan: fortress, item: { name: "Instant Fortress", uuid: "Item.f" }, user: { name: "Ezren", actorUuid: "Actor.e" } });
    const template = structureTemplate(state, { x: 1000, y: 1000 }, 0, { from: { x: 750, y: 1050 } });
    assert.deepEqual(template, { name: "Instant Fortress", at: { x: 1000, y: 1000 }, shape: "square", feet: 20, height: 30, kind: "wall-iron", material: "adamantine-high", door: { kind: "door-iron", material: "adamantine-high", side: "west", lock: { dc: 40 }, forceOpen: 40, locked: false }, pushOut: true, source: { actorUuid: "Actor.e", itemUuid: "Item.f", name: "Instant Fortress" } });
    assert.equal(keepsWatch(structure), true);
    assert.deepEqual(placedRecord(structure, { id: "s1", sceneId: "sc", door: "w9", messageId: "m1", worldTime: 100 }), { id: "s1", sceneId: "sc", door: "w9", messageId: "m1" });
});

test("a door facing its user: the side of the square toward the user's middle", () => {
    assert.deepEqual([sideFacing({ x: 0, y: 0 }, { x: 300, y: 50 }), sideFacing({ x: 0, y: 0 }, { x: -300, y: 50 }), sideFacing({ x: 0, y: 0 }, { x: 20, y: -300 }), sideFacing({ x: 0, y: 0 }, { x: 20, y: 300 }), sideFacing({ x: 0, y: 0 }, null)], ["east", "west", "north", "south", "south"]);
});

test("Warding Escutcheon: a locked 5-foot door on the grid line clicked, the shield's Hardness 10, HP 40, BT 20, DC 25 to Force Open or Pick; gone after its hour, as it's opened or broken, or ended", () => {
    const door = activation("Warding Escutcheon");
    assert.equal(routeOf(door), "structure");
    assert.ok(done(door));
    assert.equal(door.resolution, undefined);
    const { structure } = door;
    assert.deepEqual(structure.door, { kind: "door-stone", stats: { hardness: 10, hp: 40, bt: 20 }, feet: 5, lock: { dc: 25 }, forceOpen: 25, locked: true });
    assert.deepEqual(structure.sizes.map((size) => [size.shape, size.feet, size.rotation]), [["line", 5, 0], ["line", 5, 90]]);
    assert.deepEqual(commandsOf(structure).map((command) => command.key), ["end"]);
    const state = createStructureCard({ plan: door, item: { name: "Warding Escutcheon", uuid: "Item.w" }, user: { name: "Amiri", actorUuid: "Actor.a" } });
    const template = structureTemplate(state, { x: 500, y: 450 }, 1);
    assert.deepEqual([template.shape, template.feet, template.rotation, template.pushOut, template.door.locked], ["line", 5, 90, false, true]);
    assert.deepEqual(placedRecord(structure, { id: "s2", sceneId: "sc", door: "w1", messageId: "m2", worldTime: 1000 }), { id: "s2", sceneId: "sc", door: "w1", messageId: "m2", endsAt: 4600, whenOpened: true });
    // (Its Cozy Cabin, the other activation, still the cast.)
    assert.equal(activation("Warding Escutcheon", 1).builtin, "cast-spell");
});

test("Testudo Shield (both grades): a see-through barrier along a grid line, 15 or 25 feet long and 10 high, the shield's Hardness 5 and 20 HP, for 1 minute", () => {
    for (const [name, feet] of [["Testudo Shield", 15], ["Testudo Shield (Greater)", 25]]) {
        const barrier = activation(name);
        assert.equal(routeOf(barrier), "structure");
        assert.ok(done(barrier));
        assert.equal(barrier.gm, undefined);
        const { structure } = barrier;
        assert.deepEqual([structure.sizes[0].feet, structure.sizes[0].height, structure.transparent, structure.stats], [feet, 10, true, { hardness: 5, hp: 20 }]);
        assert.ok(barrier.notes.some((note) => /critical hits and precision/.test(note)));
        // (Nothing to command: applied once placed, its end the chat's.)
        assert.equal(keepsWatch(structure), false);
        assert.deepEqual(placedRecord(structure, { id: "s3", sceneId: "sc", messageId: "m3", worldTime: 60 }), { id: "s3", sceneId: "sc", endsAt: 120 });
        const state = createStructureCard({ plan: barrier, item: { name, uuid: "Item.t" }, user: { name: "Valeros", actorUuid: "Actor.v" } });
        assert.deepEqual(structureTemplate(state, { x: 400, y: 400 }, 0), { name: `${name}'s barrier`, at: { x: 400, y: 400 }, shape: "line", feet, rotation: 0, height: 10, kind: "wall-masonry", stats: { hardness: 5, hp: 20 }, transparent: true, pushOut: false, source: { actorUuid: "Actor.v", itemUuid: "Item.t", name } });
    }
});

test("a placed structure's door opened or broken ends it; its card stays open for its commands", () => {
    const env = "pf2e-automatic-environment-resolution";
    assert.equal(opensOrBreaks({ ds: 1 }, env), "opened");
    assert.equal(opensOrBreaks({ flags: { [env]: { structure: { condition: "broken" } } } }, env), "broken");
    assert.equal(opensOrBreaks({ ds: 0 }, env), null);
    const fortress = activation("Instant Fortress");
    const state = { ...createStructureCard({ plan: fortress, item: { name: "Instant Fortress" }, user: { name: "Ezren" } }), step: "placed", size: 0, results: ["Placed."] };
    const html = structureCardHTML(state, { canApply: true });
    assert.match(html, /Shut and lock its door/);
    assert.match(html, />Do it</);
    assert.match(structureCardHTML({ ...state, plan: activation("Warding Escutcheon") }, { canApply: true }), />End it</);
});

// --- Live play of the structure card (scripts/structure.js), on stand-ins for Foundry ---

test("the structure card live: Instant Fortress placed facing its user, its door locked by command, folded up with its activation's 4-hour wait", async (t) => {
    const calls = [];
    const flags = {};
    const fortressItem = { name: "Instant Fortress", getFlag: (_scope, key) => flags[key], setFlag: async (_scope, key, value) => { flags[key] = value; }, unsetFlag: async (_scope, key) => { delete flags[key]; } };
    const wall = { c: [1000, 1100, 1000, 1000], update: async (change) => calls.push(["wall", change]) };
    const scene = { id: "sc", grid: { size: 100, distance: 5 }, walls: { get: (id) => (id === "w9" ? wall : null) } };
    const token = { x: 700, y: 1000, width: 1, height: 1, parent: scene };
    const api = { placeStructure: async (_scene, template) => (calls.push(["place", template]), { id: "s1", walls: ["a", "b", "w9"], door: "w9", pushed: [] }), removeStructure: async (_scene, id) => calls.push(["remove", id]) };
    const message = { id: "m1", flags: {}, getFlag(scope, key) { return this.flags[scope]?.[key]; }, async update(change) { const [key] = Object.keys(change).filter((one) => one.startsWith("flags.")); this.flags[key.split(".")[1]] = { [key.split(".")[2]]: change[key] }; this.content = change.content; } };
    // (The other files' stand-ins are this process's too: put back after.)
    const before = { game: globalThis.game, fromUuid: globalThis.fromUuid, canvas: globalThis.canvas };
    t.after(() => Object.assign(globalThis, before));
    globalThis.game = { modules: new Map([["pf2e-automatic-environment-resolution", { active: true, api }]]), time: { worldTime: 5000 }, scenes: { get: (id) => (id === "sc" ? scene : null) }, messages: { get: () => message }, users: { activeGM: { isSelf: true } }, user: { isGM: true } };
    globalThis.fromUuid = async (uuid) => ({ "Token.t": token, "Item.f": fortressItem })[uuid] ?? null;
    globalThis.canvas = { scene, grid: { size: 100 } };
    const { applyStructureCard } = await import("../scripts/structure.js");
    const plan = activation("Instant Fortress");
    message.flags["pf2e-automatic-item-resolution"] = { card: createStructureCard({ plan, item: { name: "Instant Fortress", uuid: "Item.f" }, user: { name: "Ezren", actorUuid: "Actor.e", tokenUuid: "Token.t" } }) };
    await applyStructureCard(message, { destination: { x: 1000, y: 1000 }, choice: 0 });
    assert.equal(calls[0][0], "place");
    assert.equal(calls[0][1].door.side, "west");
    assert.deepEqual(flags.structure, { id: "s1", sceneId: "sc", door: "w9", messageId: "m1" });
    let state = message.getFlag("pf2e-automatic-item-resolution", "card");
    assert.deepEqual([state.status, state.step], ["open", "placed"]);
    // (Shut and locked: its user 15 feet from the door.)
    await applyStructureCard(message, { choice: 1 });
    assert.equal(calls[1][1].ds, 2);
    // (Folded: its walls gone, the record with them, its activation usable again in 4 hours.)
    await applyStructureCard(message, { choice: 2 });
    assert.deepEqual(calls[2], ["remove", "s1"]);
    assert.equal(flags.structure, undefined);
    assert.deepEqual(flags.activationRecharges, { 0: 5000 + 4 * 3600 });
    state = message.getFlag("pf2e-automatic-item-resolution", "card");
    assert.equal(state.status, "applied");
    assert.ok(state.results.some((line) => /4 hours/.test(line)));
    // (Too far from its door to command it: refused.)
    message.flags["pf2e-automatic-item-resolution"] = { card: { ...state, status: "open", step: "placed" } };
    flags.structure = { id: "s1", sceneId: "sc", door: "w9" };
    token.x = -2000;
    await assert.rejects(applyStructureCard(message, { choice: 0 }), /more than 100 feet/);
});

// --- Cube of Force: the cube's faces, as Cube of Nex's (src/compiler/cube-faces.js) ---

test("Cube of Force: Cube of Nex's ways card, each face for its table's time — zones of 30, 10, 10 and 5 minutes, walls of force for a minute", async () => {
    const { cubeFaces } = await import("../src/compiler/cube-faces.js");
    const cube = activation("Cube of Force");
    assert.deepEqual([routeOf(cube), done(cube), cube.ways.length, cube.trigger.frequency.per, cube.notes], ["ways", true, 5, "day", undefined]);
    const [gas, nonliving, living, magic, force] = cube.ways.map((way) => way.plan);
    assert.deepEqual([gas, nonliving, living, magic].map((plan) => [routeOf(plan), plan.zone.lasts.value, plan.zone.lasts.unit]), [["zone", 30, "minutes"], ["zone", 10, "minutes"], ["zone", 10, "minutes"], ["zone", 5, "minutes"]]);
    // (Its level 13: rank 7 for its +20 counteracts.)
    assert.deepEqual([gas.item.counteract.modifier, gas.item.counteract.rank, magic.item.counteract.rank], [20, 7, 7]);
    // (Crossing saves one each way since the merge, 2026-10-29: in, pushed back out; out, pulled back in.)
    assert.deepEqual([nonliving.zone.saves.map((save) => save.when), living.zone.saves[0].only], [[["enter"], ["exit"]], { notTraits: ["construct", "undead"] }]);
    // (Its walls the environment module's transparent ones since the merge, 2026-10-29 — two groups' words for it, one kept.)
    assert.deepEqual([routeOf(force), force.structure.lasts, force.structure.transparent], ["walls-around", { value: 1, unit: "minutes" }, true]);
    assert.deepEqual(placedRecord(force.structure, { id: "c", sceneId: "sc", worldTime: 0 }), { id: "c", sceneId: "sc", endsAt: 60 });
    assert.match(cube.ways[0].name, /\(30 minutes\)$/);
    // (A table of two columns, Cube of Nex's: no durations.)
    assert.deepEqual(cubeFaces("<table><tr><td>1</td><td>Words.</td></tr><tr><td>2</td><td>-</td><td>More.</td></tr></table>"), null);
    const two = cubeFaces([1, 2, 3, 4, 5, 6].map((face) => `<tr><td>${face}</td><td>Face ${face}.</td></tr>`).join(""));
    assert.deepEqual(two.map((face) => face.duration), [null, null, null, null, null, null]);
});

// --- Anointing Oil (Greater): its 5th-rank Peaceful Rest (src/compiler/user-actions.js) ---

test("Anointing Oil (Greater): the cast card's Peaceful Rest at 5th rank on the corpse, its undead's Enfeebled the one-off line; the lesser grade's at the spell's own rank", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const consumables = documents("equipment");
    const oil = (name) => compileItem({ ...consumables.find((entry) => entry.name === name) }, options);
    const greater = oil("Anointing Oil (Greater)");
    assert.deepEqual([greater.builtin, greater.spell.name, greater.rank, greater.decided, greater.targeting.target], ["cast-spell", "Peaceful Rest", 5, "one-off", "the corpse"]);
    assert.ok(done(greater));
    assert.ok(!greater.notes.some((note) => /funerary/.test(note)));
    assert.equal(oil("Anointing Oil").rank, 2);
});

// --- Kraken Bottle: the bottled arms' ways card, its ink zone's poison (src/compiler/visibility.js bottledGrasp) ---

test("Kraken Bottle: a DC 38 Fortitude save card at up to four creatures within 60 feet, Grabbed and moved on a failure; in water its 80-foot ink zone — Undetected, no smell, kraken ink poison at DC 39", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { withAfflictionItem } = await import("../src/live/zone-afflictions.js");
    const bottle = compileItem({ ...equipment.find((entry) => entry.name === "Kraken Bottle") }, options);
    assert.deepEqual([routeOf(bottle), done(bottle), bottle.ways.length], ["ways", true, 2]);
    const [water, ground] = bottle.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(ground), ground.targeting.target, ground.targeting.range, ground.resolution.check.against.value, ground.placed.nearSource, ground.trigger.event], ["save", "up to 4 creatures", "60 feet", 38, 60, "use"]);
    assert.deepEqual(ground.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.duration.expiry]), [["grabbed", "turn-end"]]);
    assert.deepEqual(ground.resolution.outcomes.success.effects, []);
    const { zone } = water.item.alsoZone;
    assert.deepEqual([zone.area, zone.undetected, zone.lasts.value, zone.lasts.unit, zone.inside.length], [{ type: "burst", value: 80 }, true, 1, "minutes", 1]);
    const [poison] = zone.saves;
    assert.deepEqual([poison.when, poison.plan.resolution.check.against.value, poison.plan.resolution.outcomes.failure.affliction, poison.plan.resolution.outcomes.criticalFailure.affliction.stage], [["initial", "enter"], 39, { name: "Kraken Bottle", stage: 1, dc: 39, uuid: "item" }, 2]);
    // (Live, the used bottle's compendium source named as the affliction's item.)
    const named = withAfflictionItem(water.item.alsoZone, "Compendium.pf2e.equipment-srd.Item.k");
    assert.equal(named.zone.saves[0].plan.resolution.outcomes.failure.affliction.uuid, "Compendium.pf2e.equipment-srd.Item.k");
    assert.equal(withAfflictionItem(ground, "x"), ground);
});

// --- Feather Token (Whip): the animated weapon's card, a Trip or a Strike (src/compiler/dancing-whip.js) ---

test("Feather Token (Whip): the animated weapon's card for the minute — its Trip at +18 against Reflex, its Strike at +18 for 2d4 slashing at a prone target, the DC 6 flat check after each; no longer a one-off", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const { planFor } = await import("../src/live/if-target.js");
    const basicActions = compileBasicActions(documents("actions").filter((doc) => BASIC_ACTIONS.includes(doc.system?.slug)));
    const token = compileItem({ ...equipment.find((entry) => entry.name === "Feather Token (Whip)") }, { ...options, basicActions });
    assert.equal(ONE_OFFS.has("Feather Token (Whip)"), false);
    assert.ok(done(token));
    assert.deepEqual([token.again.later, token.again.repeat, token.again.time], [true, true, { value: 1, unit: "minutes" }]);
    const trip = token.again.plan;
    assert.deepEqual([trip.ownCheck, trip.resolution.check.statistic, trip.resolution.check.against.statistic, trip.selfFighting.flat, trip.selfFighting.own, trip.selfFighting.vanishes], [{ kind: "maneuver", modifier: 18 }, "athletics", "reflex", 6, true, true]);
    assert.deepEqual(trip.resolution.outcomes.success.effects.map((effect) => effect.slug), ["prone"]);
    // (Its critical failure isn't PF2e's fall for the tripper: the whip has none.)
    assert.deepEqual(trip.resolution.outcomes.criticalFailure.effects, []);
    // (A prone target: its Strike instead.)
    const prone = { conditions: { active: [{ slug: "prone" }] } };
    const strike = planFor(trip, prone);
    assert.deepEqual([strike.ownCheck, strike.resolution.check.against.statistic, strike.resolution.sharedDamage.components[0].formula, strike.resolution.sharedDamage.components[0].type], [{ kind: "attack", modifier: 18 }, "ac", "2d4", "slashing"]);
    assert.equal(planFor(trip, { conditions: { active: [] } }), trip);
    // (Without the ability module's compiled Trip, not read.)
    assert.equal(compileItem({ ...equipment.find((entry) => entry.name === "Feather Token (Whip)") }, options)?.again, undefined);
});

// --- Bomb Snare: a way for each damaging 3rd-level moderate bomb, options.bombs (src/compiler/bomb-snare.js) ---

test("Bomb Snare: the ways card of PF2e's 30 damaging 3rd-level moderate bombs, each burst's Reflex DC 24 at three times its direct hit, the rest of a hit on a failure", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { bombIndex } = await import("../src/compiler/bomb-snare.js");
    const { CORE_FAMILIES, createRegistry } = await import("../../pf2e-resolution-core/src/index.js");
    const bombs = bombIndex(equipment);
    const snare = compileItem({ ...equipment.find((entry) => entry.name === "Bomb Snare") }, { ...options, bombs });
    assert.equal(routeOf(snare), "ways");
    assert.ok(done(snare));
    assert.equal(snare.once, true);
    assert.equal(snare.ways.length, 30);
    // (Its "damaging" bomb: not Glue Bomb's, nor the lesser or ungraded ones of that level.)
    assert.equal(snare.ways.some((way) => /^(?:Glue Bomb|Silversoul Bomb|Silverscrap Bomb)/.test(way.name)), false);
    const way = (name) => snare.ways.find((entry) => entry.name.startsWith(`${name} (Moderate)`)).plan;
    const burst = (name) => way(name).zone.burst.plan.resolution;
    // (Bottled Lightning: 6d6 electricity, half on a success, doubled on a critical failure, Off-Guard on both failures.)
    const lightning = burst("Bottled Lightning");
    assert.equal(way("Bottled Lightning").builtin, "zone");
    assert.deepEqual([lightning.check.statistic, lightning.check.against.value], ["reflex", 24]);
    assert.deepEqual(lightning.sharedDamage.components.map((part) => [part.formula, part.type]), [["6d6", "electricity"]]);
    assert.deepEqual([lightning.outcomes.criticalSuccess.damage.mode, lightning.outcomes.success.damage.multiplier, lightning.outcomes.failure.damage.multiplier, lightning.outcomes.criticalFailure.damage.multiplier], ["none", 0.5, 1, 2]);
    assert.deepEqual(lightning.outcomes.success.effects, []);
    assert.deepEqual([lightning.outcomes.failure, lightning.outcomes.criticalFailure].map((row) => row.effects.map((effect) => effect.slug)), [["off-guard"], ["off-guard"]]);
    // (Acid Flask: its persistent acid once on a failure, not doubled.)
    const acid = burst("Acid Flask");
    assert.deepEqual([acid.outcomes.failure.damage.mode, acid.outcomes.failure.damage.formulas, acid.outcomes.criticalFailure.damage.formulas], ["mixed", [{ formula: "2d6[persistent,acid]" }], [{ formula: "2d6[persistent,acid]" }]]);
    assert.equal(acid.outcomes.success.damage.formulas, undefined);
    // (A bomb's own save after its hit: the core's follow-up save card at each creature that fails.)
    const daisy = burst("Dwarven Daisy");
    assert.deepEqual([daisy.outcomes.failure.followUps[0].kind, daisy.outcomes.failure.followUps[0].check.statistic, daisy.outcomes.failure.followUps[0].check.against.value], ["save", "fortitude", 18]);
    assert.equal(daisy.outcomes.success.followUps, undefined);
    const registry = createRegistry();
    for (const family of CORE_FAMILIES) registry.registerFamily(family);
    const context = { caster: { id: "setter", side: "party" }, targets: [{ id: "orc", side: "foes" }], statistic: () => ({ modifier: 10, dc: 20 }), allied: (a, b) => a?.side === b?.side };
    const failed = registry.resolveSync(way("Dwarven Daisy").zone.burst.plan, context, { roll: () => ({ degree: "failure", natural: 5, total: 12 }), damage: () => 14 });
    assert.deepEqual(failed.gaps, []);
    assert.deepEqual(failed.changes.filter((change) => ["damage", "followUp"].includes(change.op)).map((change) => change.op), ["damage", "followUp"]);
    // (What PF2e can't play, a note Effect: Vexing Vapor's flat check to concentrate until the end of its next turn.)
    const vapor = burst("Vexing Vapor").outcomes.failure.noteEffects;
    assert.deepEqual(vapor.map((note) => [note.label, note.duration.expiry, note.duration.anchor]), [["Flat check to concentrate", "turn-end", "target-turn"]]);
    assert.match(vapor[0].text, /DC 5 flat check/);
    // (Goo Grenade: its penalty ended by an Escape at DC 17, a note Effect for the rest.)
    const goo = burst("Goo Grenade").outcomes.failure;
    assert.deepEqual(goo.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.escape]), [["all-speeds", -5, { dc: 17 }]]);
    assert.deepEqual(goo.noteEffects.map((note) => [note.label, note.escape]), [["Clinging goo", { dc: 17 }]]);
    // (A rider only some creatures take, a metal-only acid and nonlethal damage: the zone card's lines.)
    assert.ok(way("Ghost Charge").zone.notes.some((line) => /void healing/.test(line) && /Enfeebled 1/.test(line)));
    assert.deepEqual(burst("Ghost Charge").outcomes.failure.effects, []);
    assert.equal(burst("Steelscour").outcomes.failure.damage.mode, "none");
    assert.ok(way("Steelscour").zone.notes.some((line) => /metal creature/.test(line)));
    assert.ok(way("Water Bomb").zone.notes.includes("Its damage is nonlethal."));
    // (Without the bombs' index, the zone as before.)
    assert.equal(compileItem({ ...equipment.find((entry) => entry.name === "Bomb Snare") }, options).builtin, "zone");
});

// --- Pistol of Wonder: its d% table's rows built, the rest its card's lines (src/compiler/wonder-table.js) ---

test("Pistol of Wonder: every row of its d% table a card of its own or a line — its casts at 60 feet, the shadows and sheen at the creature, its push, the marked bullet's fortune, two more rolls on a 100; its 1d4 hours' wait", () => {
    const pistol = activation("Pistol of Wonder");
    assert.equal(routeOf(pistol), "table");
    assert.ok(done(pistol));
    assert.deepEqual(pistol.trigger.recharge, { formula: "1d4", unit: "hours" });
    // (Its own DC, rank and range sentences played by the rows: only its user's choices and the no-save on its user left as lines.)
    assert.equal(pistol.notes.length, 2);
    const row = (low) => pistol.table.rows.find((entry) => entry.low === low);
    // (Every row a card or a line.)
    assert.equal(pistol.table.rows.filter((entry) => !entry.plan && !entry.lines?.length).length, 0);
    assert.equal(pistol.table.rows.filter((entry) => entry.plan?.partial).length, 0);
    // (Casts at the creature chosen within 60 feet: Planar Tether's 30 feet, Outcast's Curse's touch made 60.)
    assert.deepEqual([row(4).plan.castRange.feet, row(82).plan.castRange.feet, row(21).plan.castRange], [60, 60, undefined]);
    // (Cloak of Colors for 1d10 rounds, rolled as it's cast; Uncontrollable Dance 3 rounds whatever the save.)
    assert.deepEqual([row(36).plan.castDuration.valueRoll, row(36).plan.castDuration.unit, row(97).plan.castDuration.value], ["1d10", "rounds", 3]);
    // (Mountain Resilience: the creature aimed at ignoring it, a note Effect on its user for the spell's 20 minutes.)
    assert.deepEqual(row(92).plan.userEffects.map((entry) => [entry.kind, entry.duration.value, entry.duration.unit]), [["note", 20, "minutes"]]);
    // (At the creature: the sheen for a month, the shadows for an hour, its push 30 feet, its Quickened only to move.)
    assert.deepEqual([routeOf(row(3).plan), row(3).plan.resolution.outcomes.success.noteEffects[0].duration.value, row(3).plan.resolution.outcomes.success.noteEffects[0].duration.unit], ["save", 30, "days"]);
    assert.deepEqual([routeOf(row(53).plan), row(53).plan.resolution.outcomes.success.noteEffects[0].duration.unit], ["save", "hours"]);
    assert.deepEqual([routeOf(row(17).plan), row(17).plan.resolution.outcomes.success.forcedMovement], ["save", { kind: "push", distance: 30 }]);
    const quick = row(70).plan.resolution.outcomes.success;
    assert.deepEqual([quick.effects.map((effect) => effect.slug), quick.noteEffects.length, quick.manualInstructions], [["quickened"], 1, undefined]);
    // (The bullet: the creature marked, its user's first Strike with the pistol at it rolled twice until the end of its next turn.)
    const bullet = row(33).plan;
    assert.deepEqual([routeOf(bullet), bullet.item.mark.slug, bullet.item.recipient], ["item", "pistol-of-wonder-mark", "user"]);
    const [roll] = bullet.resolution.outcomes.success.noteEffects[0].rules;
    assert.deepEqual([roll.key, roll.keep, roll.selector, roll.removeAfterRoll, roll.predicate], ["RollTwice", "higher", "strike-attack-roll", true, ["target:mark:pistol-of-wonder-mark", "item:slug:pistol-of-wonder"]]);
    // (A 100: two more rolls; the user's own push and the collisions the one-off's lines.)
    assert.deepEqual(row(100).again, { count: 2, skip: 100 });
    assert.ok(row(14).lines[0].includes("30 feet"));
    assert.equal(ONE_OFFS.has("Pistol of Wonder: Wonder Shot"), true);
});

test("the table card live: a row's lines on the card, and a 100 on Pistol of Wonder's rolls the table twice more, each row played", async () => {
    const { fakeFoundry } = await import("./support/fake-foundry.mjs");
    const { applyTableCard } = await import("../scripts/table.js");
    const { createTableCard } = await import("../src/live/table-card.js");
    const foundry = await fakeFoundry();
    const gunner = foundry.makeActor({ id: "wonder-gunner", name: "Wonder Gunner", owners: ["player"] });
    const pistol = activation("Pistol of Wonder");
    const card = (total) => foundry.makeMessage({ flags: { "pf2e-automatic-item-resolution": { card: createTableCard({ plan: pistol, item: { name: "Pistol of Wonder", uuid: null }, user: { name: gunner.name, actorUuid: gunner.uuid, tokenUuid: null } }) } } });
    const posted = [];
    const postCardFor = async ({ plan, used }) => posted.push([used.data.name, plan]);
    // (A 52: the cards, a line; no card posted.)
    const cards = card(52);
    await applyTableCard(cards, { total: 52 }, postCardFor);
    assert.deepEqual([posted.length, cards.flags["pf2e-automatic-item-resolution"].card.results.length], [0, 2]);
    assert.match(cards.flags["pf2e-automatic-item-resolution"].card.results[1], /playing cards/);
    // (A 100: rolled twice more — the stand-in's rolls are 7s, the flag twice; a 3: the sheen's card at the creature.)
    const hundred = card(100);
    await applyTableCard(hundred, { total: 100 }, postCardFor);
    const results = hundred.flags["pf2e-automatic-item-resolution"].card.results;
    assert.equal(results.filter((line) => /^7: A short rod/.test(line)).length, 2);
    assert.equal(results.filter((line) => /Interact action to remove it/.test(line)).length, 2);
    await applyTableCard(card(3), { total: 3 }, postCardFor);
    assert.deepEqual([posted.length, posted[0][0], posted[0][1].atTarget], [1, "Pistol of Wonder (3)", true]);
});

// --- The fulcrum lenses' possession: one reading and one live script for the three (src/compiler/possession.js, scripts/possession.js) ---

test("the fulcrum lenses' possession: Crimson's +18, Emerald's +20 and Ochre's +21 melee spell attack, a hit giving the creature the lens's own Effect and the possession's note Effect (its mark)", () => {
    for (const [name, modifier, effect] of [["Crimson Fulcrum Lens", 18, "ytqvHyF0oMKbo65P"], ["Emerald Fulcrum Lens", 20, "vlTiBE0h2kyw5J9o"], ["Ochre Fulcrum Lens", 21, "5KXsyN9J78glG25I"]]) {
        const plan = activation(name, 1);
        const hit = plan.resolution.outcomes.success;
        assert.ok(done(plan), name);
        assert.deepEqual([routeOf(plan), plan.ownCheck, plan.resolution.check.against.statistic, hit.nativeEffects[0].uuid, plan.possess.effect], ["save", { kind: "attack", modifier }, "ac", `Compendium.pf2e.equipment-effects.Item.${effect}`, `Compendium.pf2e.equipment-effects.Item.${effect}`], name);
        assert.deepEqual([hit.noteEffects[0].duration, hit.noteEffects[0].rules[0].option, plan.possess.option], [null, plan.possess.option, `air-possessed-by:${name.toLowerCase().replace(/ /g, "-")}`], name);
        assert.deepEqual(plan.resolution.outcomes.failure.nativeEffects, undefined, name);
    }
});

test("the fulcrum lenses' possession live: a hit uninvests the lens and takes its user's Effect of it; the possessed creature's note Effect deleted brings the essence back, the creature's Effect of the lens gone too", async () => {
    const { possessOnHit, possessionEnded, POSSESSING } = await import("../scripts/possession.js");
    const previous = { game: globalThis.game, fromUuid: globalThis.fromUuid, ChatMessage: globalThis.ChatMessage };
    const posted = [];
    const plan = activation("Ochre Fulcrum Lens", 1);
    const lent = plan.possess.effect;
    const actorWith = (uuid, name, effects) => ({ uuid, name, effects, get itemTypes() { return { effect: this.effects }; }, async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter((effect) => !ids.includes(effect.id)); } });
    const user = actorWith("Actor.user", "Ezren", [{ id: "own", _stats: { compendiumSource: lent } }, { id: "other", _stats: {} }]);
    const flags = {};
    const lens = {
        name: "Ochre Fulcrum Lens", actor: user, system: { equipped: { invested: true } },
        getFlag: (scope, key) => flags[scope]?.[key],
        async unsetFlag(scope, key) { delete flags[scope]?.[key]; },
        async update(changes) {
            for (const [key, value] of Object.entries(changes)) {
                if (key === "system.equipped.invested") this.system.equipped.invested = value;
                else { const [, scope, flag] = key.split("."); flags[scope] ??= {}; flags[scope][flag] = value; }
            }
        }
    };
    user.items = [lens];
    const orc = actorWith("Actor.orc", "Orc", [{ id: "lent", _stats: { compendiumSource: lent } }]);
    globalThis.fromUuid = async (uuid) => (uuid === "Item.lens" ? lens : uuid === "Actor.user" ? user : null);
    globalThis.ChatMessage = { create: async (data) => posted.push(data), getSpeaker: () => ({}) };
    globalThis.game = { ...(previous.game ?? {}), actors: [user, orc] };
    try {
        // (A miss: nothing.)
        assert.equal(await possessOnHit({ state: { plan, ability: { uuid: "Item.lens" } }, targets: [{ actorUuid: orc.uuid, name: "Orc", degree: "failure" }] }), null);
        const line = await possessOnHit({ state: { plan, ability: { uuid: "Item.lens" }, source: { actorUuid: user.uuid } }, targets: [{ actorUuid: orc.uuid, name: "Orc", degree: "success" }] });
        assert.match(line, /possesses Orc/);
        assert.deepEqual([lens.system.equipped.invested, lens.getFlag("pf2e-automatic-item-resolution", POSSESSING), user.effects.map((effect) => effect.id)], [false, { actorUuid: orc.uuid, option: plan.possess.option, effect: lent }, ["other"]]);
        // (Another creature's Effect of its kind ending: nothing; the possessed one's: the lens back, the orc's Effect of it gone.)
        assert.deepEqual(await possessionEnded({ system: { rules: [{ key: "RollOption", option: plan.possess.option }] }, parent: user }), []);
        const back = await possessionEnded({ system: { rules: [{ key: "RollOption", domain: "all", option: plan.possess.option }] }, parent: orc });
        assert.deepEqual([back.length, lens.getFlag("pf2e-automatic-item-resolution", POSSESSING), orc.effects.length, posted.length], [1, undefined, 0, 2]);
    } finally {
        globalThis.game = previous.game;
        globalThis.fromUuid = previous.fromUuid;
        globalThis.ChatMessage = previous.ChatMessage;
    }
});
