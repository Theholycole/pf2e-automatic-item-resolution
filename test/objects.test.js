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
