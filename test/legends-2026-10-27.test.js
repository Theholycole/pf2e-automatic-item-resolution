// Unique items' and artifacts' activations built in full (2026-10-27, the user: their unique effects all automated): the readings of
// src/compiler/legend-readings.js — its user's own saves and checks, the save that follows a degree, the ways card's choices, PF2e's rules on
// an Effect, the casts' changes — and the live pieces they need (src/live/poison-card.js, src/live/ends-own.js, src/live/card.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { BASIC_ACTIONS, compileBasicActions } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { isOwnSave, saveText } from "../src/live/poison-card.js";
import { ownEffectsToEnd } from "../src/live/ends-own.js";
import { castPenaltySource, checkGateMet, gateOption, gateText, previewLines } from "../src/live/card.js";
import { sinVulnerabilityOf, sinVulnerable } from "../src/live/sin-vulnerability.js";
import { periodOf } from "../src/live/activations-card.js";
import { nightsHitPoints } from "../scripts/rest.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")), basicActions: compileBasicActions(documents("actions").filter((doc) => BASIC_ACTIONS.includes(doc.system?.slug))) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const rowOf = (plan, degree = "success") => plan.resolution.outcomes[degree];

test("Whisperer of Souls: lethal or nonlethal on the ways card, the glaive defying either with its user's DC 50 Will save", () => {
    const [choice] = activations("Whisperer of Souls");
    assert.deepEqual([done(choice), routeOf(choice), choice.once, choice.ways.length], [true, "ways", true, 4]);
    const [nonlethal, lethal, defiedNonlethal, defiedLethal] = choice.ways.map((way) => way.plan);
    // (Nonlethal: PF2e's AdjustStrike giving the glaive the nonlethal trait for the turn, on its user.)
    const [effect] = nonlethal.item.ruleEffects;
    assert.deepEqual([routeOf(nonlethal), effect.rules[0].key, effect.rules[0].property, effect.rules[0].value, effect.rules[0].definition, effect.duration.expiry], ["item", "AdjustStrike", "weapon-traits", "nonlethal", ["item:slug:whisperer-of-souls"], "turn-end"]);
    assert.deepEqual([routeOf(lethal), lethal.item.ruleEffects], ["item", undefined]);
    // (Defied: its user's own save, the nonlethal Effect only when it holds the glaive to it — or only when it fails, for lethal.)
    for (const defied of [defiedNonlethal, defiedLethal]) {
        assert.deepEqual([routeOf(defied), isOwnSave(defied), defied.resolution.check.statistic, defied.resolution.check.against.value], ["save", true, "will", 50]);
        assert.match(defied.notes[0], /GM's call/);
    }
    const ruled = (plan, degree) => (rowOf(plan, degree).noteEffects ?? []).some((note) => note.rules?.[0]?.key === "AdjustStrike");
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => ruled(defiedNonlethal, degree)), [true, true, false, false]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => ruled(defiedLethal, degree)), [false, false, true, true]);
});

test("Whisperer of Souls' ritual: its user's own Occultism check at DC 37, the hour's memories, and the week in the void with the DC 50 Will save after", () => {
    const ritual = activations("Whisperer of Souls")[2];
    assert.deepEqual([ritual.partial, routeOf(ritual), isOwnSave(ritual), saveText(ritual), ritual.trigger.frequency.per, ritual.item.activation.frequency.max], [undefined, "save", true, "DC 37 Occultism check", "week", 1]);
    assert.ok(ritual.notes.some((note) => /GM may change it/.test(note)));
    assert.deepEqual([rowOf(ritual, "criticalSuccess").noteEffects[0].duration.unit, rowOf(ritual, "success").noteEffects[0].duration.value, rowOf(ritual, "failure").noteEffects], ["hours", 1, undefined]);
    const lost = rowOf(ritual, "criticalFailure");
    assert.deepEqual([lost.noteEffects[0].duration.value, lost.noteEffects[0].duration.unit], [7, "days"]);
    const [will] = lost.followUps;
    assert.deepEqual([will.kind, will.check.statistic, will.check.against.value], ["save", "will", 50]);
    assert.deepEqual(will.outcomes.failure.effects.map((effect) => [effect.slug, effect.value, effect.duration.value, effect.duration.unit]), [["stupefied", 2, 7, "days"]]);
    assert.match(will.outcomes.criticalFailure.noteEffects[0].text, /alignment moves one step toward evil/);
    assert.match(will.outcomes.success.noteEffects[0].text, /retrain/);
});

test("Orb of Dragonkind's dominate: a dragon within 500 feet only, its status bonus to saves against magic suppressed for the save", () => {
    const [dominate] = activations("Orb of Dragonkind");
    assert.deepEqual([done(dominate), routeOf(dominate), dominate.notes, dominate.castRange.feet, dominate.castTraits.only, dominate.castDuration.value], [true, "cast", undefined, 500, ["dragon"], 30]);
    const [suppressed] = dominate.castTraits.penalties;
    const source = castPenaltySource(suppressed, "Dominate", { item: { name: "Orb of Dragonkind" } });
    assert.deepEqual(source.system.rules, [{ key: "AdjustModifier", selectors: ["saving-throw"], slug: "1-status-to-all-saves-vs-magic", suppress: true }]);
    assert.match(source.system.description.value, /against Dominate/);
    // (A penalty with no rules of its own is PF2e's FlatModifier, as before.)
    assert.equal(castPenaltySource({ traits: ["demon"], selector: "will", type: "status", value: -2, duration: { value: 1, unit: "minutes" } }, "Fear").system.rules[0].key, "FlatModifier");
});

test("note Effects for what PF2e can't play: the Deck of Destiny's shared hands on each companion, the Lens' far senses, Herald's Ring's voice", () => {
    const [hands] = activations("The Deck of Destiny");
    assert.deepEqual([done(hands), routeOf(hands), hands.item.recipient, rowOf(hands).noteEffects[0].duration.value], [true, "item", "targets", 24]);
    const [lens] = activations("The Lens of the Outreaching Eye");
    assert.deepEqual([done(lens), routeOf(lens), lens.noteOnly, rowOf(lens).noteEffects[0].duration.unit], [true, "item", undefined, "hours"]);
    const voice = activation("Herald's Ring", "Project Voice");
    assert.deepEqual([done(voice), routeOf(voice), rowOf(voice).noteEffects[0].duration.value], [true, "item", 2]);
});

test("The Silent Hag: three ways, each an Effect of PF2e's rules that ends the sense another way gave", () => {
    const [hag] = activations("The Silent Hag");
    assert.deepEqual([done(hag), routeOf(hag), hag.ways.map((way) => way.name)], [true, "ways", ["Eyes of death", "Ears of hair", "Sealed mouth"]]);
    const [eyes, ears, mouth] = hag.ways.map((way) => way.plan);
    assert.deepEqual(eyes.item.ruleEffects[0].rules.map((rule) => rule.key), ["GrantItem", "Sense"]);
    assert.deepEqual([eyes.item.ruleEffects[0].rules[1].selector, eyes.item.ruleEffects[0].rules[1].range], ["lifesense", 60]);
    assert.deepEqual(ears.item.ruleEffects[0].rules[1].path, "system.attributes.flanking.flankable");
    assert.deepEqual(mouth.item.ruleEffects[0].rules, []);
    assert.deepEqual(eyes.item.endsOwn.names, ["The Silent Hag (Ears of hair): Ears of hair", "The Silent Hag (Sealed mouth): Sealed mouth"]);
    const effects = [{ id: "a", name: "The Silent Hag (Ears of hair): Ears of hair" }, { id: "b", name: "The Silent Hag (Eyes of death): Eyes of death" }, { id: "c", name: "Other" }];
    assert.deepEqual(ownEffectsToEnd(effects, "The Silent Hag (Eyes of death)", "other sense", eyes.item.endsOwn.names), ["a"]);
    // (By its label alone, as before: Hosteling Statuette's.)
    assert.deepEqual(ownEffectsToEnd([{ id: "x", name: "Statuette: Statuette form" }], "Statuette", "Statuette form"), ["x"]);
});

test("The Whispering Reeds: the +2 to Recall Knowledge about Nhimbaloth an Effect of PF2e's rules, its four spells each at its rank", () => {
    const [bonus, , , cast] = activations("The Whispering Reeds");
    const [effect] = bonus.item.ruleEffects;
    assert.deepEqual([done(bonus), routeOf(bonus), effect.rules[0].selector, effect.rules[0].value, effect.rules[0].predicate], [true, "item", "skill-check", 2, ["action:recall-knowledge"]]);
    assert.deepEqual([done(cast), cast.notes, cast.choices.map((choice) => [choice.spell.name, choice.targets])], [true, undefined, [["Wave of Despair", true], ["Fear", true], ["Paranoia", true], ["Phantasmal Killer", true]]]);
    assert.ok(cast.castLines.some((line) => /in place of its cone/.test(line)));
});

test("The Deck of Destiny's Resurrect: the ritual's DC 50 Occultism check, then each result's way at the dead creature, gated by that check", () => {
    const resurrect = activations("The Deck of Destiny")[3];
    assert.deepEqual([done(resurrect), routeOf(resurrect), resurrect.once, resurrect.trigger.frequency.per, resurrect.ways.length], [true, "ways", undefined, "year", 4]);
    const [check, critical, success, failure] = resurrect.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(check), isOwnSave(check), saveText(check)], ["save", true, "DC 50 Occultism check"]);
    assert.deepEqual([routeOf(critical), critical.item.recipient, critical.item.revive.hp, critical.item.revive.keepPools, critical.checkGate], ["item", "targets", "max", true, { statistic: "occultism", dc: 50, degree: "criticalSuccess" }]);
    assert.deepEqual(critical.item.revive.boon.rules.map((rule) => [rule.selector, rule.type, rule.value]), [["attack-roll", "status", 1], ["perception", "status", 1], ["saving-throw", "status", 1], ["skill-check", "status", 1]]);
    assert.deepEqual([success.item.revive.hp, success.item.revive.debilitation, success.checkGate.degree], [1, undefined, "success"]);
    assert.deepEqual([routeOf(failure), failure.whisper.text.length > 0], ["whisper", true]);
    // (The gate: a statistic's check at exactly its degree; an action's at least a success, as before.)
    assert.equal(gateOption(critical.checkGate), "check:statistic:occultism");
    assert.deepEqual([3, 2].map((degree) => checkGateMet(critical.checkGate, degree)), [true, false]);
    assert.deepEqual([2, 1].map((degree) => checkGateMet({ action: "recall-knowledge", dc: 20 }, degree)), [true, false]);
    assert.match(gateText(critical.checkGate), /a critical success at its user's DC 50 Occultism check/);
    // (Once a year, counted in years of world time.)
    assert.notEqual(periodOf({ max: 1, per: "year" }, { worldTime: 0 }), periodOf({ max: 1, per: "year" }, { worldTime: 31_536_000 }));
    assert.equal(periodOf({ max: 1, per: "year" }, { worldTime: 0 }), periodOf({ max: 1, per: "year" }, { worldTime: 86_400 * 300 }));
});

test("Soulcutter (Heroic): Soulcutting Storm's spirit damage an Effect of PF2e's rules on its caster, Shame Demon a demon's sin vulnerability set off", () => {
    const storm = activation("Soulcutter (Heroic)", "Soulcutting Storm");
    assert.deepEqual([done(storm), routeOf(storm), storm.notes, storm.castCaster.rules[0].key, storm.castCaster.rules[0].value, storm.castCaster.rules[0].predicate], [true, "cast", undefined, "DamageAlteration", "spirit", ["item:slug:weapon-storm"]]);
    const shame = activation("Soulcutter (Heroic)", "Shame Demon");
    assert.deepEqual([done(shame), routeOf(shame), shame.noteOnly, shame.item.recipient, shame.item.sinVulnerability, shame.item.immunity.duration.value, shame.targeting.range], [true, "item", undefined, "targets", { only: ["demon"] }, 24, "30 feet"]);
    assert.ok(previewLines({ plan: shame }).some((line) => /sin vulnerability of the demon targeted/.test(line)));
    // (A demon's own, as the bestiaries give it: Monster Core's succubus.)
    const bestiary = readDocuments(path.join(PACKS, "pathfinder-monster-core"));
    const succubus = bestiary.find((doc) => doc.name === "Succubus");
    const sin = sinVulnerabilityOf(succubus.items);
    assert.deepEqual([sin.name, sin.formula], ["Rejection Vulnerability", "2d6[mental]"]);
    assert.match(sin.text, /takes 2d6 mental damage/);
    assert.deepEqual([sinVulnerable(["demon", "fiend"], ["demon"]), sinVulnerable(["devil"], ["demon"]), sinVulnerabilityOf([{ name: "Claw", type: "melee" }])], [true, false, null]);
});

test("Hallajin Key: a full day's rest for each ally targeted (PF2e's Rest for the Night and a night's Hit Points more), its trip home a line", () => {
    const [, , rest, home] = activations("Hallajin Key");
    assert.deepEqual([done(rest), routeOf(rest), rest.item.recipient, rest.item.rest, rest.targeting.area.value], [true, "item", "targets", { day: true }, 60]);
    assert.ok(rest.notes.some((note) => /5 of the key's charges/.test(note)));
    assert.deepEqual([nightsHitPoints({ con: 3, level: 7 }), nightsHitPoints({ con: -1, level: 4 })], [21, 4]);
    assert.ok(previewLines({ plan: rest }).some((line) => /full day/.test(line)));
    assert.deepEqual([done(home), routeOf(home), home.trigger.frequency.per], [true, "item", "day"]);
    assert.match(home.notes[0], /Ardis Scholars' manor/);
});

test("Miogimo's Mask: its two forms on the ways card, each ending the other; Talking Corpse on the soul fragment", () => {
    const [form, , corpse] = activations("Miogimo's Mask");
    assert.deepEqual([done(form), routeOf(form), form.ways.map((way) => way.name)], [true, "ways", ["Angelic form", "Demonic form"]]);
    assert.deepEqual(form.ways[0].plan.item.endsOwn.names, ["Miogimo's Mask (Demonic form): Demonic form"]);
    assert.match(form.ways[1].plan.item.ruleEffects[0].words, /chaotic evil/);
    assert.deepEqual([done(corpse), routeOf(corpse), corpse.notes, corpse.targets], [true, "cast", undefined, false]);
});

test("Taljjae's Mask (The Nobleman): an unattended object a line, one a creature holds PF2e's Disarm at 100 feet, a critical failure a failure", () => {
    const [mask] = activations("Taljjae's Mask (The Nobleman)");
    assert.deepEqual([done(mask), routeOf(mask), mask.ways.map((way) => routeOf(way.plan))], [true, "ways", ["item", "action"]]);
    const { action } = mask.ways[1].plan;
    assert.deepEqual([action.slug, action.targeted, action.degree, Boolean(action.basic?.resolution), mask.ways[1].plan.targeting.range], ["disarm", true, { criticalFailure: "failure" }, true, "100 feet"]);
    assert.match(action.after, /Only a critical success takes the object/);
});

test("Wintershot's Signal Flare: a flare's light for a minute, or the arrow's hit counteracting a darkness at rank 7", () => {
    const flare = activation("Wintershot", "Signal Flare");
    assert.deepEqual([done(flare), routeOf(flare), flare.trigger.frequency.per], [true, "ways", "day"]);
    const [up, at] = flare.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(up), up.item.placedLight.bright, up.item.placedLight.dim, up.item.placedLight.duration.unit], ["item", 100, 200, "minutes"]);
    assert.deepEqual([routeOf(at), at.strike.counteract.counteract.rank, at.strike.counteract.counteract.modifier, at.strike.counteract.counteract.free.name], ["strike", 7, 26, "a darkness effect of its user's choice in the area hit"]);
});
