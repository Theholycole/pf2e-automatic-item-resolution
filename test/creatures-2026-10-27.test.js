// Creatures an item makes or controls, and its user's companion (2026-10-27, docs/needs.md "Creatures it makes or controls"): the readings
// of src/compiler/creature-readings.js — conjured tokens, a creature its user picks first, a size on the ways card, note Effects —, and what
// the made creature gets from the item's text (src/live/conjured.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { conjuredChanges, countNow, pickCandidates, pickedPlan, slainUntil } from "../src/live/conjured.js";
import { frequencyText, periodOf } from "../src/live/activations-card.js";
import { ownEffectsToEnd } from "../src/live/ends-own.js";
import { SPIDER_SWARM } from "../src/compiler/creature-readings.js";
import { createItemCard, previewLines } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
// (The spells, for casts read by the spell's name: Cozy Cabin.)
const spells = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("its companion's senses while Sustained: Collar of Empathy's Empathic Link, a note Effect on its user for 10 minutes at most", () => {
    const link = activation("Collar of Empathy", "Empathic Link");
    const note = link.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(link), routeOf(link), note.label, note.duration.value, note.duration.unit], [true, "item", "Empathic Link", 10, "minutes"]);
    assert.match(note.text, /unaware of its own surroundings/);
});

test("a corpse or an object animated as its user's pick: Dust of Corpse Animation's skeleton or zombie, Oil of Dynamism's animated object, each grade's level", () => {
    for (const [name, level] of [["Dust of Corpse Animation", 3], ["Dust of Corpse Animation (Greater)", 11]]) {
        const dust = compileItem(item(name));
        assert.deepEqual([done(dust), routeOf(dust), dust.pick, dust.creatures[0].traits, dust.lasts.value, dust.lasts.unit, dust.item.uses.autoDestroy], [true, "conjure", { any: ["skeleton", "zombie"], maxLevel: level }, ["minion"], 1, "minutes", true], name);
        assert.match(dust.needs, /corpse/);
    }
    for (const [name, level] of [["Oil of Dynamism", 3], ["Oil of Dynamism (Greater)", 11]]) {
        const oil = compileItem(item(name));
        assert.deepEqual([done(oil), routeOf(oil), oil.pick, oil.creatures[0].traits], [true, "conjure", { all: ["construct", "mindless"], maxLevel: level }, ["minion"]], name);
    }
    // (The pick: the compendiums' creatures of those traits at that level or lower, as the ability module's summons offer them.)
    const index = [
        { uuid: "a", name: "Skeletal Champion", level: 2, traits: ["skeleton", "undead"], type: "npc" },
        { uuid: "b", name: "Zombie Hulk", level: 6, traits: ["undead", "zombie"], type: "npc" },
        { uuid: "c", name: "Zombie Shambler", level: -1, traits: ["undead", "zombie"], type: "npc" },
        { uuid: "d", name: "Animated Statue", level: 3, traits: ["construct", "mindless"], type: "npc" }
    ];
    assert.deepEqual(pickCandidates(index, compileItem(item("Dust of Corpse Animation")).pick).map((entry) => entry.name), ["Skeletal Champion", "Zombie Shambler"]);
    assert.deepEqual(pickCandidates(index, compileItem(item("Oil of Dynamism")).pick).map((entry) => entry.name), ["Animated Statue"]);
    const picked = pickedPlan(compileItem(item("Dust of Corpse Animation")), { uuid: "a", name: "Skeletal Champion" });
    assert.deepEqual([picked.pick, picked.needs, picked.creatures[0].from, picked.creatures[0].name, picked.creatures[0].traits], [undefined, undefined, { uuid: "a" }, "Skeletal Champion", ["minion"]]);
});

test("a zombie shambler that's a construct, Medium or Small as its corpse: Galvasphere's two ways, each a conjured token, and what it lacks taken off", () => {
    const sphere = compileItem(item("Galvasphere"));
    assert.deepEqual([done(sphere), routeOf(sphere), sphere.once, sphere.ways.map((way) => way.name)], [true, "ways", true, ["A Medium corpse", "A Small corpse"]]);
    const [medium, small] = sphere.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(small), small.creatures[0].from, small.creatures[0].size, medium.creatures[0].size, small.lasts.value], ["conjure", { name: "Zombie Shambler" }, "small", "medium", 1]);
    // (PF2e's zombie shambler, as the ability module makes it — the creature's own traits with minion and construct.)
    const changes = conjuredChanges({ traits: ["mindless", "undead", "unholy", "zombie", "minion", "construct"], immunities: [{ type: "disease" }], weaknesses: [{ type: "vitality", value: 5 }, { type: "slashing", value: 5 }], size: "med", items: [] }, small.creatures[0]);
    assert.deepEqual(changes.update, {
        "system.traits.value": ["mindless", "zombie", "minion", "construct"],
        "system.attributes.immunities": [{ type: "disease" }, { type: "vitality" }],
        "system.attributes.weaknesses": [{ type: "slashing", value: 5 }],
        "system.traits.size.value": "sm"
    });
    assert.equal(conjuredChanges({ traits: ["mindless", "undead", "unholy", "zombie", "minion", "construct"], immunities: [], weaknesses: [], size: "med", items: [] }, medium.creatures[0]).update["system.traits.size.value"], undefined);
});

test("an object with the text's own numbers that fails every save: Kotodama Bells' Awaken the Soul, a minion for 24 hours", () => {
    const bells = activation("Kotodama Bells", "Awaken the Soul");
    const [object] = bells.creatures;
    assert.deepEqual([done(bells), routeOf(bells), object.stats, object.size, object.traits, bells.lasts.value, bells.lasts.unit, bells.vanishAtZero, bells.trigger.frequency.per], [true, "conjure", { ac: 5, hp: 5, speeds: { land: 10 } }, "tiny", ["minion"], 24, "hours", undefined, "day"]);
    assert.deepEqual(object.own.rules, [{ key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "to-failure" } }]);
    assert.ok(bells.notes.includes("It lasts 24 hours: dismiss it when that's up."));
});

test("an Animated Broom with no Strike for menial tasks: Cordelia's Construct Keys' second activation, an hour or 8; the first still casts Summon Construct", () => {
    for (const [name, time] of [["Cordelia's Construct Key", 1], ["Cordelia's Greater Construct Key", 8]]) {
        const [summon, broom] = activations(name);
        assert.deepEqual([summon.builtin, done(broom), routeOf(broom), broom.creatures[0].from.uuid, broom.creatures[0].own, broom.lasts.value, broom.lasts.unit], ["cast-spell", true, "conjure", "Compendium.pf2e.pathfinder-monster-core.Actor.ybkelAOtSIA06fnj", { noStrikes: true }, time, "hours"], name);
    }
    // (Its Strikes are its melee items: gone.)
    const broom = activations("Cordelia's Construct Key")[1].creatures[0];
    assert.deepEqual(conjuredChanges({ traits: ["construct", "mindless"], immunities: [], weaknesses: [], size: "sm", items: [{ id: "m1", type: "melee" }, { id: "a1", type: "action" }] }, broom), { update: {}, deleteIds: ["m1"] });
});

test("merged into the statuette and called forth: Hosteling Statuette's Petrified and Tiny note Effect on its companion, ended by its other activation", () => {
    const [merge, call] = activations("Hosteling Statuette");
    const note = merge.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([merge.item.recipient, call.item.recipient], ["targets", "targets"]);
    assert.deepEqual([done(merge), routeOf(merge), note.label, note.duration, note.rules], [true, "item", "Statuette form", null, [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.dTwPJuKgBQCMxixg", inMemoryOnly: true }, { key: "CreatureSize", value: "tiny" }]]);
    assert.deepEqual([done(call), routeOf(call), call.item.endsOwn, call.item.activation.index], [true, "item", { label: "Statuette form" }, 1]);
    assert.ok(previewLines(createItemCard({ plan: call, item: { name: "Hosteling Statuette" }, user: { name: "Wolf", actorUuid: "Actor.w" } })).includes("Ends its Statuette form Effect (the one its other activation gave)"));
    // (Its note Effect's name as the ability module gives it: the item's, then its label.)
    assert.deepEqual(ownEffectsToEnd([{ id: "e1", name: "Hosteling Statuette: Statuette form" }, { id: "e2", name: "Hosteling Statuette: other" }, { id: "e3", name: "Statuette form" }], "Hosteling Statuette", "Statuette form"), ["e1"]);
});

test("attuned over 10 minutes, out of combat: Whistle of Calling's first activation is its card's line, its second still the teleport card", () => {
    const [attune, call] = activations("Whistle of Calling");
    assert.deepEqual([done(attune), routeOf(attune), attune.notes.length, call.builtin], [true, "item", 1, "teleport"]);
    assert.match(attune.notes[0], /one at a time/);
});

test("a swim Speed, or more of the one it has: Waverider Barding's ways card, each a note Effect of PF2e's rules for 10 minutes", () => {
    const barding = activations("Waverider Barding")[0];
    assert.deepEqual([done(barding), routeOf(barding), barding.once, barding.ways.map((way) => way.name)], [true, "ways", true, ["It has no swim Speed", "It has a swim Speed"]]);
    const [none, has] = barding.ways.map((way) => way.plan);
    const bonus = has.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([none.item.recipient, none.item.speeds.map((speed) => [speed.type, speed.value, speed.duration.value]), has.item.recipient, bonus.rules, bonus.duration.value, routeOf(none), routeOf(has)], ["targets", [["swim", 30, 10]], "targets", [{ key: "FlatModifier", selector: "swim-speed", type: "item", value: 10 }], 10, "item", "item"]);
});

test("a swarm for a minute: Swarmform Collar's note Effect (Large, the swarm trait, a Spider Swarm's resistances and weaknesses) and its swarming attack's card kept open", () => {
    const collar = activations("Swarmform Collar")[0];
    const note = collar.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(collar), routeOf(collar), collar.item.recipient, note.duration.value, note.rules.slice(0, 2)], [true, "item", "targets", 1, [{ key: "CreatureSize", value: "large" }, { key: "ActorTraits", add: ["swarm"] }]]);
    assert.deepEqual([collar.again.later, collar.again.repeat, collar.again.time, collar.again.plan.resolution.check.against.value, collar.again.plan.resolution.check.basic, collar.again.plan.damageChoices.map((choice) => choice.formula)], [true, true, { value: 1, unit: "minutes" }, 23, true, ["1d8[bludgeoning]", "1d8[piercing]", "1d8[slashing]"]]);
    // (The resistances and weaknesses as PF2e's Spider Swarm has them.)
    const swarm = readDocuments(path.join(PACKS, "pathfinder-monster-core")).find((doc) => doc.collection === "actors" && doc.name === "Spider Swarm");
    assert.deepEqual(SPIDER_SWARM, { resistances: swarm.system.attributes.resistances.map(({ type, value }) => ({ type, value })), weaknesses: swarm.system.attributes.weaknesses.map(({ type, value }) => ({ type, value })) });
});

test("one-offs, their card's lines: Barding Saddle's heavy barding, Familiar Morsel's familiar ability", () => {
    const saddle = activation("Barding Saddle", "Ready for Battle");
    const morsel = compileItem(item("Familiar Morsel"));
    for (const plan of [saddle, morsel]) assert.deepEqual([plan.decided, done(plan), plan.notes.length], ["one-off", true, 1]);
});

test("a tattoo with a summon spell's parameters: Bound Guardian's Tattoo Guardian, Fauna Guardian's animal its user picks (level 4 or lower), each summoned for a minute at most", () => {
    const bound = activations("Bound Guardian")[0];
    assert.deepEqual([done(bound), routeOf(bound), bound.creatures[0].from, bound.creatures[0].traits, bound.lasts.value, bound.vanishAtZero, bound.trigger.frequency.per], [true, "conjure", { name: "Tattoo Guardian" }, ["summoned", "minion"], 1, true, "day"]);
    const fauna = activations("Fauna Guardian")[0];
    assert.deepEqual([done(fauna), routeOf(fauna), fauna.pick, fauna.creatures[0].traits, fauna.lasts.value], [true, "conjure", { any: ["animal"], maxLevel: 4 }, ["summoned", "minion"], 1]);
});

test("a cast whose changes are its card's lines: Busine of Divine Reinforcements' celestial, Sow a Tooth's visible skeleton, the anchor's sunken ship; Reef Heart, Guardian Shield and Bleachguard Doll one-offs", () => {
    const [stun, summon] = activations("Busine of Divine Reinforcements");
    assert.deepEqual([stun.resolution.kind, summon.builtin, done(summon), summon.spell.name, summon.rank, summon.notes.length], ["save", "cast-spell", true, "Summon Celestial", 6, 4]);
    const tooth = activation("Sack of Hydra's Teeth", "Sow a Tooth");
    assert.deepEqual([tooth.builtin, done(tooth), tooth.spell.name, tooth.notes.length], ["cast-spell", true, "Phantasmal Minion", 1]);
    const anchor = compileActivations(item("Anchor of Aquatic Exploration"), spells)[0].plan;
    assert.deepEqual([anchor.builtin, done(anchor), anchor.spell.name], ["cast-spell", true, "Cozy Cabin"]);
    for (const plan of [activations("Reef Heart")[0], activations("Reef Heart (Greater)")[0], activations("Guardian Shield")[0], ...activations("Bleachguard Doll")]) assert.deepEqual([plan.decided, done(plan)], ["one-off", true]);
});

test("Wondrous Figurines: how often they're called (the activations card's frequency, a week or a month too), a week's wait once slain, each lion its own, the Onyx Dog's scent on its own Effect", () => {
    const [lions] = activations("Wondrous Figurine (Golden Lions)");
    assert.deepEqual([done(lions), lions.trigger.frequency.max, lions.trigger.frequency.per, lions.slainWait, lions.creatures[0].count], [true, 1, "day", { value: 1, unit: "weeks", each: true }, 2]);
    const [dog] = activations("Wondrous Figurine (Onyx Dog)");
    assert.deepEqual([done(dog), dog.trigger.frequency.per, dog.slainWait, dog.creatures[0].own.rules.length], [true, "week", { value: 1, unit: "weeks" }, 2]);
    assert.match(dog.creatures[0].own.text, /observed and concealed/);
    assert.equal(activations("Wondrous Figurine (Jade Serpent)")[0].trigger.frequency.per, "day");
    // (The waits: a week from the fall; a lion slain within it, one fewer called.)
    assert.equal(slainUntil(lions.slainWait, 1000), 1000 + 604_800);
    assert.deepEqual([countNow(2, [{ until: 5000 }], 4000), countNow(2, [{ until: 5000 }], 6000), countNow(2, [{ until: 5000 }, { until: 7000 }], 4000)], [1, 2, 0]);
    assert.deepEqual([periodOf({ max: 1, per: "week" }, { worldTime: 604_800 * 3 + 5 }), frequencyText({ max: 4, per: "month" })], ["week:3", "4 times per month"]);
});

test("Fossil Fragments: the Brontosaurus's day out of combat and four calls a month, its card's lines; the Amber Mosquito's own changes a one-off", () => {
    const [bronto] = activations("Fossil Fragment (Brontosaurus Phalange)");
    assert.deepEqual([done(bronto), bronto.lasts.formula, bronto.trigger.frequency.max, bronto.trigger.frequency.per], [true, "1d4", 4, "month"]);
    assert.ok(bronto.notes.includes("Out of combat, as a beast of burden or for transport, it lasts 24 hours: dismiss it when that's up."));
    const [mosquito] = activations("Fossil Fragment (Amber Mosquito)");
    assert.deepEqual([mosquito.decided, done(mosquito), mosquito.builtin, mosquito.trigger.frequency.per], ["one-off", true, "conjure", "day"]);
});

test("Serpent Oil (Moderate)'s Small or Medium object, the ways card's Sea Snake or Python; Palanquin of Night's four bearers", () => {
    const oil = compileItem(item("Serpent Oil (Moderate)"));
    assert.deepEqual([done(oil), routeOf(oil), oil.ways.map((way) => [way.name, way.plan.creatures[0].name, routeOf(way.plan)])], [true, "ways", [["A Small object", "Sea Snake", "conjure"], ["A Medium object", "Python", "conjure"]]]);
    assert.match(oil.ways[0].plan.creatures[0].from.uuid, /pathfinder-monster-core-2\.Actor\.rVzdgqUn7slx2WSS$/);
    const [palanquin] = activations("Palanquin of Night");
    assert.deepEqual([done(palanquin), routeOf(palanquin), palanquin.creatures[0].count, palanquin.creatures[0].from.uuid, palanquin.lasts, palanquin.notes.length], [true, "conjure", 4, "Compendium.pf2e.pathfinder-bestiary.Actor.j7NNPfZwD19BwSEZ", null, 5]);
});

test("a performance contest, a lost body found, shared waffles: Bargainer's Instrument's +2 to Performance (a note Effect of PF2e's rule) and its contest's lines, Mourner's Dawnlight Fulu whispered, Cooperative Waffles' 24-hour note Effect on both", () => {
    const instrument = compileItem(item("Bargainer's Instrument"));
    const contest = instrument.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(instrument), routeOf(instrument), contest.rules, contest.duration, instrument.notes.length], [true, "item", [{ key: "FlatModifier", selector: "performance", type: "item", value: 2 }], null, 4]);
    const fulu = compileItem(item("Mourner's Dawnlight Fulu"));
    assert.deepEqual([done(fulu), routeOf(fulu)], [true, "whisper"]);
    assert.match(fulu.whisper.text, /within 500 feet/);
    for (const [name, aid] of [["Cooperative Waffles", false], ["Cooperative Waffles (Greater)", true]]) {
        const waffles = compileItem(item(name));
        const note = waffles.resolution.outcomes.success.noteEffects[0];
        assert.deepEqual([done(waffles), routeOf(waffles), waffles.item.recipient, note.duration.value, note.duration.unit, /Aids/.test(note.text)], [true, "item", "targets", 24, "hours", aid], name);
    }
});

test("Harrow Spellcards' card or 1d6, the table card: each row its next check of a kind rolled twice until the next daily preparations", () => {
    const [harrow] = activations("Harrow Spellcards");
    assert.deepEqual([done(harrow), routeOf(harrow), harrow.table.die, harrow.table.rows.map((row) => row.plan.rollTwice.selector)], [true, "table", "1d6", ["athletics", "acrobatics", "survival", "skill-check", "religion", "diplomacy"]]);
    const books = harrow.table.rows[3].plan;
    assert.deepEqual([routeOf(books), books.rollTwice.predicate, books.rollTwice.keep, books.rollTwice.duration.unit], ["fortune", ["action:recall-knowledge"], "higher", "days"]);
});

test("Doctrine of Blissful Eternity's healing for its undead minion, a way per slot rank each spending that slot; Weapon Shots' ghostly weapon a one-off, their first activation still the Strike card", () => {
    const [doctrine] = activations("Doctrine of Blissful Eternity");
    const third = doctrine.ways[2].plan;
    assert.deepEqual([done(doctrine), routeOf(doctrine), doctrine.ways.length, third.resolution.outcomes.success.effects, third.spend, routeOf(third), doctrine.trigger.frequency.per], [true, "ways", 10, [{ kind: "heal", formula: "3d8" }], { spellSlot: { rank: 3 } }, "save", "day"]);
    for (const grade of ["Lesser", "Moderate", "Greater", "Major"]) {
        const [strike, ghost] = activations(`Weapon Shot (${grade})`);
        assert.deepEqual([routeOf(strike), ghost.decided, done(ghost)], ["strike", "one-off", true], grade);
    }
});
