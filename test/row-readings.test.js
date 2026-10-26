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
