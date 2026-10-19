// A weapon lent a property rune for a while, against the stand-in for Foundry: the reading (Burial Oil's "applied to a weapon
// grants the benefits of a Vitalizing rune for 1 minute"), PF2e's key for the rune, and the item card's Effect with PF2e's
// AdjustStrike rule on the weapon picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { readRuneLoan, runeKey } from "../src/compiler/rune-loans.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 240 squares down.)
const foundry = await fakeFoundry();
const fighter = foundry.makeActor({ id: "rune-fighter", name: "Fighter", owners: ["player"] });
foundry.place(fighter, 0, 24000);

test("the reading: the rune, PF2e's key for it, its time; not a passive one or an item with PF2e's own Effect", () => {
    const oil = compileItem(source("Burial Oil"));
    assert.equal(routeOf(oil), "item");
    assert.deepEqual(oil.item.rune, { key: "disrupting", name: "Vitalizing", duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, own: false });
    assert.deepEqual([compileItem(source("Oil of Swiftness")).item.rune.key, compileItem(source("Burial Oil (Greater)")).item.rune.key], ["speed", "greater-disrupting"]);
    assert.equal(runeKey("Ghost Touch"), "ghost-touch");
    // Not: a passive one, PF2e's own Effect (Wounding Oil links "Effect: Wounding Oil").
    assert.equal(readRuneLoan("While invested, this aeon stone grants the benefit of the Ghost Touch property rune to your weapons."), null);
    assert.equal(compileItem(source("Wounding Oil")).item.rune, undefined);
});

test("Burial Oil: the card picks the weapon; Apply gives its user an Effect with PF2e's AdjustStrike adding the rune to it", async () => {
    const sword = foundry.giveItem(fighter, source("Longsword"));
    const axe = foundry.giveItem(fighter, source("Battle Axe"));
    fighter.weapons.push(sword, axe);
    const oil = foundry.giveItem(fighter, source("Burial Oil"));
    const data = oil.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: oil.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.match(card.content, /data-air-field="runeWeapon"/);
    assert.match(card.content, /Gives the weapon picked the Vitalizing rune for 1 minute/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", runeWeapon: 1 });
    await settle();
    const effect = fighter.created.find((entry) => entry.flags?.[MODULE_ID]?.rune);
    assert.ok(effect, "the rune's Effect");
    assert.deepEqual(effect.system.rules, [{ key: "AdjustStrike", mode: "add", property: "property-runes", value: "disrupting", definition: [`item:id:${axe.id}`] }]);
    assert.deepEqual([effect.system.duration.value, effect.system.duration.unit], [1, "minutes"]);
    assert.match(card.content, /Fighter: Gives Battle Axe the Vitalizing rune for 1 minute/);
});

test("Boughshatter: one of three runes, picked on the card (Grievous), on the weapon itself", async () => {
    const mace = foundry.giveItem(fighter, source("Boughshatter"));
    fighter.weapons.push(mace);
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: mace.uuid, activation: 1, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.ok(card, "the item card");
    assert.match(card.content, /data-air-field="runeChoice"/);
    assert.match(card.content, /Gives its weapon the Decaying, Grievous or Wounding rune \(picked\) for 1 minute/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", runeChoice: 1 });
    await settle();
    const effect = fighter.created.filter((entry) => entry.flags?.[MODULE_ID]?.rune).at(-1);
    assert.deepEqual([effect.system.rules[0].value, effect.system.rules[0].definition], ["grievous", [`item:id:${mace.id}`]]);
    assert.match(card.content, /Gives Boughshatter the Grievous rune for 1 minute/);
});

test("Blade Phantom's Guide: the weapon picked (up to level 11) at its user's highest weapon proficiency for 1 minute — PF2e's MartialProficiency on it", async () => {
    const guide = compileItem(source("Blade Phantom's Guide"));
    assert.deepEqual([guide.item.proficiency.duration.value, guide.item.proficiency.duration.unit, guide.item.proficiency.maxLevel], [1, "minutes", 11]);
    const scholar = foundry.makeActor({ id: "rune-scholar", name: "Scholar", owners: ["player"] });
    foundry.place(scholar, 100, 24000);
    scholar.system.proficiencies = { attacks: { simple: { rank: 1 }, martial: { rank: 3 }, unarmed: { rank: 1 } } };
    const whip = foundry.giveItem(scholar, source("Whip"));
    const blade = foundry.giveItem(scholar, source("Frost Brand"));
    scholar.weapons.push(whip, blade);
    const item = foundry.giveItem(scholar, source("Blade Phantom's Guide"));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: scholar.id }, actor: scholar, token: scholar.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    // (Frost Brand, level 16, is past the guide's 11th: not offered.)
    assert.deepEqual(card.flags[MODULE_ID].card.weapons.map((weapon) => weapon.name), ["Whip"]);
    assert.match(card.content, /The weapon picked at your highest weapon proficiency for 1 minute \(one of level 11 or lower\)/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", runeWeapon: 0 });
    await settle();
    const effect = scholar.created.find((entry) => entry.flags?.[MODULE_ID]?.proficiency);
    assert.deepEqual(effect.system.rules, [{ key: "MartialProficiency", slug: `blade-phantom-s-guide-${whip.id}`, label: "Blade Phantom's Guide", definition: [`item:id:${whip.id}`], value: 3 }]);
    assert.match(card.content, /Scholar: Whip at your highest weapon proficiency for 1 minute \(rank 3\)/);
});
