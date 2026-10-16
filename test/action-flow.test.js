// An item used by taking a skill action with it, against the stand-in for Foundry: the card rolls PF2e's own action with
// the item's bonus, at the creature targeted, and puts the action's row for the degree on it.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { readItemAction } from "../src/compiler/item-actions.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 120 squares down.)
const foundry = await fakeFoundry();
const thief = foundry.makeActor({ id: "action-thief", name: "Thief", owners: ["player"] });
const mark = foundry.makeActor({ id: "action-mark", name: "Mark" });
foundry.place(thief, 0, 12000);
foundry.place(mark, 100, 12000);

async function useCard(name) {
    const item = foundry.giveItem(thief, source(name));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: item.type } } }, speaker: { actor: thief.id }, actor: thief, token: thief.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("the reading: the action, its bonus, whether it's aimed; not when the item changes the check's maths", () => {
    assert.deepEqual(readItemAction(source("Onyx Panther").system.description.value), { slug: "sneak", name: "Sneak", bonus: { value: 1, type: "item" }, targeted: false, after: "You can move your full Speed (instead of half) on this Sneak action and any others you take this turn." });
    assert.deepEqual(readItemAction(source("Coldstar Pistols").system.description.value)?.bonus, { value: 4, type: "circumstance" });
    // A total of its own (+7 "regardless"), a DC of its own: not PF2e's plain action.
    assert.equal(readItemAction(source("Neophyte's Fipple").system.description.value), null);
    assert.equal(readItemAction(source("Lady's Blessing Oil").system.description.value), null);
});

test("Onyx Panther: PF2e's Sneak with its +1 item bonus, no target needed", async () => {
    const card = await useCard("Onyx Panther");
    assert.equal(card.flags[MODULE_ID].card.kind, "item-action");
    assert.match(card.content, /Sneak with a \+1 item bonus/);
    const before = foundry.actionUses.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    const [use] = foundry.actionUses.slice(before);
    assert.equal(use.slug, "sneak");
    assert.deepEqual(use.options.actors, [thief]);
    assert.deepEqual([use.options.modifiers[0].modifier, use.options.modifiers[0].type, use.options.modifiers[0].label], [1, "item", "Onyx Panther"]);
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("Crying Angel Pendant: Administer First Aid at the target with +1, and a success ends its dying (the ability module's row)", async () => {
    const card = await useCard("Crying Angel Pendant");
    const errors = foundry.notifications.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Target the creature first/.test(text)));
    foundry.nextOutcome.value = "success";
    const before = foundry.applied.length;
    const uses = foundry.actionUses.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [mark.token.uuid], userId: "player" });
    await settle();
    const [use] = foundry.actionUses.slice(uses);
    assert.equal(use.slug, "administer-first-aid");
    assert.equal(use.options.target, mark.token, "at the creature targeted");
    const changes = foundry.applied.slice(before).map((entry) => entry.change);
    assert.ok(changes.length && changes.every((change) => change.target === "target"), JSON.stringify(changes));
    assert.match(card.content, /Thief&#39;s Administer First Aid against Mark: a success/);
    foundry.nextOutcome.value = "success";
});

test("\"You attempt to Demoralize the foe the Strike hit\", \"to attempt to Grapple the creature\": its user's action at one creature", () => {
    const action = (text) => readItemAction(`<p><strong>Effect</strong> ${text}</p>`);
    assert.deepEqual([action("You attempt to Demoralize the foe the Strike hit.").slug, action("You attempt to Demoralize the foe the Strike hit.").targeted], ["demoralize", true]);
    assert.equal(action("You can activate the tiger fork to attempt to Grapple the creature. This attempt uses the same multiple attack penalty as the required Strike.").slug, "grapple");
    assert.equal(action("You attempt to Disarm the creature whose attack you blocked of the weapon they attacked you with.").slug, "disarm");
    // Not the item's own check ("The tentacle attempts to Grapple with a +13 bonus"); a choice of actions is all of them (The Bear).
    assert.equal(action("The tentacle attempts to Grapple with a +13 bonus."), null);
    assert.deepEqual(action("You attempt to Grapple, Shove, or Trip the creature you hit with the successful Strike.").slugs, ["grapple", "shove", "trip"]);
});

test("Twisting Twine: Disarm or Trip at its own +9, picked on the card; the save card is the one picked", async () => {
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const twine = compileActivations(source("Twisting Twine (Lesser)"), { basicActions }).find((entry) => entry.activation.name === "Unravel Twine");
    assert.deepEqual(twine.plan.checkChoices.map((choice) => [choice.label, choice.resolution.check.modifier]), [["Disarm", 9], ["Trip", 9]]);
    const user = foundry.makeActor({ id: "action-twiner", name: "Twiner", owners: ["player"] });
    const foe = foundry.makeActor({ id: "action-twined", name: "Twined" });
    foundry.place(user, 0, 23000);
    foundry.place(foe, 100, 23000);
    const ball = foundry.giveItem(user, source("Twisting Twine (Lesser)"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: ball.uuid, activation: twine.index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.match(card.content, /data-air-field="checkChoice"/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [foe.token.uuid], checkChoice: 1 });
    await settle();
    const posted = foundry.posted.slice(before)[0];
    assert.deepEqual([posted.plan.resolution.check.modifier, posted.plan.resolution.outcomes.success.effects.map((effect) => effect.slug)], [9, twine.plan.checkChoices[1].resolution.outcomes.success.effects.map((effect) => effect.slug)]);
});

test("the item's modifier when it's higher than its user's: PF2e's action with the difference added", async () => {
    // (The module's own wording, after the Alchemists+ plants.)
    const html = "<p><strong>Activate</strong> Trip</p><p>The vine can lend its grip to your Trip. You can use a +7 Athletics modifier for your Trip instead of your Athletics modifier if it is higher than your own.</p>";
    assert.deepEqual(readItemAction(html), { slug: "trip", name: "Trip", bonus: null, minimum: { value: 7, skill: "athletics" }, targeted: true });
    const vine = foundry.giveItem(thief, { _id: "testVineTrip0001", type: "consumable", name: "Test Vine", img: null, system: { category: "other", traits: { value: ["consumable"] }, level: { value: 1 }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: html } } });
    const data = vine.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: vine.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: thief.id }, actor: thief, token: thief.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.match(card.content, /Trip at \+7 Athletics, when that&#39;s higher than your own/);
    // Its user's Athletics is +3: the action gets +4 more.
    thief.getStatistic = (slug) => (slug === "athletics" ? { mod: 3 } : null);
    const before = foundry.actionUses.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [mark.token.uuid], userId: "player" });
    await settle();
    const [use] = foundry.actionUses.slice(before);
    assert.deepEqual([use.slug, use.options.modifiers.map((modifier) => [modifier.modifier, modifier.type])], ["trip", [[4, "untyped"]]]);
    delete thief.getStatistic;
});

test("The Bear and Blade of the Rabbit Prince: one of several actions, picked on the card; the Rabbit Prince's with Thievery and its potency", async () => {
    const bear = compileActivations(source("The Bear"))[0].plan.action;
    assert.deepEqual([bear.slugs, bear.bonus, bear.statistic], [["grapple", "shove", "trip"], { value: 2, type: "status" }, undefined]);
    const rabbit = compileActivations(source("Blade of the Rabbit Prince")).find((entry) => entry.plan?.action?.slugs).plan.action;
    assert.deepEqual([rabbit.slugs, rabbit.bonus, rabbit.statistic], [["trip", "disarm"], { value: 2, type: "item" }, "thievery"]);
    const card = foundry.giveItem(thief, source("The Bear"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: card.uuid, activation: 0, userId: "player" });
    await settle();
    const posted = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item-action");
    assert.match(posted.content, /data-air-field="choice"/);
    const before = foundry.actionUses.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: posted.id, targets: [mark.token.uuid], choice: 2, userId: "player" });
    await settle();
    const [use] = foundry.actionUses.slice(before);
    assert.deepEqual([use.slug, use.options.modifiers[0].modifier, use.options.modifiers[0].type], ["trip", 2, "status"]);
});

test("Grim Trophy: one Demoralize at up to two creatures, PF2e's at the first and the same roll against the second's Will DC", async () => {
    assert.deepEqual([readItemAction(source("Grim Trophy").system.description.value).maxTargets, readItemAction(source("Grim Trophy (Greater)").system.description.value).maxTargets], [2, 3]);
    const second = foundry.makeActor({ id: "action-second", name: "Second" });
    foundry.place(second, 200, 12000);
    second.getStatistic = (slug) => (slug === "will" ? { dc: { value: 15 } } : null);
    const card = await useCard("Grim Trophy");
    foundry.nextOutcome.value = "success";
    foundry.nextOutcome.roll = { total: 25, dice: [{ total: 12 }] };
    const uses = foundry.actionUses.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [mark.token.uuid, second.token.uuid], userId: "player" });
    await settle();
    assert.equal(foundry.actionUses.length - uses, 1, "PF2e's action rolled once");
    // 25 against DC 15: a critical success for the second.
    assert.match(card.content, /Demoralize against Second \(DC 15\): a critical success/);
    delete foundry.nextOutcome.roll;
});

test("more of the words for an action: \"You Seek with a +1 item bonus\", \"Roll an Intimidation check to Demoralize\", one check at every undead around", async () => {
    const { actionCardHTML } = await import("../src/live/action-card.js");
    const lenses = compileActivations(source("Motion-Seeking Lenses"))[0].plan;
    assert.deepEqual([lenses.builtin, lenses.action.slug, lenses.action.bonus, lenses.action.targeted], ["item-action", "seek", { value: 1, type: "item" }, false]);
    const veil = compileActivations(source("Smoke Veil"))[0].plan;
    assert.deepEqual([veil.action.slug, veil.action.bonus, veil.action.targeted], ["demoralize", null, true]);
    // Horn of Exorcism: Demoralize at each undead or unholy creature in 30 feet, one roll against each one's Will DC.
    const horn = compileActivations(source("Horn of Exorcism"))[0].plan;
    assert.deepEqual([horn.action.slug, horn.action.maxTargets, horn.action.everyone], ["demoralize", 99, "all creatures with the undead or unholy trait within 30 feet"]);
    assert.match(horn.action.after, /mindless creature/);
    const html = actionCardHTML({ status: "open", plan: horn, user: { name: "Thief" }, item: { name: "Horn of Exorcism" }, results: [] }, { canApply: true });
    assert.match(html, /Target all creatures with the undead or unholy trait within 30 feet \(one roll against each one's DC\), then press the button\./);
});

test("its owner's numbers in its text: Wolf Fang's Strength damage; Bracers of Strength's Grapple, then its crush (double on a critical success)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    // Unknown owner (a census, the simulator): nothing read from "@actor"; known: the number.
    assert.equal(compileItem(source("Wolf Fang")), null);
    const fang = compileItem({ ...source("Wolf Fang"), ownerAbilities: { str: 4 } });
    assert.deepEqual([fang.resolution.check.roll, fang.resolution.sharedDamage.components[0].formula, fang.targeting.target], ["automatic", "4[bludgeoning]", "1 creature"]);
    // Live: PF2e's Grapple from the activation, and on a critical success the ability module's card for 10 bludgeoning at the target.
    thief.abilities = { str: { mod: 5 } };
    const bracers = foundry.giveItem(thief, source("Bracers of Strength"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: bracers.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item-action");
    assert.deepEqual([card.flags[MODULE_ID].card.plan.action.slug, Object.keys(card.flags[MODULE_ID].card.plan.action.damage)], ["grapple", ["success", "criticalSuccess"]]);
    foundry.nextOutcome.value = "criticalSuccess";
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [mark.token.uuid], userId: "player" });
    await settle();
    const [crush] = foundry.posted.slice(before);
    assert.deepEqual([crush.plan.resolution.sharedDamage.components[0].formula, crush.plan.resolution.sharedDamage.components[0].type, crush.cause], ["10", "bludgeoning", "a critical success"]);
    foundry.nextOutcome.value = "success";
    delete thief.abilities;
});

test("Buzzsaw Axe: its line's basic Reflex save at the weapon's own Strike damage, its owner's Strength with it", () => {
    const axe = source("Buzzsaw Axe");
    assert.equal(compileActivations(axe)[0].plan, null, "no owner known: nothing to read");
    const plan = compileActivations({ ...axe, ownerAbilities: { str: 4 } })[0].plan;
    assert.deepEqual([plan.resolution.check.basic, plan.resolution.check.against.value, plan.resolution.sharedDamage.components[0].formula, plan.targeting.area], [true, 28, "(2d8+4)[slashing]", { type: "line", value: 120 }]);
});
