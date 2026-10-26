// The objects card (src/compiler/objects.js, src/live/objects-card.js, scripts/objects.js, 2026-10-25): an item that stores, retrieves,
// brings to hand, dons or repairs one of its user's items, or itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { objectsText } from "../src/live/objects-card.js";
import { routeOf } from "../src/live/route.js";
import { objectChoices } from "../scripts/objects.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => (which ? entry.activation.name === which : true)).plan;

test("the reading: store and retrieve in a container, to hand (itself or one picked), don, repair — its wait shared by both", () => {
    const store = activation("Retrieval Belt", "Store Item");
    assert.deepEqual([routeOf(store), store.objects, store.partial], ["objects", { op: "store", maxBulk: 1 }, undefined]);
    const retrieve = activation("Retrieval Belt", "Retrieve Item");
    // (Its minute's wait, shared with Store Item, the plan's trigger.recharge — src/compiler/cooldown.js, 2026-10-26.)
    assert.deepEqual([retrieve.objects, Boolean(retrieve.partial), retrieve.notes, retrieve.trigger.recharge, store.trigger.recharge], [{ op: "retrieve" }, false, undefined, { value: 1, unit: "minutes", shared: ["Store Item"] }, { value: 1, unit: "minutes", shared: ["Retrieve Item"] }]);
    assert.deepEqual(activation("Blackaxe", "Owner's Reclamation").objects, { op: "hand", self: true });
    assert.deepEqual(compileItem(item("Retrieval Prism")).objects, { op: "hand", maxBulk: 1 });
    assert.deepEqual(activation("Crushing Coils").objects, { op: "don", self: true });
    assert.deepEqual(activation("The Forge").objects, { op: "repair", maxBulk: 4 });
    assert.equal(objectsText({ op: "store", maxBulk: 1 }, { name: "Retrieval Belt" }), "Into Retrieval Belt: an item it's holding (1 Bulk or less)");
});

test("the choices: its user's items each op can take", () => {
    const of = (id, name, system) => ({ id, name, type: "equipment", system });
    const actor = { items: [
        of("belt", "Retrieval Belt", { equipped: { carryType: "worn" } }),
        of("rope", "Rope", { bulk: { value: 1 }, equipped: { carryType: "held" } }),
        of("anvil", "Anvil", { bulk: { value: 5 }, equipped: { carryType: "held" } }),
        of("gem", "Gem", { bulk: { value: 0 }, containerId: "belt", equipped: { carryType: "stowed" } }),
        of("shield", "Shield", { bulk: { value: 1 }, hp: { value: 3, max: 20 }, equipped: { carryType: "worn" } })
    ] };
    const names = (objects) => objectChoices(actor, objects, "belt").map((choice) => choice.name);
    assert.deepEqual(names({ op: "store", maxBulk: 1 }), ["Rope"]);
    assert.deepEqual(names({ op: "retrieve" }), ["Gem"]);
    assert.deepEqual(names({ op: "hand", maxBulk: 1 }), ["Gem", "Shield"]);
    assert.deepEqual(names({ op: "repair", maxBulk: 4 }), ["Shield"]);
    assert.deepEqual(names({ op: "don", self: true }), []);
});

test("a weapon made in its user's hand: Boots of the Secret Blade's dagger with each grade's runes, the last one replaced; Necklace of Knives' while it's held", () => {
    const boots = activation("Boots of the Secret Blade", "Draw Secret Blade");
    assert.deepEqual([routeOf(boots), boots.objects, boots.notes, boots.partial], ["objects", { op: "create", self: true, weapon: "dagger", potency: 0, striking: 0, replaces: true }, undefined, undefined]);
    assert.deepEqual([activation("Boots of the Secret Blade (Greater)", "Draw Secret Blade").objects.potency, activation("Boots of the Secret Blade (Major)", "Draw Secret Blade").objects.striking], [1, 2]);
    assert.equal(objectsText(activation("Boots of the Secret Blade (Major)", "Draw Secret Blade").objects), "A +2 greater striking dagger in its user's hand, the last one it made gone: Strike with it");
    const necklace = activation("Necklace of Knives");
    assert.deepEqual(necklace.objects, { op: "create", self: true, weapon: "dagger", potency: 0, striking: 0, whileHeld: true });
    assert.equal(objectsText(necklace.objects), "A dagger in its user's hand, gone once it's out of the hand: Strike with it");
});

test("Rust Scrub: 2d4 Hit Points back to one of its user's damaged items, up to its maximum, the GM's share of the rust a card line", () => {
    const scrub = compileItem(item("Rust Scrub"));
    assert.deepEqual([routeOf(scrub), scrub.objects, scrub.partial, scrub.notes], ["objects", { op: "repair", amount: "2d4", damagedBy: "rust" }, undefined, ["The GM may lower it to what the rust did, when that isn't known."]]);
    assert.equal(objectsText(scrub.objects), "2d4 Hit Points restored, up to its maximum: one of its user's damaged items (what the rust did)");
});

test("Autoload Leathers: one of its user's reload 1 weapons with room for a round and ammunition for it, reloaded (2026-10-26)", () => {
    const autoload = activation("Autoload Leathers", "Autoload");
    assert.deepEqual([routeOf(autoload), autoload.objects, Boolean(autoload.partial)], ["objects", { op: "reload", reload: "1" }, false]);
    assert.equal(objectsText(autoload.objects), "Reloaded with one of its user's rounds for it: one of its user's weapons with reload 1");
    const round = { id: "r1", name: "Round", type: "ammo", quantity: 5, isAmmoFor: (weapon) => weapon.id !== "bow" };
    const pistol = { id: "p1", name: "Pistol", type: "weapon", system: { reload: { value: "1" } }, subitems: [] };
    const loaded = { id: "p2", name: "Loaded Pistol", type: "weapon", system: { reload: { value: "1" } }, subitems: [{ type: "ammo", quantity: 1 }] };
    const bow = { id: "bow", name: "Bow", type: "weapon", system: { reload: { value: "0" } }, subitems: [] };
    assert.deepEqual(objectChoices({ items: [round, pistol, loaded, bow] }, autoload.objects, "leathers"), [{ id: "p1", name: "Pistol" }]);
    assert.deepEqual(objectChoices({ items: [pistol] }, autoload.objects, "leathers"), [], "no ammunition for it");
});

// (A spell an item holds for later, src/compiler/stored-spell.js, 2026-10-26.)
test("stored spells: Furnace of Endings' scroll by grade, cast as the scroll; Spell Bastion's readied, unleashed at the attacker, let go; Ring of Counterspells' let go", async () => {
    const { storable } = await import("../src/compiler/stored-spell.js");
    const furnaces = ["Furnace of Endings", "Furnace of Endings (Greater)", "Furnace of Endings (Major)"].map((name) => compileActivations(item(name))[0].plan.objects);
    assert.deepEqual(furnaces.map((objects) => [objects.op, objects.store.from, objects.store.maxRank]), [["cast-stored", "scroll", 1], ["cast-stored", "scroll", 3], ["cast-stored", "scroll", 5]]);
    const bastion = compileActivations(item("Spell Bastion")).map((entry) => entry.plan.objects);
    assert.deepEqual(bastion.map((objects) => [objects.op, objects.at ?? null]), [["ready-stored", null], ["cast-stored", "attacker"], ["expend-stored", null]]);
    assert.deepEqual(bastion[0].store, { from: "cast", maxRank: 3, maxActions: 2, otherTarget: true });
    assert.equal(compileActivations(item("Ring of Counterspells"))[1].plan.objects.op, "expend-stored");
    assert.deepEqual([storable(bastion[0].store, { rank: 3, actions: 2, traits: [], target: "1 creature" }), storable(bastion[0].store, { rank: 4, actions: 2, target: "1 creature" }), storable(bastion[0].store, { rank: 1, actions: 2, target: "you" }), storable(furnaces[0].store, { rank: 1, actions: 2, traits: ["cold"] })], [true, false, false, false]);
    assert.equal(objectsText(bastion[1], { name: "Spell Bastion" }, { name: "Fireball", rank: 3 }), "Fireball (rank 3) cast from Spell Bastion at the attacker (target it); it's empty after");
    assert.match(objectsText(furnaces[0], { name: "Furnace of Endings" }), /^Nothing stored: store one of its user's scrolls that fits \(the scroll is burned\)$/);
});

test("live: a scroll burned into the furnace, then cast through the spell module at the user's best spell DC, the furnace empty after", async () => {
    const { applyObjectsCard } = await import("../scripts/objects.js");
    const saved = { game: globalThis.game, fromUuid: globalThis.fromUuid, foundry: globalThis.foundry };
    const casts = [];
    const flags = {};
    const furnace = { id: "furnace", name: "Furnace of Endings", uuid: "Actor.a.Item.furnace", flags: { "pf2e-automatic-item-resolution": flags }, setFlag: async (scope, key, value) => { flags[key] = value; }, unsetFlag: async (scope, key) => { delete flags[key]; } };
    let burned = 0;
    const scroll = { id: "scroll", name: "Scroll of Burning Hands", type: "consumable", system: { quantity: 1, spell: { name: "Burning Hands", system: { level: { value: 1 }, time: { value: "2" }, traits: { value: ["fire"] }, target: { value: "" } } } }, delete: async () => { burned += 1; } };
    const items = new Map([["furnace", furnace], ["scroll", scroll]]);
    const actor = { uuid: "Actor.a", items: Object.assign([...items.values()], { get: (id) => items.get(id) }), itemTypes: { spell: [] }, spellcasting: { contents: [{ statistic: { dc: { value: 24 } } }, { statistic: { dc: { value: 21 } } }] } };
    globalThis.foundry = { utils: { deepClone: (value) => JSON.parse(JSON.stringify(value)) } };
    globalThis.fromUuid = async (uuid) => (uuid === "Actor.a" ? actor : { name: "Ogre", uuid });
    globalThis.game = { modules: new Map([["pf2e-automatic-resolution", { api: { castFromItem: async (options) => casts.push(options) } }]]) };
    const state = (stored) => ({ kind: "objects", status: "open", plan: compileActivations(item("Furnace of Endings"))[0].plan, item: { name: "Furnace of Endings", id: "furnace" }, user: { actorUuid: "Actor.a", name: "Ash" }, choices: [], results: [], ...(stored ? { stored } : {}) });
    const message = (one) => ({ getFlag: (scope, key) => (key === "card" ? one : null), update: async (data) => data });
    try {
        const stored = await applyObjectsCard(message(state(null)), { pick: 0 });
        assert.deepEqual([burned, flags.storedSpell?.name, flags.storedSpell?.rank], [1, "Burning Hands", 1]);
        assert.match(stored["flags.pf2e-automatic-item-resolution.card"].results[0], /burned in Furnace of Endings: Burning Hands \(rank 1\) is stored/);
        await applyObjectsCard(message(state({ name: "Burning Hands", rank: 1 })), { targets: ["Scene.s.Token.ogre"] });
        assert.deepEqual([casts.length, casts[0].dc, casts[0].rank, casts[0].spell.name, casts[0].targets.length, flags.storedSpell], [1, 24, 1, "Burning Hands", 1, undefined]);
    } finally {
        Object.assign(globalThis, saved);
    }
});
