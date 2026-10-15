// An item used by taking a skill action with it, against the stand-in for Foundry: the card rolls PF2e's own action with
// the item's bonus, at the creature targeted, and puts the action's row for the degree on it.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { readItemAction } from "../src/compiler/item-actions.js";

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
