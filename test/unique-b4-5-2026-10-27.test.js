// Unique items and artifacts, built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"):
// each activation's every rule played on its card — the readers they needed, on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { attitudeOf, pausedAfter } from "../src/live/conjured.js";
import { planFor } from "../src/live/if-target.js";
import { withAttackModifiers, withNearbyDC, withTargetDC } from "../src/live/scaled.js";
import { endsFor, hostileAt } from "../src/live/targeted.js";
import { saveText, withAttackChoice } from "../src/live/poison-card.js";
import { doomCurseOf, markText, marksEndingAt, runesAfter, spaceSource, storeAfter } from "../src/live/card.js";
import { focusText, poolAfter } from "../src/live/focus-card.js";
import { readiedRules } from "../src/live/fortune-card.js";

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
    assert.deepEqual([rows.success.effects, success.rules[0].alterations[0].value, success.rules[0].onDeleteActions, success.rules[1].option], [[], 3, { granter: "cascade", grantee: "cascade" }, "air-ends-on:targeted"]);
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
    // (2026-10-28: its ghost touch the ability module's damage roll options now, on the javelin and the gazelle — done.)
    assert.deepEqual([done(javelin), one.plan.damageOptions, one.plan.thenSave.damageOptions], [true, ["item:rune:property:ghost-touch"], ["item:rune:property:ghost-touch"]]);
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
    // (2026-10-28: only.all, the ability module's — summoned undead alone; done.)
    assert.deepEqual([save.when, save.only, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value], [["enter"], { all: ["undead", "summoned"] }, "will", 44]);
    assert.equal(done(ward), true);
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

test("The Carnival, The Empty Throne, The Owl: a whispered vision with its secret flat check and its user's Stupefied 1; no bonuses for a day or a week; a Nature check as Commune, the card's bonus on it", () => {
    const [carnival] = plans("The Carnival");
    assert.deepEqual([done(carnival), routeOf(carnival), carnival.whisper.flat.dc, carnival.userEffects], [true, "whisper", 3, [{ slug: "stupefied", value: 1, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } }]]);
    const [throne] = plans("The Empty Throne");
    const rows = throne.resolution.outcomes;
    assert.deepEqual([done(throne), routeOf(throne, "x"), rows.success.noteEffects[0].duration.unit, rows.failure.noteEffects[0].duration.value, rows.criticalFailure.noteEffects[0].duration.value], [true, "save", "rounds", 1, 7]);
    assert.match(rows.failure.noteEffects[0].text, /allies can't benefit from them either while within 15 feet/);
    const [owl] = plans("The Owl");
    assert.deepEqual([routeOf(owl, "x"), owl.ownSave, owl.resolution.check.statistic, owl.resolution.check.against.value, owl.resolution.check.bonus], ["save", true, "nature", 30, { value: 3, type: "item" }]);
    assert.equal(owl.resolution.outcomes.criticalFailure.noteEffects[0].rules[0].alterations[0].value, 4);
});

test("The Uprising: a 20-foot burst of grabbing figures for a minute, its user's unarmed Strike against each creature's Fortitude DC as it rises and at turns' ends", () => {
    const [mob] = plans("The Uprising");
    // (Done since the ability module's only.conditions and only.lacks.conditions — 2026-10-28.)
    assert.deepEqual([routeOf(mob), mob.zone.area, mob.zone.range, mob.zone.lasts.value, mob.zone.lasts.unit, done(mob)], ["zone", { type: "burst", value: 20 }, 120, 1, "minutes", true]);
    const [rises, grabs] = mob.zone.saves;
    assert.deepEqual([rises.when, rises.plan.resolution.check.against.statistic, rises.plan.resolution.check.attackFrom, rises.plan.resolution.sharedDamage.components[0].formula, rises.plan.resolution.outcomes.success.effects[0].duration.escape], [["initial"], "fortitude", "unarmed", "3d6", { ownerDC: "class" }]);
    assert.deepEqual([grabs.when, grabs.only, grabs.plan.resolution.outcomes.success.damage.mode, mob.zone.damage[0]], [["end"], { lacks: { conditions: ["grabbed"] } }, "none", { when: "end", only: { conditions: ["grabbed"] }, formulas: ["1d6[bludgeoning]"] }]);
    // (Its user's unarmed attack modifier, filled in as it's used.)
    assert.equal(withAttackModifiers(mob, { unarmed: 31 }).zone.saves[0].plan.resolution.check.modifier, 31);
});

test("Void Mirror: Speak to the Void its skills legendary for the check and a failure's mental damage; Call from the Void its picked creature's attitude by its user's check, its return a save; Become the Void's rows", () => {
    const [speak, call, become] = plans("Void Mirror");
    assert.deepEqual([done(speak), routeOf(speak), speak.trigger.frequency.per, speak.bonus.rules.map((rule) => rule.path), speak.bonus.after], [true, "fortune", "month", ["system.skills.nature.rank", "system.skills.occultism.rank"], { failure: { formula: "10d6", type: "mental" }, criticalFailure: { formula: "100", type: "mental" } }]);
    assert.ok(readiedRules(speak).some((rule) => rule.key === "ActiveEffectLike" && rule.value === 4));
    const [called, returned] = call.ways.map((way) => way.plan);
    assert.deepEqual([done(call), call.trigger.frequency?.per ?? call.ways[0].plan.trigger.frequency?.per, routeOf(called), called.pick, called.attitudeCheck.degrees, called.attitudeCheck.stunned], [true, "year", "conjure", { any: ["aberration", "beast", "fungus", "ooze", "plant"], maxLevel: 24 }, { criticalSuccess: "helpful", success: "indifferent", failure: "hostile", criticalFailure: "hostile" }, 3]);
    assert.deepEqual([routeOf(returned, "x"), returned.dcFromUser, returned.trigger.immunity.duration, returned.trigger.immunity.degrees], ["save", "occultism", { value: 24, unit: "hours" }, ["criticalSuccess", "success"]]);
    assert.deepEqual([attitudeOf(3, called.attitudeCheck.degrees), attitudeOf(0, called.attitudeCheck.degrees).alliance], [{ degree: "criticalSuccess", attitude: "helpful", disposition: 1, alliance: "party" }, "opposition"]);
    const rows = become.resolution.outcomes;
    assert.deepEqual([done(become), become.trigger.frequency.per, become.resolution.check.against.value, become.resolution.sharedDamage.components[0].formula, rows.criticalFailure.terminal, rows.criticalFailure.noteEffects[0].duration.value], [true, "century", 40, "10d6+40", { kind: "death" }, 7]);
});

// (2026-10-28: its Heroic grade's reading for both grades, src/compiler/artifact-readings.js — the ChoiceSet note Effect had no end at the next
// daily preparations and PF2e's terrain roll option wrong; a way for each terrain and side now, its Effect gone at rest.)
test("Slithermaw's Bane's Terrain Adaptation: a way for each terrain and heat or cold, its Effect ignoring that terrain's non-magical difficult terrain, +1 to saves against its hazards, until its user's next daily preparations", () => {
    const adapt = compileActivations(item("Slithermaw's Bane"), options).find((entry) => entry.activation.name === "Terrain Adaptation").plan;
    assert.deepEqual([done(adapt), routeOf(adapt), adapt.ways.length, adapt.ways[10].name], [true, "ways", 18, "Plains, protected from heat"]);
    const plains = adapt.ways[10].plan;
    const [effect] = plains.item.ruleEffects;
    assert.deepEqual([plains.partial, plains.temperature.counts["extreme-heat"], plains.temperature.untilRest, effect.rules.map((rule) => rule.key), effect.untilRest, effect.replaces], [undefined, "mild-heat", true, ["ActiveEffectLike", "FlatModifier"], true, undefined]);
    assert.deepEqual([effect.rules[0].value, effect.rules[1].value, effect.rules[1].predicate[0]], [{ environment: "plains", feature: "all" }, 1, "terrain:plains"]);
    assert.match(effect.words, /non-magical difficult terrain/);
});

test("What Doors We Open's door a container as a Spacious Pouch (Type II); Spectacles of Discernment's language and mark, then its secret counteract to see through", () => {
    const door = compileActivations(item("What Doors We Open"), options).find((entry) => entry.activation.name === "Open the Door Within").plan;
    assert.deepEqual([done(door), routeOf(door), door.item.space], [true, "item", { uuid: "Compendium.pf2e.equipment-srd.Item.JBMBaN9dZLytfFLQ", name: "The Door Within", like: "Spacious Pouch (Type II)" }]);
    const made = spaceSource({ _id: "x", name: "Spacious Pouch (Type II)", type: "backpack", system: { bulk: { capacity: 50 } } }, { space: door.item.space, itemUuid: "Actor.a.Item.g" });
    assert.deepEqual([made._id, made.name, made.type, made.flags["pf2e-automatic-item-resolution"].spaceOf], [undefined, "The Door Within", "backpack", "Actor.a.Item.g"]);
    const spectacles = compileActivations(item("Spectacles of Discernment"), options).find((entry) => entry.activation.name === "Reveal the Truth").plan;
    const [regard, flip] = spectacles.ways.map((way) => way.plan);
    assert.deepEqual([done(spectacles), routeOf(regard), regard.item.mark.duration.value, regard.resolution.outcomes.success.noteEffects[0].duration.unit, routeOf(flip), flip.whisper.secret.formula], [true, "item", 24, "hours", "whisper", "1d20+23"]);
    assert.match(flip.whisper.secret.words, /counteract rank 7/);
});

test("Hex Blaster: the creature hexed for a minute, its Will save card kept open for the hits; its critical failure's curse a note Effect the doom hold reads", () => {
    const [hex] = plans("Hex Blaster");
    const save = hex.again.plan;
    assert.deepEqual([done(hex), routeOf(hex), hex.item.mark.duration.value, hex.again.later, hex.again.repeat, hex.again.time.unit], [true, "item", 1, true, true, "minutes"]);
    const rows = save.resolution.outcomes;
    assert.deepEqual([save.resolution.check.against.value, rows.success.damage.formulas[0].formula, rows.criticalFailure.effects.map((effect) => [effect.slug, effect.value, effect.duration?.value ?? null])], [28, "1d6[persistent,mental]", [["frightened", 2, null], ["slowed", 1, 1]]]);
    const [curse] = rows.criticalFailure.noteEffects;
    assert.deepEqual(doomCurseOf({ system: { rules: curse.rules } }), { dc: 28, days: 1 });
    assert.equal(doomCurseOf({ system: { rules: [] } }), null);
});

test("Emerald Fulcrum Lens: its splinter possessing the creature its +20 spell attack hits — the lens's benefits on it for good, its user uninvested", () => {
    const [, possess] = plans("Emerald Fulcrum Lens");
    const [effect] = possess.resolution.outcomes.success.noteEffects;
    assert.deepEqual([done(possess), routeOf(possess), possess.resolution.check.modifier, possess.resolution.check.against.statistic, possess.possess.degrees, effect.duration], [true, "save", 20, "ac", ["criticalSuccess", "success"], null]);
    // (2026-10-28: the three fulcrum lenses' one reading, src/compiler/possession.js — its benefits PF2e's own Effect: Emerald Fulcrum Lens on the
    // creature, its user's taken away; the note Effect's RollOption alone.)
    assert.deepEqual([effect.rules.map((rule) => rule.key), possess.resolution.outcomes.success.nativeEffects[0].label, possess.possess.effect], [["RollOption"], "Effect: Emerald Fulcrum Lens", "Compendium.pf2e.equipment-effects.Item.vlTiBE0h2kyw5J9o"]);
});

test("Mindsponge: the surgery its user's Medicine check at DC 28 (a failure the creature's death), the harvest one more of four (the corpse's Talking Corpse save worse), squeezing them out", () => {
    const sponge = compileActivations(item("Mindsponge"), options);
    const absorb = sponge.find((entry) => entry.activation.name === "Absorb Memories").plan;
    const wipe = sponge.find((entry) => entry.activation.name === "Wipe Memories").plan;
    const [prepare, harvest, squeeze] = absorb.ways.map((way) => way.plan);
    // (2026-10-28: the ability module's skill check at a fixed DC, its rows on the creature — no statistic of the target's; done.)
    assert.deepEqual([routeOf(absorb), routeOf(prepare), prepare.resolution.check.statistic, prepare.resolution.check.against, prepare.resolution.outcomes.failure.terminal, done(absorb)], ["ways", "save", "medicine", { dc: "fixed", value: 28 }, { kind: "death" }, true]);
    assert.deepEqual([routeOf(harvest), harvest.item.store, harvest.resolution.outcomes.success.noteEffects[0].rules[0].key, squeeze.item.store, wipe.item.storeFull], ["item", { max: 4, add: 1 }, "AdjustDegreeOfSuccess", { max: 4, release: true }, 4]);
    assert.deepEqual([storeAfter(3, harvest.item.store, "Mindsponge"), storeAfter(4, harvest.item.store, "Mindsponge").full, storeAfter(4, squeeze.item.store, "Mindsponge").count], [{ count: 4, line: "Mindsponge now holds 4 of 4" }, "Mindsponge is full (4 of 4): squeeze it out first", 0]);
});

test("Jax: her Dominate on its wielder, a Lamashtu worshipper's or a chaotic one's save at -2 and a degree worse (PF2e's rules on a note Effect), her orders a note Effect", () => {
    const [, dominate] = plans("Jax");
    const [judged, orders] = dominate.userEffects;
    assert.deepEqual([done(dominate), routeOf(dominate), dominate.notes, judged.kind, judged.note.rules.map((rule) => rule.key), judged.note.rules[0].value, orders.note.label], [true, "cast", undefined, "note", ["FlatModifier", "AdjustDegreeOfSuccess"], -2, "Jax's orders"]);
});

test("Meloth's Lifedrinker: Lifedrink's 1d6 void, its slain victim raising its runes for good by its wielder's level; Vision of Meloth's death at 0 HP. Tengu Feather Fan: the spells its owner's feats put in it, or a cantrip not counted", () => {
    const blade = compileActivations(item("Meloth's Lifedrinker (Level 7)"), options);
    const drink = blade.find((entry) => entry.activation.name === "Lifedrink").plan;
    const vision = blade.find((entry) => entry.activation.name === "Vision of Meloth").plan;
    assert.deepEqual([done(drink), routeOf(drink), drink.lifedrink.upgrades.map((step) => step.level), vision.resolution.postDamageTerminal, vision.notes], [true, "save", [10, 12, 16, 19], { kind: "death", threshold: 0 }, undefined]);
    assert.deepEqual(runesAfter({ potency: 1, striking: 1 }, drink.lifedrink.upgrades, 16), { runes: { potency: 3, striking: 2 }, lines: ["its +1 potency rune is now +2", "its striking rune is now greater striking", "its +2 potency rune is now +3"] });
    assert.deepEqual(runesAfter({ potency: 2, striking: 1 }, drink.lifedrink.upgrades, 11).lines, []);
    const fan = (feats) => compileActivations({ ...item("Tengu Feather Fan"), ownerFeats: feats }, options)[0].plan;
    const plain = fan([]);
    assert.deepEqual([done(plain), routeOf(plain), plain.trigger.frequency.max, plain.ways[0].plan.spell.name, plain.ways[0].plan.rank, plain.ways[0].plan.ownerDC, plain.ways[1].refund], [true, "ways", 1, "Gust of Wind", 1, "class-spell", true]);
    const full = fan(["wind-gods-fan", "thunder-gods-fan"]);
    assert.deepEqual([full.trigger.frequency.max, full.ways[0].plan.choices.map((choice) => `${choice.spell.name} ${choice.rank}`)], [3, ["Gust of Wind 1", "Wall of Wind 3", "Lightning Bolt 5"]]);
});
