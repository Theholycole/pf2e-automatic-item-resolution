// Speeds, senses, forms and sizes (2026-10-27, docs/needs.md): the items whose leftovers were a sense, a Speed, a form or a size, read and
// played — each test on PF2e's own item.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { planFor, targetGroups } from "../src/live/if-target.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    assert.ok(doc, name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => compileActivations(item(name), options).find((entry) => !which || entry.activation.name === which).plan;
const consumable = (name) => compileItem(item(name), options);

test("Dawnlight: its light spells a rank higher against darkness, the counteract card after the cast; the Greater's and Major's flash only for creatures with darkvision", async () => {
    const { darkLightCounteract, darkLightWords } = await import("../src/live/cast-card.js");
    const base = activation("Dawnlight");
    assert.deepEqual([base.partial, base.notes, base.darkLight.rankUp, base.darkLight.flash], [undefined, undefined, 1, undefined]);
    const greater = activation("Dawnlight (Greater)");
    assert.equal(greater.partial, undefined);
    assert.equal(greater.notes, undefined);
    const light = greater.choices.find((choice) => choice.spell.name === "Light");
    const lash = greater.choices.find((choice) => choice.spell.name === "Vitality Lash");
    assert.deepEqual(greater.darkLight.spells, [light.spell.uuid]);
    const flash = greater.darkLight.flash;
    assert.deepEqual([flash.resolution.check.statistic, flash.resolution.check.against.value], ["fortitude", 23]);
    for (const degree of ["failure", "criticalFailure"]) assert.deepEqual(flash.resolution.outcomes[degree].effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.unit]), [["dazzled", 1, "rounds"]]);
    assert.deepEqual(flash.resolution.outcomes.success.effects, []);
    // (The counteract card for Light at rank 3: rank 4, +13; none for Vitality Lash.)
    const counteract = darkLightCounteract(greater, light, 3);
    assert.deepEqual([counteract.modifier, counteract.rank, counteract.free.name, Boolean(counteract.flash)], [13, 4, "the magical darkness", true]);
    assert.equal(darkLightCounteract(greater, lash, 3), null);
    assert.match(darkLightWords(greater), /1 rank higher.*DC 23 Fortitude save or Dazzled for 1 round, only for creatures with darkvision/);
    // (Only creatures with darkvision attempt the flash's save: the rest immune.)
    const seeing = { system: { perception: { senses: [{ type: "darkvision" }] } } };
    const blind = { system: { perception: { senses: [{ type: "low-light-vision" }] } } };
    assert.equal(planFor(flash, blind), null);
    assert.equal(planFor(flash, seeing), flash);
    assert.deepEqual(targetGroups(flash, [{ actor: seeing }, { actor: blind }]).map((group) => group.plan === null), [false, true]);
    // (The Major's Holy Light has the light trait too, its Vital Beacon doesn't; its flash DC 28.)
    const major = activation("Dawnlight (Major)");
    assert.deepEqual(major.darkLight.spells.map((uuid) => major.choices.find((choice) => choice.spell.uuid === uuid).spell.name), ["Light", "Holy Light"]);
    assert.equal(major.darkLight.flash.resolution.check.against.value, 28);
});
