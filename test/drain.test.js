// Temporary Hit Points from a share of the damage the item's target takes (src/compiler/drain.js, src/live/drain.js, scripts/drain.js,
// 2026-10-26): Blood-Drinker Blade (Greater)'s Exsanguinate — its 6d6 bleed persistent, as PF2e has it, at the creature; the first bleed
// damage the creature then takes gives its user half, after resistances, for the rest of the minute.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { drainMarkSource, drainTempSource } from "../src/live/card.js";
import { drained, shareOfType } from "../src/live/drain.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const planOf = (name, which) => {
    const found = equipment.find((doc) => doc.name === name);
    return compileActivations({ ...found, ownerLevel: Number(found.system.level?.value) || 1 }).find((entry) => entry.activation.name === which).plan;
};

test("Exsanguinate: 6d6 persistent bleed at the creature, its user's half of the bleed taken for 1 minute, whole", () => {
    const plan = planOf("Blood-Drinker Blade (Greater)", "Exsanguinate");
    assert.deepEqual(plan.resolution.sharedDamage.components, [{ id: "0", formula: "6d6", type: "bleed", category: "persistent" }]);
    assert.deepEqual([plan.targeting.target, plan.drain.fraction, plan.drain.type, plan.drain.duration.value, plan.drain.duration.unit], ["1 creature", 0.5, "bleed", 1, "minutes"]);
    assert.deepEqual([Boolean(plan.partial), plan.unread ?? [], plan.item.levelTemp ?? null], [false, [], null]);
});

test("the share: the bleed rolled now (a tick), not a persistent bleed only set; by the instances' totals", () => {
    const tick = { instances: [{ type: "bleed", persistent: true, options: { evaluatePersistent: true }, total: 18 }] };
    const set = { instances: [{ type: "slashing", persistent: false, options: {}, total: 9 }, { type: "bleed", persistent: true, options: {}, total: 0 }] };
    const mixed = { instances: [{ type: "slashing", persistent: false, options: {}, total: 6 }, { type: "bleed", persistent: false, options: {}, total: 2 }] };
    assert.deepEqual([shareOfType(tick, "bleed"), shareOfType(set, "bleed"), shareOfType(mixed, "bleed"), shareOfType(7, "bleed")], [1, null, 0.25, null]);
    assert.deepEqual([drained({ value: 50, temp: 0 }, { value: 33, temp: 0 }, 1, 0.5), drained({ value: 50, temp: 5 }, { value: 50, temp: 0 }, 1, 0.5), drained({ value: 10, temp: 0 }, { value: 10, temp: 0 }, 1, 0.5)], [8, 2, 0]);
});

test("the mark on the creature and its user's temporary Hit Points: PF2e's TempHP, its time from the mark's start", () => {
    const mark = drainMarkSource({ fraction: 0.5, type: "bleed", duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" } }, { item: { name: "Blood-Drinker Blade (Greater)" }, user: { actorUuid: "Actor.user", name: "Vamp" }, worldTime: 12 });
    assert.deepEqual([mark.name, mark.flags["pf2e-automatic-item-resolution"].drain, mark.system.duration.value, mark.system.start.value], ["Blood-Drinker Blade (Greater): drained", { fraction: 0.5, type: "bleed", userUuid: "Actor.user", userName: "Vamp" }, 1, 12]);
    assert.match(mark.system.description.value, /The next bleed damage it takes gives Vamp half of it \(after resistances\) as temporary Hit Points, until 1 minute after the activation/);
    const temp = drainTempSource(8, { item: { name: "Blood-Drinker Blade (Greater)" }, start: { value: 12, initiative: 20 }, duration: { mode: "fixed", value: 1, unit: "minutes" } });
    assert.deepEqual([temp.system.rules, temp.system.start, temp.system.duration.value], [[{ key: "TempHP", value: 8 }], { value: 12, initiative: 20 }, 1]);
});

test("live: the card applied marks the damaged creature; its first bleed tick gives the user half, the mark used up", async () => {
    const { markAfterApplied, before } = await import("../scripts/drain.js");
    const saved = { game: globalThis.game, ChatMessage: globalThis.ChatMessage, fromUuid: globalThis.fromUuid, fromUuidSync: globalThis.fromUuidSync };
    const items = [];
    const gained = [];
    const foe = { uuid: "Actor.foe", name: "Foe", system: { attributes: { hp: { value: 40, temp: 0 } } }, get itemTypes() { return { effect: items }; }, createEmbeddedDocuments: async (type, data) => data.map((one) => { const doc = { ...one, delete: async () => items.splice(items.indexOf(doc), 1) }; items.push(doc); return doc; }) };
    const user = { uuid: "Actor.user", name: "Vamp", testUserPermission: () => false, createEmbeddedDocuments: async (type, data) => gained.push(...data) };
    globalThis.game = { user: { isGM: true }, users: [{ id: "gm", isGM: true }], time: { worldTime: 5 }, combat: null, modules: new Map() };
    globalThis.ChatMessage = { create: async (data) => data, getSpeaker: () => ({}) };
    globalThis.fromUuid = async (uuid) => ({ "Actor.foe": foe, "Actor.user": user })[uuid] ?? null;
    globalThis.fromUuidSync = (uuid) => ({ "Actor.foe": foe })[uuid] ?? null;
    try {
        const plan = planOf("Blood-Drinker Blade (Greater)", "Exsanguinate");
        await markAfterApplied({ state: { plan, source: { actorUuid: "Actor.user", name: "Vamp" }, ability: { name: "Blood-Drinker Blade (Greater)" } }, targets: [{ actorUuid: "Actor.foe", degree: "success" }] });
        assert.equal(items.length, 1);
        // (A slashing hit first: not bleed, the mark stays.)
        assert.equal(before(foe, { damage: { instances: [{ type: "slashing", persistent: false, options: {}, total: 7 }] } }), null);
        const after = before(foe, { damage: { instances: [{ type: "bleed", persistent: true, options: { evaluatePersistent: true }, total: 17 }] } });
        foe.system.attributes.hp.value = 23;
        await after();
        assert.deepEqual([items.length, gained[0].system.rules, gained[0].system.start.value], [0, [{ key: "TempHP", value: 8 }], 5]);
    } finally {
        Object.assign(globalThis, saved);
    }
});
