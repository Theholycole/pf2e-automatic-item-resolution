// An alchemical item installed in an item, against the stand-in for Foundry: the reading (Living Leaf Weave's elixir of life, Dread
// Helm's ampoule, Bone Dreadnought Plate's lodestone bomb, Ooze Skin's acid flask, Troll Hide's two elixirs), and the item card picking
// one of its user's own, giving its numbers as an Effect, its damage to the creatures around, and using it up.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { installedText } from "../src/live/card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const plan = (name) => compileActivations(source(name))[0].plan;

const foundry = await fakeFoundry();
const wearer = foundry.makeActor({ id: "installed-wearer", name: "Wearer", owners: ["player"] });
const neighbour = foundry.makeActor({ id: "installed-neighbour", name: "Neighbour" });
foundry.place(wearer, 0, 28000);
foundry.place(neighbour, 100, 28000);

test("the reading: what the installed item's numbers give, its time, the rest notes", () => {
    const weave = plan("Living Leaf Weave");
    assert.equal(routeOf(weave), "item");
    assert.deepEqual(weave.item.installed, { name: "elixir of life", count: 1, modifiers: [{ selector: "athletics", predicate: ["action:grapple"] }, { selector: "fortitude-dc", predicate: [{ or: ["action:grapple", "action:disarm", "action:shove"] }] }, { selector: "reflex-dc", predicate: ["action:trip"] }], duration: { mode: "fixed", value: 3, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } });
    assert.deepEqual([weave.partial, weave.notes], [undefined, undefined]);
    const helm = plan("Dread Helm");
    assert.deepEqual([helm.item.installed.modifiers, helm.item.installed.damage, helm.partial], [[{ selector: "intimidation" }], { type: "mental", radius: 5 }, undefined]);
    const plate = plan("Bone Dreadnought Plate");
    // (Its time a minute shorter for each hit of its types, its Effect's flag — scripts/shorten-on-hit.js, 2026-10-26: whole.)
    assert.deepEqual([plate.item.installed.resistance.types, plate.item.installed.duration.value, plate.item.installed.shortensOnHit, Boolean(plate.partial), plate.notes], [["cold", "electricity", "fire", "piercing", "slashing"], 20, { value: 1, unit: "minutes", types: ["cold", "electricity", "fire", "piercing", "slashing"] }, false, undefined]);
    const ooze = plan("Ooze Skin");
    assert.deepEqual([ooze.item.installed.modifiers, ooze.item.installed.duration], [[{ selector: "check", predicate: [{ or: ["action:escape", "action:squeeze"] }] }], { from: "level", unit: "rounds" }]);
    assert.match(ooze.notes[0], /grapples or swallows you/);
    const hide = plan("Troll Hide");
    assert.deepEqual([hide.item.installed.count, hide.item.installed.fastHealing, hide.item.installed.duration.value], [2, true, 8]);
    assert.equal(installedText(weave.item.installed), "From the elixir of life installed: its item bonus to athletics (grapple), fortitude-dc (grapple, disarm, shove), reflex-dc (trip) for 3 rounds; the item used up");
    // (Not one: Magnetic Shield's metal weapons can't be told apart.)
    assert.equal(plan("Magnetic Shield").item?.installed, undefined);
});

async function use(name, { pick = null } = {}) {
    const armor = foundry.giveItem(wearer, source(name));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: armor.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    const at = pick ? card.flags[MODULE_ID].card.installed.findIndex((entry) => entry.name === pick) : 0;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", installedPick: at });
    await settle();
    return card;
}

test("Living Leaf Weave: the elixir of life picked of its user's, its +2 on the Effect for 3 rounds, the elixir used up; none, refused", async () => {
    const errors = foundry.notifications.length;
    const empty = await use("Living Leaf Weave");
    assert.ok(foundry.notifications.slice(errors).some((text) => /Wearer has no elixir of life to install in Living Leaf Weave/.test(text)));
    assert.equal(empty.flags[MODULE_ID].card.status, "open");
    const minor = foundry.giveItem(wearer, source("Elixir of Life (Minor)"));
    const moderate = foundry.giveItem(wearer, source("Elixir of Life (Moderate)"));
    const card = await use("Living Leaf Weave", { pick: "Elixir of Life (Moderate)" });
    assert.deepEqual(card.flags[MODULE_ID].card.installed.map((entry) => [entry.name, entry.bonus, entry.level]), [["Elixir of Life (Minor)", 1, 1], ["Elixir of Life (Moderate)", 2, 9]]);
    const effect = wearer.itemTypes.effect.find((entry) => entry.flags?.[MODULE_ID]?.installed === "elixir of life");
    assert.deepEqual(effect.system.rules.map((rule) => [rule.key, rule.selector, rule.type, rule.value]), [["FlatModifier", "athletics", "item", 2], ["FlatModifier", "fortitude-dc", "item", 2], ["FlatModifier", "reflex-dc", "item", 2]]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.unit], [3, "rounds"]);
    assert.match(card.content, /Wearer: From Elixir of Life \(Moderate\) installed: \+2 item bonus to athletics/);
    assert.deepEqual([moderate.deleted, minor.deleted], [true, undefined], "the one picked used up");
});

test("Dread Helm: +1 to Intimidation from a moderate ampoule, and its 2 mental splash damage on each other creature within 5 feet; Troll Hide's two elixirs: its level as fast healing, both used", async () => {
    const ampoule = foundry.giveItem(wearer, source("Dread Ampoule (Moderate)"));
    const card = await use("Dread Helm");
    assert.deepEqual(neighbour.healed.map((entry) => entry.damage), ["2[mental]"]);
    assert.deepEqual(wearer.healed, [], "not its user");
    assert.match(card.content, /2 mental damage to Neighbour/);
    assert.equal(ampoule.deleted, true);
    const elixirs = foundry.giveItem(wearer, { ...source("Elixir of Life (Lesser)"), system: { ...source("Elixir of Life (Lesser)").system, quantity: 3 } });
    await use("Troll Hide", { pick: "Elixir of Life (Lesser)" });
    const regrowth = wearer.itemTypes.effect.find((entry) => entry.flags?.[MODULE_ID]?.installed === "elixir of life" && (entry.system.rules ?? []).some((rule) => rule.key === "FastHealing"));
    // (2026-10-27: off while its "deactivated" Effect lasts, after electricity or fire damage — scripts/deactivated.js.)
    assert.deepEqual([regrowth.system.rules, regrowth.system.duration.value], [[{ key: "FastHealing", value: 5, predicate: [{ not: "self:effect:air-deactivated-troll-hide" }] }], 8]);
    assert.deepEqual(regrowth.flags[MODULE_ID].deactivatedBy, { types: ["electricity", "fire"], slug: "air-deactivated-troll-hide" });
    assert.equal(elixirs.system.quantity, 1, "two of the three used");
});

test("Potion Patch: one of its user's potions up to its level, picked, used through it (PF2e's own use: its card follows); none, refused", async () => {
    assert.deepEqual([compileItem(source("Potion Patch (Lesser)")).item.patch, compileItem(source("Potion Patch (Greater)")).item.patch], [{ maxLevel: 10 }, { maxLevel: null }]);
    const drinker = foundry.makeActor({ id: "installed-drinker", name: "Drinker", owners: ["player"] });
    foundry.place(drinker, 1000, 28000);
    const apply = async () => {
        const patch = foundry.giveItem(drinker, source("Potion Patch (Lesser)"));
        const data = patch.toObject();
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: patch.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        const card = foundry.messages[foundry.messages.indexOf(message) + 1];
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", potionPick: 0 });
        await settle();
        return card;
    };
    const errors = foundry.notifications.length;
    await apply();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Drinker has no potion for Potion Patch \(Lesser\) \(level 10 or lower\)/.test(text)));
    // (A potion of level 18 can't go in a lesser patch; one of level 3 can.)
    foundry.giveItem(drinker, source("Healing Potion (Major)"));
    const healing = foundry.giveItem(drinker, source("Healing Potion (Lesser)"));
    const used = [];
    healing.consume = async () => used.push(healing.id);
    const card = await apply();
    assert.deepEqual(card.flags[MODULE_ID].card.potions.map((entry) => entry.name), ["Healing Potion (Lesser)"]);
    assert.deepEqual(used, [healing.id]);
    assert.match(card.content, /Drinker: Healing Potion \(Lesser\) used through the patch/);
});

test("Powered Full Plate: its bottled lightning's item bonus to Athletics for 10 minutes, and the armor's Strength requirement lower by PF2e's ItemAlteration — by 2 with a +3 item", async () => {
    const { installedEffectSource } = await import("../src/live/card.js");
    const plate = plan("Powered Full Plate");
    assert.deepEqual([plate.item.installed.strength, plate.partial, plate.notes], [{ by: 1, more: 2, at: 3 }, undefined, undefined]);
    const rules = (bonus) => installedEffectSource(plate.item.installed, { id: "x", name: "Bottled Lightning", level: 1, bonus, splash: 1 }, { item: { name: "Powered Full Plate", uuid: "Actor.a.Item.plate000000000001" } }).system.rules;
    assert.deepEqual(rules(1).map((rule) => [rule.key, rule.property ?? rule.selector, rule.value]), [["FlatModifier", "athletics", 1], ["ItemAlteration", "strength", 1]]);
    assert.deepEqual(rules(3).find((rule) => rule.key === "ItemAlteration"), { key: "ItemAlteration", itemId: "plate000000000001", mode: "subtract", property: "strength", value: 2 });
});
