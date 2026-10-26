// A fall an item eases, through PF2e Automatic Environment Resolution (src/compiler/falls.js, scripts/falls.js, 2026-10-26): the item card's
// Effect with the environment module's flag, and api.fallEases for the items worn with it always on.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { fallEffectSource, fallLine, foamEffectSource } from "../src/live/card.js";
import { foamUsed } from "../src/compiler/falls.js";
import { fallEases } from "../scripts/falls.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;

test("the readings: Tumbler's Belt 120 feet shorter for the round of its reaction, Aerial Cloak 30, Jade Cat 20 for a minute, Dragonaut's Wingsuit no damage for a minute", () => {
    const belt = activation("Tumbler's Belt", "Land With Grace");
    assert.deepEqual([belt.fall, belt.notes, Boolean(belt.partial)], [{ shorter: 120, landsOnFeet: true, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } }, undefined, false]);
    // (2026-10-26: what the fall's sentence says besides is in the Effect's words — Aerial Cloak's glide, the Wingsuit's 60 feet a round — and
    // Jade Cat's Balance a roll note on it, as PF2e's Steady Balance: each whole.)
    const cloak = activation("Aerial Cloak", "Fall Gently");
    assert.deepEqual([cloak.fall.shorter, cloak.fall.glide, Boolean(cloak.partial)], [30, 20, false]);
    const cat = compileItem(item("Jade Cat"));
    assert.deepEqual([cat.fall.shorter, cat.fall.duration.value, cat.fall.duration.unit, Boolean(cat.partial)], [20, 1, "minutes", false]);
    assert.deepEqual(fallEffectSource(cat.fall, { item: { name: "Jade Cat" } }).system.rules, [{ key: "Note", selector: "acrobatics", predicate: ["action:balance"], title: "Jade Cat", text: "You aren't off-guard when you Balance, and narrow surfaces and uneven ground aren't difficult terrain for you." }]);
    const wingsuit = activation("Dragonaut's Wingsuit", "Descend");
    assert.deepEqual([wingsuit.fall.noDamage, wingsuit.fall.rate, wingsuit.fall.duration.unit, Boolean(wingsuit.partial)], [true, 60, "minutes", false]);
    assert.equal(fallLine(cloak.fall), "Its falls count as 30 feet shorter; it can land in a space of its choice within 20 feet of where it would have for 1 round");
    assert.equal(fallLine(belt.fall), "Its falls count as 120 feet shorter; it lands on its feet for 1 round");
});

test("the Effect: the environment module's fall flag, named for the item, for its time", () => {
    const belt = activation("Tumbler's Belt", "Land With Grace");
    const source = fallEffectSource(belt.fall, { item: { name: "Tumbler's Belt" }, user: {}, worldTime: 50 });
    assert.deepEqual(source.flags["pf2e-automatic-environment-resolution"].fall, { shorter: 120, landsOnFeet: true, source: "Tumbler's Belt" });
    assert.deepEqual([source.name, source.system.duration.value, source.system.duration.unit], ["Tumbler's Belt: fall", 1, "rounds"]);
});

test("api.fallEases: Gliding Membranes and Angelic Opera Cloak worn; not stowed ones; Daredevil Boots not with Cat Fall", () => {
    const worn = (name, extra = {}) => ({ ...item(name), id: name, uuid: `Item.${name}`, isEquipped: true, isInvested: true, ...extra });
    const actor = (items, feats = []) => ({ items, itemTypes: { feat: feats.map((slug) => ({ slug })) } });
    assert.deepEqual(fallEases(actor([worn("Gliding Membranes (Lesser)"), worn("Angelic Opera Cloak"), worn("Gliding Membranes (Greater)", { isEquipped: false })])), [{ shorter: 25, source: "Gliding Membranes (Lesser)" }, { noDamage: true, source: "Angelic Opera Cloak" }]);
    assert.deepEqual(fallEases(actor([worn("Daredevil Boots")])), [{ shorter: 10, source: "Daredevil Boots" }]);
    assert.deepEqual(fallEases(actor([worn("Daredevil Boots")], ["cat-fall"])), []);
});

test("the fall hook: its user's fall reactions named in a line whispered to the GMs and its owners", async () => {
    const { offerFallReactions } = await import("../scripts/falls.js");
    const before = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
    const gm = { id: "gm", isGM: true };
    const player = { id: "player", isGM: false };
    const other = { id: "other", isGM: false };
    globalThis.game = { ...(before.game ?? {}), users: [gm, player, other] };
    globalThis.ChatMessage = { create: async (data) => data, getSpeaker: () => ({}) };
    try {
        const belt = { ...item("Tumbler's Belt"), type: "equipment" };
        const actor = { name: "Faller", items: [belt], itemTypes: { feat: [] }, testUserPermission: (user) => user.id === "player" };
        const message = await offerFallReactions({ token: { name: "Faller", actor }, feet: 60 }, { activations: (one) => compileActivations(one), consumable: () => null, fallLine });
        assert.deepEqual(message.whisper, ["gm", "player"]);
        assert.match(message.content, /Faller<\/strong> is falling 60 feet\. Its reactions: Tumbler(?:&#39;|')s Belt \(Land With Grace\): Its falls count as 120 feet shorter; it lands on its feet for 1 round\./);
    } finally {
        globalThis.game = before.game;
        globalThis.ChatMessage = before.ChatMessage;
    }
});

// (2026-10-26: Impact Foam Chassis through the environment module's reduceBy and its "fell" hook, env f06ece4.)
test("Impact Foam Chassis: each grade's falling damage taken off and the foam's Hit Points, from a fall of 10 feet or more; its own plan, nothing on Use", () => {
    const grades = ["Lesser", "Moderate", "Greater", "Major"].map((grade) => compileItem(item(`Impact Foam Chassis (${grade})`)));
    assert.deepEqual(grades.map((plan) => [plan.builtin, plan.foam.reduceBy, plan.foam.hp, plan.foam.minFeet]), [["fall-foam", 20, 20, 10], ["fall-foam", 50, 40, 10], ["fall-foam", 100, 100, 10], ["fall-foam", 200, 200, 10]]);
    const worn = (name, extra = {}) => ({ ...item(name), id: name, uuid: `Item.${name}`, isEquipped: true, ...extra });
    assert.deepEqual(fallEases({ items: [worn("Impact Foam Chassis (Moderate)"), worn("Impact Foam Chassis (Major)", { isEquipped: false })], itemTypes: { feat: [] } }), [{ reduceBy: 50, minFeet: 10, itemUuid: "Item.Impact Foam Chassis (Moderate)", source: "Impact Foam Chassis (Moderate)" }]);
});

test("after the fall: the chassis whose reduction it was, its foam's Hit Points less what it took; a fall it took nothing off still foams", () => {
    const worn = [{ uuid: "Item.lesser", reduceBy: 20, minFeet: 10, hp: 20 }, { uuid: "Item.moderate", reduceBy: 50, minFeet: 10, hp: 40 }];
    assert.deepEqual(foamUsed({ feet: 60, reductions: [{ itemUuid: "Item.moderate", amount: 30 }] }, worn), { uuid: "Item.moderate", amount: 30, left: 10 });
    assert.deepEqual(foamUsed({ feet: 100, reductions: [{ itemUuid: "Item.lesser", amount: 20 }] }, worn), { uuid: "Item.lesser", amount: 20, left: 0 });
    assert.deepEqual(foamUsed({ feet: 30, reductions: [] }, worn), { uuid: "Item.moderate", amount: 0, left: 40 });
    assert.equal(foamUsed({ feet: 5, reductions: [] }, worn), null);
});

test("the foam's Effect: Immobilized, standard cover both ways, Escape DC 15 by the ability module's flag, 1 minute, its Hit Points", () => {
    const source = foamEffectSource(10, { item: { name: "Impact Foam Chassis (Moderate)", uuid: "Item.moderate" }, worldTime: 7 });
    assert.equal(source.name, "Impact Foam Chassis (Moderate): foam");
    assert.deepEqual(source.system.rules[0], { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe" });
    assert.deepEqual(source.system.rules.filter((rule) => rule.key === "RollOption").map((rule) => rule.option), ["self:cover-bonus:2", "self:cover-level:standard"]);
    assert.deepEqual(source.system.rules.filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.selector, rule.value]), [["ac", 2], ["reflex", 2], ["stealth", 2], ["attack-roll", -2]]);
    assert.deepEqual([source.flags["pf2e-automatic-ability-resolution"].escape.dc, source.flags["pf2e-automatic-item-resolution"].foam.hp, source.system.duration.value, source.system.duration.unit], [15, 10, 1, "minutes"]);
    assert.match(source.system.description.value, /10 Hit Points \(AC 12\)[^]*\[\[\/act escape dc=15\]\]\{Escape\}/);
});

test("the fell hook: the chassis used up, its foam Effect on the creature, a line to the GMs and its owners", async () => {
    const { foamAfterFall } = await import("../scripts/falls.js");
    const before = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
    const created = [];
    let deleted = 0;
    let updated = null;
    globalThis.game = { ...(before.game ?? {}), users: [{ id: "gm", isGM: true }, { id: "player", isGM: false }], time: { worldTime: 3 }, combat: null };
    globalThis.ChatMessage = { create: async (data) => data, getSpeaker: () => ({}) };
    try {
        const chassis = (quantity) => ({ ...item("Impact Foam Chassis (Moderate)"), uuid: "Actor.a.Item.c", isEquipped: true, system: { ...item("Impact Foam Chassis (Moderate)").system, quantity }, delete: async () => { deleted += 1; }, update: async (data) => { updated = data; } });
        const actor = (one) => ({ uuid: "Actor.a", name: "Faller", items: [one], itemTypes: { consumable: [one] }, testUserPermission: (user) => user.id === "player", createEmbeddedDocuments: async (type, data) => created.push(...data) });
        const message = await foamAfterFall({ token: { name: "Faller", actor: actor(chassis(1)) }, feet: 60, reductions: [{ itemUuid: "Actor.a.Item.c", amount: 30 }] });
        assert.deepEqual([deleted, created.length, created[0].flags["pf2e-automatic-item-resolution"].foam.hp, message.whisper], [1, 1, 10, ["gm", "player"]]);
        assert.match(message.content, /takes 30 off the falling damage, and its foam \(10 Hit Points\) surrounds/);
        const spent = await foamAfterFall({ token: { name: "Faller", actor: actor(chassis(2)) }, feet: 120, reductions: [{ itemUuid: "Actor.a.Item.c", amount: 50 }] });
        assert.deepEqual([updated, created.length], [{ "system.quantity": 1 }, 1]);
        assert.match(spent.content, /the foam disperses/);
    } finally {
        globalThis.game = before.game;
        globalThis.ChatMessage = before.ChatMessage;
    }
});
