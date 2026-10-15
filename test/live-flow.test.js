// scripts/live.js end to end against a stand-in for Foundry (test/support/fake-foundry.mjs):
// PF2e's Use message → the item card → Apply, as the active GM or relayed from a player.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

const foundry = await fakeFoundry();

const valeros = foundry.makeActor({ id: "valeros", name: "Valeros", owners: ["player"] });
const kyra = foundry.makeActor({ id: "kyra", name: "Kyra", hp: 0, conditions: ["dying", "unconscious"] });
const ezren = foundry.makeActor({ id: "ezren", name: "Ezren" });
foundry.place(valeros, 0, 0);
foundry.place(kyra, 100, 0);
foundry.place(ezren, 500, 0);

// PF2e's own "uses X" message for an item, with its roll when it has one.
async function use(actor, item, { roll = null } = {}) {
    const data = item.toObject();
    const message = foundry.makeMessage({
        flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } },
        rolls: roll === null ? [] : [{ total: roll }],
        speaker: { actor: actor.id },
        actor,
        token: actor.token.document
    });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

const cardAfter = (message) => foundry.messages[foundry.messages.indexOf(message) + 1];
const stateOf = (card) => card?.flags?.[MODULE_ID]?.card;

test("an elixir of life fed to a dying ally next to the user: PF2e's roll heals her, Dying ends, the Effect is the minor grade", async () => {
    const elixir = foundry.giveItem(valeros, source("Elixir of Life (Minor)"));
    const message = await use(valeros, elixir, { roll: 4 });
    const card = cardAfter(message);
    const state = stateOf(card);
    assert.ok(state, "a card follows PF2e's message");
    assert.deepEqual(state.drinkers.map((entry) => entry.name), ["Valeros", "Kyra"], "the user and the creature next to them, not one 25 feet away");
    assert.equal(state.rolled.total, 4);
    assert.equal(message.flags.pf2e.suppressDamageButtons, true, "PF2e's apply buttons come off its message");
    assert.equal(message.flags[MODULE_ID].covered, card.id);
    assert.match(card.content, /Heals 4 Hit Points/);

    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "gm" });
    await settle();
    assert.deepEqual(kyra.healed.map((entry) => entry.damage), [-4], "healed through applyDamage by PF2e's roll, once");
    assert.deepEqual(valeros.healed, [], "not the user");
    assert.equal(kyra.system.attributes.hp.value, 4);
    assert.equal(kyra.hasCondition("dying"), false);
    assert.equal(kyra.hasCondition("unconscious"), false);
    assert.equal(kyra.getCondition("wounded")?.value, 1);
    const effect = kyra.created.find((entry) => entry.name === "Effect: Elixir of Life");
    assert.ok(effect, "the Effect is on Kyra");
    assert.equal(effect.system.rules.find((rule) => rule.key === "ChoiceSet").selection, `Compendium.pf2e.equipment-srd.Item.${source("Elixir of Life (Minor)")._id}`);
    assert.deepEqual(effect.system.context.origin, { ...(effect.system.context.origin ?? {}), actor: valeros.uuid, token: valeros.token.uuid, item: elixir.uuid });
    const done = stateOf(card);
    assert.equal(done.status, "applied");
    assert.ok(done.results.some((line) => /Kyra regains 4 Hit Points, PF2e's roll/.test(line)), done.results.join(" | "));
    assert.ok(done.results.some((line) => /No longer dying/.test(line)), done.results.join(" | "));
    assert.ok(done.results.includes("Kyra gains Effect: Elixir of Life"));

    // A second Apply does nothing.
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "gm" });
    await settle();
    assert.equal(kyra.healed.length, 1);
});

test("a player's Apply is made by the GM's client only when the player owns the item's user", async () => {
    const potion = foundry.giveItem(valeros, source("Healing Potion (Minor)"));
    const card = cardAfter(await use(valeros, potion, { roll: 3 }));
    const before = valeros.system.attributes.hp.value;
    // Ezren's owner would be someone else: a request from a user who doesn't own Valeros is ignored.
    const stranger = foundry.makeActor({ id: "stranger", name: "Stranger" });
    const strangerPotion = foundry.giveItem(stranger, source("Healing Potion (Minor)"));
    const strangerCard = cardAfter(await use(stranger, strangerPotion, { roll: 5 }));
    await foundry.socket(SOCKET)({ action: "apply", messageId: strangerCard.id, drinker: 0, userId: "player" });
    await settle();
    assert.equal(stateOf(strangerCard).status, "open", "not the player's");
    assert.deepEqual(stranger.healed, []);
    // Valeros is the player's: applied, to Valeros (drinker 0, the user).
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    assert.equal(stateOf(card).status, "applied");
    assert.equal(valeros.system.attributes.hp.value, before + 3);
    // On a player's client, the socket handler does nothing (only the active GM's acts).
    foundry.actAs("player");
    const other = cardAfter(await use(valeros, foundry.giveItem(valeros, source("Healing Potion (Minor)")), { roll: 2 }));
    assert.equal(other, undefined, "no card is posted from a player's client");
    foundry.actAs("gm");
});

test("the last dose: its card comes from the item PF2e just deleted", async () => {
    const elixir = foundry.giveItem(valeros, source("Darkvision Elixir (Lesser)"));
    // PF2e deletes the item before the GM's client sees the message.
    await foundry.call("deleteItem", { type: "consumable", uuid: elixir.uuid, actor: valeros, toObject: elixir.toObject });
    foundry.forget(elixir.uuid);
    const card = cardAfter(await use(valeros, elixir));
    assert.equal(stateOf(card)?.item.name, "Darkvision Elixir (Lesser)");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
    await settle();
    assert.ok(valeros.created.some((entry) => entry.name === "Effect: Darkvision Elixir (Lesser)"));
});

test("the item's own row goes through the ability module's applyChange, on the drinker", async () => {
    const mist = foundry.giveItem(valeros, source("Mistform Elixir (Greater)"));
    const card = cardAfter(await use(valeros, mist));
    assert.match(card.content, /concealed for 5 minutes/);
    const before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "gm" });
    await settle();
    const [call] = foundry.applied.slice(before);
    assert.equal(call.change.op, "condition");
    assert.equal(call.change.slug, "concealed");
    assert.deepEqual(call.state.targets, [{ id: "drinker", actorUuid: kyra.uuid, tokenUuid: kyra.token.uuid, name: "Kyra" }]);
    assert.equal(call.state.source.actorUuid, valeros.uuid);
    assert.ok(stateOf(card).results.includes("ability applied condition"));
});

test("no card for an item with no plan (Ration Tonic), nor for PF2e's other messages", async () => {
    const count = foundry.messages.length;
    await use(valeros, foundry.giveItem(valeros, source("Ration Tonic")));
    const check = foundry.makeMessage({ flags: { pf2e: { context: { type: "skill-check" }, origin: { type: "consumable", uuid: "x" } } } });
    await foundry.call("createChatMessage", check);
    await settle();
    assert.equal(foundry.messages.length, count + 2, "only the two messages themselves");
});
