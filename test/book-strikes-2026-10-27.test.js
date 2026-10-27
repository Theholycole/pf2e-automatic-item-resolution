// The adventure books' items of the Strike group, 2026-10-27 (src/compiler/book-strikes.js): immunities by situation, plain results, bonuses
// only in some situations, numbers the text doesn't give, changes to a Strike.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { planFor } from "../src/live/if-target.js";
import { oneOff } from "../src/compiler/one-offs.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name));
const activation = (name, which = null) => activations(name).find((entry) => entry.activation.name === which).plan;
const done = (plan) => !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("Deafening Music Box: a zone placed on the box for its minute, the save as it starts and at each turn's start inside, a critical success immune for 24 hours", () => {
    const plan = activation("Deafening Music Box");
    assert.ok(done(plan));
    assert.equal(routeOf(plan), "zone");
    assert.deepEqual([plan.zone.area, plan.zone.centre, plan.zone.lasts.value, plan.zone.lasts.unit], [{ type: "burst", value: 60 }, "placed", 1, "minutes"]);
    const [save] = plan.zone.saves;
    assert.deepEqual([save.when, save.own], [["initial", "start"], true]);
    assert.deepEqual([save.plan.resolution.check.statistic, save.plan.resolution.check.against.value], ["fortitude", 24]);
    assert.deepEqual([save.plan.trigger.event, save.plan.trigger.immunity.degrees, save.plan.trigger.immunity.duration], ["zone", ["criticalSuccess"], { value: 24, unit: "hours" }]);
    assert.equal(save.plan.resolution.outcomes.failure.effects[0].slug, "deafened");
    assert.equal(plan.notes, undefined);
    assert.match(plan.zone.notes.join(" "), /flat surface/);
});

test("Mindrender Baton's command: Controlled granted by a note Effect with its new Will save at each turn's end; the critical failure's 24 hours, its save only on the GM's say", () => {
    const [, command] = activations("Mindrender Baton");
    const plan = command.plan;
    assert.ok(done(plan));
    assert.equal(plan.notes, undefined);
    const { failure, criticalFailure, success } = plan.resolution.outcomes;
    assert.equal(success.effects[0].slug, "stunned");
    for (const row of [failure, criticalFailure]) {
        assert.equal(row.manualInstructions, undefined);
        assert.equal(row.noteEffects.length, 1);
        assert.deepEqual(row.noteEffects[0].rules, [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.9qGBRpbX9NEwtAAr", inMemoryOnly: true }]);
        assert.match(row.noteEffects[0].text, /DC 32 Diplomacy or DC 31 Intimidation/);
    }
    assert.deepEqual([failure.noteEffects[0].duration, failure.noteEffects[0].saveEnds], [null, { save: "will", dc: 31, mode: "end" }]);
    assert.deepEqual([criticalFailure.noteEffects[0].duration.value, criticalFailure.noteEffects[0].duration.unit], [24, "hours"]);
    assert.match(criticalFailure.noteEffects[0].saveEnds.gate, /against its nature/);
});

test("Gift of Olives' Sew the Cutting: a 15-foot square for 8 hours, its resistance and save bonus on a toggle inside, +1 to Subsist", () => {
    const plan = activation("Gift of Olives", "Sew the Cutting");
    assert.ok(done(plan));
    assert.equal(routeOf(plan), "zone");
    assert.deepEqual([plan.zone.area, plan.zone.lasts.value, plan.zone.lasts.unit, plan.trigger.frequency.per], [{ type: "square", value: 15 }, 8, "hours", "day"]);
    const rules = plan.zone.inside[0].rules;
    assert.deepEqual(rules.find((rule) => rule.key === "Resistance"), { key: "Resistance", type: "all-damage", value: 3, predicate: ["gift-of-olives-environment"] });
    assert.ok(rules.some((rule) => rule.selector === "survival" && rule.predicate.includes("action:subsist")));
    assert.ok(rules.some((rule) => rule.selector === "saving-throw" && rule.value === 1));
    assert.match(plan.zone.notes.join(" "), /8 olives grow/);
});

test("Mutagenic Renovator: its energy picked on the item card, its shifting the words of a note Effect for the hour", () => {
    const plan = compileItem(item("Mutagenic Renovator"));
    assert.ok(done(plan));
    assert.equal(plan.unread, undefined);
    assert.deepEqual(plan.item.resist[0].choose, ["acid", "cold", "electricity", "fire", "sonic"]);
    const notes = plan.resolution.outcomes.success.noteEffects;
    assert.equal(notes.length, 1);
    assert.ok(!notes[0].reminder);
    assert.match(notes[0].text, /drops by 10 minutes/);
});

test("Mnemonic Acid: Blinded for the memory's 10 minutes beside its note Effect; dissolving the brain matter a line", () => {
    const plan = compileItem(item("Mnemonic Acid"));
    assert.ok(done(plan));
    const row = plan.resolution.outcomes.success;
    assert.deepEqual([row.effects[0].slug, row.effects[0].duration.value, row.effects[0].duration.unit], ["blinded", 10, "minutes"]);
    assert.match(row.noteEffects[0].text, /the GM tells it/);
    assert.match(plan.notes[0], /2d10 minutes/);
});

test("Soldier's Syrup: the ways card — the augmented potion held for the hour, and its spoiling (Enfeebled 1 for 24 hours) its second button", () => {
    for (const grade of ["Minor", "Lesser", "Moderate", "Greater", "Major"]) {
        const plan = compileItem(item(`Soldier's Syrup (${grade})`));
        assert.ok(done(plan), grade);
        assert.equal(routeOf(plan), "ways", grade);
        const [drunk, spoiled] = plan.ways;
        assert.deepEqual([drunk.plan.resolution.outcomes.success.noteEffects[0].duration.value, drunk.plan.resolution.outcomes.success.noteEffects[0].duration.unit], [1, "hours"], grade);
        assert.match(drunk.plan.notes[0], new RegExp(`level ${item(`Soldier's Syrup (${grade})`).system.level.value} or lower`), grade);
        const enfeebled = spoiled.plan.resolution.outcomes.success.effects[0];
        assert.deepEqual([enfeebled.slug, enfeebled.value, enfeebled.duration.value, enfeebled.duration.unit], ["enfeebled", 1, 24, "hours"], grade);
    }
});

test("Rime Jar's Siphon Chill: its 8 hours of severe cold either way, its second button also ending its user's Fatigued", () => {
    const plan = activation("Rime Jar", "Siphon Chill");
    assert.ok(done(plan));
    assert.equal(routeOf(plan), "ways");
    assert.equal(plan.notes, undefined);
    for (const way of plan.ways) assert.deepEqual(way.plan.temperature.counts, { "extreme-cold": "severe-cold" });
    assert.equal(plan.ways[0].plan.item.reduce, undefined);
    assert.deepEqual(plan.ways[1].plan.item.reduce, [{ slug: "fatigued", by: "all" }]);
});

test("Gorum's Tear: a one-off — the fortune card's lines, its circumstance penalties unticked and its Off-Guard", () => {
    const plan = compileItem(item("Gorum's Tear"));
    assert.ok(oneOff("Gorum's Tear"));
    assert.deepEqual([plan.builtin, plan.decided, plan.partial, routeOf(plan)], ["roll-twice", "one-off", undefined, "fortune"]);
    assert.equal(plan.rollTwice.selector, "attack-roll");
    assert.match(plan.notes[0], /Untick any circumstance penalties/);
    assert.match(plan.notes[1], /Off-Guard to the creature it targeted/);
});

test("bonuses only in some situations: Fungal Walk Musk's, Armor Polishing Kit's and Exploration Lens's toggles on note Effects, in place of their rows' modifiers", () => {
    const musk = compileItem(item("Fungal Walk Musk"));
    const kit = compileItem(item("Armor Polishing Kit"));
    const lens = activation("Exploration Lens (Investigating)");
    for (const plan of [musk, kit, lens]) {
        assert.ok(done(plan), plan.source.name);
        assert.equal(plan.unread, undefined, plan.source.name);
        const row = plan.resolution.outcomes.success;
        assert.deepEqual(row.modifiers, [], plan.source.name);
        assert.equal(row.noteEffects.length, 1, plan.source.name);
        assert.equal(row.noteEffects[0].rules[0].toggleable, true, plan.source.name);
    }
    const ac = musk.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([ac.rules[1].selector, ac.rules[1].value, ac.duration.value, ac.duration.unit], ["ac", 1, 1, "days"]);
    assert.match(ac.text, /–6 for a mindless one/);
    assert.deepEqual(kit.resolution.outcomes.success.noteEffects[0].rules[1].predicate, ["action:make-an-impression", "armor-polishing-kit-martial"]);
    assert.equal(kit.item.recipient, "drinker");
    assert.deepEqual(lens.resolution.outcomes.success.noteEffects[0].rules[1].predicate, ["action:recall-knowledge", "exploration-lens-investigating"]);
    assert.match(lens.notes.at(-1), /wayfinder held in its user's hand/);
});

test("Necrobinding Serum: coated as an injury poison; its rows by the undead's kind, nothing for a creature that isn't undead", () => {
    const plan = compileItem(item("Necrobinding Serum"));
    assert.ok(done(plan));
    assert.equal(routeOf(plan), "coat");
    const { success, failure, criticalFailure } = plan.resolution.outcomes;
    assert.equal(success.noteEffects[0].rules[1].value, -1);
    for (const row of [success, failure, criticalFailure]) assert.equal(row.manualInstructions, undefined);
    const zombie = { system: { traits: { value: ["undead", "mindless"] } } };
    const vampire = { system: { traits: { value: ["undead"] } } };
    const human = { system: { traits: { value: ["human", "humanoid"] } } };
    assert.equal(planFor(plan, human), null);
    const hours = (actor, degree) => planFor(plan, actor).resolution.outcomes[degree].noteEffects.map((note) => `${note.duration.value} ${note.duration.unit}`);
    assert.deepEqual(hours(zombie, "failure"), ["8 hours"]);
    assert.deepEqual(hours(vampire, "failure"), ["10 minutes"]);
    assert.deepEqual(hours(zombie, "criticalFailure"), ["24 hours"]);
    assert.deepEqual(hours(vampire, "criticalFailure"), ["1 hours"]);
    assert.match(planFor(plan, vampire).resolution.outcomes.failure.noteEffects[0].text, /a mental effect/);
});
