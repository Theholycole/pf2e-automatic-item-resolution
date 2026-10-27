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
