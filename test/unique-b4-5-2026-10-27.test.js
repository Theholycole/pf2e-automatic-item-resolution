// Unique items and artifacts, built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"):
// each activation's every rule played on its card — the readers they needed, on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { pausedAfter } from "../src/live/conjured.js";
import { planFor } from "../src/live/if-target.js";
import { withNearbyDC } from "../src/live/scaled.js";
import { endsFor, hostileAt } from "../src/live/targeted.js";
import { saveText } from "../src/live/poison-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const plans = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("Horns of Naraga: the helm becomes Naraga, an Ancient Black Dragon with her own turns, for an hour; slain, a week's wait; the helm paused meanwhile", () => {
    const [touch, dragon] = plans("Horns of Naraga");
    // (Its touch: 5d6 void, its undead user healed by it — the drain, as before.)
    assert.deepEqual([done(touch), touch.drain.onlyIf, touch.directDamage.formula], [true, "undead", "5d6"]);
    assert.deepEqual([done(dragon), routeOf(dragon), dragon.trigger.frequency.per, dragon.max, dragon.vanishAtZero, dragon.pauseItem], [true, "conjure", "day", 1, true, true]);
    const [naraga] = dragon.creatures;
    assert.deepEqual([naraga.name, naraga.from.uuid, naraga.initiative], ["Naraga", "Compendium.pf2e.pathfinder-bestiary.Actor.Lvdykf6wfqzZBlZd", "roll"]);
    assert.deepEqual([dragon.lasts.value, dragon.lasts.unit, dragon.slainWait], [1, "hours", { value: 1, unit: "weeks" }]);
    assert.ok(dragon.notes.some((note) => /uninvested until she reverts/.test(note)));
    // (The pause: kept for the others while one's still out, its invested state back once none is.)
    const paused = { actorIds: ["a", "b"], invested: true };
    assert.deepEqual(pausedAfter(paused, "a"), { keep: { actorIds: ["b"], invested: true } });
    assert.deepEqual(pausedAfter(paused, "a", (id) => id !== "b"), { restore: true });
    assert.deepEqual(pausedAfter({ actorIds: ["a"], invested: false }, "a"), { restore: false });
});

test("Flawed Orb of Gold Dragonkind: dragons only, gold ones at -4, +1 DC a shard near; its stuns Effects that end when the dragon's subject to a hostile act", () => {
    const [orb] = plans("Flawed Orb of Gold Dragonkind");
    const rows = orb.resolution.outcomes;
    assert.deepEqual([done(orb), routeOf(orb), orb.resolution.check.against.value, orb.dcNear], [true, "save", 30, { name: "Orb Shard", within: 60, each: 1 }]);
    const [success] = rows.success.noteEffects;
    assert.deepEqual([rows.success.effects, success.rules[0].alterations[0].value, success.rules[0].onDeleteActions, success.rules[1].option], [[], 3, { granter: "cascade" }, "air-ends-on:targeted"]);
    const [held] = rows.failure.noteEffects;
    assert.deepEqual([held.duration.value, held.duration.unit, held.rules.map((rule) => rule.key)], [10, "minutes", ["GrantItem", "RollOption"]]);
    // (Its critical failure's stun isn't ended by hostile acts.)
    assert.deepEqual(rows.criticalFailure.noteEffects[0].rules.map((rule) => rule.key), ["GrantItem"]);
    // (A non-dragon unaffected; a gold dragon by its name at -4; another dragon as written.)
    assert.equal(planFor(orb, { name: "Ogre", system: { traits: { value: ["giant", "humanoid"] } } }), null);
    assert.equal(planFor(orb, { name: "Gold Dragon (Ancient)", system: { traits: { value: ["dragon", "fire"] } } }).resolution.check.bonus.value, -4);
    assert.equal(planFor(orb, { name: "Black Dragon (Ancient)", system: { traits: { value: ["dragon", "acid"] } } }), orb);
    assert.equal(withNearbyDC(orb, 13).resolution.check.against.value, 43);
    assert.equal(withNearbyDC(orb, 0), orb);
    // (What ends it: an attack at it, a save it rolls; not the orb's own.)
    assert.deepEqual(hostileAt({ type: "attack-roll", target: { token: "Scene.s.Token.t", actor: "Actor.a" } }), { at: ["Scene.s.Token.t", "Actor.a"] });
    assert.deepEqual(hostileAt({ type: "saving-throw" }, "Actor.d"), { at: ["Actor.d"] });
    assert.equal(hostileAt({ type: "damage-roll" }, "Actor.d"), null);
    assert.deepEqual([endsFor("Flawed Orb of Gold Dragonkind: Stunned 3", "Flawed Orb of Gold Dragonkind"), endsFor("Flawed Orb of Gold Dragonkind: Stunned 3", "Fireball"), endsFor("Flawed Orb of Gold Dragonkind: Stunned 3", null)], [false, true, true]);
});

test("Passage Pane: its user's Religion check locks it on (a note Effect on them), its rift a note Effect for 24 hours at most, its closing that Effect ended", () => {
    const [lock, rift, close] = plans("Passage Pane");
    assert.deepEqual([done(lock), routeOf(lock, "Attempt a @Check[religion|dc:40] check."), lock.ownSave, lock.resolution.check.statistic, lock.resolution.check.against.value], [true, "save", true, "religion", 40]);
    assert.deepEqual([lock.resolution.outcomes.success.noteEffects[0].label, lock.resolution.outcomes.criticalSuccess.noteEffects[0].label, lock.resolution.outcomes.failure.noteEffects], ["Locked on", "Locked on", undefined]);
    const [open] = rift.resolution.outcomes.success.noteEffects;
    assert.deepEqual([done(rift), routeOf(rift), rift.trigger.frequency.per, open.label, open.duration.value, open.duration.unit], [true, "item", "week", "Rift to the Boneyard", 24, "hours"]);
    assert.deepEqual([done(close), routeOf(close), close.item.endsOwn, close.noRules], [true, "item", { label: "Rift to the Boneyard" }, undefined]);
    assert.equal(saveText(lock), "DC 40 Religion check");
});
