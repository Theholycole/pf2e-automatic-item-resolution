// Resistance an item gives its user for its time, against the stand-in for Foundry: the reading (Armorskin Robes' "For 10
// minutes, you gain resistance 5 to slashing and piercing damage but take a -5-foot status penalty to all Speeds"), what
// isn't one, and the item card giving it as an Effect with PF2e's Resistance rules beside its row.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ownRow } from "../src/compiler/rows.js";
import { resistanceEffectSource, resistanceText } from "../src/live/card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const text = (html) => ({ name: "Test Item", type: "consumable", system: { description: { value: html } } });

// (Shared with the other flow tests: this creature stands 190 squares down.)
const foundry = await fakeFoundry();
const monk = foundry.makeActor({ id: "resist-monk", name: "Monk", owners: ["player"] });
foundry.place(monk, 0, 19000);

test("the reading: its user's resistance for the item's time, beside its row; what isn't one", () => {
    const [sheath] = compileActivations(source("Armorskin Robes of Air"));
    assert.equal(routeOf(sheath.plan), "item");
    const minutes = (entry) => [entry.duration.value, entry.duration.unit];
    assert.deepEqual(sheath.plan.item.resist.map((entry) => [entry.type, entry.value, ...minutes(entry)]), [["slashing", 5, 10, "minutes"], ["piercing", 5, 10, "minutes"]]);
    assert.equal(sheath.plan.resolution.outcomes.success.resistances, undefined, "not the core's row: the item card's own");
    // Its row: "but take a -5-foot status penalty to all Speeds", "While activated, … +1 status bonus to your AC against physical ranged attacks".
    assert.deepEqual(sheath.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate ?? null]), [["all-speeds", -5, null], ["ac", 1, ["item:damage:category:physical", "item:ranged"]]]);
    assert.equal(sheath.plan.partial, undefined);
    assert.equal(resistanceText(sheath.plan.item.resist), "Resistance 5 to slashing and piercing for 10 minutes");
    // "you gain resistance 5 to all damage" → all-damage; "you have resistance 10 to electricity".
    assert.deepEqual(ownRow(text("<p>For 1 minute, you gain resistance 5 to all damage.</p>")).resistances.map((entry) => entry.type), ["all-damage"]);
    assert.deepEqual(ownRow(text("<p>For 10 minutes, you have resistance 10 to electricity.</p>")).resistances.map((entry) => [entry.type, entry.value]), [["electricity", 10]]);
    // A sentence that says more after it stays a note: "… and take no fall damage for 24 hours".
    const more = ownRow(text("<p>You gain resistance 8 to bludgeoning damage and take no fall damage for 24 hours.</p>"));
    assert.deepEqual([more.resistances.length, more.unread.length], [1, 1]);
    // Not one: with exceptions, a type to choose, against one hit, or another's.
    for (const html of ["You gain resistance 20 to all damage except force damage for 1 minute.", "For 1 hour, you gain resistance 5 to the chosen damage type.", "You gain resistance 5 to physical damage against the triggering attack.", "For 1 minute, you and all allies in the area gain resistance 10 to spirit damage."]) {
        assert.equal(ownRow(text(`<p>${html}</p>`))?.resistances, undefined, html);
    }
});

test("Armorskin Robes of Air: Apply gives the Speed penalty, the AC bonus and an Effect with PF2e's Resistance rules", async () => {
    const robes = foundry.giveItem(monk, source("Armorskin Robes of Air"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: robes.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /Resistance 5 to slashing and piercing for 10 minutes/);
    const before = foundry.applied.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const effect = monk.itemTypes.effect.find((entry) => entry.flags?.[MODULE_ID]?.resist);
    assert.ok(effect, "the resistance Effect");
    assert.equal(effect.name, "Armorskin Robes of Air: Elemental Sheath: resistance");
    assert.deepEqual(effect.system.rules, [{ key: "Resistance", type: "slashing", value: 5 }, { key: "Resistance", type: "piercing", value: 5 }]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.unit], [10, "minutes"]);
    assert.match(card.content, /Monk: Resistance 5 to slashing and piercing for 10 minutes/);
    // Its row, through the ability module's applyChange: the Speed penalty and the AC bonus against physical ranged attacks.
    const modifiers = foundry.applied.slice(before).map(({ change }) => change.effect?.modifier).filter(Boolean);
    assert.deepEqual(modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate ?? null]), [["all-speeds", -5, null], ["ac", 1, ["item:damage:category:physical", "item:ranged"]]]);
    // A pure source too: no time, unlimited.
    assert.deepEqual(resistanceEffectSource([{ type: "fire", value: 5, duration: null }], { item: { name: "Wayfinder" } }).system.duration.unit, "unlimited");
});
