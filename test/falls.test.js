// A fall an item eases, through PF2e Automatic Environment Resolution (src/compiler/falls.js, scripts/falls.js, 2026-10-26): the item card's
// Effect with the environment module's flag, and api.fallEases for the items worn with it always on.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { fallEffectSource, fallLine } from "../src/live/card.js";
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
    assert.equal(activation("Aerial Cloak", "Fall Gently").fall.shorter, 30);
    const cat = compileItem(item("Jade Cat"));
    assert.deepEqual([cat.fall.shorter, cat.fall.duration.value, cat.fall.duration.unit], [20, 1, "minutes"]);
    // (Its Balance and terrain stay a note.)
    assert.match(cat.notes.join(" "), /not Off-Guard when you Balance/);
    const wingsuit = activation("Dragonaut's Wingsuit", "Descend");
    assert.deepEqual([wingsuit.fall.noDamage, wingsuit.fall.duration.unit], [true, "minutes"]);
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
