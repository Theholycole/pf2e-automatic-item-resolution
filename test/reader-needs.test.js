// The item reader's needs (docs/needs.md, 2026-10-25): items whose card left a part of their text to the GM, read now. Each test is one
// reading, on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellEffectIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { planFor } from "../src/live/if-target.js";
import { senseText } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, `${name} is in PF2e's equipment pack`);
    return { ...found, ownerLevel: Number(found.system?.level?.value) || 1 };
};
const consumable = (name) => compileItem(item(name), { spellEffects });
const activation = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
const creature = (traits) => ({ system: { traits: { value: traits } } });

test("a condition only for creatures with a trait: plan.ifTarget at its degrees, the rows without it (Lacquered Waist Drum)", () => {
    // Memories of Life: the compiler left out "the ghost becomes Sickened 1 if it fails the save" — the ghosts' at both failures.
    const life = activation("Lacquered Waist Drum", 0);
    assert.equal(life.partial, undefined);
    assert.deepEqual(life.ifTarget.map((entry) => [entry.traits, entry.degree, entry.effects[0].slug, entry.effects[0].value]), [[["ghost"], "failure", "sickened", 1], [["ghost"], "criticalFailure", "sickened", 1]]);
    // Memories of Joy: the compiler gave every creature its Stupefied; now only a ghost gets it, for its minute.
    const joy = activation("Lacquered Waist Drum", 1);
    assert.equal(joy.partial, undefined);
    assert.deepEqual(joy.resolution.outcomes.failure.effects, []);
    assert.deepEqual(joy.ifTarget.map((entry) => [entry.degree, entry.effects[0].slug, entry.effects[0].value, entry.effects[0].duration?.value]), [["failure", "stupefied", 1, 1], ["criticalFailure", "stupefied", 2, 1]]);
    // The save card's plan for each creature (src/live/if-target.js): a ghost's has it, another undead's doesn't.
    assert.deepEqual(planFor(joy, creature(["undead", "ghost"])).resolution.outcomes.failure.effects.map((effect) => effect.slug), ["stupefied"]);
    assert.equal(planFor(joy, creature(["undead"])), joy);
});

test("a save harder for creatures of a trait named as a word: Mythotoxin's mythic creatures", () => {
    const toxin = consumable("Mythotoxin");
    assert.deepEqual([toxin.ifTarget, toxin.notes, toxin.partial], [[{ traits: ["mythic"], bonus: { value: -2, type: "circumstance" } }], undefined, undefined]);
    assert.deepEqual(planFor(toxin, creature(["mythic", "beast"])).resolution.check.bonus, { value: -2, type: "circumstance" });
});

test("a sense its user keeps by doing something, beside its own time: Darkvision Scope's 'as long as you continue to look through the scope'", () => {
    for (const name of ["Darkvision Scope", "Darkvision Scope (Greater)"]) {
        const scope = activation(name);
        assert.equal(scope.partial, undefined, name);
        const [sense] = scope.item.senses;
        assert.equal(sense.keeps, "as long as you continue to look through the scope");
        assert.match(senseText(sense), /until the start of the next turn, as long as you continue to look through the scope$/);
    }
});

test("'On this check, you roll twice': the check the sentence before attempts (Brooch of Inspiration's Recall Knowledge)", () => {
    assert.deepEqual(["Brooch of Inspiration", "Brooch of Inspiration (Greater)", "Brooch of Inspiration (Major)"].map((name) => [activation(name).builtin, activation(name).rollTwice.selector, activation(name).notes]), [["roll-twice", "lore-skill-check", []], ["roll-twice", "lore-skill-check", []], ["roll-twice", "skill-check", []]]);
});

test("breathing underwater, which no PF2e rule plays: in words on its user's Effect, for its time (Submersible Helmet, Sailor's Collar)", () => {
    const helmet = activation("Submersible Helmet");
    assert.equal(helmet.partial, undefined);
    assert.deepEqual([helmet.item.speeds[0].type, helmet.item.ruleEffects.map((entry) => [entry.words, entry.rules, entry.duration.value, entry.duration.unit])], ["swim", [["Can breathe underwater", [], 8, "hours"]]]);
    const collar = activation("Sailor's Collar");
    assert.deepEqual([collar.partial, collar.item.ruleEffects[0].duration.value, collar.item.ruleEffects[0].duration.unit], [undefined, 1, "minutes"]);
});

test("a sentence that says only what the bonus's time already means: Affliction Suppressant's daily saves", () => {
    for (const grade of ["Lesser", "Moderate", "Greater"]) assert.equal(consumable(`Affliction Suppressant (${grade})`).partial, undefined, grade);
    // (The Major's save against an affliction already affecting its drinker isn't read.)
    const major = consumable("Affliction Suppressant (Major)");
    assert.deepEqual([major.partial, major.unread], [true, ["When you drink the affliction suppressant, you can attempt a save against one affliction of 14th level or lower affecting you."]]);
});

test("a Quickened's extra action for the actions it names: a note Effect beside it (Propulsive Boots)", () => {
    const boots = activation("Propulsive Boots");
    const row = boots.resolution.outcomes.success;
    assert.equal(boots.partial, undefined);
    assert.deepEqual([row.effects[0].slug, row.noteEffects[0].label, row.noteEffects[0].duration.value], ["quickened", "Quickened's extra action", 1]);
    assert.match(row.noteEffects[0].text, /^You can use the extra action to Stride, Climb, or Swim\./);
});

test("an effect a successful Escape ends: the ability module's escape { dc } on the riders (Vine Arrow, the net launcher, Black Tendril Shot)", () => {
    const vine = activation("Vine Arrow");
    assert.deepEqual([vine.partial, vine.resolution.outcomes.success.modifiers[0].escape, vine.resolution.outcomes.criticalSuccess.effects[0].duration], [undefined, { dc: 19 }, { mode: "until-escape", escape: { dc: 19 } }]);
    // (Black Tendril Shot's save rows carry it from the ability compiler: its sentence no longer a note.)
    const tendril = activation("Black Tendril Shot (Lesser)");
    assert.deepEqual([tendril.partial, tendril.strike.notes, tendril.strike.save.resolution.outcomes.failure.effects[0].duration], [undefined, [], { mode: "until-escape", escape: { dc: 25 } }]);
});

test("a DC and damage by the weapon's potency rune: Screaming Pinion's Eagle's Cry at +2 and at +3", () => {
    const pinion = item("Screaming Pinion");
    const at = (potency) => compileActivations({ ...pinion, system: { ...pinion.system, runes: { ...pinion.system.runes, potency } } }, { spellEffects })[1].plan;
    assert.deepEqual([2, 3].map((potency) => [at(potency).partial, at(potency).notes, at(potency).resolution.check.against.value, at(potency).resolution.sharedDamage.components[0].formula]), [[undefined, undefined, 30, "8d10[sonic]"], [undefined, undefined, 35, "10d10[sonic]"]]);
});

test("a resistance to splash or area damage, held by PF2e's names: not a rule left out (the honesty pass)", () => {
    // (A made-up elixir, in the module's own words.)
    const elixir = { name: "Test Blast Tonic", type: "consumable", system: { category: "elixir", level: { value: 1 }, traits: { value: ["alchemical", "consumable", "elixir"], rarity: "common" }, uses: { value: 1, max: 1, autoDestroy: true }, description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><hr /><p>For 1 minute, you gain resistance 3 to area damage and splash damage.</p>" } } };
    const plan = compileItem({ ...elixir, ownerLevel: 1 }, { spellEffects });
    assert.deepEqual([plan.partial, plan.notes, plan.item.resist.map((entry) => [entry.type, entry.value])], [undefined, undefined, [["area-damage", 3], ["splash-damage", 3]]]);
});
