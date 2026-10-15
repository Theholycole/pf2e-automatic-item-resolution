// An item that lowers a condition its user has, against the stand-in for Foundry: the reading (Lion Badge's "reduce the
// value of your frightened condition by 1"), what isn't one, and the item card lowering it with PF2e's decreaseCondition.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readReductions } from "../src/compiler/reduce.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 180 squares down.)
const foundry = await fakeFoundry();
const scout = foundry.makeActor({ id: "reduce-scout", name: "Scout", owners: ["player"] });
foundry.place(scout, 0, 18000);

async function use(item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: scout.id }, actor: scout, token: scout.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("the reading: the user's conditions it lowers, and what isn't one", () => {
    const badge = compileItem(source("Lion Badge"));
    assert.equal(routeOf(badge), "item");
    assert.deepEqual(badge.item.reduce, [{ slug: "frightened", by: 1 }]);
    // An activation: Coin of Comfort's "You reduce your Frightened condition by 1".
    assert.deepEqual(compileActivations(source("Coin of Comfort"))[0].plan.item.reduce, [{ slug: "frightened", by: 1 }]);
    // What else it says, as a note: Cinnamon Nostalgia Bun's flat check.
    assert.match(compileItem(source("Cinnamon Nostalgia Bun")).notes.join(" "), /flat check/);
    // Not one: a later Secondary Effect (Ginger Chew), "if successful" (Moon Radish Soup's counteract), an area, a passive.
    assert.equal(compileItem(source("Ginger Chew")).item.reduce, undefined);
    assert.equal(compileItem(source("Moon Radish Soup")).item.reduce, undefined);
    assert.deepEqual(readReductions("You and each ally in a 5-foot emanation reduce your Frightened values by 1."), []);
    assert.deepEqual(readReductions("Whenever you become Frightened, reduce your frightened value by 1."), []);
});

test("Lion Badge: Apply lowers the user's frightened by 1; with none, the card says so", async () => {
    scout.conditions.set("frightened", 2);
    const card = await use(foundry.giveItem(scout, source("Lion Badge")));
    assert.equal(card.flags[MODULE_ID].card.kind, "item");
    assert.match(card.content, /Lowers frightened by 1/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(scout.conditions.get("frightened"), 1);
    assert.match(card.content, /Scout&#39;s frightened lowered to 1/);
    scout.conditions.delete("frightened");
    scout.conditions.delete("sickened");
    const poultice = await use(foundry.giveItem(scout, source("Pepper Poultice")));
    await foundry.socket(SOCKET)({ action: "apply", messageId: poultice.id, userId: "player" });
    await settle();
    assert.match(poultice.content, /isn&#39;t sickened: nothing to lower/);
});
