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

test("Archaic Wayfinder: one cantrip cast into it (not a free action's or a reaction's), cast again from it once", async () => {
    const { storable } = await import("../src/compiler/stored-spell.js");
    const { objects } = compileActivations(item("Archaic Wayfinder"))[0].plan;
    assert.deepEqual([objects.op, objects.store], ["cast-stored", { from: "cast", cantrip: true, maxActions: 3 }]);
    assert.deepEqual([storable(objects.store, { rank: 1, actions: 2, traits: ["cantrip", "fire"] }), storable(objects.store, { rank: 1, actions: 2, traits: ["fire"] }), storable(objects.store, { rank: 1, actions: 0, traits: ["cantrip"] })], [true, false, false]);
});

test("A weapon's other shape (Anchor Spear's longspear, the Shifting rune's any melee weapon in as many hands): the base weapon's numbers on it, its own traits and runes kept", async () => {
    const { reshapeChoices, reshapeWeapon } = await import("../scripts/objects.js");
    const weapon = (id, name, slug, usage, die, traits, extra = {}) => ({ _id: id, name, type: "weapon", system: { slug, baseItem: slug, usage: { value: usage }, range: null, level: { value: 0 }, damage: { die, damageType: "piercing" }, group: "spear", category: "simple", bulk: { value: 1 }, traits: { value: traits }, ...extra } });
    const rows = [weapon("a", "Spear", "spear", "held-in-one-hand", "d6", ["thrown-20"]), weapon("b", "Longspear", "longspear", "held-in-two-hands", "d8", ["reach"]), weapon("c", "Glaive", "glaive", "held-in-two-hands", "d8", ["deadly-d8", "forceful", "reach"]), weapon("d", "Shortbow", "shortbow", "held-in-one-plus-hands", "d6", [], { range: 60 })];
    const saved = { game: globalThis.game };
    globalThis.game = { packs: new Map([["pf2e.equipment-srd", { getIndex: async () => rows, getDocument: async (id) => { const row = rows.find((entry) => entry._id === id); return row ? { system: row.system, toObject: () => structuredClone(row) } : null; } }]]) };
    try {
        let updated = null;
        const anchor = { name: "Anchor Spear", system: { baseItem: "spear", usage: { value: "held-in-one-hand" }, traits: { value: ["magical", "thrown-20"] }, damage: { die: "d6", dice: 3 } }, update: async (changes) => { updated = changes; } };
        assert.deepEqual(await reshapeChoices(anchor, { op: "reshape", forms: ["longspear", "spear"] }), [{ id: "b", name: "Longspear" }]);
        assert.equal(await reshapeWeapon(anchor, "b"), "Longspear");
        assert.deepEqual([updated["system.baseItem"], updated["system.damage.die"], updated["system.usage.value"], updated["system.traits.value"]], ["longspear", "d8", "held-in-two-hands", ["magical", "reach"]]);
        const shifting = { system: { baseItem: "longspear", usage: { value: "held-in-two-hands" } } };
        assert.deepEqual((await reshapeChoices(shifting, { op: "reshape", sameHands: true })).map((choice) => choice.name), ["Glaive"]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Armory Bracelet: a common base weapon of its charms' groups, picked; its runes lowered after a minute; its weapon gone at its user's next daily preparations", async () => {
    const plans = ["Minor", "Lesser", "Moderate", "Greater", "Major"].map((grade) => activation(`Armory Bracelet (${grade})`));
    assert.deepEqual(plans.map((plan) => [plan.objects.potency, plan.objects.striking, plan.objects.then.potency, plan.objects.then.striking, Boolean(plan.partial)]), [[1, 1, 0, 0, false], [1, 1, 1, 0, false], [2, 1, 1, 1, false], [2, 2, 2, 1, false], [3, 2, 2, 2, false]]);
    assert.deepEqual([plans[2].objects.ammo, plans[2].objects.untilRest, plans[2].objects.choose.groups.length], [20, true, 15]);
    const { charmChoices } = await import("../scripts/objects.js");
    const { lowerMadeRunes } = await import("../scripts/expiring.js");
    const row = (id, name, group, rarity = "common", extra = {}) => ({ _id: id, name, type: "weapon", system: { slug: name.toLowerCase(), baseItem: name.toLowerCase(), group, level: { value: 0 }, traits: { rarity }, ...extra } });
    const rows = [row("a", "Longsword", "sword"), row("b", "Katana", "sword", "uncommon"), row("c", "Longbow", "bow"), row("d", "Flaming Longsword", "sword", "common", { baseItem: "longsword", level: { value: 8 } }), row("e", "Whip", "flail")];
    const saved = { game: globalThis.game };
    try {
        globalThis.game = { packs: new Map([["pf2e.equipment-srd", { getIndex: async () => rows }]]) };
        assert.deepEqual((await charmChoices({ choose: { groups: ["sword", "bow"], common: true } })).map((choice) => choice.name), ["Longbow (bow)", "Longsword (sword)"]);
        const updates = [];
        const made = { flags: { "pf2e-automatic-item-resolution": { made: { downgradeAt: 100, downgrade: { potency: 1, striking: 1 } } } }, update: async (changes) => updates.push(changes) };
        globalThis.game = { actors: [{ items: { contents: [made] } }], scenes: [] };
        await lowerMadeRunes(99);
        assert.equal(updates.length, 0);
        await lowerMadeRunes(100);
        assert.deepEqual([updates[0]["system.runes.potency"], updates[0]["system.runes.striking"]], [1, 1]);
    } finally {
        Object.assign(globalThis, saved);
    }
});
