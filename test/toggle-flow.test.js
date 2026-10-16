// An activation that sets one of the item's own PF2e toggles, against the stand-in for Foundry: the reading (the ability
// compiler's ways, each a roll-option), its card's picker, and Set switching PF2e's RollOption to the way picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { createToggleCard, isToggle, toggleRequest } from "../src/live/toggle-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 210 squares down.)
const foundry = await fakeFoundry();
const wielder = foundry.makeActor({ id: "toggle-wielder", name: "Wielder", owners: ["player"] });
foundry.place(wielder, 0, 21000);

test("the reading: ways that are each one of the item's toggles; the card starts on the activation's own", () => {
    const [twist] = compileActivations(source("Four-Ways Dogslicer")).filter((entry) => entry.plan?.builtin === "modes");
    assert.equal(routeOf(twist.plan), "toggle");
    assert.equal(isToggle(twist.plan), true);
    const state = createToggleCard({ plan: twist.plan, item: { name: "Four-Ways Dogslicer" }, user: { name: "Wielder" } });
    assert.deepEqual(state.ways.map((way) => way.suboption), ["flaming", "frost", "shock"]);
    assert.deepEqual(toggleRequest({ ...state, choice: 1 }, { rules: source("Four-Ways Dogslicer").system.rules, itemId: "x" }), { domain: "all", option: "gem-twist", itemId: "x", value: true, suboption: "frost", name: "Frost" });
    // Pharasmin Visor's "Reveal the Unseen" activation starts on that way.
    const visor = compileActivations(source("Pharasmin Visor")).find((entry) => entry.activation.name === "Reveal the Unseen");
    assert.equal(createToggleCard({ plan: visor.plan, item: { name: "Pharasmin Visor" }, user: { name: "Wielder" } }).choice, 1);
});

test("Four-Ways Dogslicer's Gem Twist: Set has PF2e switch the item's toggle to the way picked", async () => {
    const blade = foundry.giveItem(wielder, source("Four-Ways Dogslicer"));
    const index = compileActivations(source("Four-Ways Dogslicer")).findIndex((entry) => entry.plan?.builtin === "modes");
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: blade.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "toggle");
    assert.ok(card, "the toggle card");
    assert.match(card.content, /data-air-field="choice"/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, choice: 2, userId: "player" });
    await settle();
    assert.deepEqual(wielder.toggled.at(-1), { domain: "all", option: "gem-twist", itemId: blade.id, value: true, suboption: "shock" });
    assert.match(card.content, /Wielder: Four-Ways Dogslicer set to/);
});
