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
import { diceOf, scrapedFormula } from "../scripts/scrape.js";
import { THRICE, thriceTotals } from "../scripts/initiative-thrice.js";
import { uninvests } from "../scripts/uninvest.js";
import { heldBy } from "../scripts/hit-counteract.js";
import { reflection, createCounteractCard, counteractCardHTML } from "../src/live/counteract-card.js";
import { planFor } from "../src/live/if-target.js";
import { riderFor } from "../src/live/strike-card.js";

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

test("Soulheart (Angelic)'s Defy Charg and the Doomsday Door's rites: the curse lifted and the soulheart destroyed; each day's cost a way of its own", () => {
    const defy = activation("Soulheart (Angelic)", "Defy Charg");
    assert.deepEqual([done(defy), routeOf(defy), defy.item.destroyed], [true, "item", true]);
    assert.ok(previewLines({ plan: defy }).some((line) => /destroyed/.test(line)));
    const attune = activation("Doomsday Door", "Attune Door");
    const open = activation("Doomsday Door", "Open Door");
    for (const rite of [attune, open]) {
        assert.deepEqual([done(rite), routeOf(rite), rite.once], [true, "ways", undefined]);
        const [point, doomed, other] = rite.ways.map((way) => way.plan);
        assert.deepEqual([point.spend, routeOf(point)], [{ mythicPoints: 1 }, "item"]);
        assert.deepEqual(rowOf(doomed).effects, [{ kind: "condition", slug: "doomed", value: 1, duration: null, stack: { by: 1 } }]);
        assert.match(other.notes[0], /as the GM decides/);
    }
    assert.deepEqual([attune.ways.length, open.ways.length, routeOf(open.ways[3].plan)], [3, 4, "whisper"]);
});

test("Ochre Fulcrum Lens: its +21 melee spell attack possesses the creature hit — the lens's Effect on it — and its user is no longer invested", () => {
    const [, possess] = activations("Ochre Fulcrum Lens");
    assert.deepEqual([done(possess), routeOf(possess), possess.ownCheck, possess.resolution.check.modifier], [true, "save", { kind: "attack", modifier: 21 }, 21]);
    assert.deepEqual(rowOf(possess).nativeEffects, [{ uuid: "Compendium.pf2e.equipment-effects.Item.5KXsyN9J78glG25I", label: "Effect: Ochre Fulcrum Lens" }]);
    assert.deepEqual([rowOf(possess, "failure").nativeEffects, possess.uninvest.degrees], [undefined, ["success", "criticalSuccess"]]);
    assert.deepEqual([uninvests(possess.uninvest, [{ degree: "failure" }]), uninvests(possess.uninvest, [{ degree: "criticalSuccess" }])], [false, true]);
});

test("The Dance: its user's next initiative rolled three times, the best set (src/live: scripts/initiative-thrice.js)", () => {
    const [dance] = activations("The Dance");
    const [effect] = dance.item.ruleEffects;
    assert.deepEqual([done(dance), routeOf(dance), effect.rules], [true, "item", [{ key: "RollOption", domain: "initiative", option: THRICE }]]);
    assert.ok(dance.notes.some((note) => /Performance/.test(note)));
    assert.deepEqual(thriceTotals(25, 12, [3, 18]), { totals: [25, 16, 31], best: 31 });
});

test("The Waxworks: its lines' save with Confused (and Slowed 1) on an Effect the goo's scraping ends, and the scraping a way of its own", () => {
    const [wax] = activations("The Waxworks");
    assert.deepEqual([done(wax), routeOf(wax), wax.ways.map((way) => routeOf(way.plan))], [true, "ways", ["save", "item"]]);
    const [lines, scrape] = wax.ways.map((way) => way.plan);
    assert.deepEqual([lines.partial, rowOf(lines).effects, rowOf(lines).noteEffects[0].rules.map((rule) => rule.uuid)], [undefined, [], ["Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ"]]);
    assert.deepEqual(rowOf(lines, "criticalFailure").noteEffects[0].rules.map((rule) => rule.alterations?.[0]?.value ?? null), [null, 1]);
    assert.match(rowOf(lines, "failure").damage.formulas[0].formula, /4d6\[persistent,fire\]/);
    assert.deepEqual([scrape.item.recipient, scrape.item.scrape], ["targets", { types: ["fire", "mental"], die: 6, effect: "Hot wax", from: "The Waxworks" }]);
    assert.deepEqual([scrapedFormula("4d6", 6), scrapedFormula("1d6", 6), scrapedFormula("2d8", 6), scrapedFormula("2d6+1", 6)], [{ formula: "3d6", dice: 3 }, { formula: null, dice: 0 }, null, null]);
    assert.deepEqual([diceOf("1d6"), diceOf("0d6"), diceOf("2d6+1")], [1, 0, Infinity]);
});

test("Halcyon Heart's net: its riders until the creature Escapes at DC 44, a demon's Escapes rolled twice keeping the lower, and the counteract card on a hit", () => {
    const [net] = activations("Halcyon Heart");
    assert.deepEqual([done(net), routeOf(net), net.partial], [true, "save", undefined]);
    const critical = rowOf(net, "criticalSuccess");
    assert.deepEqual(critical.effects.map((effect) => [effect.slug, effect.duration.mode, effect.duration.escape.dc]), [["off-guard", "until-escape", 44], ["immobilized", "until-escape", 44]]);
    assert.deepEqual(rowOf(net).modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.escape.dc]), [["all-speeds", -10, 44]]);
    // (A demon's: the misfortune note Effect on a hit, PF2e's RollTwice on its Escapes.)
    const demon = planFor(net, { system: { traits: { value: ["demon", "fiend"] } } });
    assert.deepEqual(demon.resolution.outcomes.success.noteEffects[0].rules, [{ key: "RollTwice", selector: ["skill-check", "attack-roll"], keep: "lower", predicate: ["action:escape"] }]);
    assert.equal(planFor(net, { system: { traits: { value: ["humanoid"] } } }).resolution.outcomes.success.noteEffects, undefined);
    assert.deepEqual([net.heldCounteract.counteract.rank, net.heldCounteract.counteract.modifier, net.heldCounteract.counteract.fortuneVs], [9, 38, ["demon"]]);
    assert.deepEqual(heldBy(net.heldCounteract, [{ degree: "failure", actorUuid: "a" }, { degree: "success", actorUuid: "b" }]).map((target) => target.actorUuid), ["b"]);
});

test("Herald's Ring's Reflect Sound: the damage turned back and negated by the counteract's result, its use given back on a critical failure", () => {
    const reflect = activation("Herald's Ring", "Reflect Sound");
    const { counteract } = reflect.item;
    assert.deepEqual([done(reflect), routeOf(reflect), counteract.modifier, counteract.regain.index, counteract.regain.frequency.per], [true, "counteract", 23, 1, "day"]);
    assert.deepEqual([3, 2, 1, 0].map((degree) => reflection(counteract.reflect, degree, 31)), [{ back: 31, negated: 0, regain: false }, { back: 15, negated: 15, regain: false }, { back: 15, negated: 0, regain: false }, { back: 0, negated: 0, regain: true }]);
    const card = createCounteractCard({ counteract, item: { name: "Herald's Ring" }, user: { actorUuid: "u", name: "Hero" } });
    assert.match(counteractCardHTML(card, { canApply: true }), /data-air-amount/);
});

test("Shot of the First Vault: its fragments torn out (15 persistent bleed, Clumsy 2 lower), and Vault Deposit's Strike with the DC 45 Reflex save unless it critically fails", () => {
    const reload = activation("Shot of the First Vault", "Reload Order");
    assert.deepEqual([done(reload), routeOf(reload), reload.ways.map((way) => routeOf(way.plan))], [true, "ways", ["item", "save"]]);
    const torn = rowOf(reload.ways[1].plan);
    assert.deepEqual([torn.damage.formulas[0].formula, torn.effects[0].slug, torn.effects[0].stack], ["15[persistent,bleed]", "clumsy", { by: -2 }]);
    const deposit = activation("Shot of the First Vault", "Vault Deposit");
    assert.deepEqual([done(deposit), routeOf(deposit), deposit.partial], [true, "strike", undefined]);
    const { save } = deposit.strike;
    assert.deepEqual([save.resolution.check.statistic, save.resolution.check.against.value, save.traits.includes("incapacitation")], ["reflex", 45, true]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => (save.resolution.outcomes[degree].noteEffects ?? []).map((note) => note.label)), [[], ["Hurled by the shot"], ["Sent to Axis"], ["In the First Vault"]]);
    // (Its save on a hit and on a failure, not on a critical failure.)
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((outcome) => riderFor(deposit, { ranged: true, outcome })), ["hit", "hit", "failure", "spend"]);
});
