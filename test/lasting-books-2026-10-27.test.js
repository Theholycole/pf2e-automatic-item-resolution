// The adventure books' sustained, later, dying and affliction items (2026-10-27, batch 3, docs/needs.md "lasting", "dying", "afflictions"): what
// the user's rulings make of those with nothing a card could play (notes checked) or a mechanism of their own (one-offs).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const consumable = (name) => compileItem(item(name), options);
const activations = (name) => compileActivations(item(name), options);
const activation = (name, which) => activations(name).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("one-offs and notes checked: Moonkeep Hyacinth, Verdant Poultice, Phoenix Fulu Holder, Disgorge Soul; Gingerbread House, Unfolding Tree House, the Wraithweave Patches", () => {
    for (const plan of [consumable("Moonkeep Hyacinth"), consumable("Verdant Poultice"), activation("Phoenix Fulu Holder", "Duplicate Fulu"), activation("Soulfeeding Mask", "Disgorge Soul")]) assert.deepEqual([plan.decided, done(plan)], ["one-off", true], plan.source.name);
    assert.equal(activation("Soulfeeding Mask", "Disgorge Soul").builtin, "cast-spell");
    for (const plan of [activations("Gingerbread House")[0].plan, activation("Unfolding Tree House", "Unfold"), ...["I", "II", "III"].map((type) => activations(`Wraithweave Patch (Type ${type})`)[0].plan)]) assert.deepEqual([plan.decided, done(plan)], ["checked", true], plan.source.name);
});
