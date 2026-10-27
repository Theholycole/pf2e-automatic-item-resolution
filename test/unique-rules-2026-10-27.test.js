// Unique items' and artifacts' own rules, built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be
// automated"): src/compiler/unique-rules.js and the cards that play them.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { featUseCardHTML, createFeatUseCard, oneMoreUse, spentFeats } from "../src/live/feat-use-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const plans = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const success = (plan) => plan.resolution.outcomes.success;

test("Ancestral Embrace: one more use of the ancestry feat just used, the feat-use card's — its spent feats a day picked, one use given back", () => {
    const [embrace] = plans("Ancestral Embrace");
    assert.deepEqual([embrace.builtin, embrace.featUse.category, embrace.trigger.frequency.max, embrace.partial, embrace.noteOnly], ["feat-use", "ancestry", 1, undefined, undefined]);
    assert.equal(routeOf(embrace), "feat-use");
    const feats = [
        { id: "a", name: "Fey Disappearance", system: { category: "ancestry", frequency: { max: 1, value: 0, per: "day" } } },
        { id: "b", name: "Unused Gift", system: { category: "ancestry", frequency: { max: 1, value: 1, per: "day" } } },
        { id: "c", name: "Hourly Trick", system: { category: "ancestry", frequency: { max: 1, value: 0, per: "PT1H" } } },
        { id: "d", name: "Class Power", system: { category: "class", frequency: { max: 1, value: 0, per: "day" } } }
    ];
    const spent = spentFeats(embrace.featUse, feats);
    assert.deepEqual(spent.map((feat) => feat.id), ["a"]);
    assert.equal(oneMoreUse(spent[0], "Valeros").value, 1);
    assert.equal(oneMoreUse({ ...spent[0], value: 1 }, "Valeros"), null);
    const html = featUseCardHTML(createFeatUseCard({ plan: embrace, item: { name: "Ancestral Embrace" }, user: { name: "Valeros" }, feats: spent }), { canApply: true });
    assert.match(html, /data-air-field="pick"/);
    assert.match(html, /Fey Disappearance \(0\/1\)/);
});

test("Ancestral Embrace: Legend Lore about its ancestry in 1 hour with no secondary casters, a note Effect on its user for that hour", () => {
    const lore = plans("Ancestral Embrace")[1];
    assert.deepEqual([lore.builtin, lore.partial, lore.noteOnly, lore.automation.level], [undefined, undefined, undefined, "automatic"]);
    const [note] = success(lore).noteEffects;
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "hours"]);
    assert.match(note.text, /Legend Lore/);
    assert.match(note.text, /no secondary casters/);
});

test("Ancestral Embrace: Avatar with the armor's own Speeds and Strikes — PF2e's BattleForm on its user for the minute, the blowgun's poison dice its own", () => {
    const avatar = plans("Ancestral Embrace")[2];
    assert.deepEqual([avatar.builtin, avatar.partial, avatar.rank, avatar.trigger.frequency.max], [undefined, undefined, 10, 1]);
    assert.ok(avatar.traits.includes("polymorph"));
    const [note] = success(avatar).noteEffects;
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "minutes"]);
    const [form, poison] = note.rules;
    assert.equal(form.key, "BattleForm");
    assert.deepEqual([form.overrides.size, form.overrides.tempHP, form.overrides.armorClass.modifier, form.overrides.speeds.land, form.overrides.skills.athletics.modifier], ["huge", 30, "25 + @actor.level", 70, 35]);
    assert.deepEqual(form.overrides.strikes.spear.traits, ["unarmed", "reach-15", "thrown-50"]);
    assert.deepEqual(form.overrides.strikes.spear.damage, { dice: 6, die: "d6", modifier: 6, damageType: "piercing" });
    assert.deepEqual([form.overrides.strikes.blowgun.ability, form.overrides.strikes.blowgun.range.max, form.overrides.strikes.blowgun.modifier], ["dex", 120, 33]);
    assert.deepEqual([poison.key, poison.diceNumber, poison.dieSize, poison.damageType, poison.predicate[0]], ["DamageDice", 5, "d6", "poison", "item:slug:blowgun"]);
    assert.match(note.text, /walks on air/);
    assert.match(note.text, /ignores difficult terrain/);
    assert.equal(routeOf(avatar), "item");
});
