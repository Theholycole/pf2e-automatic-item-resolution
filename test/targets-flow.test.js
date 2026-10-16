// What an item grants others, against the stand-in for Foundry: the reading ("You and all allies within a 60-foot emanation
// gain …", "Up to 5 creatures of your choice within 30 feet regain …", "a creature you touch") as the recipient "targets",
// and the item card giving its Effect and its healing to each creature the presser targets.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { grantsOthers } from "../src/compiler/consumables.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 220 squares down.)
const foundry = await fakeFoundry();
const piper = foundry.makeActor({ id: "allies-piper", name: "Piper", owners: ["player"] });
const ally = foundry.makeActor({ id: "allies-ally", name: "Ally" });
const other = foundry.makeActor({ id: "allies-other", name: "Other" });
foundry.place(piper, 0, 22000);
foundry.place(ally, 100, 22000);
foundry.place(other, 200, 22000);

test("the reading: granted to allies or another creature, or not", () => {
    const [salute] = compileActivations(source("Warpipes"));
    assert.equal(salute.plan.item.recipient, "targets");
    assert.equal(compileItem(source("Therapeutic Snap Peas")).item.recipient, "targets");
    assert.equal(compileActivations(source("Warleader's Bulwark"))[0].plan.item.recipient, "targets");
    for (const text of ["Effect You grant allies within 100 feet a +2 status bonus to saves against fear effects for 1 minute.", "Effect Choose a willing ally you can see within 30 feet. The ally gains a +2 status bonus.", "Effect All allies within 60 feet who can see the crosier receive a +1 status bonus to Fortitude saves."]) assert.equal(grantsOthers(text), true, text);
    // One creature: "a creature you touch" (Commander's Signet), "Choose an adjacent creature … that creature takes" (Chatterer
    // of Follies), "a single target you touch" (Razmiri Mask), "granting your companion" (Barding of the Zephyr), "Both you
    // and the triggering enemy" (Medic's Armband).
    for (const name of ["Commander's Signet", "Chatterer of Follies", "Razmiri Mask", "Barding of the Zephyr", "Medic's Armband"]) assert.equal(compileActivations(source(name))[0].plan.item.recipient, "targets", name);
    // Healing for the creature the weapon last damaged (Digly's Oil of Sympathy), not its user.
    assert.equal(compileItem(source("Digly's Oil of Sympathy (Lesser)")).item.recipient, "targets");
    // Not: its attack's degree rows (Doom Switch), the user's own, an aura Effect PF2e spreads from its user (Searing Blade).
    assert.equal(grantsOthers("Effect You attempt to Strike a significant enemy. Critical Success You and your allies gain a +1 status bonus to attack rolls against the target for 1 minute."), false);
    assert.equal(grantsOthers("Effect You gain a +1 status bonus to AC for 1 minute."), false);
    assert.equal(compileActivations(source("Searing Blade (Greater)")).find((entry) => entry.activation.name === "Radiate Flames")?.plan?.item?.recipient ?? "user", "user");
});

test("Warpipes' Inspirational Salute: its Effect on each creature targeted; with none targeted, nothing", async () => {
    const pipes = foundry.giveItem(piper, source("Warpipes"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: pipes.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /Target the creatures it helps/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [] });
    await settle();
    assert.equal(card.flags[MODULE_ID].card.status, "open");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [piper.token.uuid, ally.token.uuid] });
    await settle();
    const has = (actor) => actor.created.some((entry) => entry.name === "Effect: Inspirational Salute");
    assert.deepEqual([has(piper), has(ally), has(other)], [true, true, false]);
    assert.ok(card.flags[MODULE_ID].card.results.some((line) => /^Ally gains Effect: Inspirational Salute/.test(line)), card.flags[MODULE_ID].card.results.join(" | "));
});

test("Therapeutic Snap Peas: PF2e's healing roll for each creature targeted, and the Effect", async () => {
    piper.system.attributes.hp.value = 2;
    ally.system.attributes.hp.value = 4;
    const peas = foundry.giveItem(piper, source("Therapeutic Snap Peas"));
    const data = peas.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: peas.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, rolls: [{ total: 25 }], speaker: { actor: piper.id }, actor: piper, token: piper.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [piper.token.uuid, ally.token.uuid] });
    await settle();
    assert.deepEqual([piper.system.attributes.hp.value, ally.system.attributes.hp.value], [27, 29], "25 each, PF2e's roll");
    assert.ok(ally.created.some((entry) => entry.name === "Effect: Therapeutic Snap Peas"));
});
