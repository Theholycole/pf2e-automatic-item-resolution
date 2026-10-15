// The bomb card against the stand-in for Foundry: after PF2e's damage roll for a bomb Strike, the splash on the
// creatures within 5 feet of the target (PF2e's own splash-only roll) and the riders for the Strike's degree.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { createFakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

const foundry = createFakeFoundry();
const { setUpLivePlay } = await import("../scripts/live.js");
setUpLivePlay({ compileItem: (data) => compileItem(data) });

const alchemist = foundry.makeActor({ id: "alchemist", name: "Alchemist", owners: ["player"] });
const goblin = foundry.makeActor({ id: "goblin", name: "Goblin" });
const kyra = foundry.makeActor({ id: "kyra", name: "Kyra" });
const boss = foundry.makeActor({ id: "boss", name: "Goblin Boss" });
const far = foundry.makeActor({ id: "far", name: "Far Goblin" });
foundry.place(alchemist, 0, 0);
foundry.place(goblin, 300, 0);
foundry.place(kyra, 400, 0);
foundry.place(boss, 300, 100);
foundry.place(far, 600, 0);

// PF2e's damage message for a bomb Strike: its main roll, then a splash-only roll per damage type (8.6.1).
async function damage(bomb, { outcome, target = goblin, splash = 1, type = "electricity" }) {
    const data = bomb.toObject();
    const message = foundry.makeMessage({
        flags: { pf2e: { context: { type: "damage-roll", outcome, target: { actor: target.uuid, token: target.token.uuid } }, origin: { uuid: bomb.uuid, sourceId: data._stats.compendiumSource, type: "weapon" } } },
        rolls: [{ total: 7, instances: [{ type }] }, ...(splash ? [{ total: splash, options: { splashOnly: true }, instances: [{ type }] }] : [])],
        speaker: { actor: alchemist.id },
        actor: alchemist,
        token: alchemist.token.document
    });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

const cardAfter = (message) => {
    const next = foundry.messages[foundry.messages.indexOf(message) + 1];
    return next?.flags?.[MODULE_ID]?.card ? next : undefined;
};
const stateOf = (card) => card?.flags?.[MODULE_ID]?.card;

test("a bottled lightning hit: splash on the others within 5 feet (one unticked), off-guard on the target", async () => {
    const bomb = foundry.giveItem(alchemist, source("Bottled Lightning (Lesser)"));
    const message = await damage(bomb, { outcome: "success" });
    const card = cardAfter(message);
    const state = stateOf(card);
    assert.equal(state.kind, "bomb");
    assert.deepEqual(state.splashed.map((entry) => [entry.name, entry.include]), [["Kyra", true], ["Goblin Boss", true]], "the creatures within 5 feet of the target, not the target (PF2e's roll splashed it) nor one 15 feet away");
    assert.deepEqual(state.splash, [{ type: "electricity", total: 1 }]);
    assert.match(card.content, /Goblin: off-guard until the start of the thrower&#39;s next turn/);
    assert.deepEqual(message.flags[MODULE_ID].coveredSplash, [1], "the splash-only roll's buttons come off PF2e's message");
    // The player who owns the alchemist unticks Kyra and applies.
    const before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, included: [1], userId: "player" });
    await settle();
    assert.deepEqual(boss.healed.map((entry) => entry.damage), ["(1[splash])[electricity]"]);
    assert.deepEqual(kyra.healed, [], "unticked");
    assert.deepEqual(goblin.healed, [], "the target's damage is PF2e's");
    const [rider] = foundry.applied.slice(before);
    assert.equal(rider.change.op, "condition");
    assert.equal(rider.change.slug, "off-guard");
    assert.equal(rider.change.target, "target");
    assert.deepEqual(rider.state.targets, [{ id: "target", actorUuid: goblin.uuid, tokenUuid: goblin.token.uuid, name: "Goblin" }]);
    const done = stateOf(card);
    assert.equal(done.status, "applied");
    assert.ok(done.results.includes("Goblin Boss takes the splash (1 electricity)"), done.results.join(" | "));
});

test("a miss splashes the target too; a critical miss, nothing", async () => {
    const bomb = foundry.giveItem(alchemist, source("Alchemist's Fire (Lesser)"));
    const miss = cardAfter(await damage(bomb, { outcome: "failure", type: "fire" }));
    assert.deepEqual(stateOf(miss).splashed.map((entry) => entry.name), ["Goblin", "Kyra", "Goblin Boss"]);
    const count = foundry.messages.length;
    await damage(bomb, { outcome: "criticalFailure", type: "fire" });
    assert.equal(foundry.messages.length, count + 1, "no card after a critical miss");
});

test("a critical hit's rider in place of the hit's: a dread ampoule frightens 2", async () => {
    const bomb = foundry.giveItem(alchemist, source("Dread Ampoule (Lesser)"));
    const card = cardAfter(await damage(bomb, { outcome: "criticalSuccess", type: "mental" }));
    assert.match(card.content, /Goblin: frightened 2/);
    const before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, included: [], userId: "gm" });
    await settle();
    const calls = foundry.applied.slice(before);
    assert.deepEqual(calls.map((call) => [call.change.slug, call.change.value]), [["frightened", 2]]);
    assert.deepEqual(kyra.healed.length + boss.healed.length, 1, "nobody ticked: only the boss's earlier splash");
});

test("no card when nothing is left to do: a hit with no rider and nobody within 5 feet", async () => {
    const bomb = foundry.giveItem(alchemist, source("Alchemist's Fire (Lesser)"));
    const count = foundry.messages.length;
    await damage(bomb, { outcome: "success", target: far, type: "fire" });
    assert.equal(foundry.messages.length, count + 1);
});
