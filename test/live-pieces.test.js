// Live-play pieces for docs/needs.md (2026-10-25), against the stand-in for Foundry: a Mythic Point given back once the card applies (Preordained
// Spear), the allies' own Effect within its feet of the user (Belt of the Five Kings), a rage-long retaliation refused once the rage is over
// (Instinct Crown (Dragon)), and a light placed in its user's square, gone when its time is up (Flare Beacon).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { expireLights, placeLight } from "../scripts/placed-light.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 330 squares down.)
const foundry = await fakeFoundry();
const lancer = foundry.makeActor({ id: "pieces-lancer", name: "Lancer", owners: ["player"] });
const near = foundry.makeActor({ id: "pieces-near", name: "Near Ally" });
const far = foundry.makeActor({ id: "pieces-far", name: "Far Ally" });
foundry.place(lancer, 0, 33000);
foundry.place(near, 200, 33000);
foundry.place(far, 1000, 33000);

async function activated(actor, name, index = 0) {
    const item = foundry.giveItem(actor, source(name));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: index, userId: "player" });
    await settle();
    return foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card);
}

test("Preordained Spear: its doomed lowered and its Mythic Point given back once the card applies, up to the maximum", async () => {
    lancer.conditions.set("doomed", 2);
    lancer.system.resources.mythicPoints = { value: 1, max: 3 };
    const card = await activated(lancer, "Preordained Spear");
    assert.match(card.content, /Gives back 1 Mythic Point/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.deepEqual([lancer.conditions.get("doomed"), lancer.system.resources.mythicPoints.value], [1, 2]);
    assert.ok(foundry.messages.some((message) => /Lancer regains 1 Mythic Point \(2 of 3\)/.test(message.content)));
    // (At its maximum: none regained, and said so.)
    lancer.system.resources.mythicPoints.value = 3;
    const again = await activated(lancer, "Preordained Spear");
    await foundry.socket(SOCKET)({ action: "apply", messageId: again.id, userId: "player" });
    await settle();
    assert.equal(lancer.system.resources.mythicPoints.value, 3);
    assert.ok(foundry.messages.some((message) => /Mythic Points are full \(3 of 3\): none regained/.test(message.content)));
});

test("Belt of the Five Kings: its wearer's Effect, and the allies' own on each ally within 20 feet of it", async () => {
    const plan = compileActivations(source("Belt of the Five Kings"))[0].plan;
    assert.deepEqual([plan.allyLinks.map((link) => [link.label, link.radius]), plan.partial], [[["Belt of the Five Kings (Allies)", 20]], undefined]);
    const card = await activated(lancer, "Belt of the Five Kings");
    assert.match(card.content, /Belt of the Five Kings \(Allies\) on each ally within 20 feet of you/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const has = (actor, name) => actor.created.some((entry) => entry.name === name);
    assert.deepEqual([has(lancer, "Effect: Belt of the Five Kings (Wearer)"), has(near, "Effect: Belt of the Five Kings (Allies)"), has(far, "Effect: Belt of the Five Kings (Allies)"), has(lancer, "Effect: Belt of the Five Kings (Allies)")], [true, true, false, false]);
});

test("Instinct Crown (Dragon): its retaliation card is open while its user rages, refused once the rage is over", async () => {
    const card = await activated(lancer, "Instinct Crown (Dragon)", 1);
    assert.equal(card.flags[MODULE_ID].card.plan.retaliation.untilRage, true);
    assert.match(card.content, /It stays open until Lancer(?:'|&#39;)s rage ends/);
    // (Not raging: Apply refuses, and the card closes.)
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [near.token.uuid] });
    await settle();
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
    assert.match(card.flags[MODULE_ID].card.results.at(-1), /Lancer isn't raging: Instinct Crown \(Dragon\)'s retaliation is over/);
});

test("Flare Beacon: its light, bright and dim in feet, at its user's square for its minute; gone once the world's time passes that", async () => {
    const plan = compileItem(source("Flare Beacon (Lesser)"));
    assert.deepEqual([plan.item.placedLight.bright, plan.item.placedLight.dim, plan.item.placedLight.duration.value, plan.partial, plan.notes], [20, 40, 1, undefined, undefined]);
    // (A scene of its own, as Foundry's: its lights, made and deleted.)
    const lights = [];
    const scene = {
        id: "pieces-scene",
        grid: { size: 100 },
        lights: { contents: lights },
        async createEmbeddedDocuments(type, data) {
            const made = data.map((entry, index) => ({ ...structuredClone(entry), id: `light${lights.length + index}`, type }));
            lights.push(...made);
            return made;
        },
        async deleteEmbeddedDocuments(type, ids) {
            for (const id of ids) lights.splice(lights.findIndex((entry) => entry.id === id), 1);
        }
    };
    const token = { document: { parent: scene, x: 300, y: 400, width: 1, height: 1, name: "Lancer" } };
    globalThis.game.time.worldTime = 1000;
    await placeLight(plan.item.placedLight, { token, actor: lancer, item: { name: "Flare Beacon (Lesser)" } });
    assert.deepEqual([lights.length, lights[0].x, lights[0].y, lights[0].config, lights[0].flags[MODULE_ID].placedLight.endsAt], [1, 350, 450, { bright: 20, dim: 40 }, 1060]);
    assert.ok(foundry.messages.some((message) => /its light \(bright 20 feet, dim 40 feet\) is placed at Lancer's square for 1 minute/.test(message.content)));
    const scenes = globalThis.game.scenes;
    globalThis.game.scenes = [scene];
    await expireLights(1059);
    assert.equal(lights.length, 1);
    await expireLights(1060);
    assert.equal(lights.length, 0);
    globalThis.game.scenes = scenes;
});
