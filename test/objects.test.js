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

test("the reading: store and retrieve in a container, to hand (itself or one picked), don, repair — its cooldown a note", () => {
    const store = activation("Retrieval Belt", "Store Item");
    assert.deepEqual([routeOf(store), store.objects, store.partial], ["objects", { op: "store", maxBulk: 1 }, undefined]);
    const retrieve = activation("Retrieval Belt", "Retrieve Item");
    assert.deepEqual([retrieve.objects, retrieve.partial], [{ op: "retrieve" }, true]);
    assert.match(retrieve.notes[0], /can be activated again for 1 minute/);
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
