// Etching a rune from its runestone: which items it fits, the item's update (a fundamental rune upgraded, a property rune in a
// free slot, its lesser grade replaced) or why it can't, and the Crafting DC — with PF2e's own rune items and equipment.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { craftDC, etchUpdate, fitProblem, needsEnergy, runeDC } from "../src/compiler/etching.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => structuredClone(equipment.find((doc) => doc.name === name));
const rune = (slug) => structuredClone(equipment.find((doc) => doc.system?.slug === slug && /^etched-onto/.test(doc.system?.usage?.value ?? "")));
const withRunes = (name, runes, extra = {}) => {
    const source = item(name);
    return { ...source, ...extra, system: { ...source.system, runes: { ...source.system.runes, ...runes } } };
};

test("which items a rune fits, by its usage", () => {
    assert.equal(fitProblem(rune("vorpal"), item("Longsword")), null);
    assert.match(fitProblem(rune("vorpal"), item("Rapier")), /goes onto a slashing melee weapon, and Rapier isn't/);
    assert.match(fitProblem(rune("resilient"), item("Longsword")), /goes onto armor/);
    assert.equal(fitProblem(rune("resilient"), item("Full Plate")), null);
    assert.equal(fitProblem(rune("reinforcing-rune-minor"), item("Steel Shield")), null);
    assert.match(fitProblem(rune("striking"), { ...item("Longsword"), system: { ...item("Longsword").system, specific: { runes: {} } } }), /specific magic item/);
});

test("fundamental runes: upgraded, never lowered", () => {
    assert.deepEqual(etchUpdate(rune("striking"), item("Longsword")).update, { "system.runes.striking": 1 });
    assert.deepEqual(etchUpdate(rune("striking-greater"), withRunes("Longsword", { striking: 1 })).update, { "system.runes.striking": 2 });
    assert.match(etchUpdate(rune("striking"), withRunes("Longsword", { striking: 2 })).problem, /already has a striking rune as good as Striking/);
    assert.deepEqual(etchUpdate(rune("weapon-potency-2"), withRunes("Longsword", { potency: 1 })).update, { "system.runes.potency": 2 });
    assert.deepEqual(etchUpdate(rune("resilient"), item("Full Plate")).update, { "system.runes.resilient": 1 });
    assert.deepEqual(etchUpdate(rune("reinforcing-rune-minor"), item("Steel Shield")).update, { "system.runes.reinforcing": 1 });
});

test("property runes: a free slot from the potency rune, the lesser grade replaced, PF2e's keys", () => {
    assert.match(etchUpdate(rune("flaming"), item("Longsword")).problem, /no potency rune, so it has no slot/);
    assert.deepEqual(etchUpdate(rune("flaming"), withRunes("Longsword", { potency: 1 })).update, { "system.runes.property": ["flaming"] });
    assert.match(etchUpdate(rune("frost"), withRunes("Longsword", { potency: 1, property: ["flaming"] })).problem, /no free property rune slot \(its potency rune gives 1\)/);
    // (Automatic Bonus Progression: PF2e's own slots.)
    assert.deepEqual(etchUpdate(rune("frost"), withRunes("Longsword", { potency: 1, property: ["flaming"] }), { abp: true }).update, { "system.runes.property": ["flaming", "frost"] });
    const greater = etchUpdate(rune("flaming-greater"), withRunes("Longsword", { potency: 1, property: ["flaming"] }));
    assert.deepEqual([greater.update, greater.replaced], [{ "system.runes.property": ["greaterFlaming"] }, ["flaming"]]);
    assert.match(etchUpdate(rune("flaming"), withRunes("Longsword", { potency: 2, property: ["greaterFlaming"] })).problem, /already has a stronger Flaming rune/);
    assert.match(etchUpdate(rune("holy"), withRunes("Longsword", { potency: 2, property: ["unholy"] })).problem, /has the unholy rune/);
    assert.match(etchUpdate(rune("vorpal"), withRunes("Longsword", { potency: 1 }), { keys: new Set(["flaming"]) }).problem, /PF2e has no Vorpal rune for weapons/);
    assert.deepEqual(etchUpdate(rune("vorpal"), withRunes("Longsword", { potency: 1 }), { keys: new Set(["vorpal"]) }).update, { "system.runes.property": ["vorpal"] });
});

test("an Energy-Resistant rune takes the energy picked; the Crafting DC is the rune's level's, with its rarity", () => {
    assert.equal(needsEnergy(rune("energy-resistant")), true);
    assert.match(etchUpdate(rune("energy-resistant"), withRunes("Full Plate", { potency: 1 })).problem, /Pick the energy/);
    assert.deepEqual(etchUpdate(rune("energy-resistant"), withRunes("Full Plate", { potency: 1 }), { energy: "fire" }).update, { "system.runes.property": ["fireResistant"] });
    assert.deepEqual(etchUpdate(rune("energy-resistant-greater"), withRunes("Full Plate", { potency: 2, property: ["fireResistant"] }), { energy: "fire" }).update, { "system.runes.property": ["greaterFireResistant"] });
    assert.deepEqual([craftDC(8), craftDC(20, "rare"), runeDC(rune("vorpal"))], [24, 45, craftDC(rune("vorpal").system.level.value, rune("vorpal").system.traits.rarity)]);
});
