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
import { withNearbyDC, withTargetDC } from "../src/live/scaled.js";
import { endsFor, hostileAt } from "../src/live/targeted.js";
import { saveText, withAttackChoice } from "../src/live/poison-card.js";
import { markText, marksEndingAt } from "../src/live/card.js";
import { focusText, poolAfter } from "../src/live/focus-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1, ownerAbilities: { str: 4, dex: 3, con: 2, int: 1, wis: 1, cha: 1 } };
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

test("Hunter's Dawn: the javelin's three ways (its user's thrown attack with the club's +3, the gazelle at as many creatures as actions), its mark until death or another, Locate once a day", () => {
    const [javelin, mark] = plans("Hunter's Dawn");
    assert.deepEqual([routeOf(javelin), javelin.ways.map((way) => way.plan.thenSave.maxTargets), javelin.ways.map((way) => way.plan.activation.time)], ["ways", [1, 2, 3], ["1", "2", "3"]]);
    const [one] = javelin.ways;
    assert.deepEqual([one.plan.ownCheck, one.plan.resolution.sharedDamage.components[0].formula, one.plan.thenSave.resolution.sharedDamage.components[0].formula, one.plan.targeting.range], [{ kind: "attack", modifier: null, choose: ["thrown"], within: 60, itemBonus: 3 }, "3d6+4", "2d6+4", "60 feet"]);
    // (Its ghost touch alone left: the ability module's damage roll options, requested.)
    assert.deepEqual([javelin.partial, one.plan.damageOptions], [true, ["item:rune:property:ghost-touch"]]);
    const attack = withAttackChoice(one.plan, { attackChoices: [{ kind: "thrown", label: "Thrown", modifier: 20 }], attackChoice: 0, attackPenalty: 0 });
    assert.equal(attack.resolution.check.modifier, 23);
    const [marking, locate] = mark.ways;
    assert.deepEqual([done(mark), routeOf(marking.plan), marking.plan.item.mark.slug, marking.plan.item.mark.endsOnDeath, routeOf(locate.plan), locate.plan.rank, locate.frequency.per], [true, "item", "hunters-dawn-mark", true, "cast", 5, "day"]);
    assert.match(markText(marking.plan.item.mark), /until it dies or another is marked; dispelling it takes a counteract check against DC 46$/);
    // (Its mark gone as its creature dies: the mark Effects at that creature's tokens.)
    const effects = [{ id: "m", flags: { "pf2e-automatic-item-resolution": { markEndsOnDeath: true } }, system: { rules: [{ key: "TokenMark", uuid: "Scene.s.Token.t" }] } }, { id: "n", flags: { "pf2e-automatic-item-resolution": { mark: "x" } }, system: { rules: [{ key: "TokenMark", uuid: "Scene.s.Token.t" }] } }];
    assert.deepEqual([marksEndingAt(effects, ["Scene.s.Token.t"]), marksEndingAt(effects, ["Scene.s.Token.u"])], [["m"], []]);
});

test("Spiral Athame: its Circle of Protection against undead a 10-foot ward around its holder for a minute, the bonuses inside, a summoned undead's Will save at the door", () => {
    const [, ward] = plans("Spiral Athame");
    assert.deepEqual([routeOf(ward), ward.zone.centre, ward.zone.area, ward.zone.lasts.value, ward.zone.lasts.unit], ["zone", "self", { type: "emanation", value: 10 }, 1, "minutes"]);
    const rules = ward.zone.inside[0].rules;
    assert.deepEqual(rules.filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.value, rule.predicate]), [[1, ["origin:trait:undead"]], [3, ["origin:trait:undead", "origin:trait:summoned"]], [3, ["origin:trait:undead", "spiral-athame-ward:controlling"]]]);
    const [save] = ward.zone.saves;
    assert.deepEqual([save.when, save.only, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value], [["enter"], { traits: ["undead"], all: ["undead", "summoned"] }, "will", 44]);
    // (Its save for summoned undead alone waits for the ability module's all-traits filter: partial for that.)
    assert.equal(ward.partial, true);
});

test("Red Hand's Satchel: one more batch of infused reagents past its daily count, lost unused at the end of its user's next turn", () => {
    const [satchel] = plans("Red Hand's Satchel");
    assert.deepEqual([done(satchel), routeOf(satchel), satchel.focus, satchel.trigger.frequency.per], [true, "focus", { amount: 1, only: null, lost: "next-turn-end", resource: "infused-reagents", overMax: true }, "day"]);
    assert.equal(focusText(satchel.focus), "1 batch of infused reagents; lost at the end of its next turn if not used");
    assert.deepEqual([poolAfter({ value: 4, max: 4 }, 1, { overMax: true }), poolAfter({ value: 4, max: 4 }, 1).reason, poolAfter({ value: 0, max: 0 }, 1, { overMax: true }).reason], [{ value: 5, gained: 1, max: 4, reason: null }, "full", "no-pool"]);
});

test("Briar: its partner back from death at full Hit Points with its pools; its first Strike at Nyrissa a +4 to saves against her spells, then her DC 50 save; its casts without the next tier's words", () => {
    const all = plans("Briar");
    const [back, nyrissa] = all.slice(8);
    assert.deepEqual([done(back), routeOf(back), back.item.recipient, back.item.revive.hp, back.item.revive.keepPools, back.trigger.frequency.per], [true, "item", "user", "max", true, "month"]);
    const [bonus] = nyrissa.resolution.outcomes.success.modifiers;
    assert.deepEqual([done(nyrissa), routeOf(nyrissa), bonus.value, bonus.type, bonus.predicate, bonus.duration.value, nyrissa.item.mark.slug], [true, "item", 4, "item", ["origin:mark:briar-nyrissa", "item:type:spell"], 1, "briar-nyrissa"]);
    const save = nyrissa.again.plan;
    assert.deepEqual([save.resolution.check.against.value, save.resolution.outcomes.failure.effects[0].value, save.resolution.outcomes.criticalFailure.effects[0].value], [50, 1, 3]);
    assert.equal(planFor(save, { name: "Owlbear", system: { traits: { value: ["animal"] } } }), null);
    assert.equal(planFor(save, { name: "Nyrissa", system: { traits: { value: ["fey"] } } }), save);
    // (The casts' blocks ran into the next tier's words: not their card's lines.)
    assert.deepEqual([all[0].notes, all[5].notes], [undefined, undefined]);
});

test("Piereta: its Retributive Strike's resistance, 2 + its user's level, for the ally the enemy damaged against that damage", () => {
    const [retribution] = plans("Piereta");
    assert.deepEqual([done(retribution), routeOf(retribution), retribution.bonus.resistance, retribution.bonus.against, retribution.bonus.recipient, retribution.trigger.frequency.per], [true, "fortune", { type: "all-damage", value: 22 }, true, "target", "minute"]);
});

test("Spear of the Destroyer's Flame: tying its user's soul (its best of four against the living Commander's highest DC, or at once with none), mustering the Army of Fire", () => {
    const [spear] = plans("Spear of the Destroyer's Flame");
    assert.deepEqual([done(spear), routeOf(spear), spear.ways.map((way) => way.frequency.per), spear.ways.map((way) => way.frequencyKey ?? null)], [true, "ways", ["day", "day", "week"], ["tie", "tie", null]]);
    const [against, alone] = spear.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(against, "x"), against.ownSave, against.bestOf, against.dcFromTarget.statistics], ["save", true, ["will", "diplomacy", "intimidation", "warfare-lore"], ["will", "diplomacy", "intimidation", "warfare-lore"]]);
    assert.deepEqual([against.resolution.outcomes.success.noteEffects[0].label, against.resolution.outcomes.failure.noteEffects[0].duration.value, alone.resolution.outcomes.success.noteEffects[0].label], ["Commander of Flame", 24, "Commander of Flame"]);
    const rolled = withTargetDC(against, { will: 38, diplomacy: 41, intimidation: 36 }, { will: 20, diplomacy: 25, intimidation: 18, "warfare-lore": 27 });
    assert.deepEqual([rolled.resolution.check.against.value, rolled.resolution.check.statistic], [41, "warfare-lore"]);
    assert.equal(withTargetDC(against, {}, {}), null);
});
