// Unique items and artifacts read whole (2026-10-27, the user: their unique effects all built): src/compiler/relic-readings.js and the
// mechanisms its readings make — crafting from a known formula (src/live/craft-card.js), damage each round around its user with a blast at
// the end (src/live/pulse.js) —, on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { coinsText, craftOutcome, fitsCraft, impeccableEffect, impeccablePlan, levelsLeft, materialsCost, withLevels } from "../src/live/craft-card.js";
import { pulseDamagePlan, pulseFlag, pulseStep } from "../src/live/pulse.js";
import { periodOf } from "../src/live/activations-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;

test("Aroden's Hearthstone's crafting: a magical weapon or armor of 20th level or lower, a Crafting check, a quarter of the Price, 4 times a year", () => {
    const [craft] = activations("Aroden's Hearthstone");
    assert.deepEqual([craft.builtin, routeOf(craft), done(craft)], ["craft", "craft", true]);
    assert.deepEqual(craft.craft, { types: ["weapon", "armor"], traits: ["magical"], maxLevel: 20, check: true, materials: 0.25, requires: { skill: "crafting", rank: 4, words: "legendary in Crafting" } });
    assert.deepEqual([craft.trigger.frequency, craft.item.activation.frequency], [{ max: 4, per: "year", raw: "4 times per year" }, { max: 4, per: "year", raw: "4 times per year" }]);
    assert.equal(craft.notes.length, 2);
    // (A year's period for its uses.)
    assert.equal(periodOf({ per: "year" }, { worldTime: 31_536_000 * 3 + 5 }), "year:3");
    // (What fits, what it costs, and each degree.)
    assert.equal(fitsCraft({ type: "weapon", traits: ["magical"], level: 20 }, craft.craft, 25), true);
    assert.equal(fitsCraft({ type: "weapon", traits: ["magical"], level: 21 }, craft.craft, 25), false);
    assert.equal(fitsCraft({ type: "armor", traits: [], level: 5 }, craft.craft, 25), false);
    assert.equal(fitsCraft({ type: "shield", traits: ["magical"], level: 5 }, craft.craft, 25), false);
    assert.equal(materialsCost(craft.craft, 1_000_000), 250_000);
    assert.deepEqual([craftOutcome(craft.craft, 2, { name: "Sword", priceCopper: 1_000_000 }).made, craftOutcome(craft.craft, 2, { name: "Sword", priceCopper: 1_000_000 }).paid], [true, 250_000]);
    assert.deepEqual([craftOutcome(craft.craft, 1, { name: "Sword", priceCopper: 1_000_000 }).made, craftOutcome(craft.craft, 1, { name: "Sword", priceCopper: 1_000_000 }).paid], [false, 0]);
    assert.deepEqual([craftOutcome(craft.craft, 0, { name: "Sword", priceCopper: 1_000_000 }).made, craftOutcome(craft.craft, 0, { name: "Sword", priceCopper: 1_000_000 }).paid], [false, 25_000]);
    assert.equal(coinsText(250_055), "2,500 gp, 5 sp, 5 cp");
});

test("Aroden's Hearthstone's cold: 4d6 cold each round within its mile (its user too) for the minute, then the 25d6 fire blast within 150 feet", () => {
    const [, cold] = activations("Aroden's Hearthstone");
    assert.deepEqual([routeOf(cold), done(cold), cold.trigger.frequency.per], ["item", true, "month"]);
    assert.deepEqual(cold.item.pulse, { formula: "4d6", type: "cold", radius: 5280, own: true, lasts: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" }, then: { formula: "25d6", type: "fire", radius: 150, own: true } });
    const [note] = success(cold).noteEffects;
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "minutes"]);
    assert.match(note.text, /−200 °F/);
    // (Its ticks while the minute lasts, then the blast.)
    const flag = pulseFlag(cold.item.pulse, { item: { name: "Aroden's Hearthstone" }, worldTime: 600 });
    assert.deepEqual([flag.endsAt, pulseStep(flag, 654), pulseStep(flag, 660)], [660, "tick", "blast"]);
    assert.equal(pulseStep({ ...flag, pulse: { ...flag.pulse, then: null } }, 660), "end");
    const plan = pulseDamagePlan({ ...cold.item.pulse, name: "Aroden's Hearthstone: this round" });
    assert.deepEqual([plan.resolution.check.roll, plan.resolution.sharedDamage.components[0].formula, plan.resolution.outcomes.success.damage.mode], ["automatic", "4d6[cold]", "shared"]);
});

test("Philosopher's Extractor's Accelerated Synthesis: an alchemical item of its user's level or lower, 56 levels a day, impeccable", () => {
    const synthesis = activation("Philosopher's Extractor", "Accelerated Synthesis");
    assert.deepEqual([synthesis.builtin, routeOf(synthesis), done(synthesis), synthesis.trigger.frequency.per], ["craft", "craft", true, "minute"]);
    assert.deepEqual(synthesis.craft, { types: [], traits: ["alchemical"], maxLevel: "user", check: false, materials: 0, budget: { levels: 56, per: "day" }, impeccable: true });
    assert.equal(fitsCraft({ type: "consumable", traits: ["alchemical", "elixir"], level: 19 }, synthesis.craft, 19), true);
    assert.equal(fitsCraft({ type: "consumable", traits: ["alchemical"], level: 20 }, synthesis.craft, 19), false);
    // (The day's levels.)
    const record = withLevels(withLevels(null, "day:3", 19), "day:3", 19);
    assert.deepEqual([levelsLeft(synthesis.craft.budget, record, "day:3"), levelsLeft(synthesis.craft.budget, record, "day:4")], [18, 56]);
    assert.equal(craftOutcome(synthesis.craft, 3, { name: "Elixir", priceCopper: 100 }).paid, 0);
});

test("an impeccable item's use: its rolls at their maximum, its times doubled, its drawback gone", () => {
    const plan = impeccablePlan({ resolution: { kind: "healing", healing: { formula: "6d8+30" } }, item: { pf2eRoll: { formula: "6d8+30", kind: "healing" } }, rows: { success: { modifiers: [{ selector: "ac", value: -1 }, { selector: "attack", value: 1 }], effects: [{ duration: { mode: "fixed", value: 1, unit: "hours" } }, { duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end" } }] } } });
    assert.deepEqual([plan.impeccable, plan.resolution.healing.formula, plan.item.pf2eRoll], [true, "48+30", null]);
    assert.deepEqual(plan.rows.success.modifiers, [{ selector: "attack", value: 1 }]);
    assert.deepEqual(plan.rows.success.effects.map((effect) => effect.duration.value), [2, 0]);
    const effect = impeccableEffect({ system: { duration: { value: 1, unit: "hours" }, rules: [{ key: "FlatModifier", selector: "ac", value: -1 }, { key: "FlatModifier", selector: "attack", value: 1 }, { key: "Weakness", type: "fire", value: 5 }] } });
    assert.deepEqual([effect.system.duration.value, effect.system.rules.length], [2, 1]);
});

test("Philosopher's Extractor's Essence Transmogrification: up to 10 mutagens from the creature targeted; drunk, the GM's pick of its abilities for an hour", async () => {
    const { abilityChoices, abilityRules, mutagenPlan, mutagenSource, transformDC, withOwnDC } = await import("../src/live/transmogrify.js");
    const essence = activation("Philosopher's Extractor", "Essence Transmogrification");
    assert.deepEqual([essence.builtin, routeOf(essence), done(essence)], ["transmogrify", "transmogrify", true]);
    assert.deepEqual(essence.transmogrify, { step: "make", most: 10, lasts: { value: 1, unit: "hours" } });
    assert.equal(essence.notes.length, 3);
    const troll = { name: "Troll", uuid: "Compendium.pf2e.pathfinder-monster-core.Actor.x", level: 5 };
    const source = mutagenSource(troll, { count: 12, level: 25 });
    assert.deepEqual([source.name, source.system.quantity, source.flags["pf2e-automatic-item-resolution"].transmogrify.creature.name], ["Transmogrifying Mutagen (Troll)", 10, "Troll"]);
    assert.deepEqual([routeOf(mutagenPlan({ creature: troll })), mutagenPlan({ creature: troll }).transmogrify.step], ["transmogrify", "drink"]);
    const choices = abilityChoices({ senses: [{ type: "darkvision" }, { type: "scent", acuity: "imprecise", range: 30 }], speeds: { land: 30, fly: 60 }, immunities: ["sleep"], resistances: [{ type: "fire", value: 10 }], actions: [{ name: "Breath Weapon", uuid: "u1" }, { name: "Arcane Innate Spells", uuid: "u2" }] });
    assert.deepEqual(choices.map((choice) => choice.label), ["darkvision", "scent (imprecise) 30 feet", "fly Speed 60 feet", "immunity to sleep", "resistance 10 to fire", "Breath Weapon"]);
    assert.deepEqual(choices.map((choice) => abilityRules(choice)[0]?.key ?? null), ["Sense", "Sense", "BaseSpeed", "Immunity", "Resistance", null]);
    assert.equal(withOwnDC("<p>@Check[reflex|dc:34|basic] save; DC 34 to Escape</p>", 41), "<p>@Check[reflex|dc:41|basic] save; DC 41 to Escape</p>");
    assert.deepEqual([transformDC(0), transformDC(1), transformDC(3)], [null, 2, 4]);
});

test("Runewell of Lust's Exit the Eye: the teleport card to a space within 30 feet of the anima focus, the token targeted", () => {
    const [exit] = activations("Runewell of Lust");
    assert.deepEqual([exit.builtin, routeOf(exit), done(exit), exit.teleport.within, exit.teleport.from], ["teleport", "teleport", true, 30, "target"]);
    assert.equal(exit.teleport.lines.length, 2);
});

test("Freedom's Flame's Break Free: a Mythic Point, and +3 status to the new save of each creature targeted within 120 feet", () => {
    const free = activation("Freedom's Flame", "Break Free");
    assert.deepEqual([routeOf(free), done(free), free.spend, free.item.recipient, free.targeting.range], ["item", true, { mythicPoints: 1 }, "targets", "120 feet"]);
    const [note] = success(free).noteEffects;
    assert.deepEqual(note.rules, [{ key: "FlatModifier", selector: "saving-throw", type: "status", value: 3, removeAfterRoll: "if-enabled" }]);
});

test("Retribution's Vengeful Slice: the Strike card with Retribution itself, once per round, its 120 feet as if within reach", () => {
    const [slice] = activations("Retribution");
    assert.deepEqual([routeOf(slice), done(slice), slice.strike.own, slice.trigger.event, slice.trigger.frequency.per], ["strike", true, true, "strike", "round"]);
    assert.match(slice.strike.lines[0], /120 feet/);
});

test("Clockwork Sun's Set Cycle: a sunny day's light to a mile, and its two saves at creatures' turns while it's lit", async () => {
    const { auraFits } = await import("../src/live/turn-auras.js");
    const [sun] = activations("Clockwork Sun");
    assert.deepEqual([routeOf(sun), done(sun), sun.notes.length], ["item", true, 3]);
    const [lit] = sun.item.ruleEffects;
    assert.deepEqual(lit.rules, [{ key: "TokenLight", value: { bright: 5280, dim: 5280 } }]);
    const [glare, pain] = lit.turnAuras;
    assert.deepEqual([glare.radius, glare.at, glare.plan.resolution.check.statistic, glare.plan.resolution.check.against.value, glare.plan.resolution.outcomes.failure.effects[0].slug, glare.plan.resolution.outcomes.criticalFailure.effects[0].slug], [20, "end", "fortitude", 43, "dazzled", "blinded"]);
    assert.deepEqual([pain.radius, pain.at, pain.plan.resolution.check.statistic, pain.plan.resolution.outcomes.failure.effects[0].value, pain.plan.resolution.outcomes.criticalFailure.effects[0].value], [5280, "start", "will", 1, 2]);
    // (Who each one calls for.)
    assert.equal(auraFits(glare, { at: "end", distance: 15 }), true);
    assert.equal(auraFits(glare, { at: "end", distance: 25 }), false);
    assert.equal(auraFits(glare, { at: "end", distance: 15, effects: ["effect-avert-gaze"] }), false);
    assert.equal(auraFits(glare, { at: "end", distance: 15, conditions: ["blinded"] }), false);
    assert.equal(auraFits(glare, { at: "start", distance: 15 }), false);
    assert.equal(auraFits(glare, { at: "end", distance: 0, self: true }), false);
    assert.equal(auraFits(pain, { at: "start", distance: 900, abilities: ["sunlight-powerlessness"] }), true);
    assert.equal(auraFits(pain, { at: "start", distance: 900, abilities: ["darkvision"] }), false);
});

// (2026-10-28: Lesser Cube of Nex read as Cube of Nex is, src/compiler/cube-faces.js withCubeWalls — its own reading's zones, entering-only
// saves and item.structure walls gone; the leftovers group's test/b5-leftovers-2026-10-28.test.js.)
test("Lesser Cube of Nex: Cube of Nex's ways card — zones with counteracts and crossing saves both ways, walls of force round its user", () => {
    const [cube] = activations("Lesser Cube of Nex");
    assert.deepEqual([routeOf(cube), done(cube), cube.ways.length, cube.trigger.frequency.per], ["ways", true, 5, "hour"]);
    const [gas, nonliving, living, magic, force] = cube.ways.map((way) => way.plan);
    assert.deepEqual([gas.zone.area, gas.zone.centre, gas.item.counteract.modifier, gas.item.counteract.rank], [{ type: "square", value: 10 }, "around", 20, 10]);
    assert.deepEqual([magic.item.counteract.modifier, magic.item.counteract.free.name], [20, "the magical effect crossing its walls"]);
    assert.deepEqual([nonliving.zone.saves[0].when, nonliving.zone.saves[0].only, nonliving.zone.saves[0].plan.resolution.check.against.value], [["enter", "exit"], { traits: ["construct", "undead"] }, 30]);
    assert.deepEqual(living.zone.saves[0].only, { notTraits: ["construct", "undead"] });
    assert.deepEqual([routeOf(force), force.structure.stats, force.structure.invisible], ["walls-around", { hardness: 30, hp: 60 }, true]);
});

test("Planar Ribbon's reach: the DC 42 Reflex save card at a foe within 60 feet, places traded and its allies Off-Guard on a failure", async () => {
    const { swapOffGuardPlan } = await import("../src/live/swap.js");
    const [, reach] = activations("Planar Ribbon");
    assert.deepEqual([routeOf(reach), done(reach), reach.targeting.range, reach.resolution.check.statistic, reach.resolution.check.against.value, reach.swap], ["save", true, "60 feet", "reflex", 42, { degrees: ["failure", "criticalFailure"] }]);
    assert.deepEqual(Object.values(reach.resolution.outcomes).map((row) => (row.manualInstructions ?? []).length), [0, 0, 0, 0]);
    const [offGuard] = swapOffGuardPlan("Planar Ribbon").resolution.outcomes.success.effects;
    assert.deepEqual([offGuard.slug, offGuard.scope, offGuard.duration.expiry, offGuard.duration.anchor], ["off-guard", { against: "actor", attacks: "any" }, "turn-end", "source-turn"]);
});

test("Staff of Sun Wukong's Close at Hand: the needle form, negligible Bulk and +4 to hide it, until activated again", async () => {
    const { itemFormEffectSource } = await import("../src/live/item-form.js");
    const close = activation("Staff of Sun Wukong", "Close at Hand");
    assert.deepEqual([routeOf(close), done(close), close.item.itemForm.alterations], ["item", true, [{ property: "bulk", mode: "override", value: 0 }]]);
    const effect = itemFormEffectSource(close.item.itemForm, { item: { name: "Staff of Sun Wukong", uuid: "Actor.a.Item.staffid" } });
    assert.deepEqual(effect.system.rules.map((rule) => [rule.key, rule.itemId ?? rule.selector ?? rule.option, rule.value ?? null]), [["ItemAlteration", "staffid", 0], ["RollOption", "hiding-sun-wukong-staff", null], ["FlatModifier", "stealth", 4]]);
    assert.equal(effect.flags["pf2e-automatic-item-resolution"].itemForm, "staffid");
});

test("The Courtesan and The Fiend: their casts at half their user's level, the Courtesan's Impersonate a degree better, the Fiend's 20-foot emanation", () => {
    const [courtesan] = activations("The Courtesan");
    assert.deepEqual([routeOf(courtesan), done(courtesan), courtesan.self, courtesan.castRank.min], ["cast", true, true, 6]);
    assert.deepEqual(courtesan.castBonus.rules.map((rule) => rule.key), ["RollOption", "AdjustDegreeOfSuccess"]);
    assert.deepEqual(courtesan.castBonus.rules[1].predicate, ["action:impersonate", "courtesan-lower-level"]);
    const [fiend] = activations("The Fiend");
    assert.deepEqual([routeOf(fiend), done(fiend), fiend.castDC.from, fiend.castRange.feet, fiend.area], ["cast", true, "class-spell", 20, true]);
});

test("The Publican and The Vision: one more step of attitude (two from 18th), the next Lore check as if master (legendary from 15th)", () => {
    const [publican] = activations("The Publican");
    assert.deepEqual([routeOf(publican), done(publican), publican.item.recipient], ["item", true, "targets"]);
    assert.match(success(publican).noteEffects[0].text, /two more steps/);
    const low = compileActivations({ ...item("The Publican"), ownerLevel: 12 }, options)[0].plan;
    assert.match(success(low).noteEffects[0].text, /one more step/);
    const [vision] = activations("The Vision");
    assert.deepEqual([routeOf(vision), done(vision)], ["item", true]);
    const [rule, toggle, degree] = vision.item.ruleEffects[0].rules;
    assert.deepEqual([rule.selector, rule.type, rule.value, rule.removeAfterRoll, toggle.option, degree.adjustment], ["lore-skill-check", "proficiency", "@actor.level + 8", "if-enabled", "the-vision-master", { all: "one-degree-better" }]);
    assert.equal(compileActivations({ ...item("The Vision"), ownerLevel: 9 }, options)[0].plan.item.ruleEffects[0].rules[0].value, "@actor.level + 6");
});

test("Wintershot (Heroic)'s Signal Flare: the beacon's light for a minute, or the Strike that counteracts darkness at +25 (+30 a fiend's)", () => {
    const flare = activation("Wintershot (Heroic)", "Signal Flare");
    assert.deepEqual([routeOf(flare), done(flare), flare.ways.length, flare.trigger.frequency.per], ["ways", true, 3, "hour"]);
    const [beacon, shot, fiend] = flare.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(beacon), beacon.item.placedLight.bright, beacon.item.placedLight.dim, beacon.item.placedLight.duration.value], ["item", 100, 200, 1]);
    assert.deepEqual([routeOf(shot), shot.strike.own, shot.strike.counteract.counteract], ["strike", true, { rank: 9, modifier: 25, traits: ["darkness"], at: "target" }]);
    assert.equal(fiend.strike.counteract.counteract.modifier, 30);
});

test("Grimoire of Unknown Necessities: the GM's arcane spell of its user's highest rank, for the day, its copies gone with it", async () => {
    const { copiesSince, grantProblem, highestRank } = await import("../src/live/grimoire.js");
    const [grimoire] = activations("Grimoire of Unknown Necessities");
    assert.deepEqual([grimoire.builtin, routeOf(grimoire), done(grimoire), grimoire.grantSpell], ["grant-spell", "grant-spell", true, { tradition: "arcane", prepared: true, rank: "highest", until: "next-day" }]);
    assert.equal(highestRank({ slot0: { max: 5 }, slot1: { max: 3 }, slot8: { max: 2 }, slot9: { max: 0 } }), 8);
    assert.equal(grantProblem({ name: "Disjunction", rank: 9, traditions: ["arcane"] }, { tradition: "arcane", rank: 8 }), "Disjunction is rank 9, not 8 (the highest its user casts)");
    assert.equal(grantProblem({ name: "Heal", rank: 8, traditions: ["divine", "primal"] }, { tradition: "arcane", rank: 8 }), "Heal isn't an arcane spell");
    assert.equal(grantProblem({ name: "Maze", rank: 8, traditions: ["arcane"], sourceId: "x" }, { tradition: "arcane", rank: 8, known: ["x"] }), "Maze is already in its user's spellbook");
    assert.equal(grantProblem({ name: "Maze", rank: 8, traditions: ["arcane"], sourceId: "x" }, { tradition: "arcane", rank: 8, known: [] }), null);
    assert.deepEqual(copiesSince([{ id: "a", sourceId: "x", createdTime: 5 }, { id: "b", sourceId: "x", createdTime: 1 }, { id: "c", sourceId: "y", createdTime: 9 }], "x", 3).map((one) => one.id), ["a"]);
});

test("Book of Lost Days' Study Memory: a 40 to Recall Knowledge whispered, Drained 2 held for 2 days, the day it takes a note, refused while drained", () => {
    const [book] = activations("Book of Lost Days");
    const row = success(book);
    assert.deepEqual([routeOf(book), done(book), row.effects[0].slug, row.effects[0].value, row.conditionFloor], ["item", true, "drained", 2, { slug: "drained", value: 2, lifetime: "fixed", duration: { value: 48, unit: "hours" } }]);
    assert.deepEqual([book.unlessCondition.slug, /total of 40/.test(book.alsoWhisper), row.noteEffects.length], ["drained", true, 1]);
});

test("Soulcutter's Soulcutting Storm: Weapon Storm at 7th rank, its damage spirit once the spell module takes damageType (partial till then)", () => {
    const storm = activation("Soulcutter", "Soulcutting Storm");
    assert.deepEqual([routeOf(storm), storm.partial, storm.castDamageType.type, storm.rank], ["cast", true, "spirit", 7]);
});

test("Crooner's Cravat's Influential Croon and Stage Magician's Cloak: two casts on the ways card; the smoke's save, its user Quickened; Invisibility and the teleport", () => {
    const croon = activation("Crooner's Cravat", "Influential Croon");
    assert.deepEqual([routeOf(croon), done(croon), croon.ways.map((way) => [way.plan.spell.name, way.plan.dc])], ["ways", true, [["Enthrall", 30], ["Subconscious Suggestion", 30]]]);
    assert.deepEqual([croon.ways[1].plan.castRange.feet, croon.ways[1].plan.castTargets.max], [30, 1]);
    const see = activation("Stage Magician's Cloak", "Now You See Me...");
    assert.deepEqual([routeOf(see), done(see), see.targeting.area, see.resolution.check.against.value, see.resolution.outcomes.failure.effects[0].slug], ["save", true, { type: "emanation", value: 10 }, 30, "off-guard"]);
    assert.deepEqual(see.userEffects.map((effect) => effect.kind ?? effect.slug), ["quickened", "note", "remove"]);
    const gone = activation("Stage Magician's Cloak", "...Now You Don't");
    assert.deepEqual([routeOf(gone), done(gone), gone.spell.name, gone.rank, gone.item.move.within], ["cast", true, "Invisibility", 2, 30]);
});

test("Grail of Twisted Desires: three wines on the ways card, the drink's cast, the secret twist by the day's use", async () => {
    const { twistedKind, winePlan } = await import("../src/live/grail.js");
    const [grail] = activations("Grail of Twisted Desires");
    assert.deepEqual([routeOf(grail), done(grail), grail.ways.length, grail.trigger.frequency.max], ["ways", true, 3, 3]);
    const kinds = ["ordinary", "restoration", "nightmare"];
    assert.equal(twistedKind(kinds, "restoration", { roll: 1, use: 1 }), "ordinary");
    assert.equal(twistedKind(kinds, "restoration", { roll: 2, use: 1 }), "restoration");
    assert.equal(twistedKind(kinds, "restoration", { roll: 2, use: 2 }), "nightmare");
    assert.equal(twistedKind(kinds, "restoration", { roll: 1, use: 3, chaotic: true }), "restoration");
    const wine = grail.ways[2].plan.item.wine;
    const drink = winePlan({ ...wine.kinds[2], from: "Grail of Twisted Desires" });
    assert.deepEqual([routeOf(drink), drink.spell.name, drink.rank, drink.self], ["cast", "Nightmare", 4, true]);
    assert.equal(routeOf(winePlan({ kind: "ordinary", cast: null })), "item");
});

test("Ring of Bestial Friendship: Charm at 4th rank within 30 feet with its bond and the ring's lasting immunity, then the creature's rage for an hour", () => {
    const [ring] = activations("Ring of Bestial Friendship");
    assert.deepEqual([routeOf(ring), done(ring), ring.ways.length], ["ways", true, 2]);
    const [charm, rage] = ring.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(charm), charm.rank, charm.castRange.feet, charm.item.immunity.duration.value, charm.userEffects[0].kind], ["cast", 4, 30, 36500, "note"]);
    const [note] = success(rage).noteEffects;
    assert.deepEqual([routeOf(rage), rage.item.recipient, note.duration.value, note.rules[1].value, note.rules[1].type], ["item", "targets", 1, 1, "item"]);
});

test("Azarim's help with a Lie, Vile Remnant's Hear My Words, Fan of the Four Winds: built whole", () => {
    const lie = activations("Azarim")[2];
    assert.deepEqual([routeOf(lie), done(lie), lie.ways.map((way) => [routeOf(way.plan), way.plan.action.minimum?.value ?? null, way.plan.action.bonus?.value ?? null])], ["ways", true, [["action", 15, null], ["action", null, 2]]]);
    const words = activation("Vile Remnant", "Hear My Words");
    assert.deepEqual([routeOf(words), done(words), words.dc, words.castBonus.rules, words.userEffects[0].duration.value], ["cast", true, 23, [], 7]);
    const nightmare = words.item.afterRest.plan;
    assert.deepEqual([nightmare.resolution.check.statistic, nightmare.resolution.check.against.value, nightmare.resolution.outcomes.failure.effects[0].slug, nightmare.resolution.outcomes.failure.effects[0].duration.value], ["will", 23, "stupefied", 24]);
    const [fan] = activations("Fan of the Four Winds");
    assert.deepEqual([routeOf(fan), done(fan), fan.ways.map((way) => routeOf(way.plan))], ["ways", true, ["cast", "save"]]);
    assert.equal(success(fan.ways[1].plan).noteEffects[0].duration.value, 8);
});

test("Deck of Many Things: declared draws from PF2e's own table within the hour, never again, each card's rule (choices, more draws, stops, losses)", async () => {
    const { afterChoice, afterDraw, afterLose, attributeDrop, cardName, createDeckCard, drawsLeft, lostItems, postsOwnCard } = await import("../src/live/deck.js");
    const [deck] = activations("Deck of Many Things");
    assert.deepEqual([deck.builtin, routeOf(deck), done(deck), deck.deck.uuid], ["deck", "deck", true, "Compendium.pf2e.rollable-tables.RollTable.mA13pL1Ypo1pYkK6"]);
    assert.deepEqual([cardName("Fool. You lose 1d10*100 XP"), cardName("Euryale (curse). A medusa's image"), cardName("The Void. Your mind")], ["Fool", "Euryale", "The Void"]);
    const user = { name: "Ezren", actorUuid: "Actor.e" };
    assert.deepEqual([createDeckCard({ plan: deck, item: { name: "Deck" }, user, used: true }).status, createDeckCard({ plan: deck, item: { name: "Deck" }, user }).step], ["applied", "declare"]);
    let state = { ...createDeckCard({ plan: deck, item: { name: "Deck" }, user }), declared: 2 };
    state = afterDraw(state, "Fool");
    assert.deepEqual([state.step, state.choice, drawsLeft(state)], ["choice", "Fool", 1]);
    state = afterChoice(state, 1);
    assert.deepEqual([state.step, drawsLeft(state)], ["draw", 3]);
    state = afterDraw(state, "Dullard");
    assert.deepEqual([state.step, drawsLeft(state)], ["draw", 3]);
    state = afterDraw(state, "Talons");
    assert.deepEqual([state.step, state.losing, state.then], ["lose", "magic", "draw"]);
    state = afterLose(state);
    state = afterDraw(state, "Donjon");
    assert.deepEqual([state.step, state.stopped, drawsLeft(state)], ["lose", true, 0]);
    assert.equal(afterLose(state).step, "done");
    assert.deepEqual([attributeDrop(2), attributeDrop(5)], [1, 2]);
    const items = [{ id: "deck", physical: true, magical: true }, { id: "sword", physical: true, magical: true, level: 10 }, { id: "orb", physical: true, magical: true, artifact: true, level: 23 }, { id: "rope", physical: true, magical: false }];
    assert.deepEqual(lostItems(items, "magic", { deckId: "deck", deckLevel: 22 }), ["sword"]);
    assert.deepEqual(lostItems(items, "nonmagic", { deckId: "deck", deckLevel: 22 }), ["rope"]);
    assert.deepEqual(lostItems(items, "all", { deckId: "deck", deckLevel: 22 }), ["sword", "orb", "rope"]);
    assert.deepEqual(["Throne", "Euryale", "Moon", "The Void", "Fool", "Sun", "Knight"].map(postsOwnCard), [true, true, true, true, false, false, false]);
});
