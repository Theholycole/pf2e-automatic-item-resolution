// An item that has its user roll their next roll of a kind twice, against the stand-in for Foundry: the reading, its card,
// Apply giving the user an Effect with PF2e's RollTwice rule, and that Effect gone after the roll it's for.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readRollTwice } from "../src/compiler/fortune.js";
import { readReadiedBonus } from "../src/compiler/readied-bonus.js";
import { plainText } from "../src/compiler/rows.js";
import { readiedRules, readiedWords, rollWords } from "../src/live/fortune-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 160 squares down.)
const foundry = await fakeFoundry();
const hero = foundry.makeActor({ id: "fortune-hero", name: "Hero", owners: ["player"] });
foundry.place(hero, 0, 16000);
const fortunes = () => hero.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.rollTwice);

test("the reading: which roll is rolled twice, from the text or its trigger, and what else it says", () => {
    const [sunweave] = compileActivations(source("Sunweave"));
    assert.equal(routeOf(sunweave.plan), "fortune");
    assert.deepEqual(sunweave.plan.rollTwice, { selector: "initiative", keep: "higher" });
    // "Trigger You attempt an Athletics check to Force Open, Reposition, or Shove": Athletics, for those actions only.
    const wraps = compileActivations(source("Kinetic Wraps of Strength")).find((entry) => entry.plan?.builtin === "roll-twice").plan;
    assert.deepEqual(wraps.rollTwice, { selector: "athletics", keep: "higher", predicate: [{ or: ["action:force-open", "action:reposition", "action:shove"] }] });
    assert.equal(rollWords(wraps.rollTwice), "Athletics check (force open, reposition, shove)");
    // "Roll the triggering saving throw twice".
    assert.equal(compileActivations(source("Energy Shield Tunic")).find((entry) => entry.plan?.builtin === "roll-twice").plan.rollTwice.selector, "saving-throw");
    // A talisman: "you roll your next attack roll twice …, ignoring any circumstance penalties. You then become Off-Guard …".
    const tear = compileItem(source("Gorum's Tear"));
    assert.deepEqual([tear.builtin, tear.rollTwice.selector, tear.partial], ["roll-twice", "attack-roll", true]);
    assert.match(tear.notes.join(" "), /Off-Guard/);
    // Not a fortune for its user: another creature's worse roll, or a damage roll.
    assert.equal(readRollTwice("Effect The caster must roll the spell attack roll twice and take the worse result."), null);
    assert.equal(readRollTwice("Trigger You successfully Strike a creature; Effect Roll the damage of the triggering Strike twice and take the higher result."), null);
    assert.equal(readRollTwice(plainText(source("Grinning Pugwampi").system.description.value)), null);
});

test("Gorum's Tear: Apply gives PF2e's RollTwice for the next attack roll; that roll removes it", async () => {
    const item = foundry.giveItem(hero, source("Gorum's Tear"));
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "fortune");
    assert.match(card.content, /next attack roll: roll twice, take the better/);
    assert.match(card.content, /Off-Guard/, "what else it says, as notes");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const [effect] = fortunes();
    assert.deepEqual(effect.system.rules, [{ key: "RollTwice", selector: "attack-roll", keep: "higher", removeAfterRoll: true }]);
    // A save doesn't spend it; the attack roll does.
    const save = foundry.makeMessage({ flags: { pf2e: { context: { type: "saving-throw", domains: ["reflex", "saving-throw", "all"] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", save);
    await settle();
    assert.equal(fortunes().length, 1);
    const attack = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", domains: ["strike-attack-roll", "attack-roll", "attack", "all"], options: [] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", attack);
    await settle();
    assert.equal(fortunes().length, 0);
});

test("the reading: a bonus for a moment — the roll that triggered it, or the turn — and what isn't one", () => {
    // "You absorb light, gaining a +2 status bonus to the Stealth check" (Trigger: you attempt a Stealth check to Hide or Sneak).
    const eclipse = compileActivations(source("Eclipse")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.equal(routeOf(eclipse), "fortune");
    assert.deepEqual(eclipse.bonus.modifiers, [{ selector: "stealth", type: "status", value: 2 }]);
    assert.deepEqual(eclipse.bonus.spend, ["stealth"], "that one roll");
    // "Until the end of the current turn, against the triggering effect, … +1 status bonus to AC and saving throws and gain resistance 2 to damage."
    const spark = compileActivations(source("Sparkwarden"))[0].plan;
    assert.deepEqual(spark.bonus.modifiers.map((modifier) => modifier.selector), ["ac", "saving-throw"]);
    assert.deepEqual(spark.bonus.resistance, { type: "all-damage", value: 2 });
    assert.deepEqual([spark.bonus.duration.value, spark.bonus.duration.expiry, spark.bonus.spend], [0, "turn-end", []]);
    assert.match(spark.notes.join(" "), /Only against what triggered it/);
    // "+2 circumstance bonus to your Fortitude DC against the triggering Grapple".
    assert.equal(compileActivations(source("Shacklebreaker"))[0].plan.bonus.modifiers[0].selector, "fortitude-dc");
    // "Until the start of your next turn, you gain a +4 item bonus to Stealth checks to Hide and Sneak".
    const scale = compileActivations(source("Scale of Igroon"))[0].plan.bonus;
    assert.deepEqual([scale.modifiers[0].predicate, scale.duration.expiry], [[{ or: ["action:hide", "action:sneak"] }], "turn-start"]);
    assert.equal(readiedWords(compileActivations(source("Scale of Igroon"))[0].plan), "+4 item bonus to Stealth check (hide, sneak), until the start of the next turn");
    // Not one: after the roll ("You would miss …", "If this causes the Strike to miss"), a lasting one, an ally's.
    assert.equal(readReadiedBonus("Trigger You would miss with an attack made with a bow Effect You gain a +2 circumstance bonus to your attack roll, possibly turning a miss into a hit."), null);
    assert.equal(compileItem(source("Animal-Turning Fulu"))?.builtin === "readied-bonus", false);
    assert.equal(readReadiedBonus("Effect You gain a +1 item bonus to Perception checks. The duration is 1 hour."), null);
    assert.equal(readReadiedBonus("Trigger An ally fails Effect Your allies gain a +1 status bonus to saving throws until the end of the turn."), null);
});

test("Eclipse: Apply gives PF2e's FlatModifier for the Stealth check; that check removes it, a save doesn't", async () => {
    const blade = foundry.giveItem(hero, source("Eclipse"));
    const index = compileActivations(source("Eclipse")).findIndex((entry) => entry.plan?.builtin === "readied-bonus");
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: blade.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "fortune");
    assert.match(card.content, /\+2 status bonus to Stealth check, for the next such roll/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const [effect] = fortunes();
    assert.deepEqual(effect.system.rules, [{ key: "FlatModifier", selector: "stealth", type: "status", value: 2, label: "Eclipse" }]);
    const save = foundry.makeMessage({ flags: { pf2e: { context: { type: "saving-throw", domains: ["will", "saving-throw", "all"] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", save);
    await settle();
    assert.equal(fortunes().length, 1);
    const hide = foundry.makeMessage({ flags: { pf2e: { context: { type: "skill-check", domains: ["stealth", "dex-based", "skill-check", "all"] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", hide);
    await settle();
    assert.equal(fortunes().length, 0);
});

test("a better degree for the triggering roll: PF2e's AdjustDegreeOfSuccess, spent by that roll", () => {
    // "Trigger You attempt a Performance check … If you roll a success on your triggering check, you get a critical success instead."
    const muse = compileItem(source("Singing Muse"));
    assert.equal(routeOf(muse), "fortune");
    assert.deepEqual(muse.bonus.degree, { selector: "performance", adjustment: { success: "one-degree-better" } });
    assert.deepEqual(muse.bonus.spend, ["performance"]);
    assert.deepEqual(readiedRules(muse), [{ key: "AdjustDegreeOfSuccess", selector: "performance", adjustment: { success: "one-degree-better" }, label: "Singing Muse" }]);
    // "attempt a Deception check to Feint. If the outcome is a success, … critical success instead. If … a critical failure, … a failure instead."
    const opal = compileItem(source("Mesmerizing Opal"));
    assert.deepEqual(opal.bonus.degree, { selector: "deception", adjustment: { success: "one-degree-better", criticalFailure: "one-degree-better" }, predicate: [{ or: ["action:feint"] }] });
    assert.match(readiedWords(opal), /a success becomes a critical success, a critical failure becomes a failure/);
});


test("resistance against the hit that triggered it: PF2e's Resistance for the turn, its type the text's or the trigger's", async () => {
    // "You gain resistance 5 to physical damage against the triggering Strike" (Deflecting Parry).
    const parry = compileActivations(source("Deflecting"))[0].plan;
    assert.equal(routeOf(parry), "fortune");
    assert.deepEqual([parry.bonus.modifiers, parry.bonus.resistance, parry.bonus.duration.value, parry.bonus.duration.expiry], [[], { type: "physical", value: 5 }, 0, "turn-end"]);
    assert.equal(readiedWords(parry), "resistance 5 to physical damage, until the end of this turn");
    assert.match(parry.notes[0], /^Only against what triggered it/);
    // "You gain resistance 3 against that spirit damage" (Third Blessing).
    assert.deepEqual(compileActivations(source("Three-Pillared Yang Na")).find((entry) => entry.plan?.builtin === "readied-bonus").plan.bonus.resistance, { type: "spirit", value: 3 });
    // Not one: an item used two ways (Toadskin Salve's two reactions, Thrice-Fried Mudwings' meal), a lasting one (Adaptive Aegis's
    // "that lasts for 10 minutes"), another creature's (Hallajin Key's "grants the target resistance 10").
    assert.notEqual(compileItem(source("Toadskin Salve"))?.builtin, "readied-bonus");
    assert.notEqual(compileItem(source("Thrice-Fried Mudwings"))?.builtin, "readied-bonus");
    assert.equal(readReadiedBonus("Trigger You would take mental, poison, or spirit damage Effect You gain resistance 5 to the triggering damage type that lasts for 10 minutes."), null);
    assert.equal(readReadiedBonus("Trigger A creature within 60 feet of the key takes electricity or mental damage Effect Lumna grants the target resistance 10 to the triggering damage."), null);
    // Ferrofluid Urchin: "Trigger You take physical damage … You gain resistance 3 to the triggering damage" — Apply gives the Effect.
    const item = foundry.giveItem(hero, source("Ferrofluid Urchin (Lesser)"));
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "fortune");
    assert.match(card.content, /resistance 3 to physical damage, until the end of this turn/);
    assert.doesNotMatch(card.content, /spiky glob/, "its flavor isn't a note");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const effect = fortunes().find((entry) => entry.name === "Ferrofluid Urchin (Lesser): bonus");
    assert.deepEqual(effect.system.rules, [{ key: "Resistance", type: "physical", value: 3 }]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.expiry], [0, "turn-end"]);
});

test("a talisman's moment bonus: its trigger its first sentence, \"When activated, …\", \"grants you\", a name of several words", () => {
    // "Trigger You attempt a saving throw against an injected poison. … When activated, …, granting you a +2 status bonus to the
    // triggering saving throw." — its flavor isn't a note, nor its Usage or Trigger line.
    const venom = compileItem(source("Venomous Cure Fulu"));
    assert.equal(routeOf(venom), "fortune");
    assert.deepEqual([venom.bonus.modifiers, venom.bonus.spend, venom.notes], [[{ selector: "saving-throw", type: "status", value: 2 }], ["saving-throw"], []]);
    // "The memory ribbon grants you a +2 item bonus to the triggering skill check to Recall Knowledge".
    assert.deepEqual(compileItem(source("Memory Ribbon")).bonus.modifiers[0].predicate, [{ or: ["action:recall-knowledge"] }]);
    // "You get a +2 status bonus to the Diplomacy check, and if you roll a critical failure on the check, you get a failure
    // instead": the later "if you roll a critical failure" isn't its trigger.
    const match = compileItem(source("Matchmaker Fulu"));
    assert.deepEqual([match.bonus.modifiers[0].selector, match.bonus.degree.adjustment], ["diplomacy", { criticalFailure: "one-degree-better" }]);
    // "+2 status bonus on your Fortitude save against the initial exposure": spent by that save.
    assert.deepEqual(compileItem(source("Sanitizing Pin")).bonus.spend, ["fortitude"]);
    // "…, which increases to a +3 circumstance bonus …": a note.
    assert.match(compileItem(source("Conrasu Coin (Arbiter)")).notes.join(" "), /increases to a \+3/);
    // Not a moment: "on all Fortitude saves against the same disease for the next minute" (Fulu of the Stoic Ox).
    assert.notEqual(compileItem(source("Fulu of the Stoic Ox"))?.builtin, "readied-bonus");
});

test("\"the triggering check\" alone: the trigger's rolls and actions (Mask of Allure, Whisperer of Souls)", () => {
    const mask = compileActivations(source("Mask of Allure")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(mask.bonus.spend, ["deception", "diplomacy", "intimidation", "performance"]);
    assert.equal(readiedWords(mask), "+4 status bonus to Deception check or Diplomacy check or Intimidation check or Performance check, for the next such roll");
    const souls = compileActivations(source("Whisperer of Souls")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(souls.bonus.modifiers, [{ selector: "occultism", type: "item", value: 4, predicate: [{ or: ["action:decipher-writing", "action:identify-magic", "action:learn-a-spell", "action:recall-knowledge"] }] }]);
});

test("resistance to the triggering damage in other words: \"20 resistance to all damage\", \"reduce the damage taken by 10\"", () => {
    const scapular = compileActivations(source("Scapular of Shields")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(scapular.bonus.resistance, { type: "all-damage", value: 20 });
    assert.deepEqual(compileActivations(source("Mantle of Amazing Health"))[0].plan.bonus.resistance, { type: "all-damage", value: 10 });
    // "When you activate it, …, and you reduce the damage from the triggering critical hit by 10": its limit a note.
    const keepsake = compileItem(source("Indomitable Keepsake"));
    assert.deepEqual(keepsake.bonus.resistance, { type: "all-damage", value: 10 });
    assert.match(keepsake.notes.join(" "), /only reduces the additional damage from a critical hit/);
});

test("another sentence's time isn't the bonus's: a Quickened on success, an immunity (Boots of the Blight, Stone of Encouragement)", () => {
    const boots = compileActivations(source("Boots of the Blight")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual([boots.bonus.modifiers[0].selector, boots.bonus.spend], ["saving-throw", ["saving-throw"]]);
    assert.match(boots.notes.join(" "), /Quickened for 1 minute/);
    // "+1 item bonus to the first skill check you attempt within 1 minute. You become temporarily immune …".
    assert.deepEqual(compileActivations(source("Stone of Encouragement"))[0].plan.bonus.spend, ["skill-check"]);
    // Its own sentence's "for the next minute" still is (Fulu of the Stoic Ox).
    assert.notEqual(compileItem(source("Fulu of the Stoic Ox"))?.builtin, "readied-bonus");
});

test("\"resistance 2 to the triggering damage\" beside the bonus (Warding Tattoo)", () => {
    const tattoo = compileActivations(source("Warding Tattoo")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(tattoo.bonus.resistance, { type: "all-damage", value: 2 });
});
