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
import { lightEffectSource, lightText, resistanceEffectSource, resistanceText, senseEffectSource, senseText, speedText, weaponEffectSource, weaponText } from "../src/live/card.js";
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
    // (Thrice-Fried Mudwings' meal: the first of its ways, src/compiler/ways.js.)
    const mudwings = compileItem(source("Thrice-Fried Mudwings")).ways[0].plan;
    assert.deepEqual([mudwings.item.speeds[0].value, mudwings.item.speeds[0].duration.value], [`min(30,${LAND})`, 10]);
    // "granting you a fly Speed of 25 feet or your land Speed, whichever is slower. This effect lasts for 5 minutes" (Winged).
    const winged = compileActivations(source("Winged"))[0].plan.item.speeds[0];
    assert.deepEqual([winged.type, winged.value, winged.duration.value, winged.duration.unit], ["fly", `min(25,${LAND})`, 5, "minutes"]);
    // Breathing underwater in words beside it (2026-10-25, test/reader-needs.test.js).
    // (Dragonaut's Wingsuit's "If you don't have a fly Speed, you gain a 20-foot fly Speed for Fly actions from this activation" is the activation's
    // own moves' Speed, src/compiler/move-actions.js — to the end of the turn, 2026-10-26.)
    assert.deepEqual(compileActivations(source("Dragonaut's Wingsuit")).find((entry) => entry.activation.name === "Drake's Glide").plan?.item?.speeds?.map((speed) => [speed.type, speed.value]), [["fly", 20]]);
    assert.equal(compileActivations(source("Submersible Helmet"))[0].plan.partial, undefined);
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

test("a vision: PF2e's Sense rule, another way it ends on the note or its Effect", () => {
    // "you gain darkvision until you deactivate it as an Interact action or the item is no longer invested by you, whichever comes first".
    const [goggles] = compileActivations(source("Obsidian Goggles (Greater)"));
    // (Its own end now read: toggled by its next activation, ended by uninvesting.)
    assert.deepEqual([goggles.plan.item.senses, goggles.plan.partial], [[{ selector: "darkvision", duration: null, toggle: true, invested: true }], undefined]);
    // "You gain greater darkvision until the beginning of your next turn, as long as you continue to look through the scope".
    const [scope] = compileActivations(source("Darkvision Scope (Greater)"));
    assert.deepEqual([scope.plan.item.senses[0].selector, scope.plan.item.senses[0].duration.expiry], ["greater-darkvision", "turn-start"]);
    // (Its user's to keep looking, on the Effect's words: 2026-10-25.)
    assert.equal(senseText(scope.plan.item.senses[0]), "Greater darkvision until the start of the next turn, as long as you continue to look through the scope");
    assert.deepEqual(senseEffectSource(goggles.plan.item.senses[0], { item: { name: "Obsidian Goggles (Greater): Darkvision" } }).system.rules, [{ key: "Sense", selector: "darkvision" }]);
});

test("other senses with their acuity and range: Blood Sight Elixir's bloodsense (its range a sentence after), PF2e's Sense rule with them", () => {
    const lesser = compileItem(source("Blood Sight Elixir (Lesser)"));
    assert.deepEqual(lesser.item.senses.map(({ selector, acuity, range, duration }) => [selector, acuity, range, duration.value, duration.unit]), [["bloodsense", "imprecise", 60, 10, "minutes"]]);
    assert.equal(compileItem(source("Blood Sight Elixir (Major)")).item.senses[0].acuity, "precise");
    assert.equal(senseText(lesser.item.senses[0]), "Imprecise bloodsense 60 feet for 10 minutes");
    assert.deepEqual(senseEffectSource(lesser.item.senses[0], { item: { name: "Blood Sight Elixir (Lesser)" } }).system.rules, [{ key: "Sense", selector: "bloodsense", acuity: "imprecise", range: 60 }]);
    // (Its range sentence, which says what the sense detects, read with it: not a note. The major elixir's approximations were one; since
    // 2026-10-27 they're words on its note Effect, src/compiler/visibility.js.)
    assert.deepEqual([lesser.partial, lesser.unread], [undefined, undefined]);
    assert.equal(compileItem(source("Blood Sight Elixir (Major)")).partial, undefined);
});

test("PF2e's own rules on its user (item.ruleEffects): Mirrorblade's 10 minutes of not being Off-Guard to flanking creatures — flanking.offGuardable false, as PF2e's Deny Advantage sets it; Apply puts the Effect on its user", async () => {
    const { ruleEffectSource } = await import("../src/live/card.js");
    const [guard] = compileActivations(source("Mirrorblade"));
    const [entry] = guard.plan.item.ruleEffects;
    assert.deepEqual([entry.rules, entry.duration.value, entry.duration.unit, guard.plan.partial, guard.plan.noteOnly], [[{ key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.offGuardable", value: false }], 10, "minutes", undefined, undefined]);
    // (And Deny Advantage's own words, Sturdy Neck Stock's: PF2e's rule for it, offGuardable its user's level.)
    const [stock] = compileActivations(source("Sturdy Neck Stock"));
    assert.deepEqual([stock.plan.item.ruleEffects[0].rules[0].value, stock.plan.item.ruleEffects[0].duration.value, stock.plan.noteOnly], ["@actor.level", 1, undefined]);
    const effect = ruleEffectSource(entry, { item: { name: "Mirrorblade" } });
    assert.deepEqual([effect.name, effect.system.duration.value, effect.system.rules[0].path], ["Mirrorblade: not off-guard to flankers", 10, "system.attributes.flanking.offGuardable"]);
    const blade = foundry.giveItem(monk, source("Mirrorblade"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: blade.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.ok(monk.itemTypes.effect.some((one) => one.flags?.[MODULE_ID]?.ruleEffect === "not off-guard to flankers"), "the Effect on its user");
});

test("a light its user sheds: PF2e's TokenLight rule, its dim light the whole radius; a torch's for \"like a torch\"", () => {
    // Sprite Apple's "you shed bright light in a 20-foot emanation (and dim light for the next 20 feet)", for 10 minutes.
    const apple = compileItem(source("Sprite Apple (Pink)"));
    assert.deepEqual(apple.item.light.map((light) => [light.bright, light.dim, light.duration.value, light.duration.unit]), [[20, 40, 10, "minutes"]]);
    // (Boughshatter's Absorb Corruption, 2026-10-26: "the morningstar glows with dim green light in a 20-foot radius" while its rune lasts.)
    const glow = compileActivations(source("Boughshatter")).find((entry) => entry.activation.name === "Absorb Corruption").plan;
    assert.deepEqual([glow.item.light.map((light) => [light.bright, light.dim, light.duration.value, light.duration.unit]), Boolean(glow.partial)], [[[0, 20, 1, "minutes"]], false]);
    // (Its "can't be Concealed" sentence in the light's words, 2026-10-26.)
    assert.equal(lightText(apple.item.light[0]), "Bright light in 20 feet and dim light to 40 feet for 10 minutes; while it sheds it, it can't be concealed if it's visible, and invisible it's concealed rather than undetected");
    assert.deepEqual(lightEffectSource(apple.item.light[0], { item: { name: "Sprite Apple (Pink)" } }).system.rules, [{ key: "TokenLight", value: { bright: 20, dim: 40 } }]);
    // (In this module's words: a stew that makes its eater glow like a torch for an hour; dim light alone.)
    const stew = (text) => compileItem({ name: "Stand-in Stew", type: "consumable", system: { category: "other", level: { value: 2 }, traits: { value: ["alchemical", "consumable"] }, description: { value: `<p><strong>Activate</strong> 1 minute (manipulate)</p><hr /><p>${text}</p>` } } });
    assert.deepEqual(stew("After eating it, you shed a warm light like a torch for 1 hour.").item.light.map((light) => [light.bright, light.dim]), [[20, 40]]);
    assert.deepEqual(stew("After eating it, you shed dim light in a 10-foot radius for 1 hour.").item.light.map((light) => [light.bright, light.dim]), [[0, 10]]);
});

test("a light the item its user holds or wears sheds: the item's own wordings, a hooded lantern's, a time a sentence later; not a weapon's gem or a planted toadstool", () => {
    const lightOf = (name, index = null) => (index === null ? compileItem(source(name)) : compileActivations(source(name))[index].plan).item.light.map(({ bright, dim, duration, note }) => [bright, dim, duration ? `${duration.value} ${duration.unit}` : null, note ?? null]);
    // Candlecap's "The candlecap sheds dim light in a 20-foot radius", Vine of Roses' "glows as bright as a torch", Eclipse's "causing it to
    // shed light as a torch", Shining Hackle's "glows even brighter, shedding bright light in a 20-foot radius (and dim light for the next 20
    // feet)": until put out.
    assert.deepEqual(lightOf("Candlecap", 0), [[0, 20, null, null]]);
    assert.deepEqual(lightOf("Vine of Roses", 0), [[20, 40, null, null]]);
    assert.deepEqual(lightOf("Eclipse", 0), [[20, 40, null, null]]);
    assert.deepEqual(lightOf("Shining Hackle", 0), [[20, 40, null, null]]);
    // Oathlamp of Accord's light "as normal for a hooded lantern": 30 feet bright, 30 more dim.
    assert.deepEqual(lightOf("Oathlamp of Accord", 0), [[30, 60, null, null]]);
    // Candle's "A lit candle sheds dim light in a 10-foot radius for 8 hours"; One-Hour Flower's 30 feet, "At the end of an hour", shrinking.
    assert.deepEqual(lightOf("Candle"), [[0, 10, "8 hours", null]]);
    assert.deepEqual(lightOf("One-Hour Flower"), [[30, 30, "1 hours", "its radius shrinks by 10 feet every 20 minutes (by hand)"]]);
    assert.equal(lightText(compileItem(source("One-Hour Flower")).item.light[0]), "Bright light in 30 feet for 1 hour; its radius shrinks by 10 feet every 20 minutes (by hand)");
    assert.equal(lightText(compileActivations(source("Candlecap"))[0].plan.item.light[0]), "Dim light in 20 feet, until put out (its next activation)");
    // Not the weapon a limning gem is applied to ("shedding dim light"), nor Kimanéz Luminescent Toadstool's own glow once planted.
    // (2026-10-27: the gem's weapon light is src/compiler/area-readings.js's now, for the whetstone's minute with its hits' outline — not this
    // reading's of a light with no time.)
    assert.deepEqual(compileItem(source("Limning Gem"))?.item?.light, [{ bright: 0, dim: 10, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]);
    assert.equal(compileItem(source("Kimanéz Luminescent Toadstool"))?.item?.light, undefined);
});

test("Candlecap: its Apply lights its user's token, its next activation's Apply puts the light out", async () => {
    const cap = foundry.giveItem(monk, source("Candlecap"));
    const press = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: cap.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const lit = await press();
    const lights = () => monk.itemTypes.effect.filter((entry) => entry.flags?.[MODULE_ID]?.light);
    assert.deepEqual(lights().map((effect) => [effect.system.rules[0].value.dim, effect.system.duration.unit]), [[20, "unlimited"]]);
    assert.match(lit.content, /Monk: Dim light in 20 feet, until put out/);
    const out = await press();
    assert.equal(lights().length, 0);
    assert.match(out.content, /Monk: Candlecap&#39;s light put out/);
});

test("Obsidian Goggles (Greater): darkvision until deactivated — its next activation's Apply ends it — or until the goggles are no longer invested", async () => {
    const plan = compileActivations(source("Obsidian Goggles (Greater)"))[0].plan;
    assert.deepEqual([plan.item.senses, plan.partial, plan.notes ?? []], [[{ selector: "darkvision", duration: null, toggle: true, invested: true }], undefined, []]);
    const goggles = foundry.giveItem(monk, source("Obsidian Goggles (Greater)"));
    const press = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: goggles.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const sight = () => monk.itemTypes.effect.filter((entry) => entry.flags?.[MODULE_ID]?.sense === "darkvision");
    const on = await press();
    assert.match(on.content, /Monk: Darkvision until deactivated \(its next activation\) or no longer invested/);
    assert.deepEqual(sight().map((effect) => [effect.system.duration.unit, effect.flags[MODULE_ID].untilUninvested]), [["unlimited", goggles.id]]);
    const off = await press();
    assert.equal(sight().length, 0);
    assert.match(off.content, /Monk: Obsidian Goggles \(Greater\)[^<]*darkvision deactivated/);
    // (On again, then the goggles uninvested: gone.)
    await press();
    assert.equal(sight().length, 1);
    await foundry.call("updateItem", goggles, { system: { equipped: { invested: false } } });
    await settle();
    assert.equal(sight().length, 0);
});

test("resistance to a type it makes its user choose: the card's picker, the type picked on Apply", async () => {
    // "grants 5 resistance against a single damage type for 1 hour. Each potion … defend against acid, cold, electricity, fire, or sonic damage".
    const potion = compileItem(source("Potion of Resistance (Lesser)"));
    assert.deepEqual(potion.item.resist.map((entry) => [entry.type, entry.choose, entry.value, entry.duration.value]), [[null, ["acid", "cold", "electricity", "fire", "sonic"], 5, 1]]);
    assert.equal(potion.partial, undefined, "the list's own sentence is read with it");
    // "attuned to one of four energy types (acid, cold, electricity, or fire) … resistance 5 to the attuned energy type and reduces the DC …":
    // the DC 2 lower for that type's persistent damage (PF2e's ItemAlteration on it); "applied to up to 5 willing creatures", each one
    // targeted.
    const ointment = compileItem(source("Energy Ointment (Lesser)"));
    assert.deepEqual([ointment.item.resist[0].choose, ointment.item.resist[0].recoveryDC, ointment.item.recipient, ointment.targeting.target, ointment.partial], [["acid", "cold", "electricity", "fire"], 2, "targets", "up to 5 creatures", undefined]);
    const { chosenResistances } = await import("../src/live/card.js");
    const cold = chosenResistances(ointment.item.resist, 1);
    assert.deepEqual(resistanceEffectSource(cold, { item: { name: "Energy Ointment (Lesser)" } }).system.rules, [{ key: "Resistance", type: "cold", value: 5 }, { key: "ItemAlteration", itemType: "condition", property: "pd-recovery-dc", mode: "subtract", value: 2, predicate: ["item:damage:type:cold"] }]);
    assert.equal(resistanceText(cold), "Resistance 5 to cold, and the flat check to end persistent cold damage 2 easier for 10 minutes");
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
    // (Its weapon flying back to its hand: the weapon's way home, still in its user's inventory — no rule, not a note.)
    assert.deepEqual([arrowhead.partial, arrowhead.unread], [undefined, undefined]);
});

test("extra damage on its user's Strikes for a while: Martial Mayhem Mutagen's precision damage on melee Strikes against off-guard creatures — PF2e's DamageDice (a FlatModifier for a number)", async () => {
    const { strikeDamageEffectSource, strikeDamageText } = await import("../src/live/card.js");
    const moderate = compileItem(source("Martial Mayhem Mutagen (Moderate)"));
    const [extra] = moderate.item.strikeDamage;
    assert.deepEqual([extra.diceNumber, extra.dieSize, extra.category, extra.predicate, extra.duration.value, extra.duration.unit], [1, "d4", "precision", ["item:melee", "target:condition:off-guard"], 10, "minutes"]);
    assert.equal(strikeDamageText(extra), "+1d4 precision damage on melee Strikes against off-guard creatures for 10 minutes");
    assert.deepEqual(strikeDamageEffectSource(extra, { item: { name: "Martial Mayhem Mutagen (Moderate)" } }).system.rules, [{ key: "DamageDice", selector: "strike-damage", category: "precision", predicate: ["item:melee", "target:condition:off-guard"], label: "Martial Mayhem Mutagen (Moderate)", diceNumber: 1, dieSize: "d4" }]);
    const lesser = compileItem(source("Martial Mayhem Mutagen (Lesser)")).item.strikeDamage[0];
    assert.deepEqual(strikeDamageEffectSource(lesser, { item: { name: "Lesser" } }).system.rules[0], { key: "FlatModifier", selector: "strike-damage", damageCategory: "precision", predicate: ["item:melee", "target:condition:off-guard"], label: "Lesser", value: 1 });
    // (Its other words — the off-guard after a hit, the drawback's Clumsy after a miss — its attack riders; its opening paragraph flavor:
    // nothing left.)
    assert.equal(moderate.partial, undefined);
});

test("an unarmed attack its user gains, PF2e's Strike rule: Ring of the Tiger's agile claw (1d6 slashing) until the end of the turn, Tentacle Potion (Greater)'s 1d6 bludgeoning sweep limb for its 24 hours; Chain of Command's own weapon gaining nonlethal for 1 minute", async () => {
    const { attackEffectSource, attackText } = await import("../src/live/card.js");
    const [ring] = compileActivations(source("Ring of the Tiger"));
    const [claw] = ring.plan.item.attacks;
    assert.equal(routeOf(ring.plan), "item");
    assert.equal(attackText(claw), "A claw unarmed attack (1d6 slashing; agile) until the end of the turn");
    const effect = attackEffectSource(claw, { item: { name: "Ring of the Tiger" } });
    assert.deepEqual([effect.system.rules, effect.system.duration.value, effect.system.duration.expiry], [[{ key: "Strike", category: "unarmed", group: "brawling", baseType: "claw", damage: { base: { damageType: "slashing", dice: 1, die: "d6" } }, label: "Claw", range: null, slug: "claw-ring-of-the-tiger", traits: ["unarmed", "agile"] }], 0, "turn-end"]);
    const [greater] = compileActivations(source("Ring of the Tiger (Greater)"));
    assert.equal(greater.plan.item.attacks[0].dice, 2);
    const tentacle = compileItem(source("Tentacle Potion (Greater)")).item.attacks[0];
    assert.equal(attackText(tentacle), "A tentacle unarmed attack (1d6 bludgeoning; sweep) for 24 hours");
    const [chain] = compileActivations(source("Chain of Command"));
    assert.deepEqual(chain.plan.item.weapon.map((adjust) => [adjust.property, adjust.value, adjust.mode, adjust.own, adjust.duration.value, adjust.duration.unit]), [["weapon-traits", "nonlethal", "add", true, 1, "minutes"]]);
    assert.equal(weaponText(chain.plan.item.weapon[0]), "The weapon gains nonlethal for 1 minute");
});

test("fast healing for a while, PF2e's FastHealing rule (its words and Effect); Infernal Health's 25 at each turn's start, which spirit damage stops, its own healing instead (2026-10-27)", async () => {
    const { fastHealingEffectSource, fastHealingText } = await import("../src/live/card.js");
    const healing = { value: 25, duration: { mode: "fixed", value: 6, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } };
    assert.equal(fastHealingText(healing), "Fast healing 25 for 6 rounds");
    assert.deepEqual(fastHealingEffectSource(healing, { item: { name: "Infernal Health" } }).system.rules, [{ key: "FastHealing", value: 25 }]);
    const [health] = compileActivations(source("Infernal Health"));
    assert.deepEqual([health.plan.item.fastHealing, health.plan.item.ruleEffects[0].turnHeal, health.plan.partial], [undefined, { formula: "25", at: "start", unless: "spirit" }, undefined]);
});

test("a tattoo of one animal (Tooth and Claw Tattoo): the ways card's pick of the animal, its unarmed attack for 1 minute copying its user's best unarmed attack's die and traits", async () => {
    const { attackEffectSource, attackText } = await import("../src/live/card.js");
    const [tattoo] = compileActivations(source("Tooth and Claw Tattoo"));
    assert.deepEqual([tattoo.plan.builtin, tattoo.plan.ways.length, tattoo.plan.ways[4].name], ["ways", 9, "Cat"]);
    const [claw] = tattoo.plan.ways[4].plan.item.attacks;
    assert.equal(attackText(claw), "A claw unarmed attack (your best unarmed attack's damage and traits, slashing) for 1 minute");
    const monk = { system: { actions: [{ item: { system: { category: "unarmed", damage: { die: "d4" }, traits: { value: ["agile", "finesse", "nonlethal", "unarmed"] } } } }, { item: { system: { category: "unarmed", damage: { die: "d8" }, traits: { value: ["unarmed", "forceful"] } } } }] } };
    const [rule] = attackEffectSource(claw, { item: { name: "Tooth and Claw Tattoo" }, actor: monk }).system.rules;
    assert.deepEqual([rule.damage.base, rule.traits, rule.baseType], [{ damageType: "slashing", dice: 1, die: "d8" }, ["unarmed", "forceful"], "claw"]);
});

test("armor recalling a victory (Victory Plate): the ways card's pick of the creature's trait, each way its resistance for 1 minute (good and evil as holy and unholy, an ooze's precision higher)", () => {
    const [, recall] = compileActivations(source("Victory Plate"));
    assert.equal(recall.plan.builtin, "ways");
    const ways = Object.fromEntries(recall.plan.ways.map((way) => [way.name, way.plan.item.resist[0]]));
    assert.deepEqual(Object.keys(ways), ["Aberration or Fey: mental", "Celestial: holy", "Construct: poison", "Dragon or Elemental: acid", "Dragon or Elemental: cold", "Dragon or Elemental: electricity", "Dragon or Elemental: fire", "Dragon or Elemental: sonic", "Fiend: unholy", "Ooze: precision", "Undead: void"]);
    assert.deepEqual([ways["Ooze: precision"].value, ways["Fiend: unholy"].value, ways["Celestial: holy"].duration.value, ways["Celestial: holy"].duration.unit], [10, 5, 1, "minutes"]);
    assert.equal(resistanceText([ways["Ooze: precision"]]), "Resistance 10 to precision for 1 minute");
    assert.deepEqual(resistanceEffectSource([ways["Ooze: precision"]], { item: { name: "Victory Plate" } }).system.rules, [{ key: "Resistance", type: "precision", value: 10 }]);
    const [, greater] = compileActivations(source("Victory Plate (Greater)"));
    assert.deepEqual(greater.plan.ways.filter((way) => /Ooze|Undead/.test(way.name)).map((way) => way.plan.item.resist[0].value), [20, 10]);
});

test("a talisman of one dragon: Dragonclaw Scutcheon's immunity to the picked type until the end of the next turn (PF2e's Immunity rule), Dragontooth Trophy's triggering Strike of that damage type", () => {
    const scutcheon = compileItem(source("Dragonclaw Scutcheon"));
    assert.equal(scutcheon.builtin, "ways");
    const fire = scutcheon.ways.find((way) => way.name === "Fire").plan.item.resist;
    assert.equal(resistanceText(fire), "Immunity to fire until the end of the next turn");
    assert.deepEqual(resistanceEffectSource(fire, { item: { name: "Dragonclaw Scutcheon" } }).system.rules, [{ key: "Immunity", type: "fire" }]);
    // (2026-10-27: the three talismans' set a one-off, src/compiler/one-offs.js — its words a line of each way's card, the ways plan whole.)
    assert.match(scutcheon.ways.find((way) => way.name === "Fire").plan.notes.at(-1), /8th-rank Dragon Breath focus spell \(DC 35 basic Reflex save\)/);
    assert.deepEqual([scutcheon.notes, scutcheon.partial], [undefined, undefined]);
    const trophy = compileItem(source("Dragontooth Trophy"));
    const cold = trophy.ways.find((way) => way.name === "Cold").plan;
    assert.deepEqual([routeOf(cold), cold.strike.alteration, cold.strike.hit], ["strike", "cold", true]);
    assert.ok(cold.notes.includes("Until the end of your next turn, the affixed weapon's other Strikes deal cold damage too (by hand)."));
});

test("resistance to all damage but some (Silhouette Cloak): PF2e's Resistance with exceptions and doubled against non-magical; its reaction the first activation's resistance until the end of the turn, the light trait's exception a note", () => {
    const [shadow, fold] = compileActivations(source("Silhouette Cloak"));
    const [resist] = shadow.plan.item.resist;
    // (2026-10-27: the light trait's exception read too, PF2e's "light" — src/compiler/silhouette.js; its other rules a note Effect.)
    assert.deepEqual([resist.type, resist.value, resist.exceptions, resist.doubleVs], ["all-damage", 20, ["force", "ghost-touch", "light"], ["non-magical"]]);
    assert.deepEqual(resistanceEffectSource([resist], { item: { name: "Silhouette Cloak" } }).system.rules, [{ key: "Resistance", type: "all-damage", value: 20, exceptions: ["force", "ghost-touch", "light"], doubleVs: ["non-magical"] }]);
    assert.equal(shadow.plan.unread, undefined);
    assert.equal(resistanceText(fold.plan.item.resist), "Resistance 20 to all damage except force, ghost touch and light, double against non magical until the end of the turn");
    // (Its exceptions in parentheses, Phase Spike's during its Stride.)
    const [stride] = compileActivations(source("Phase Spike"));
    assert.equal(resistanceText(stride.plan.item.resist), "Resistance 10 to all damage except force, spirit and ghost touch, double against non magical until the end of the turn");
});

test("a shield changing form until activated again (Sapling Shield): a tower shield's +2 AC and –5-foot Speed, its Hardness and Bulk 2 higher, by PF2e's ItemAlteration on that shield; Take Cover a note", async () => {
    const { shieldFormEffectSource, shieldFormText } = await import("../src/live/card.js");
    const [sapling] = compileActivations(source("Sapling Shield (Major)"));
    const form = sapling.plan.item.shieldForm;
    assert.equal(routeOf(sapling.plan), "item");
    assert.equal(shieldFormText(form), "The shield becomes a tower shield (+2 AC, a -5-foot Speed penalty, its Hardness and Bulk 2 higher; it can Take Cover as a tower shield does: PF2e's Take Cover, greater cover with it raised) until it's activated again");
    const effect = shieldFormEffectSource(form, { item: { name: "Sapling Shield (Major)", uuid: "Actor.a.Item.shield0000000001" } });
    assert.deepEqual([effect.system.rules, effect.system.duration.unit, effect.flags["pf2e-automatic-item-resolution"]], [[{ key: "ItemAlteration", itemId: "shield0000000001", mode: "override", property: "ac-bonus", value: 2 }, { key: "ItemAlteration", itemId: "shield0000000001", mode: "override", property: "speed-penalty", value: -5 }, { key: "ItemAlteration", itemId: "shield0000000001", mode: "add", property: "hardness", value: 2 }, { key: "ItemAlteration", itemId: "shield0000000001", mode: "add", property: "bulk", value: 2 }], "unlimited", { shieldForm: "shield0000000001" }]);
    // (Its Take Cover PF2e's own action and Effect: Cover, the card's line — not a note.)
    assert.deepEqual([sapling.plan.notes, sapling.plan.partial], [undefined, undefined]);
});
