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

test("Dinosaur Boots: PF2e's own Effect (Enlarge's numbers and the foot), not a cast of Enlarge; its Trample a basic Reflex card for the minute, with the foot Strike's damage as PF2e rolls it", async () => {
    const { withStrikeFormula } = await import("../src/live/strike-as.js");
    const boots = activation("Dinosaur Boots");
    assert.equal(boots.builtin, undefined);
    assert.equal(boots.partial, undefined);
    assert.deepEqual(boots.resolution.applications.map((entry) => [entry.label, entry.recipients]), [["Effect: Dinosaur Boots", "self"]]);
    assert.deepEqual([boots.again.later, boots.again.repeat, boots.again.time], [true, undefined, { value: 1, unit: "minutes" }]);
    const trample = boots.again.plan;
    assert.deepEqual([trample.resolution.check.statistic, trample.resolution.check.basic, trample.resolution.check.against.value], ["reflex", true, 27]);
    assert.equal(trample.strikeDamage.slug, "dinosaur-boots-foot-attack");
    // (The Greater's Trample each time, and its Huge a line.)
    const greater = activation("Dinosaur Boots (Greater)");
    assert.equal(greater.again.repeat, true);
    assert.equal(greater.again.plan.strikeDamage.slug, "dinosaur-boots-foot-attack");
    assert.ok(greater.notes.some((note) => /Huge/.test(note)));
    // (The foot's damage as PF2e gives it, each instance its own type: halved on a success, doubled on a critical failure.)
    const filled = withStrikeFormula(trample, "{(1d6 + 6)[bludgeoning],1d6[fire]}");
    assert.deepEqual(filled.resolution.sharedDamage.components.map((component) => [component.formula, component.type]), [["1d6 + 6", "bludgeoning"], ["1d6", "fire"]]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => filled.resolution.outcomes[degree].damage.multiplier), [0, 0.5, 1, 2]);
    assert.deepEqual(filled.resolution.outcomes.failure.damage.sourceComponentIds, ["strike0", "strike1"]);
});

test("Clockwork Chirper and Sentry Fulu: a placed watch whose set-off is the GM's note — the chirper's square set off by a Small or larger creature once, its bird's numbers in the note; the sentry's 20-foot burst for 8 hours, each creature entering", () => {
    const chirper = consumable("Clockwork Chirper");
    assert.equal(chirper.builtin, "zone");
    assert.equal(chirper.partial, undefined);
    const [set] = chirper.zone.saves;
    assert.deepEqual([set.when, set.only, set.plan, chirper.zone.once], [["enter"], { minSize: "sm" }, undefined, true]);
    assert.match(set.note, /heard up to 500 feet away.*follows that creature for up to 1 hour.*fly Speed 25 feet, AC 15, Hardness 5, HP 10 \(BT 5\)/);
    const sentry = consumable("Sentry Fulu");
    assert.deepEqual([sentry.builtin, sentry.partial, sentry.noteOnly], ["zone", undefined, undefined]);
    assert.deepEqual([sentry.zone.area, sentry.zone.lasts.value, sentry.zone.lasts.unit, sentry.zone.once], [{ type: "burst", value: 20 }, 8, "hours", undefined]);
    assert.match(sentry.zone.saves[0].note, /password.*Perception DC 20.*DC 15 Perception check to wake.*within 60 feet/);
    assert.ok(sentry.zone.notes.some((note) => /patrols the area along a path they set, at a Speed of 25 feet/.test(note)));
});
