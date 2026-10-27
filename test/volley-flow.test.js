// Several Strikes in one activation (src/compiler/volley.js), against the stand-in for Foundry: the reading (how many, at whom, the penalty,
// the user's damage, the multiple attack penalty held, the results put in the hit's words), the card's lines, and the readied Strikes — one
// at each creature targeted at Apply, each at a creature not yet struck, the user's damage for each one made.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { strikeLines } from "../src/live/strike-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const plan = (name, which = 0) => compileActivations(source(name))[which].plan;

// (Shared with the other flow tests: these creatures stand 320 squares down.)
const foundry = await fakeFoundry();
const shooter = foundry.makeActor({ id: "volley-shooter", name: "Shooter", owners: ["player"] });
const one = foundry.makeActor({ id: "volley-one", name: "First Foe" });
const two = foundry.makeActor({ id: "volley-two", name: "Second Foe" });
const other = foundry.makeActor({ id: "volley-other", name: "Bystander" });
foundry.place(shooter, 0, 32000);
foundry.place(one, 100, 32000);
foundry.place(two, 200, 32000);
foundry.place(other, 300, 32000);

const readied = () => shooter.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.strikeRider);

test("the reading: how many Strikes and at whom, what the text says of them, the results in the hit's words", () => {
    const gun = plan("Liar's Gun");
    assert.equal(routeOf(gun), "strike");
    assert.deepEqual([gun.strike.uses, gun.strike.volley, gun.partial, gun.strike.notes], [4, { different: true, cone: 20, mapHeld: true, misfire: true }, undefined, []]);
    const caress = plan("Caress of the Great Serpent");
    assert.deepEqual([caress.strike.uses, caress.strike.attack, caress.strike.volley.selfDamage, caress.strike.volley.within], [8, { value: -2, type: "untyped" }, { formula: "1d6", type: "piercing" }, 30]);
    const spikes = plan("Spike Launcher");
    assert.deepEqual([spikes.strike.uses, spikes.strike.volley.each, spikes.strike.volley.area, spikes.strike.volley.removal, spikes.partial], [null, "creature", "10-foot burst centered anywhere within its range", true, undefined]);
    assert.deepEqual(spikes.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["land-speed", -5, "status"]]);
    assert.deepEqual(spikes.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), ["immobilized"]);
    const legion = plan("Shield of the Unified Legion");
    assert.deepEqual([legion.strike.volley.each, legion.strike.alteration, legion.resolution.outcomes.success.forcedMovement, legion.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), legion.partial], ["enemy", "force", { kind: "push", distance: 10 }, ["prone"], undefined]);
    // (The bow's healing stopped for the next turn: its PF2e toggle off, plan.toggleOff — src/compiler/toggle-off.js, 2026-10-26; the chair's
    // bonuses against a prone foe still a note.)
    const bow = plan("Splithead Bow");
    assert.deepEqual([bow.strike.uses, bow.strike.volley, Boolean(bow.partial), bow.toggleOff.option, bow.toggleOff.duration.expiry], [2, { different: true, within: 50, sight: true, mapHeld: true }, false, "splithead-bow-healing", "turn-end"]);
    const chair = plan("Minotaur Chair");
    // (2026-10-27: its prone foe's extras read too, src/compiler/strike-if.js — no note left.)
    assert.deepEqual([chair.strike.volley.move, chair.partial, chair.strike.notes.length], ["Stride in a straight line first, through the enemies' spaces", undefined, 0]);
    // (Two at once whose only other sentence was the multiple attack penalty: no longer partial.)
    assert.equal(plan("Amphisbaena Handwraps").partial, undefined);
});

test("the card's lines: the penalty once, the user's damage, the multiple attack penalty, at whom", () => {
    const lines = strikeLines(plan("Caress of the Great Serpent"));
    assert.deepEqual(lines.slice(0, 5), ["Up to 8 Strikes", "Each at a different creature within 30 feet (a creature already struck doesn't take another)", "-2 to each of these Strikes", "Each Strike made deals 1d6 piercing damage to you", "Roll them all at the multiple attack penalty you're at now (the same PF2e button); it rises only after the last"]);
    assert.ok(!lines.some((line) => /bonus to the attack roll|penalty to the attack roll/.test(line)), "its penalty isn't said twice");
    assert.match(strikeLines(plan("Spike Launcher"))[0], /^One Strike at each creature in the 10-foot burst centered anywhere within its range \(target them all, then Apply\)$/);
});

async function ready(name, targets) {
    const item = foundry.giveItem(shooter, source(name));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, `${name}'s Strike card`);
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: targets.map((actor) => actor.token.uuid) });
    } catch {
        // (Refused: checked by its notification.)
    }
    await settle();
    return { item, card };
}

async function attackAt(target, outcome, weaponId) {
    const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options: ["item:ranged", `item:id:${weaponId}`], target: { actor: target.uuid, token: target.token.uuid } }, origin: { uuid: `${shooter.uuid}.Item.${weaponId}`, type: "weapon" } } }, speaker: { actor: shooter.id }, actor: shooter, token: shooter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

test("Spike Launcher: with no one targeted, refused; then one Strike at each creature targeted — a hit's Speed penalty, a critical hit's Immobilized; the same creature again, or one not targeted, isn't one of them", async () => {
    const errors = foundry.notifications.length;
    const { card } = await ready("Spike Launcher", []);
    assert.ok(foundry.notifications.slice(errors).some((text) => /Target each creature in the 10-foot burst/.test(text)), foundry.notifications.slice(errors).join(" / "));
    assert.equal(readied().length, 0);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [one.token.uuid, two.token.uuid] });
    await settle();
    const [effect] = readied();
    assert.deepEqual([effect.flags[MODULE_ID].strikeRider.uses, effect.flags[MODULE_ID].strikeRider.targets], [2, [one.token.uuid, two.token.uuid]]);
    const weaponId = effect.flags[MODULE_ID].strikeRider.weaponId;
    const before = foundry.applied.length;
    await attackAt(one, "success", weaponId);
    const slowed = foundry.applied.slice(before).map((entry) => entry.change);
    assert.ok(slowed.some((change) => change.effect?.modifier?.selector === "land-speed" && change.effect.modifier.value === -5), JSON.stringify(slowed));
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.uses, 1);
    await attackAt(one, "success", weaponId);
    assert.match(foundry.messages.at(-1).content, /already struck by it/);
    await attackAt(other, "success", weaponId);
    assert.match(foundry.messages.at(-1).content, /isn't one of those targeted for it/);
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.uses, 1, "neither spent one");
    const later = foundry.applied.length;
    await attackAt(two, "criticalSuccess", weaponId);
    assert.ok(foundry.applied.slice(later).some((entry) => entry.change.op === "condition" && entry.change.slug === "immobilized"));
    assert.equal(readied().length, 0, "all spent");
});

test("Caress of the Great Serpent: up to eight Strikes, each one made deals its user 1d6 piercing, a hit or a miss; the same creature twice isn't one of them", async () => {
    const { card } = await ready("Caress of the Great Serpent", []);
    assert.equal(card.flags[MODULE_ID].card.status, "applied", "no one to target first: up to eight");
    const [effect] = readied();
    const weaponId = effect.flags[MODULE_ID].strikeRider.weaponId;
    assert.ok(effect.system.rules.some((rule) => rule.key === "FlatModifier" && rule.value === -2 && rule.type === "untyped"));
    const hurt = shooter.healed.length;
    await attackAt(one, "failure", weaponId);
    await attackAt(two, "success", weaponId);
    assert.deepEqual(shooter.healed.slice(hurt).map((entry) => entry.damage), ["(1d6)[piercing]", "(1d6)[piercing]"]);
    await attackAt(two, "success", weaponId);
    assert.equal(shooter.healed.length, hurt + 2, "not for one at a creature already struck");
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.uses, 6);
});
