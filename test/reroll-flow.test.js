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
import { triggeringRoll } from "../src/live/reroll-card.js";

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
    // A bonus on the reroll, a later blessing, a table's reroll, a companion's, allies' after the user's own: not read.
    for (const name of ["Redsand Hourglass", "Old Tillimaquin", "Pistol of Wonder", "Navaratna of the Solar Ruby"]) assert.equal(compileActivations(source(name)).some((entry) => entry.plan?.builtin === "reroll"), false, name);
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
