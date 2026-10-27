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

test("an object's own Speed or a smell isn't its user's sense or Speed: Ration Tonic's fruity scent, the missives' and Tracking Fulu's flight — their out-of-combat words the card's lines; Shortbread Spy's sights whispered", async () => {
    const { NEEDS } = await import("../src/compiler/needs.js");
    const test = (id, words) => NEEDS.find((need) => need.id === id).test.test(words);
    assert.equal(test("senses", "faintly fruity scent"), false);
    assert.equal(test("senses", "the scent of brimstone"), false);
    assert.equal(test("senses", "you gain scent as an imprecise sense"), true);
    assert.equal(test("speeds", "Flies at a Speed of 45 feet"), false);
    assert.equal(test("speeds", "you have a Speed of 30 feet"), true);
    for (const name of ["Ration Tonic", "Tracking Fulu"]) assert.deepEqual([consumable(name).decided, consumable(name).partial], ["card-line", undefined], name);
    assert.equal(consumable("Messenger Missive").builtin, "whisper");
    const spy = consumable("Shortbread Spy");
    assert.deepEqual([spy.builtin, spy.decided], ["whisper", "information"]);
    assert.match(spy.whisper.text, /scrambles away at a Speed of 15 feet.*see what the spy saw/);
});

test("Heartening Missive (Butterfly): its recipient's first failed Diplomacy or Performance check one degree better within 24 hours (a fortune effect), gone with that roll; its 24 hours' immunity", async () => {
    const { firstDegreeRules } = await import("../src/compiler/first-degree.js");
    const { firstDegreeText } = await import("../src/live/card.js");
    const butterfly = consumable("Heartening Missive (Butterfly)");
    assert.deepEqual([butterfly.noteOnly, butterfly.partial, butterfly.item.recipient, butterfly.targeting.target], [undefined, undefined, "targets", "1 creature"]);
    const first = butterfly.item.firstDegree;
    assert.deepEqual([first.selectors, first.adjustment, first.duration.value, first.duration.unit], [["diplomacy", "performance"], { failure: "one-degree-better", criticalFailure: "one-degree-better" }, 24, "hours"]);
    assert.deepEqual(firstDegreeRules(first).map((rule) => rule.selector), ["diplomacy", "performance"]);
    assert.equal(firstDegreeText(first), "The first failure or critical failure on Diplomacy or Performance checks is one degree better (a fortune effect), within 24 hours");
    assert.equal(butterfly.item.immunity.slug, "heartening-missive");
});

test("floating off the ground: Hovering Potion's climb Speed with its hovering in words for 5 minutes; Feather Token (Balloon)'s 9 rounds for those holding on; Balloon Padding inflated until deflated; Boots of Free Running's walls checked", () => {
    const hovering = consumable("Hovering Potion");
    assert.deepEqual([hovering.noteOnly, hovering.partial], [undefined, undefined]);
    const [speed] = hovering.item.speeds;
    assert.deepEqual([speed.type, speed.value, speed.duration.value, speed.duration.unit], ["climb", "@actor.system.movement.speeds.land.value", 5, "minutes"]);
    assert.match(speed.note, /Arrest a Fall as if it had a fly Speed/);
    const balloon = consumable("Feather Token (Balloon)");
    const [held] = balloon.resolution.outcomes.success.noteEffects;
    assert.deepEqual([balloon.noteOnly, balloon.item.recipient, held.duration.value, held.duration.unit], [undefined, "targets", 9, "rounds"]);
    assert.match(held.text, /rises 20 feet a round for 3 rounds \(60 feet up\), floats in place for 2 rounds/);
    const padding = activation("Balloon Padding", "Inflate");
    assert.deepEqual([padding.builtin, padding.source.name, padding.resolution.outcomes.success.noteEffects[0].duration], [undefined, "Balloon Padding: Inflate", null]);
    assert.match(padding.resolution.outcomes.success.noteEffects[0].text, /5 feet off the ground.*AC 10, Hardness 0/);
    for (const grade of ["Lesser", "Moderate", "Greater"]) assert.equal(activation(`Boots of Free Running (${grade})`).decided, "checked");
});

test("Corpseward Pendant: Undetected by undead in words for 10 minutes, ended by its wearer's attack or damage roll; the undead's DC 18 Will card after it, a success's 24 hours' immunity, no card for the living", () => {
    const pendant = activation("Corpseward Pendant");
    const [ward] = pendant.resolution.outcomes.success.noteEffects;
    assert.deepEqual([pendant.noteOnly, ward.duration.value, ward.duration.unit, ward.rules], [undefined, 10, "minutes", [{ key: "RollOption", option: "air-ends-on:attack" }]]);
    const save = pendant.again.plan;
    assert.deepEqual([pendant.again.repeat, save.resolution.check.statistic, save.resolution.check.against.value], [true, "will", 18]);
    assert.deepEqual([save.trigger.immunity.degrees, save.trigger.immunity.duration], [["criticalSuccess", "success"], { value: 24, unit: "hours" }]);
    assert.equal(planFor(save, { system: { traits: { value: ["humanoid"] } } }), null);
    assert.equal(planFor(save, { system: { traits: { value: ["undead", "zombie"] } } }), save);
});

test("Horn of the Aoyin's Cannibal Call: a DC 30 Will card in its 60-foot emanation, the rage a note Effect with PF2e's rules (jaws, +2 unarmed damage, +2 against mental, bloodsense 30, +10 Speed, –1 AC), a round or a minute; the critical success's immunity", () => {
    const horn = activation("Horn of the Aoyin", "Cannibal Call");
    assert.deepEqual([horn.noteOnly, horn.partial, horn.resolution.kind, horn.resolution.check.statistic, horn.resolution.check.against.value, horn.targeting.area], [undefined, undefined, "save", "will", 30, { type: "emanation", value: 60 }]);
    const [rage] = horn.resolution.outcomes.failure.noteEffects;
    assert.deepEqual([rage.duration.value, rage.duration.unit, horn.resolution.outcomes.criticalFailure.noteEffects[0].duration.unit], [1, "rounds", "minutes"]);
    assert.deepEqual(rage.rules.map((rule) => [rule.key, rule.selector ?? rule.slug, rule.value ?? rule.range ?? rule.damage?.base?.die]), [["Strike", "aoyin-jaws", "d8"], ["FlatModifier", "strike-damage", 2], ["FlatModifier", "saving-throw", 2], ["Sense", "bloodsense", 30], ["FlatModifier", "land-speed", 10], ["FlatModifier", "ac", -1]]);
    assert.deepEqual(horn.trigger.immunity.degrees, ["criticalSuccess"]);
    assert.ok(horn.traits.includes("incapacitation"));
    assert.ok(horn.notes.some((note) => /above level 13/.test(note)) && horn.notes.some((note) => /critically fail, with no save/.test(note)));
});

test("words on an Effect for what PF2e can't play: Infiltrator's Elixir's disguise beside its +4, Look-Me-Not's untrained Feint and reactionless Strikes beside its +2, Sinister Knight's disguise until dismissed, Scope of Truth's 10 minutes of the GM's secret counteracts", () => {
    const elixir = consumable("Infiltrator's Elixir");
    assert.deepEqual([elixir.partial, elixir.unread, elixir.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration.value])], [undefined, undefined, [["Disguised", 10]]]);
    const look = consumable("Look-Me-Not");
    assert.deepEqual([look.partial, look.unread, look.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit])], [undefined, undefined, [["Hard to look at", 1, "minutes"]]]);
    const knight = activation("Sinister Knight");
    const [disguise] = knight.resolution.outcomes.success.noteEffects;
    assert.deepEqual([knight.builtin, disguise.duration], [undefined, null]);
    assert.match(disguise.text, /lifesense.*\+14, rank 4/);
    const scope = activation("Scope of Truth", "Reveal All");
    const [truth] = scope.resolution.outcomes.success.noteEffects;
    assert.deepEqual([scope.builtin, truth.duration.value, truth.duration.unit], [undefined, 10, "minutes"]);
    assert.match(truth.text, /\+20, rank 7/);
    assert.equal(activation("Animate Dreamer", "Animate Object").partial, undefined, "its note only says what Telekinetic Hand does");
});

test("Fiendish Teleportation: its brimstone's 2d6 spirit damage, after the teleport, at the creatures next to the space it left or arrived in", async () => {
    const { adjacentTo } = await import("../src/live/arrival.js");
    const fiendish = activation("Fiendish Teleportation");
    assert.deepEqual([fiendish.builtin, fiendish.partial, fiendish.notes], ["cast-spell", undefined, undefined]);
    const damage = fiendish.castArrival.plan.resolution;
    assert.deepEqual([damage.check.roll, damage.sharedDamage.components[0].formula, damage.sharedDamage.components[0].type, damage.outcomes.success.damage.multiplier], ["automatic", "2d6", "spirit", 1]);
    // (A 100-pixel grid: next to the old square or the new, each once; not the one standing on it, nor one two squares off.)
    const tokens = [{ id: "a", x: 100, y: 0 }, { id: "b", x: 200, y: 0 }, { id: "c", x: 1100, y: 1000 }, { id: "d", x: 1000, y: 1000 }, { id: "e", x: 100, y: 100 }];
    assert.deepEqual(adjacentTo([{ x: 0, y: 0, width: 1, height: 1 }, { x: 1000, y: 1000, width: 1, height: 1 }], tokens, 100).map((token) => token.id), ["a", "e", "c"]);
});

test("Appetizing Flavor Snare's DC 15 Reflex save, its failures doused for the hour (a note Effect); Aquarium Lamp's 60 feet of bright light for 10 minutes at its user's square", () => {
    const snare = consumable("Appetizing Flavor Snare");
    assert.deepEqual([snare.builtin, snare.partial, snare.noteOnly], ["zone", undefined, undefined]);
    const save = snare.zone.saves[0].plan;
    assert.deepEqual([save.resolution.check.statistic, save.resolution.check.against.value], ["reflex", 15]);
    for (const degree of ["failure", "criticalFailure"]) assert.deepEqual(save.resolution.outcomes[degree].noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit]), [["Doused with bait", 1, "hours"]]);
    assert.deepEqual(save.resolution.outcomes.success.noteEffects, []);
    const lamp = activation("Aquarium Lamp");
    assert.deepEqual([lamp.noteOnly, lamp.item.placedLight.bright, lamp.item.placedLight.dim, lamp.item.placedLight.duration.value], [undefined, 60, 120, 10]);
});
