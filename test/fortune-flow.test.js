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
    assert.equal(readRollTwice("Trigger Your Strike hits; Effect Roll your damage for that Strike twice and use the higher result."), null);
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
    // (Only against what triggered it: bonus.against, spent by that — no note.)
    assert.equal(spark.bonus.against, true);
    assert.equal(spark.partial, undefined);
    // The ability compiler's "ac-reaction", a monster's own reaction: its user's Effect for it instead — Deflecting Branch's "+4
    // circumstance bonus to AC against the triggering attack", Dragon Turtle Plate's "to gain a +1 …", Bismuth Armor's miss a note.
    const branch = compileActivations(source("Deflecting Branch"))[0].plan;
    assert.deepEqual([branch.builtin, routeOf(branch), branch.bonus.modifiers, branch.bonus.duration.expiry], ["readied-bonus", "fortune", [{ selector: "ac", type: "circumstance", value: 4 }], "turn-end"]);
    // ("If the attack misses, you have knocked it away": the state its other activation's trigger names — not a note.)
    assert.deepEqual([branch.notes, branch.partial], [[], undefined]);
    // ("You can't use this ability to deflect unusually massive ranged projectiles": a line of the card, its trigger's — 2026-10-27.)
    assert.match(branch.bonus.limits[0], /^You can't use this ability to deflect unusually massive ranged projectiles/);
    assert.equal(compileActivations(source("Dragon Turtle Plate"))[0].plan.bonus.modifiers[0].value, 1);
    // (Its miss now the attacker's Dazzled, bonus.onAttack.)
    assert.deepEqual(compileActivations(source("Bismuth Armor"))[0].plan.bonus.onAttack, { miss: { condition: { slug: "dazzled", value: null, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } } } });
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
    // (A higher resistance against some sources, Warding Tattoo (Fiend)'s and (Trail)'s "becomes resistance 5": a second Resistance rule
    // predicated as PF2e's own for the tattoo.)
    const fiend = compileActivations(source("Warding Tattoo (Fiend)"))[0].plan;
    assert.deepEqual([readiedRules(fiend).filter((rule) => rule.key === "Resistance"), fiend.partial], [[{ key: "Resistance", type: "all-damage", value: 2 }, { key: "Resistance", type: "all-damage", value: 5, predicate: ["origin:trait:fiend"] }], undefined]);
    assert.match(readiedWords(fiend), /resistance 2 to damage \(5 to damage from fiends and magical attacks by fiends\)/);
    const trail = compileActivations(source("Warding Tattoo (Trail)"))[0].plan;
    assert.deepEqual(readiedRules(trail).at(-1).predicate, [{ or: ["origin:trait:environmental", "origin:trait:terrain"] }]);
    // (The Feint itself its user's own PF2e roll: the card's line, not a note.)
    assert.deepEqual([opal.then, opal.notes, opal.partial], ["Attempt a Deception check to Feint (PF2e's own, its degree improved)", [], undefined]);
});


test("resistance against the hit that triggered it: PF2e's Resistance for the turn, its type the text's or the trigger's", async () => {
    // "You gain resistance 5 to physical damage against the triggering Strike" (Deflecting Parry).
    const parry = compileActivations(source("Deflecting"))[0].plan;
    assert.equal(routeOf(parry), "fortune");
    assert.deepEqual([parry.bonus.modifiers, parry.bonus.resistance, parry.bonus.duration.value, parry.bonus.duration.expiry], [[], { type: "physical", value: 5 }, 0, "turn-end"]);
    assert.equal(readiedWords(parry), "resistance 5 to physical damage, against what triggered it, this turn");
    assert.deepEqual([parry.bonus.against, parry.notes], [true, []]);
    // "You gain resistance 3 against that spirit damage" (Third Blessing).
    assert.deepEqual(compileActivations(source("Three-Pillared Yang Na")).find((entry) => entry.plan?.builtin === "readied-bonus").plan.bonus.resistance, { type: "spirit", value: 3 });
    // Not one: an item used two ways (Toadskin Salve's two reactions, Thrice-Fried Mudwings' meal), a lasting one (Adaptive Aegis's
    // "that lasts for 10 minutes"), and another creature's is for the creature targeted (Hallajin Key's "grants the target resistance 10").
    assert.notEqual(compileItem(source("Toadskin Salve"))?.builtin, "readied-bonus");
    assert.notEqual(compileItem(source("Thrice-Fried Mudwings"))?.builtin, "readied-bonus");
    assert.equal(readReadiedBonus("Trigger You would take mental, poison, or spirit damage Effect You gain resistance 5 to the triggering damage type that lasts for 10 minutes."), null);
    // (Another creature's, Hallajin Key's: for the creature the presser targets — bonus.recipient "target".)
    const lumna = readReadiedBonus("Trigger A creature within 60 feet of the key takes electricity or mental damage Effect Lumna grants the target resistance 10 to the triggering damage.");
    assert.deepEqual([lumna.recipient, lumna.resistance], ["target", { type: ["electricity", "mental"], value: 10 }]);
    // Ferrofluid Urchin: "Trigger You take physical damage … You gain resistance 3 to the triggering damage" — Apply gives the Effect.
    const item = foundry.giveItem(hero, source("Ferrofluid Urchin (Lesser)"));
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "fortune");
    assert.match(card.content, /resistance 3 to physical damage, against what triggered it, this turn/);
    assert.doesNotMatch(card.content, /spiky glob/, "its flavor isn't a note");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const effect = fortunes().find((entry) => entry.name === "Ferrofluid Urchin (Lesser): bonus");
    assert.deepEqual(effect.system.rules, [{ key: "Resistance", type: "physical", value: 3 }]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.expiry], [0, "turn-end"]);
    // (The damage it takes spends it.)
    await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { appliedDamage: { uuid: hero.uuid, isHealing: false, updates: [] }, context: { type: "damage-taken" } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document }));
    await settle();
    assert.equal(fortunes().some((entry) => entry.name === "Ferrofluid Urchin (Lesser): bonus"), false);
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
    // "…, which increases to a +3 circumstance bonus … on a creature with the aeon trait": read (a second, predicated modifier — below).
    assert.equal(compileItem(source("Conrasu Coin (Arbiter)")).bonus.modifiers.length, 2);
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
    // (Its Quickened on a success: bonus.onSuccess, given when the save spends it — 2026-10-27; the card's words say it.)
    assert.deepEqual([boots.bonus.onSuccess.condition.slug, boots.bonus.onSuccess.condition.duration.value, boots.bonus.onSuccess.only, boots.partial], ["quickened", 1, "Stride", undefined]);
    assert.match(readiedWords(boots), /on a success, quickened for 1 minute \(its extra action only to Stride\)/);
    // "+1 item bonus to the first skill check you attempt within 1 minute. You become temporarily immune …".
    assert.deepEqual(compileActivations(source("Stone of Encouragement"))[0].plan.bonus.spend, ["skill-check"]);
    // Its own sentence's "for the next minute" still is (Fulu of the Stoic Ox).
    assert.notEqual(compileItem(source("Fulu of the Stoic Ox"))?.builtin, "readied-bonus");
});

test("\"resistance 2 to the triggering damage\" beside the bonus (Warding Tattoo)", () => {
    const tattoo = compileActivations(source("Warding Tattoo")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(tattoo.bonus.resistance, { type: "all-damage", value: 2 });
});

test("Ring of Torag: resistance 5 against fire and +1 to AC and saves, together, against the fire effect that triggered it", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const ring = compileActivations(source("Ring of Torag")).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual(ring.bonus.modifiers.map((modifier) => `${modifier.selector} +${modifier.value} ${modifier.type}`), ["ac +1 status", "saving-throw +1 status"]);
    assert.deepEqual(ring.bonus.resistance, { type: "fire", value: 5 });
    assert.deepEqual([ring.bonus.against, ring.notes], [true, []]);
    // (A sentence saying more than the bonus is read for it: Broken Tusk Pendant's "… or a +2 item bonus if the animal is the specific kind …" —
    // the ways card's two buttons, test/ways-flow.test.js.)
    assert.equal(compileActivations(source("Broken Tusk Pendant"))[0].plan.builtin, "ways");
    // (A higher one at a kind of creature, Conrasu Coin (Arbiter)'s +3 against an aeon: a second modifier on the target's trait, PF2e keeping the
    // higher circumstance bonus.)
    const coin = compileItem(source("Conrasu Coin (Arbiter)"));
    assert.deepEqual([readiedRules(coin).map((rule) => [rule.selector, rule.value, rule.predicate ?? null]), coin.notes, coin.partial], [[["diplomacy", 2, null], ["diplomacy", 3, ["target:trait:aeon"]]], [], undefined]);
});

test("moment bonuses in more words: Pyrefeather Cloak's type-first resistance, Curious Teardrop's \"You receive\", Calamity's Bane Tattoo's any check, Crown of the Fire Eater's raised resistance", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const plan = (name) => compileActivations(source(name)).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    const cloak = plan("Pyrefeather Cloak");
    assert.deepEqual([cloak.bonus.resistance, cloak.bonus.modifiers.map((modifier) => `${modifier.selector} +${modifier.value}`), cloak.bonus.duration.expiry], [{ type: "fire", value: 5 }, ["saving-throw +1"], "turn-start"]);
    assert.deepEqual(plan("Curious Teardrop").bonus.modifiers, [{ selector: "saving-throw", type: "status", value: 4 }]);
    assert.deepEqual([plan("Calamity's Bane Tattoo").bonus.modifiers[0].selector, plan("Calamity's Bane Tattoo").bonus.spend], ["check", ["check"]]);
    const crown = plan("Crown of the Fire Eater (Greater)");
    assert.deepEqual(crown.bonus.resistance, { type: "fire", value: 25 });
    assert.ok(crown.notes.some((note) => /regain a number of Hit Points/.test(note)));
});

test("a bonus for another creature (Resonant Guitar's Chord of Protection, +2 status to AC against the triggering attack): Apply gives the creature targeted the Effect, not the user; no target, refused", async () => {
    const bard = foundry.makeActor({ id: "fortune-bard", name: "Bard", owners: ["player"] });
    const ally = foundry.makeActor({ id: "fortune-ally", name: "Guarded Ally" });
    foundry.place(bard, 0, 16100);
    foundry.place(ally, 100, 16100);
    const guitar = foundry.giveItem(bard, source("Resonant Guitar"));
    const plan = compileActivations(source("Resonant Guitar"))[1].plan;
    assert.deepEqual([plan.builtin, plan.bonus.recipient, plan.targeting.range], ["readied-bonus", "target", "30 feet"]);
    const before = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: guitar.uuid, activation: 1, userId: "player" });
    await settle();
    const card = foundry.messages.slice(before).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "fortune");
    assert.match(card.content, /For the creature targeted \(within 30 feet\): \+2 status bonus to AC/);
    const errors = foundry.notifications.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Target the creature first/.test(text)));
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [ally.token.document.uuid], userId: "player" });
    await settle();
    const given = ally.itemTypes.effect.find((effect) => effect.flags?.[MODULE_ID]?.rollTwice);
    assert.deepEqual(given?.system.rules.map((rule) => [rule.key, rule.selector, rule.value]), [["FlatModifier", "ac", 2]]);
    assert.equal(bard.itemTypes.effect.some((effect) => effect.flags?.[MODULE_ID]?.rollTwice), false, "not the user's");
    // (Its Strike still hitting: the barrier's 3d10 sonic on the attacker, and the Effect spent.)
    assert.match(card.content, /if it hits, 3d10 sonic damage to the attacker/);
    const attacker = foundry.makeActor({ id: "fortune-attacker", name: "Attacker", hp: 40, max: 40 });
    foundry.place(attacker, 200, 16100);
    await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: [], target: { actor: ally.uuid, token: ally.token.uuid } } } }, speaker: { actor: attacker.id }, actor: attacker, token: attacker.token.document }));
    await settle();
    assert.deepEqual(attacker.healed.map((entry) => entry.damage), ["(3d10)[sonic]"]);
    assert.ok(foundry.messages.some((message) => /Resonant Guitar[^<]*<\/strong>: the attack still hit — 3d10 sonic damage to Attacker/.test(message.content)));
    assert.equal(ally.itemTypes.effect.some((effect) => effect.flags?.[MODULE_ID]?.rollTwice), false);
});

test("Bismuth Armor: the spell attack at its user misses — the attacker Dazzled for 1 round (the ability module's timed condition), the Effect spent", async () => {
    const wearer = foundry.makeActor({ id: "fortune-wearer", name: "Wearer", owners: ["player"] });
    const caster = foundry.makeActor({ id: "fortune-caster", name: "Caster" });
    foundry.place(wearer, 0, 16600);
    foundry.place(caster, 100, 16600);
    const armor = foundry.giveItem(wearer, source("Bismuth Armor"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: armor.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "fortune");
    assert.match(card.content, /\+2 circumstance bonus to AC, against what triggered it, this turn; if it misses, the attacker dazzled for 1 round/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const before = foundry.applied.length;
    await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "spell-attack-roll", outcome: "failure", options: [], target: { actor: wearer.uuid, token: wearer.token.uuid } } } }, speaker: { actor: caster.id }, actor: caster, token: caster.token.document }));
    await settle();
    const [change] = foundry.applied.slice(before);
    assert.deepEqual([change.change.op, change.change.slug, change.change.target, change.state.targets[0].name, change.change.duration.value], ["condition", "dazzled", "t0", "Caster", 1]);
    assert.equal(wearer.itemTypes.effect.some((effect) => effect.flags?.[MODULE_ID]?.rollTwice), false);
});

test("the roll named before it, in a clause of its own: \"when you make an attack roll at a foe …, you can roll twice\" — its user's next attack roll, the rest notes (the module's own wording)", () => {
    const read = readRollTwice("Effect A war cry rises. Once in the fury, when you make an attack roll at a foe of your faith, you can roll twice and keep the better result. This is a fortune effect. Every foe counts as one.");
    assert.deepEqual(read, { selector: "attack-roll", keep: "higher", notes: ["A war cry rises.", "Every foe counts as one."] });
    // (Not someone else's roll, nor a damage roll.)
    assert.equal(readRollTwice("Effect When you make a damage roll, you can roll twice and keep the better result."), null);
});

test("only against what triggered it (bonus.against): the attack at its creature spends it, a hit keeping one with resistance until the damage; a check against its DC, its own save, the damage it takes", async () => {
    const guard = foundry.makeActor({ id: "fortune-guard", name: "Guard", owners: ["player"] });
    const foe = foundry.makeActor({ id: "fortune-foe", name: "Foe" });
    foundry.place(guard, 0, 16400);
    foundry.place(foe, 100, 16400);
    const mine = () => guard.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.rollTwice);
    const gain = async (name) => {
        const item = foundry.giveItem(guard, source(name));
        const index = compileActivations(source(name)).findIndex((entry) => entry.plan?.builtin === "readied-bonus");
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: index, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "fortune");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const post = async (flags, actor) => {
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: flags }, speaker: { actor: actor.id }, actor, token: actor.token.document }));
        await settle();
    };
    const attack = (outcome) => post({ context: { type: "attack-roll", outcome, options: [], target: { actor: guard.uuid, token: guard.token.uuid } } }, foe);
    // Sparkwarden (+1 status to AC and saves, resistance 2): a hit at it leaves it for the damage; that damage spends it.
    const card = await gain("Sparkwarden");
    assert.match(card.content, /\+1 status bonus to AC and saving throw, resistance 2 to damage, against what triggered it, this turn/);
    assert.deepEqual(mine()[0].flags[MODULE_ID].rollTwice.against, { damage: true, save: true });
    await attack("success");
    assert.equal(mine().length, 1, "the damage still to come");
    await post({ context: { type: "saving-throw", domains: ["reflex", "saving-throw"] } }, guard);
    assert.equal(mine().length, 1, "a save with damage to come: kept");
    await post({ appliedDamage: { uuid: guard.uuid, isHealing: false, updates: [] }, context: { type: "damage-taken" } }, guard);
    assert.equal(mine().length, 0);
    // Sparkwarden again, missed: nothing to come.
    await gain("Sparkwarden");
    await attack("failure");
    assert.equal(mine().length, 0);
    // Deflecting Branch (+4 circumstance to AC): the attack spends it, hit or miss; another creature's attack doesn't.
    await gain("Deflecting Branch");
    await post({ context: { type: "attack-roll", outcome: "success", options: [], target: { actor: foe.uuid, token: foe.token.uuid } } }, guard);
    assert.equal(mine().length, 1, "an attack at someone else");
    await attack("success");
    assert.equal(mine().length, 0);
    // Shacklebreaker (+1 to its Fortitude DC against the Grapple): the Grapple check at it.
    await gain("Shacklebreaker");
    assert.equal(mine().length, 1);
    await post({ context: { type: "skill-check", outcome: "failure", options: ["action:grapple"], target: { actor: guard.uuid, token: guard.token.uuid } } }, foe);
    assert.equal(mine().length, 0);
    // Spellcutter (+4 status to AC and saves, nothing against damage): its own save.
    await gain("Spellcutter");
    await post({ context: { type: "saving-throw", domains: ["will", "saving-throw"] } }, guard);
    assert.equal(mine().length, 0);
});

test("Champion's Laurels: +1 status to the triggering Acrobatics or Athletics check, and on its critical success 2 temporary Hit Points for 1 minute (the ability module's) — given when that roll spends it, not on a success", async () => {
    const athlete = foundry.makeActor({ id: "fortune-athlete", name: "Athlete", owners: ["player"] });
    foundry.place(athlete, 0, 16800);
    const laurels = compileItem(source("Champion's Laurels (Amateur)"));
    assert.deepEqual([laurels.bonus.onCritical.tempHP, laurels.bonus.onCritical.duration.value, laurels.bonus.onCritical.duration.unit, laurels.notes, laurels.partial], [2, 1, "minutes", [], undefined]);
    const use = async () => {
        const item = foundry.giveItem(athlete, source("Champion's Laurels (Amateur)"));
        const data = item.toObject();
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: athlete.id }, actor: athlete, token: athlete.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        const card = foundry.messages[foundry.messages.indexOf(message) + 1];
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const check = async (outcome) => {
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "skill-check", outcome, domains: ["athletics", "skill-check"], options: [] } } }, speaker: { actor: athlete.id }, actor: athlete, token: athlete.token.document }));
        await settle();
    };
    const card = await use();
    assert.match(card.content, /on a critical success, 2 temporary Hit Points for 1 minute/);
    const before = foundry.applied.length;
    await check("success");
    assert.equal(foundry.applied.length, before, "a success: no temporary Hit Points");
    assert.equal(athlete.itemTypes.effect.some((effect) => effect.flags?.[MODULE_ID]?.rollTwice), false, "spent");
    await use();
    await check("criticalSuccess");
    const [given] = foundry.applied.slice(before);
    assert.deepEqual([given.change.op, given.change.target, given.change.amount, given.change.duration.unit, given.state.source.name], ["tempHp", "source", 2, "minutes", "Athlete"]);
    assert.match(foundry.messages.at(-1).content, /Champion&#39;s Laurels \(Amateur\)<\/strong>: a critical success — ability applied tempHp/);
});

test("what a failure at the roll costs: Iris of the Sky's A Wish Granted With Inevitable Fire — 5 persistent fire to its user on a failure, on the card", () => {
    const [, wish] = compileActivations(source("Iris of the Sky"));
    assert.deepEqual([wish.plan.rollTwice.onFailure, wish.plan.partial], [{ formula: "5", type: "fire", persistent: true }, undefined]);
    assert.match(readiedWords(wish.plan), /on a failure, its user takes 5 persistent fire damage$/);
});

test("more for an expert: Warrior's Training Ring's +2 to the attack roll, +4 for an expert in any weapon — on the card", () => {
    const [ring] = compileActivations(source("Warrior's Training Ring"));
    assert.deepEqual([ring.plan.bonus.modifiers[0].value, ring.plan.bonus.modifiers[0].ifExpert, ring.plan.partial], [2, 4, undefined]);
    assert.match(readiedWords(ring.plan), /\(\+4 for an expert in any weapon\)/);
});

test("a Speed the reaction lowers, then ends: Thrice-Fried Mudwings' fly Speed 15 feet or half the first time, ended the second", () => {
    const wings = compileItem(source("Thrice-Fried Mudwings"));
    const reaction = wings.ways[1].plan;
    assert.deepEqual([reaction.bonus.speedSteps.type, reaction.bonus.speedSteps.feet, reaction.bonus.speedSteps.secondEnds, reaction.partial], ["fly", 15, true, undefined]);
    assert.match(readiedWords(reaction), /its fly Speed 15 feet or half its Speed the first time, ended the second/);
});

test("a flat check to end a persistent damage at once beside the bonus: Pyrefeather Cloak's persistent fire — its sentence no longer dropped", () => {
    const [cloak] = compileActivations(source("Pyrefeather Cloak"));
    assert.deepEqual([cloak.plan.bonus.recovery, cloak.plan.bonus.resistance, cloak.plan.partial], [{ types: ["fire"] }, { type: "fire", value: 5 }, undefined]);
    assert.match(readiedWords(cloak.plan), /a flat check now to end persistent fire damage/);
});

test("half the triggering attack's damage: Laurel of the Empath's reaction, its readied Effect halving the damage roll as PF2e applies it", async () => {
    const [laurel] = compileActivations(source("Laurel of the Empath"));
    assert.deepEqual([laurel.plan.builtin, laurel.plan.bonus.halfDamage, laurel.plan.bonus.against, laurel.plan.partial], ["readied-bonus", true, true, undefined]);
    assert.match(readiedWords(laurel.plan), /half damage from the triggering attack/);
    const { before } = await import("../scripts/half-damage.js");
    const actor = { itemTypes: { effect: [{ flags: { [MODULE_ID]: { rollTwice: { halfDamage: true } } } }] } };
    assert.deepEqual(before(actor, { damage: 15 }).params.damage, 7);
    assert.equal(before({ itemTypes: { effect: [] } }, { damage: 15 }), null);
});
