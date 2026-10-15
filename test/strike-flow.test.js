// An item used by Striking, against the stand-in for Foundry: its card readies the user's next Strike; PF2e's attack
// roll then puts the riders on the target (a hit), posts the Strike's save, or spends it (a miss).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { riderFor, strikeLines } from "../src/live/strike-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 100 squares down.)
const foundry = await fakeFoundry();
const fighter = foundry.makeActor({ id: "strike-fighter", name: "Fighter", owners: ["player"] });
const foe = foundry.makeActor({ id: "strike-foe", name: "Foe" });
foundry.place(fighter, 0, 10000);
foundry.place(foe, 100, 10000);

const readied = () => fighter.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.strikeRider);

async function useCard(name) {
    const item = foundry.giveItem(fighter, source(name));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: item.type } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

async function attack(outcome, options = ["item:melee"]) {
    const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options, target: { actor: foe.uuid, token: foe.token.uuid } }, origin: { uuid: `${fighter.uuid}.Item.sword`, type: "weapon" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

test("the reading: a Strike's riders by degree, a save on a hit, and which Strike takes them", () => {
    const gem = compileItem(source("Fear Gem"));
    assert.equal(routeOf(gem), "strike");
    assert.deepEqual(strikeLines(gem), ["On a hit: frightened 1", "On a critical hit: frightened 2"]);
    const [beacon] = compileActivations(source("Duelist's Beacon"));
    assert.equal(routeOf(beacon.plan), "strike");
    assert.equal(beacon.plan.strike.save.resolution.check.against.value, 22);
    assert.deepEqual(beacon.plan.resolution.outcomes.success.effects, [], "the blinding is the save's, not the hit's");
    // A save at whoever's targeted gives way to the Strike's own on a hit (Aurochs' Might Tattoo).
    const charge = compileActivations(source("Aurochs' Might Tattoo (Lesser)")).find((entry) => entry.activation.name === "Aurochs Charge");
    assert.equal(routeOf(charge.plan), "strike");
    assert.equal(riderFor(gem, { ranged: true, outcome: "success" }), null, "a melee one waits for a melee Strike");
    assert.equal(riderFor(gem, { outcome: "failure" }), "spend");
});

test("Fear Gem: readied, then a hit frightens the target; a later miss spends the next one", async () => {
    const card = await useCard("Fear Gem");
    assert.equal(card.flags[MODULE_ID].card.kind, "strike");
    assert.match(card.content, /On a critical hit: frightened 2/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(readied().length, 1);
    assert.equal(readied()[0].system.duration.expiry, "turn-end");
    // A ranged Strike doesn't take a melee one.
    await attack("success", ["item:ranged"]);
    assert.equal(readied().length, 1, "still readied");
    const before = foundry.applied.length;
    await attack("criticalSuccess");
    assert.equal(readied().length, 0, "spent");
    const frightened = foundry.applied.slice(before).map((entry) => entry.change).find((change) => change.op === "condition");
    assert.deepEqual([frightened.slug, frightened.value, frightened.target], ["frightened", 2, "target"]);
    assert.equal(foundry.applied.slice(before).find((entry) => entry.change.op === "condition").state.targets[0].name, "Foe");
    // Again, and a miss.
    const again = await useCard("Fear Gem");
    await foundry.socket(SOCKET)({ action: "apply", messageId: again.id, userId: "player" });
    await settle();
    const count = foundry.applied.length;
    await attack("failure");
    assert.equal(readied().length, 0);
    assert.equal(foundry.applied.length, count, "nothing on a miss");
    assert.match(foundry.messages.at(-1).content, /missed; it's spent/);
});

test("Duelist's Beacon: its activation readies the Strike; a hit posts the target's save card", async () => {
    const beacon = foundry.giveItem(fighter, source("Duelist's Beacon"));
    const post = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: beacon.uuid, type: beacon.type } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", post);
    await settle();
    const activations = foundry.messages[foundry.messages.indexOf(post) + 1];
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: activations.id, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, "the Strike card");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const before = foundry.posted.length;
    await attack("success");
    const posted = foundry.posted.slice(before)[0];
    assert.equal(posted?.plan.resolution.check.against.value, 22);
    assert.deepEqual(posted.tokens.map((token) => token.name), ["Foe"]);
});
