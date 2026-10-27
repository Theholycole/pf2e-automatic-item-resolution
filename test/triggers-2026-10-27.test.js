// Triggered activations built on 2026-10-27 (docs/needs.md, "Triggers"): reactions and effects that fire on an event — a creature reduced to 0
// Hit Points, a hit, a spell at its user — each its card's reading on the real PF2e pack item, and its live play where it has its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { strikeLines } from "../src/live/strike-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which) => compileActivations(item(name), options).find((entry, index) => (typeof which === "string" ? entry.activation.name === which : index === (which ?? 0)))?.plan;
const consumable = (name) => compileItem(item(name), options);
// (Nothing left to the table: not partial nor note-only, no notes unread, no GM lines on its rows.)
const done = (plan) => !plan.partial && !plan.noteOnly && !(plan.unread ?? []).length && Object.values(plan.resolution?.outcomes ?? {}).every((row) => !(row?.manualInstructions ?? []).length);

// (Shared with the other flow tests: these creatures stand 520 squares down.)
const foundry = await fakeFoundry();
const reaper = foundry.makeActor({ id: "trigger-reaper", name: "Reaper", owners: ["player"] });
const victim = foundry.makeActor({ id: "trigger-victim", name: "Victim" });
foundry.place(reaper, 0, 52000);
foundry.place(victim, 100, 52000);

test("Reaper's Toll: Reaper's Claim is a melee Strike with the scythe, its reach from the fallen creature's space, half its damage temporary Hit Points for 1 minute", () => {
    const claim = activation("Reaper's Toll", "Reaper's Claim");
    assert.equal(routeOf(claim), "strike");
    assert.deepEqual([claim.strike.range, claim.strike.own, claim.strike.drain, claim.strike.notes], ["melee", true, { fraction: 0.5, type: null, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }, []]);
    assert.ok(done(claim), "nothing left over");
    assert.equal(claim.item.levelTemp, undefined, "no typed amount: the hit's damage gives it");
    const lines = strikeLines(claim);
    assert.ok(lines.some((line) => /space of the creature that triggered it/.test(line)));
    assert.ok(lines.includes("On a hit: its user gains half the damage the Strike deals the creature hit (after its resistances) as temporary Hit Points, for 1 minute"));
});

test("Reaper's Toll live: the hit marks the creature struck; its damage then gives the reaper half of what it lost", async () => {
    const scythe = foundry.giveItem(reaper, source("Reaper's Toll"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: scythe.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, "the Strike card");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const attack = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: ["item:melee", `item:id:${scythe.id}`], target: { actor: victim.uuid, token: victim.token.uuid } }, origin: { uuid: scythe.uuid, type: "weapon" } } }, speaker: { actor: reaper.id }, actor: reaper, token: reaper.token.document });
    await foundry.call("createChatMessage", attack);
    await settle();
    const mark = victim.itemTypes.effect.find((effect) => effect.flags?.[MODULE_ID]?.drain);
    assert.ok(mark, "the creature hit is marked");
    assert.deepEqual([mark.flags[MODULE_ID].drain.fraction, mark.flags[MODULE_ID].drain.userUuid, mark.system.duration.value, mark.system.duration.unit], [0.5, reaper.uuid, 1, "minutes"]);
    assert.match(foundry.messages.at(-1).content, /gives Reaper half of it as temporary Hit Points/);
});

test("a condition suppressed: Lost Ember's Off-Guard or Confused until the start of its next turn — the ways card, each a note Effect with PF2e's AdjustModifier", () => {
    const focus = activation("Lost Ember", "Fix Focus");
    assert.equal(routeOf(focus), "ways");
    assert.deepEqual(focus.ways.map((way) => way.name), ["Off-Guard", "Confused"]);
    const [offGuard, confused] = focus.ways.map((way) => way.plan);
    assert.equal(routeOf(offGuard), "item");
    const note = offGuard.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([note.label, note.duration, note.rules], ["Off-Guard suppressed", { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" }, [{ key: "AdjustModifier", selectors: ["ac"], slug: "off-guard", suppress: true }]]);
    assert.match(confused.resolution.outcomes.success.noteEffects[0].text, /^Confused is suppressed until the start of your next turn: you act normally/);
    // (Its use while confused, its user's own action: a line of the card.)
    assert.ok(confused.notes[0].startsWith("You can use this free action when you're confused"));
    assert.ok(done(offGuard) && done(confused));
    assert.deepEqual([focus.item.activation.frequency.per, focus.item.activation.time], ["day", "free"]);
});

test("the triggering effect suppressed: Aeon Stone (Olivine Pendeloque)'s Still Earth for 1 minute, one way for each condition its trigger names, its −1 to attack rolls on each", () => {
    const still = activation("Aeon Stone (Olivine Pendeloque)", "Still Earth");
    assert.deepEqual(still.ways.map((way) => way.name), ["Confused", "Frightened", "Stupefied"]);
    const frightened = still.ways[1].plan.resolution.outcomes.success;
    assert.deepEqual(frightened.noteEffects[0].rules, [{ key: "AdjustModifier", selectors: ["all"], slug: "frightened", suppress: true }]);
    assert.deepEqual([frightened.noteEffects[0].duration.value, frightened.noteEffects[0].duration.unit], [1, "minutes"]);
    assert.deepEqual(frightened.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["attack-roll", -1, "status"]]);
    assert.ok(still.ways.every((way) => done(way.plan)));
    // (And Moonlit Chain's Dazzled for 1 minute, the same words: a note Effect, PF2e having no rule for Dazzled's concealment.)
    const dim = activation("Moonlit Chain", "Dim Sight");
    assert.deepEqual([dim.noteOnly, dim.resolution.outcomes.success.noteEffects[0].label, dim.resolution.outcomes.success.noteEffects[0].rules], [undefined, "Dazzled suppressed", undefined]);
});
