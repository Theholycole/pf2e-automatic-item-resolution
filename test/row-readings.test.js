// What the ability compiler leaves as notes that a row carries itself (src/compiler/row-readings.js, 2026-10-25): a shrink for a time with
// PF2e's own size rules, persistent damage on a failure; and its user's attacks against creatures Off-Guard to it (src/compiler/rows.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;

test("Reducer Round: Tiny with reach 0 for 1d4 rounds on a failure and a minute on a critical failure, its Enfeebled granted by that Effect (gone with it)", () => {
    const round = compileActivations(item("Reducer Round"))[0].plan;
    const { failure, criticalFailure } = round.resolution.outcomes;
    assert.deepEqual([round.partial, round.notes, failure.effects, criticalFailure.effects], [undefined, undefined, [], []]);
    const [shrunk] = failure.noteEffects;
    assert.deepEqual([shrunk.label, shrunk.duration.value, shrunk.duration.valueRoll, shrunk.duration.unit], ["Shrunk to Tiny", 2, "1d4", "rounds"]);
    assert.deepEqual(shrunk.rules[0], { key: "CreatureSize", value: "tiny", reach: { override: 0 }, resizeEquipment: true });
    assert.deepEqual([shrunk.rules[1].key, shrunk.rules[1].uuid, shrunk.rules[1].alterations[0].value], ["GrantItem", "Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7", 1]);
    const [worse] = criticalFailure.noteEffects;
    assert.deepEqual([worse.duration.value, worse.duration.unit, worse.rules[1].alterations[0].value], [1, "minutes", 2]);
});

test("Chiromantic Lines: until the end of the turn, PF2e's Off-Guard on its user's attacks against creatures not Concealed or hidden", () => {
    const lines = activation("Chiromantic Lines", "Cunning Consultation");
    const [own] = lines.item.ruleEffects;
    assert.deepEqual([Boolean(lines.partial), own.rules[0].key, own.rules[0].uuid, own.rules[0].predicate, own.duration.expiry], [false, "EphemeralEffect", "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg", [{ not: "target:condition:concealed" }, { not: "target:condition:hidden" }], "turn-end"]);
});

test("Splintering Spear's Shatter: a creature that fails its basic Reflex save also takes the spear's own 1d6 bleed on a hit, as persistent damage", () => {
    for (const name of ["Splintering Spear", "Splintering Spear (Greater)", "Splintering Spear (Major)"]) {
        const shatter = activation(name, "Shatter");
        const { success, failure, criticalFailure } = shatter.resolution.outcomes;
        assert.deepEqual([success.damage.mode, failure.damage.formulas, criticalFailure.damage.shared.multiplier, shatter.notes ?? []], ["shared", [{ formula: "1d6[persistent,bleed]" }], 2, []]);
    }
});

test("Blast Lance: the push its failures already make, the Stride after the creature its user's option on the card, no GM line", () => {
    for (const name of ["Blast Lance", "Blast Lance (Greater)"]) {
        const plan = compileActivations(item(name))[0].plan;
        const { failure, criticalFailure } = plan.resolution.outcomes;
        assert.deepEqual([failure.forcedMovement.distance, criticalFailure.forcedMovement.distance, failure.manualInstructions, criticalFailure.manualInstructions, plan.notes, Boolean(plan.partial)], [5, 10, [], [], ["After the push, its user can Stride after the creature, the same distance and direction."], false]);
    }
});

test("Shield of Snakes' Snap Up: its user's shield raised on the item card's Apply (PF2e's own Raise a Shield), nothing left over", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const snap = activation("Shield of Snakes", "Snap Up");
    assert.deepEqual([routeOf(snap), snap.raiseShield, Boolean(snap.partial), snap.notes], ["item", true, false, undefined]);
    // (Shield of Endurance's too, 2026-10-26: its shield's 10 temporary Hit Points for a minute a note Effect on its user — PF2e gives a shield none.)
    const endurance = activation("Shield of Endurance", "Temporary Endurance");
    const [note] = endurance.resolution.outcomes.success.noteEffects;
    assert.deepEqual([routeOf(endurance), endurance.raiseShield, Boolean(endurance.partial), Boolean(endurance.noteOnly), note.label, note.duration.value, note.duration.unit], ["item", true, false, false, "Shield: 10 temporary Hit Points", 1, "minutes"]);
});

test("Alchemist's Flamethrower: the grade of alchemist's fire loaded picked on the ways card, each its basic Reflex save in its line and its persistent fire on a critical failure", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const plan = compileActivations(item("Alchemist's Flamethrower"))[0].plan;
    assert.equal(routeOf(plan), "ways");
    assert.deepEqual(plan.ways.map((way) => [way.name, way.plan.resolution.check.against.value, way.plan.targeting.area.value, way.plan.resolution.sharedDamage.components[0].formula, way.plan.resolution.outcomes.criticalFailure.damage.formulas[0].formula]), [
        ["Lesser Alchemist's Fire", 15, 30, "1d8[fire]", "1[persistent,fire]"],
        ["Moderate Alchemist's Fire", 17, 60, "2d8[fire]", "2[persistent,fire]"],
        ["Greater Alchemist's Fire", 28, 90, "6d8[fire]", "3[persistent,fire]"],
        ["Major Alchemist's Fire", 37, 120, "10d8[fire]", "4[persistent,fire]"]
    ]);
    assert.equal(plan.ways[0].plan.resolution.outcomes.failure.damage.mode, "shared");
});

test("Banner of Piercing Shards: whom it's at — each enemy in the banner's aura dealt damage since its user's last turn — the card's target, not the GM's", () => {
    for (const name of ["Banner of Piercing Shards", "Banner of Piercing Shards (Greater)", "Banner of Piercing Shards (Major)"]) {
        const plan = compileActivations(item(name))[0].plan;
        assert.deepEqual([plan.targeting.target, plan.resolution.outcomes.success.manualInstructions ?? [], plan.notes, Boolean(plan.partial)], ["each enemy within the banner's aura that has been dealt damage since the end of your last turn", [], undefined, false]);
    }
});

test("Oracular Crown: its 3d8 healing more by its user's cursebound value, the formula picked as the card applies (5d8 at 2, 7d8 at 3, 9d8 at 4)", async () => {
    const { scaledByCondition } = await import("../src/live/scaled.js");
    const plan = compileActivations(item("Oracular Crown"))[1].plan;
    const [heal] = plan.resolution.outcomes.success.effects;
    assert.deepEqual([heal.formula, heal.byCondition, Boolean(plan.partial), plan.notes], ["3d8", { slug: "cursebound", formulas: { 2: "5d8", 3: "7d8", 4: "9d8" } }, false, undefined]);
    assert.deepEqual([1, 2, 3, 4].map((value) => scaledByCondition(plan, (slug) => (slug === "cursebound" ? value : 0)).resolution.outcomes.success.effects[0].formula), ["3d8", "5d8", "7d8", "9d8"]);
});
