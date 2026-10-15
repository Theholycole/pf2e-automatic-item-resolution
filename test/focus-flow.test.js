// An activation that gives a Focus Point, against the stand-in for Foundry: the activations card, its Focus Point card,
// Apply (up to the pool's maximum, a note of what it's only for), and the point lost at the end of the turn if unspent.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { focusText, poolAfter, unspent } from "../src/live/focus-card.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 90 squares down.)
const foundry = await fakeFoundry();
const witch = foundry.makeActor({ id: "focus-witch", name: "Witch", owners: ["player"], focus: { value: 1, max: 2 } });
foundry.place(witch, 0, 9000);

async function focusCard(actor, name) {
    const item = foundry.giveItem(actor, source(name));
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, type: item.type } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const activations = foundry.messages[foundry.messages.indexOf(message) + 1];
    const index = activations.flags[MODULE_ID].card.activations.find((entry) => compileActivations(source(name))[entry.index].plan?.builtin === "focus-point").index;
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: activations.id, activation: index, userId: "player" });
    await settle();
    return foundry.messages.slice(count).find((entry) => entry.flags?.[MODULE_ID]?.card?.kind === "focus");
}

test("the Focus Point reading: what it's only for, lost at the end of the turn", () => {
    const [robe] = compileActivations(source("Hexing Jar"));
    assert.deepEqual(robe.plan.focus, { amount: 1, only: "cast a witch hex spell", lost: "turn-end" });
    assert.equal(focusText(robe.plan.focus), "1 Focus Point, only to cast a witch hex spell; lost at the end of the turn if not spent");
    const tome = compileActivations(source("Crimson Tome")).find((entry) => entry.plan?.builtin === "focus-point");
    assert.deepEqual(tome.plan.focus, { amount: 1, only: null, lost: null });
    // Spent at once on a spell: not a gain to play.
    assert.ok(!compileActivations(source("Harmonic Hauberk")).some((entry) => entry.plan?.builtin === "focus-point"));
    assert.deepEqual(poolAfter({ value: 2, max: 2 }, 1), { value: 2, gained: 0, max: 2, reason: "full" });
    assert.deepEqual(poolAfter({ value: 0, max: 0 }, 1).reason, "no-pool");
    assert.equal(unspent({ before: 1, gained: 1 }, { value: 2 }), 1);
    assert.equal(unspent({ before: 1, gained: 1 }, { value: 1 }), 0, "spent");
});

test("in an encounter: the point gained, its note, and taken back at the end of the turn when unspent", async () => {
    const combatant = { id: "c-witch", actor: witch, actorId: witch.id };
    globalThis.game.combat = { id: "fight", started: true, round: 1, combatant, combatants: [combatant] };
    try {
        const card = await focusCard(witch, "Hexing Jar");
        assert.ok(card, "the Focus Point card");
        assert.match(card.content, /only to cast a witch hex spell/);
        const before = foundry.applied.length;
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        assert.equal(witch.system.resources.focus.value, 2);
        assert.deepEqual(witch.getFlag(MODULE_ID, "focusGrant"), { before: 1, gained: 1, combatId: "fight", combatantId: "c-witch", item: "Hexing Jar" });
        const note = foundry.applied.slice(before).find((entry) => entry.change.effect?.kind === "note");
        assert.equal(note.change.effect.note.duration.expiry, "turn-end");
        assert.match(card.content, /gains 1 Focus Point \(2 of 2\)/);
        // Unspent at the end of the witch's turn: lost.
        await foundry.call("pf2e.endTurn", combatant, globalThis.game.combat);
        assert.equal(witch.system.resources.focus.value, 1);
        assert.equal(witch.getFlag(MODULE_ID, "focusGrant"), undefined);
        assert.match(foundry.messages.at(-1).content, /unspent Focus Point is lost/);
    } finally {
        globalThis.game.combat = null;
    }
});

test("a full pool gains nothing; out of an encounter the point stays for the table to take back", async () => {
    witch.system.resources.focus.value = 2;
    const full = await focusCard(witch, "Hexing Jar");
    await foundry.socket(SOCKET)({ action: "apply", messageId: full.id, userId: "player" });
    await settle();
    assert.equal(witch.system.resources.focus.value, 2);
    assert.match(full.content, /focus pool is full/);
    witch.system.resources.focus.value = 0;
    const card = await focusCard(witch, "Hexing Jar");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(witch.system.resources.focus.value, 1);
    assert.equal(witch.getFlag(MODULE_ID, "focusGrant"), undefined);
    assert.match(card.content, /Not in an encounter/);
});
