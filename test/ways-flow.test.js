// A consumable used in one of several ways, each its own Activate block, against the stand-in for Foundry: the reading
// (each block as a permanent item's activation), the ways card after its Use, and "Use it" posting the picked way's own
// card while the ways card stays open.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 175 squares down.)
const foundry = await fakeFoundry();
const fighter = foundry.makeActor({ id: "ways-fighter", name: "Salved Fighter", owners: ["player"] });
foundry.place(fighter, 0, 17500);

test("the reading: Toadskin Salve's two reactions, each its own way — the mucus's damage at the creature hit, resistance against the triggering attack; Thrice-Fried Mudwings' meal and its wings' reaction", () => {
    const salve = compileItem(source("Toadskin Salve"));
    assert.equal(routeOf(salve), "ways");
    assert.deepEqual(salve.ways.map((way) => way.name), ["When you hit a creature with a melee Strike", "When you are hit with a melee attack that deals physical damage"]);
    assert.deepEqual(salve.ways[0].plan.resolution.sharedDamage.components.map((component) => component.formula), ["1d4[persistent,poison]"]);
    assert.deepEqual([routeOf(salve.ways[1].plan), salve.ways[1].plan.bonus.resistance], ["fortune", { type: "physical", value: 3 }]);
    const mudwings = compileItem(source("Thrice-Fried Mudwings"));
    assert.deepEqual([mudwings.builtin, mudwings.ways.length, mudwings.ways[0].plan.item.speeds?.[0]?.type, mudwings.ways[1].plan.builtin], ["ways", 2, "fly", "readied-bonus"]);
});

test("Toadskin Salve's Use: the ways card; \"Use it\" on the second way posts its resistance card, and the ways card stays open", async () => {
    const salve = foundry.giveItem(fighter, source("Toadskin Salve"));
    const data = salve.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: salve.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "ways");
    assert.match(card.content, /one of 2 ways/);
    const before = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, choice: 1, userId: "player" });
    await settle();
    const posted = foundry.messages.slice(before);
    const fortune = posted.find((message) => message.flags?.[MODULE_ID]?.card?.kind === "fortune");
    assert.ok(fortune, "the resistance's card");
    assert.match(fortune.flags[MODULE_ID].card.item.name, /Toadskin Salve \(When you are hit/);
    const state = card.flags[MODULE_ID].card;
    assert.deepEqual([state.status, state.results.length], ["open", 1]);
});

test("Striking Snare: stones or spikes, picked on the ways card before it's placed — each the snare's zone, a basic Reflex save against its 9d8; the card closed once placed. Ice Slick Snare: its 2d6 cold a basic Reflex save, the ice a note", async () => {
    const snare = compileItem(source("Striking Snare"));
    assert.deepEqual([routeOf(snare), snare.once, snare.ways.map((way) => way.name)], ["ways", true, ["Stones: bludgeoning", "Spikes: piercing"]]);
    for (const [way, type] of [[snare.ways[0], "bludgeoning"], [snare.ways[1], "piercing"]]) {
        const save = way.plan.zone.saves[0].plan.resolution;
        assert.deepEqual([routeOf(way.plan), save.check.statistic, save.check.basic, save.check.against.value, save.sharedDamage.components[0].formula], ["zone", "reflex", true, 26, `9d8[${type}]`]);
    }
    const ice = compileItem(source("Ice Slick Snare"));
    const iceSave = ice.zone.saves[0].plan.resolution;
    assert.deepEqual([iceSave.check.statistic, iceSave.check.basic, iceSave.check.against.value, iceSave.sharedDamage.components[0].formula], ["reflex", true, 22, "2d6[cold]"]);
    assert.ok(ice.zone.notes.includes("It leaves a slippery patch of ice on the ground (the GM's)."));
    const zones = [];
    foundry.ability.live.startZone = async (options) => zones.push(options);
    try {
        const item = foundry.giveItem(fighter, source("Striking Snare"));
        const data = item.toObject();
        const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
        await foundry.call("createChatMessage", use);
        await settle();
        const card = foundry.messages[foundry.messages.indexOf(use) + 1];
        assert.equal(card.flags[MODULE_ID].card.kind, "ways");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, choice: 1, userId: "player" });
        await settle();
        assert.equal(zones.length, 1);
        assert.equal(zones[0].item.name, "Striking Snare (Spikes: piercing)");
        assert.equal(zones[0].plan.zone.saves[0].plan.resolution.sharedDamage.components[0].formula, "9d8[piercing]");
        assert.deepEqual([card.flags[MODULE_ID].card.status, card.flags[MODULE_ID].card.results], ["applied", ["Spikes: piercing: placed."]]);
    } finally {
        delete foundry.ability.live.startZone;
    }
});
