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
import { resistanceEffectSource, resistanceText, senseEffectSource, senseText, speedText, weaponEffectSource, weaponText } from "../src/live/card.js";
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
    // A sentence that says more after it stays a note: "… and ignore difficult terrain for 1 hour".
    const more = ownRow(text("<p>You gain resistance 4 to bludgeoning damage and ignore difficult terrain for 1 hour.</p>"));
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

test("a Speed of a new kind: PF2e's BaseSpeed on the land Speed or a number, for its time; Apply gives the Effect", async () => {
    const LAND = "@actor.system.movement.speeds.land.value";
    // "You gain a fly Speed equal to your Speed until the end of your next turn" (Umbral Wings).
    const [wings] = compileActivations(source("Umbral Wings"));
    assert.deepEqual(wings.plan.item.speeds.map((speed) => [speed.type, speed.value, speed.duration.expiry]), [["fly", LAND, "turn-end"]]);
    assert.equal(speedText(wings.plan.item.speeds[0]), "A fly Speed equal to your land Speed until the end of the next turn");
    // "a swim Speed equal to half your land Speed"; "equal to either your land Speed or 20 feet, whichever is greater"; "of 30
    // feet or your Speed, whichever is lower".
    assert.equal(compileActivations(source("Buoyant Buckle"))[0].plan.item.speeds[0].value, `floor(${LAND}*0.5)`);
    assert.equal(compileActivations(source("Soaring Wings (Major)"))[0].plan.item.speeds[0].value, `max(20,${LAND})`);
    const mudwings = compileItem(source("Thrice-Fried Mudwings"));
    assert.deepEqual([mudwings.item.speeds[0].value, mudwings.item.speeds[0].duration.value], [`min(30,${LAND})`, 10]);
    // "granting you a fly Speed of 25 feet or your land Speed, whichever is slower. This effect lasts for 5 minutes" (Winged).
    const winged = compileActivations(source("Winged"))[0].plan.item.speeds[0];
    assert.deepEqual([winged.type, winged.value, winged.duration.value, winged.duration.unit], ["fly", `min(25,${LAND})`, 5, "minutes"]);
    // Not one under a condition ("If you don't have a fly Speed, you gain a 20-foot fly Speed …"); breathing underwater a note.
    assert.equal(compileActivations(source("Dragonaut's Wingsuit")).find((entry) => entry.activation.name === "Drake's Glide").plan?.item?.speeds, undefined);
    assert.equal(compileActivations(source("Submersible Helmet"))[0].plan.partial, true);
    // Apply: the Effect with PF2e's BaseSpeed rule.
    const cloak = foundry.giveItem(monk, source("Umbral Wings"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: cloak.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /A fly Speed equal to your land Speed until the end of the next turn/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const effect = monk.itemTypes.effect.find((entry) => entry.flags?.[MODULE_ID]?.speed === "fly");
    assert.deepEqual(effect.system.rules, [{ key: "BaseSpeed", selector: "fly", value: LAND }]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.unit, effect.system.duration.expiry], [1, "rounds", "turn-end"]);
});

test("a vision: PF2e's Sense rule, its own end on the note", () => {
    // "you gain darkvision until you deactivate it as an Interact action or the item is no longer invested by you, whichever comes first".
    const [goggles] = compileActivations(source("Obsidian Goggles (Greater)"));
    assert.deepEqual([goggles.plan.item.senses, goggles.plan.partial], [[{ selector: "darkvision", duration: null }], true]);
    // "You gain greater darkvision until the beginning of your next turn, as long as you continue to look through the scope".
    const [scope] = compileActivations(source("Darkvision Scope (Greater)"));
    assert.deepEqual([scope.plan.item.senses[0].selector, scope.plan.item.senses[0].duration.expiry], ["greater-darkvision", "turn-start"]);
    assert.equal(senseText(scope.plan.item.senses[0]), "Greater darkvision until the start of the next turn");
    assert.deepEqual(senseEffectSource(goggles.plan.item.senses[0], { item: { name: "Obsidian Goggles (Greater): Darkvision" } }).system.rules, [{ key: "Sense", selector: "darkvision" }]);
});

test("resistance to a type it makes its user choose: the card's picker, the type picked on Apply", async () => {
    // "grants 5 resistance against a single damage type for 1 hour. Each potion … defend against acid, cold, electricity, fire, or sonic damage".
    const potion = compileItem(source("Potion of Resistance (Lesser)"));
    assert.deepEqual(potion.item.resist.map((entry) => [entry.type, entry.choose, entry.value, entry.duration.value]), [[null, ["acid", "cold", "electricity", "fire", "sonic"], 5, 1]]);
    assert.equal(potion.partial, undefined, "the list's own sentence is read with it");
    // "attuned to one of four energy types (acid, cold, electricity, or fire) … resistance 5 to the attuned energy type and reduces the DC …":
    // the DC on the note; "applied to up to 5 willing creatures", the card's drinker choice.
    const ointment = compileItem(source("Energy Ointment (Lesser)"));
    assert.deepEqual([ointment.item.resist[0].choose, ointment.item.recipient, ointment.partial], [["acid", "cold", "electricity", "fire"], "drinker", true]);
    // "Choose acid, cold, electricity, or fire. The robe grants resistance 15 to the chosen damage type": until its next use.
    const [robe] = compileActivations(source("Chromatic Robe"));
    assert.deepEqual([robe.plan.item.resist[0].value, robe.plan.item.resist[0].duration], [15, null]);
    // Apply: the type picked.
    const card = await (async () => {
        const item = foundry.giveItem(monk, source("Potion of Resistance (Lesser)"));
        const data = item.toObject();
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: monk.id }, actor: monk, token: monk.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        return foundry.messages[foundry.messages.indexOf(message) + 1];
    })();
    assert.match(card.content, /data-air-field="resistType"/);
    assert.match(card.content, /Resistance 5 to acid, cold, electricity, fire or sonic \(one, chosen\) for 1 hour/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, resistType: 3, userId: "player" });
    await settle();
    const effect = monk.itemTypes.effect.filter((entry) => entry.flags?.[MODULE_ID]?.resist).at(-1);
    assert.deepEqual(effect.system.rules, [{ key: "Resistance", type: "fire", value: 5 }]);
    assert.match(card.content, /Monk: Resistance 5 to fire for 1 hour/);
});

test("more resistance and bonus wordings: number first on the creature it's smeared on, splash and area damage, \"bonus against fear effects\", comma lists", () => {
    const row = (html) => ownRow(text(`<p>${html}</p>`));
    const smeared = row("When smeared over a creature, that creature gains 3 resistance to acid damage for 1 minute.");
    assert.deepEqual(smeared.resistances.map((entry) => [entry.type, entry.value, entry.duration.value]), [["acid", 3, 1]]);
    assert.deepEqual(row("After eating it, you gain resistance 3 to area damage and splash damage for 10 minutes.").resistances.map((entry) => entry.type), ["area-damage", "splash-damage"]);
    // (PF2e's own Effects read "a +1 status bonus against emotion and mental effects" as saves.)
    assert.deepEqual(row("For 1 hour, you gain a +1 status bonus against fear effects.").modifiers.map((modifier) => [modifier.selector, modifier.predicate]), [["saving-throw", ["item:trait:fear"]]]);
    assert.deepEqual(row("You gain a +2 item bonus to Acrobatics checks to Escape, Squeeze, or Tumble Through for 1 hour.").modifiers[0].predicate, [{ or: ["action:escape", "action:squeeze", "action:tumble-through"] }]);
});

test("a change to its user's weapons: Magnifying Scope's range increment until the start of the next turn, Dragonbone Arrowhead's thrown 20 feet this turn — PF2e's AdjustStrike", () => {
    const [scope] = compileActivations(source("Magnifying Scope (Major)"));
    assert.deepEqual(scope.plan.item.weapon, [{ property: "range-increment", value: 20, definition: ["item:ranged"], duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" } }]);
    assert.equal(routeOf(scope.plan), "item");
    assert.equal(weaponText(scope.plan.item.weapon[0]), "+20 feet to its ranged weapons' range increment until the start of the next turn");
    const effect = weaponEffectSource(scope.plan.item.weapon[0], { item: { name: "Magnifying Scope (Major): Zoom In" } });
    assert.deepEqual([effect.name, effect.system.rules, effect.system.duration.value, effect.system.duration.expiry], ["Magnifying Scope (Major): Zoom In: weapon", [{ key: "AdjustStrike", mode: "add", property: "range-increment", value: 20, definition: ["item:ranged"] }], 1, "turn-start"]);
    const arrowhead = compileItem(source("Dragonbone Arrowhead"));
    assert.deepEqual(arrowhead.item.weapon.map((adjust) => [adjust.property, adjust.value, adjust.definition, adjust.duration.value, adjust.duration.expiry]), [["weapon-traits", "thrown-20", ["item:melee"], 0, "turn-end"]]);
    assert.equal(weaponText(arrowhead.item.weapon[0]), "Its melee weapons gain thrown 20 feet until the end of the turn");
    // (Its weapon flying back to its hand: the note.)
    assert.equal(arrowhead.partial, true);
});
