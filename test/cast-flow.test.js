// Items that cast a spell PF2e has no Effect for, against the stand-in for Foundry: the card, and Apply asking the
// spell module (api.castFromItem) to cast it on the drinker, on the user, or at the presser's targets.

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

// (Shared with the other flow tests: these creatures stand 60 squares down.)
const foundry = await fakeFoundry();
const sneak = foundry.makeActor({ id: "cast-sneak", name: "Sneak", owners: ["player"] });
const buddy = foundry.makeActor({ id: "cast-buddy", name: "Buddy" });
foundry.place(sneak, 0, 6000);
foundry.place(buddy, 100, 6000);

async function use(actor, item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("an invisibility potion fed to the creature next to the user: the spell module casts it on that drinker", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.kind, "cast");
    assert.deepEqual(state.drinkers.map((entry) => entry.name), ["Sneak", "Buddy"]);
    assert.match(card.content, /Invisibility \(rank 2\)/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "player" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.equal(cast.actor, buddy, "the drinker casts it");
    assert.equal(cast.spell, "Compendium.pf2e.spells-srd.Item.XXqE1eY3w3z6xJCB");
    assert.equal(cast.rank, 2);
    assert.deepEqual(cast.targets.map((token) => token.uuid), [buddy.token.uuid], "on itself");
    assert.equal(cast.item.name, "Invisibility Potion");
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("a counteract modifier the item states goes with the cast", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Truesight Potion")));
    assert.match(card.content, /counteract \+25/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.actor, cast.rank, cast.counteract], [sneak, 7, 25]);
});

test("without the spell module, the card says to cast it by hand", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const { castFromItem } = foundry.spell;
    delete foundry.spell.castFromItem;
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
        await settle();
        assert.match(card.flags[MODULE_ID].card.results[0], /Cast Invisibility by hand at rank 2/);
    } finally {
        foundry.spell.castFromItem = castFromItem;
    }
});
