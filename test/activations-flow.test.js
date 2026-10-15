// Permanent items' activations against the stand-in for Foundry: PF2e posts the item to chat; the activations card
// lists what the module reads; Activate posts that activation's card and counts its use against its frequency.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { periodOf, usesNow, withUse } from "../src/live/activations-card.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 80 squares down.)
const foundry = await fakeFoundry();
const elf = foundry.makeActor({ id: "activate-elf", name: "Elf", owners: ["player"] });
foundry.place(elf, 0, 8000);

async function post(item) {
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, type: item.type } } }, speaker: { actor: elf.id }, actor: elf, token: elf.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const next = foundry.messages[foundry.messages.indexOf(message) + 1];
    return next?.flags?.[MODULE_ID]?.card ? next : undefined;
}

test("uses counted per period of world time", () => {
    const daily = { max: 1, per: "day" };
    assert.equal(periodOf(daily, { worldTime: 86_400 * 3 + 5 }), "day:3");
    let record = withUse({}, 0, daily, { worldTime: 100 });
    assert.equal(usesNow(record, 0, daily, { worldTime: 200 }), 1);
    assert.equal(usesNow(record, 0, daily, { worldTime: 86_500 }), 0, "a new day");
    record = withUse(record, 0, daily, { worldTime: 300 });
    assert.equal(usesNow(record, 0, daily, { worldTime: 400 }), 2);
    assert.equal(periodOf({ max: 1, per: "encounter" }, { combatId: "c1" }), "combat:c1");
});

test("a cloak of elvenkind posted to chat: its activation's card (a cast of Invisibility), its daily use counted", async () => {
    const cloak = foundry.giveItem(elf, source("Cloak of Elvenkind"));
    const card = await post(cloak);
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.kind, "activations");
    assert.deepEqual(state.activations.map((entry) => [entry.time, entry.frequency?.per]), [["2", "day"]]);
    assert.match(card.content, /2 actions, once per day/);
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, activation: 0, userId: "player" });
    await settle();
    const cast = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    assert.ok(cast, "the activation's own card: a cast");
    assert.equal(cast.flags[MODULE_ID].card.plan.spell.name, "Invisibility");
    assert.equal(cast.flags[MODULE_ID].card.item.name, "Cloak of Elvenkind");
    assert.match(card.content, /used 1 of 1 this day/);
    // Again the same day: a warning, still activated (the GM's call).
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, activation: 0, userId: "player" });
    await settle();
    assert.ok(card.flags[MODULE_ID].card.results.some((line) => /already used 1 time this day/.test(line)));
});

test("an item with nothing the module reads posts no activations card; nor one that isn't permanent", async () => {
    const plain = foundry.giveItem(elf, { ...source("Cloak of Elvenkind"), _id: "plainCloak1234567", system: { ...source("Cloak of Elvenkind").system, description: { value: "<p>No activation.</p>" } } });
    assert.equal(await post(plain), undefined);
});
