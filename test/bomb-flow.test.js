// The bomb card against the stand-in for Foundry: after PF2e's damage roll for a bomb Strike, the splash on the
// creatures within 5 feet of the target (PF2e's own splash-only roll) and the riders for the Strike's degree.

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

// (The stand-in is shared with the other flow tests: these creatures stand apart from theirs, 20 squares down.)
const foundry = await fakeFoundry();
const alchemist = foundry.makeActor({ id: "bomb-alchemist", name: "Alchemist", owners: ["player"] });
const goblin = foundry.makeActor({ id: "bomb-goblin", name: "Goblin" });
const kyra = foundry.makeActor({ id: "bomb-kyra", name: "Kyra" });
const boss = foundry.makeActor({ id: "bomb-boss", name: "Goblin Boss" });
const far = foundry.makeActor({ id: "bomb-far", name: "Far Goblin" });
foundry.place(alchemist, 0, 2000);
foundry.place(goblin, 300, 2000);
foundry.place(kyra, 400, 2000);
foundry.place(boss, 300, 2100);
foundry.place(far, 600, 2000);

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

test("a bomb's save: the ability module's save card for whoever attempts it", async () => {
    // Skunk Bomb: "Any creature hit by the bomb or in its splash area must attempt a DC 15 Fortitude save".
    const skunk = foundry.giveItem(alchemist, source("Skunk Bomb (Lesser)"));
    const card = cardAfter(await damage(skunk, { outcome: "success", type: "poison" }));
    assert.match(card.content, /DC 15 Fortitude save: Goblin, Kyra, Goblin Boss \(as ticked for the splash\)/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, included: [1], userId: "gm" });
    await settle();
    const [posted] = foundry.posted.slice(before);
    assert.equal(posted.plan.resolution.kind, "save");
    assert.equal(posted.plan.resolution.check.against.value, 15);
    assert.deepEqual(posted.tokens.map((token) => token.name), ["Goblin", "Goblin Boss"], "the target and the one left ticked");
    // Dwarven Daisy: "A creature struck by a dwarven daisy …": the target, on a hit only.
    const daisy = foundry.giveItem(alchemist, source("Dwarven Daisy (Lesser)"));
    const missed = cardAfter(await damage(daisy, { outcome: "failure", type: "fire" }));
    assert.doesNotMatch(missed.content, /Fortitude save/);
    const struck = cardAfter(await damage(daisy, { outcome: "success", type: "fire" }));
    assert.match(struck.content, /DC \d+ Fortitude save: Goblin</);
    // Blasting Stone: each creature within 10 feet of where it exploded (the far goblin, 15 feet away, isn't).
    const stone = foundry.giveItem(alchemist, source("Blasting Stone (Lesser)"));
    const blast = cardAfter(await damage(stone, { outcome: "success", type: "sonic" }));
    assert.match(blast.content, /Fortitude save: Goblin, Kyra, Goblin Boss</);
});

test("splash ammunition: a longbow's Strike with Elemental Ammunition puts its splash on the others within 5 feet", async () => {
    const bow = foundry.giveItem(alchemist, source("Longbow"));
    const ammo = foundry.giveItem(alchemist, source("Elemental Ammunition (Moderate, Acid)"));
    const arrows = foundry.giveItem(alchemist, source("Arrows"));
    // PF2e's damage message for the Strike: the ammunition's rules gave it a splash-only roll.
    const strike = async ({ outcome, loaded = ammo, splash = 2 }) => {
        const message = foundry.makeMessage({
            flags: { pf2e: { context: { type: "damage-roll", outcome, options: ["item:ranged", `item:ammo:id:${loaded.id}`], target: { actor: goblin.uuid, token: goblin.token.uuid } }, origin: { uuid: bow.uuid, type: "weapon" } } },
            rolls: [{ total: 9, instances: [{ type: "piercing" }] }, ...(splash ? [{ total: splash, options: { splashOnly: true }, instances: [{ type: "acid" }] }] : [])],
            speaker: { actor: alchemist.id },
            actor: alchemist,
            token: alchemist.token.document
        });
        await foundry.call("createChatMessage", message);
        await settle();
        return message;
    };
    const message = await strike({ outcome: "success" });
    const card = cardAfter(message);
    const state = stateOf(card);
    assert.equal(state.item.name, "Longbow (Elemental Ammunition (Moderate, Acid))");
    assert.deepEqual(state.splashed.map((entry) => entry.name), ["Kyra", "Goblin Boss"]);
    assert.deepEqual(message.flags[MODULE_ID].coveredSplash, [1]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.ok(stateOf(card).results.includes("Kyra takes the splash (2 acid)"), stateOf(card).results.join(" | "));
    // A miss: its splash trait splashes the target too.
    assert.deepEqual(stateOf(cardAfter(await strike({ outcome: "failure" }))).splashed.map((entry) => entry.name), ["Goblin", "Kyra", "Goblin Boss"]);
    // No card: a Strike with no splash, or a miss with ammunition and a weapon without the splash trait.
    for (const [label, options] of [["no splash", { outcome: "success", splash: 0 }], ["a miss with arrows", { outcome: "failure", loaded: arrows }]]) {
        const count = foundry.messages.length;
        await strike(options);
        assert.equal(foundry.messages.length, count + 1, label);
    }
});

test("riders in a bomb's damage sentence: Atrophy Bomb's enfeebled, Peshpine Grenade's stupefied (its time from the other sentence), Goo Grenade's Speed penalty", async () => {
    const { compileBomb } = await import("../src/compiler/bombs.js");
    const rows = (name) => compileBomb(source(name)).resolution.outcomes;
    assert.deepEqual(rows("Atrophy Bomb (Major)").success.effects.map((effect) => `${effect.slug} ${effect.value}`), ["enfeebled 2"]);
    const peshpine = rows("Peshpine Grenade (Lesser)").success.effects[0];
    assert.deepEqual([peshpine.slug, peshpine.value, peshpine.duration.expiry, peshpine.duration.anchor], ["stupefied", 1, "turn-end", "target-turn"]);
    assert.deepEqual(rows("Goo Grenade (Greater)").success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["all-speeds", -10, "circumstance"]]);
});

test("riders only some creatures take: Ghost Charge's enfeebled on undead or void healing only, Tallow Bomb's sickened on the living only", async () => {
    const { compileBomb } = await import("../src/compiler/bombs.js");
    assert.equal(compileBomb(source("Ghost Charge (Lesser)")).item.riderOnly, "void-healing");
    assert.deepEqual([compileBomb(source("Tallow Bomb (Lesser)")).item.riderOnly, compileBomb(source("Tallow Bomb (Lesser)")).resolution.outcomes.success.effects], ["living", []]);
    // Live: the goblin (living, no void healing) takes no enfeebled from a ghost charge; with void healing, it does.
    const charge = foundry.giveItem(alchemist, source("Ghost Charge (Lesser)"));
    let card = cardAfter(await damage(charge, { outcome: "success", type: "vitality" }));
    let before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, included: [], userId: "gm" });
    await settle();
    assert.deepEqual(foundry.applied.slice(before).map((call) => call.change.slug), []);
    assert.ok(stateOf(card).results.some((line) => /not undead and without void healing, so no rider/.test(line)));
    goblin.attributes.hp.negativeHealing = true;
    card = cardAfter(await damage(charge, { outcome: "success", type: "vitality" }));
    before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, included: [], userId: "gm" });
    await settle();
    assert.deepEqual(foundry.applied.slice(before).map((call) => [call.change.slug, call.change.value]), [["enfeebled", 1]]);
    goblin.attributes.hp.negativeHealing = false;
});

test("a condition for as long as a persistent damage lasts: Spider Satchel's Fascinated with its poison, Freezing Embrace Snare's clumsy with its cold; not Tallow Bomb's floor-held sickened, nor Bloodburn Censer's fire-or-poison", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const { compileBomb } = await import("../src/compiler/bombs.js");
    const satchel = compileBomb(source("Spider Satchel (Lesser)"));
    assert.deepEqual(satchel.resolution.outcomes.success.effects, [{ kind: "condition", slug: "fascinated", value: null, duration: { mode: "while", persistent: "poison" } }]);
    const snare = compileItem(source("Freezing Embrace Snare")).zone.saves[0].plan.resolution.outcomes;
    assert.deepEqual([snare.failure.effects[0].duration, snare.success.effects[0].duration.mode], [{ mode: "while", persistent: "cold" }, "fixed"]);
    assert.equal(compileBomb(source("Tallow Bomb (Lesser)")).resolution.outcomes.criticalSuccess.effects[0].duration, null);
    assert.equal(compileActivations(source("Bloodburn Censer"))[0].plan.resolution.outcomes.failure.effects[0].duration, null);
});
