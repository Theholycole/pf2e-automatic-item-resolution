// Creatures an item makes or controls, and its user's companion (2026-10-27, docs/needs.md "Creatures it makes or controls"): the readings
// of src/compiler/creature-readings.js — conjured tokens, a creature its user picks first, a size on the ways card, note Effects —, and what
// the made creature gets from the item's text (src/live/conjured.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { conjuredChanges, pickCandidates, pickedPlan } from "../src/live/conjured.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
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
