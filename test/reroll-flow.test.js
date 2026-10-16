// An item that rerolls the roll that triggered it, against the stand-in for Foundry: its card finds the user's latest
// matching roll in the chat (or the latest attack at them) and PF2e rerolls it, keeping the result the item says.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readReroll } from "../src/compiler/rerolls.js";
import { bonusReroll, degreeOf, triggeringRoll } from "../src/live/reroll-card.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 110 squares down.)
const foundry = await fakeFoundry();
const hero = foundry.makeActor({ id: "reroll-hero", name: "Hero", owners: ["player"] });
const brute = foundry.makeActor({ id: "reroll-brute", name: "Brute" });
foundry.place(hero, 0, 11000);
foundry.place(brute, 100, 11000);

const roll = (actor, type, extra = {}) => foundry.makeMessage({ flags: { pf2e: { context: { type, outcome: "failure", ...extra } } }, speaker: { actor: actor.id }, actor });

async function useCard(name) {
    const item = foundry.giveItem(hero, source(name));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: item.type } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("the reading: what's rerolled, which result is kept, and what isn't read", () => {
    assert.deepEqual(compileItem(source("Lucky Rabbit's Foot")).reroll, { what: "save", keep: "new", who: "self", statistic: "reflex", after: "If you fail the second roll as well, you can Stride up to your Speed." });
    assert.deepEqual(compileActivations(source("Starfaring Cloak")).find((entry) => entry.plan?.builtin === "reroll").plan.reroll, { what: "roll", keep: "higher", who: "self" });
    assert.deepEqual(compileActivations(source("Mail of Luck"))[0].plan.reroll, { what: "attack", keep: "lower", who: "attacker" });
    // A bonus on the reroll: the card's own roll; a companion's: the creature targeted.
    assert.deepEqual(compileActivations(source("Redsand Hourglass")).find((entry) => entry.plan?.builtin === "reroll").plan.reroll.bonus, { value: 4, type: "circumstance" });
    assert.equal(compileActivations(source("Navaratna of the Solar Ruby")).find((entry) => entry.plan?.builtin === "reroll").plan.reroll.who, "companion");
    // A later blessing, a table's reroll, allies' after the user's own: not read.
    for (const name of ["Old Tillimaquin", "Pistol of Wonder"]) assert.equal(compileActivations(source(name)).some((entry) => entry.plan?.builtin === "reroll"), false, name);
    assert.equal(readReroll(source("Beckoning Cat Amulet").system.description.value), null);
    // The search: newest first, not a reroll already, the user's own (or an attack at them).
    const messages = [{ id: "a", type: "saving-throw", actorUuid: "Actor.x" }, { id: "b", type: "saving-throw", actorUuid: "Actor.x", isReroll: true }, { id: "c", type: "skill-check", actorUuid: "Actor.x" }, { id: "d", type: "attack-roll", actorUuid: "Actor.y", targetActorUuid: "Actor.x" }];
    assert.equal(triggeringRoll(messages, { what: "save", who: "self" }, { actorUuid: "Actor.x" }), "a");
    assert.equal(triggeringRoll(messages, { what: "roll", who: "self" }, { actorUuid: "Actor.x" }), "c");
    assert.equal(triggeringRoll(messages, { what: "attack", who: "attacker" }, { actorUuid: "Actor.x" }), "d");
});

test("Lucky Rabbit's Foot rerolls the user's latest save; with none, the card says so", async () => {
    const empty = await useCard("Lucky Rabbit's Foot");
    const errors = foundry.notifications.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: empty.id, userId: "player" });
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /No reflex saving throw by Hero to reroll/.test(text)));
    const save = roll(hero, "saving-throw", { domains: ["saving-throw", "reflex"] });
    roll(hero, "saving-throw", { domains: ["saving-throw", "will"] });
    roll(brute, "saving-throw", { domains: ["saving-throw", "reflex"] });
    const card = await useCard("Lucky Rabbit's Foot");
    assert.match(card.content, /If you fail the second roll as well/);
    const before = foundry.rerolls.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const [done] = foundry.rerolls.slice(before);
    assert.equal(done.message.id, save.id, "the hero's Reflex save: not the later Will save, nor the brute's");
    assert.deepEqual(done.options, {}, "keep the new result, as PF2e's own Keep new");
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("Mail of Luck makes the attacker reroll the latest attack at its wearer, keeping the lower", async () => {
    const attack = roll(brute, "attack-roll", { target: { actor: hero.uuid, token: hero.token.uuid } });
    const mail = foundry.giveItem(hero, source("Mail of Luck"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: mail.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "reroll");
    const before = foundry.rerolls.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const [done] = foundry.rerolls.slice(before);
    assert.equal(done.message.id, attack.id);
    assert.deepEqual(done.options, { keep: "lower" });
});

test("a reroll with a bonus: the card's own roll, the old modifier plus the bonus, its degree against the same DC; PF2e's message unchanged", async () => {
    assert.equal(degreeOf({ total: 25, dc: 15 }), 3);
    assert.equal(degreeOf({ total: 15, dc: 15, natural: 1 }), 1, "a natural 1 one step worse");
    assert.deepEqual(bonusReroll({ oldTotal: 14, oldNatural: 5, newNatural: 3, bonus: 2, dc: 20, keep: "higher" }), { total: 14, modifier: 9, degree: 1, oldDegree: 1, kept: "old" });
    // Redsand Hourglass, after a failed save of 15 (a natural 6, so +9) against DC 22: 10 + 9 + 4 = 23, a success.
    const save = roll(hero, "saving-throw", { dc: { value: 22 }, domains: ["saving-throw", "will"] });
    save.rolls = [{ total: 15, dice: [{ total: 6 }] }];
    const hourglass = foundry.giveItem(hero, source("Redsand Hourglass"));
    const index = compileActivations(source("Redsand Hourglass")).find((entry) => entry.plan?.builtin === "reroll").index;
    const count = foundry.messages.length;
    const rerolls = foundry.rerolls.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: hourglass.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "reroll");
    assert.match(card.content, /rerolled with a \+4 circumstance bonus/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    assert.equal(foundry.rerolls.length, rerolls, "not PF2e's reroll");
    assert.match(card.content, /Hero&#39;s reroll: 23 \(10 \+ 9 \+ 4 circumstance\) against DC 22 \(a success\); the first roll was 15 \(a failure\)/);
    assert.match(card.content, /The new result stands/);
});

test("a change to the roll already made: its degree changed, or its total raised and graded again, for the GM", async () => {
    const { raisedResult } = await import("../src/live/reroll-card.js");
    // "If you failed the saving throw, it becomes a success. If you critically failed, it becomes a failure instead."
    const breastplate = compileActivations(source("Breastplate of the Mountain")).find((entry) => entry.plan?.reroll?.raise).plan.reroll;
    assert.deepEqual(breastplate, { what: "save", keep: "new", who: "self", statistic: "fortitude", raise: { change: { failure: "success", criticalFailure: "failure" } } });
    // "You would miss with an attack … +2 circumstance bonus to your attack roll, possibly turning a miss into a hit."
    const arrowhead = compileActivations(source("Hunter's Arrowhead"))[0].plan.reroll;
    assert.deepEqual([arrowhead.what, arrowhead.raise.bonus], ["attack", { value: 2, type: "circumstance" }]);
    assert.deepEqual(raisedResult({ oldTotal: 17, oldNatural: 9, dc: 18, raise: arrowhead.raise }), { degree: 2, total: 19, before: 1, added: 2 });
    assert.deepEqual(raisedResult({ oldTotal: 8, dc: 18, oldDegree: 0, raise: breastplate.raise }).degree, 1);
    // A before-the-roll "You automatically succeed at your save": PF2e's AdjustDegreeOfSuccess, not this card.
    assert.deepEqual(compileActivations(source("Robe of the Archmagi"))[0].plan.bonus.degree, { selector: "saving-throw", adjustment: { failure: "to-success", criticalFailure: "to-success" } });
    // The card: the user's latest Fortitude save, a failure → a success.
    const save = roll(hero, "saving-throw", { domains: ["fortitude", "saving-throw"], dc: { value: 20 } });
    save.rolls = [{ total: 15, dice: [{ total: 8 }] }];
    const plate = foundry.giveItem(hero, source("Breastplate of the Mountain"));
    const index = compileActivations(source("Breastplate of the Mountain")).findIndex((entry) => entry.plan?.reroll?.raise);
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: plate.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "reroll");
    assert.match(card.content, /a failure becomes a success/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.match(card.content, /a failure becomes a success\./);
    assert.match(card.content, /the GM uses this result/);
});

test("degree changes in more words: The Paladin's \"up by one degree of success\", Laurel of the Empath's \"Treat the failed saving throw as a success\"", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const paladin = compileActivations(source("The Paladin")).find((entry) => entry.plan?.builtin === "reroll").plan;
    assert.deepEqual([paladin.reroll.what, paladin.reroll.raise.change], ["save", { criticalFailure: "failure", failure: "success", success: "criticalSuccess" }]);
    const laurel = compileActivations(source("Laurel of the Empath")).find((entry) => entry.plan?.builtin === "reroll").plan;
    assert.deepEqual(laurel.reroll.raise.change, { failure: "success" });
});
