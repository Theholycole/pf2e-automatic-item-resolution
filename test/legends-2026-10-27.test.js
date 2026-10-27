// Unique items' and artifacts' activations built in full (2026-10-27, the user: their unique effects all automated): the readings of
// src/compiler/legend-readings.js — its user's own saves and checks, the save that follows a degree, the ways card's choices, PF2e's rules on
// an Effect, the casts' changes — and the live pieces they need (src/live/poison-card.js, src/live/ends-own.js, src/live/card.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { isOwnSave, saveText } from "../src/live/poison-card.js";
import { ownEffectsToEnd } from "../src/live/ends-own.js";
import { castPenaltySource } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
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
