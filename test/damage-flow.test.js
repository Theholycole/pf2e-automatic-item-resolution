// Damage an item deals outright to one creature, against the stand-in for Foundry: the reading (Forge Warden's "The
// attacking creature takes 2d6 fire damage"), what isn't read, and its card sending it to the presser's targets through
// the ability module's card.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readDirectDamage, readOutrightConditions } from "../src/compiler/direct-damage.js";
import { outrightText } from "../src/live/poison-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 170 squares down.)
const foundry = await fakeFoundry();
const warden = foundry.makeActor({ id: "damage-warden", name: "Warden", owners: ["player"] });
const brute = foundry.makeActor({ id: "damage-brute", name: "Brute" });
foundry.place(warden, 0, 17000);
foundry.place(brute, 100, 17000);

const component = (plan) => plan.resolution.sharedDamage.components[0];

test("the reading: outright damage to the creature it names, its conditions, and what isn't outright", () => {
    const forge = compileActivations(source("Forge Warden")).find((entry) => entry.activation.name === "Forge Fires").plan;
    assert.equal(routeOf(forge), "save", "to the presser's targets");
    assert.deepEqual([component(forge).formula, component(forge).type, forge.resolution.check.roll], ["2d6", "fire", "automatic"]);
    assert.equal(outrightText(forge), "2d6 fire damage");
    // "You deal an additional 2d8 force damage to the struck creature."
    const kortos = compileActivations(source("Kortos Diamond")).find((entry) => entry.plan?.directDamage).plan;
    assert.deepEqual(kortos.directDamage, { formula: "2d8", type: "force", category: null });
    // "… deals an additional 1d10 persistent fire damage to the plant."
    assert.equal(compileActivations(source("Clear Cutter's Axe")).find((entry) => entry.plan?.directDamage).plan.directDamage.category, "persistent");
    // A talisman: "the creature you damaged takes 1d6 bleed damage and is off-guard until …": bleed persistent, off-guard too.
    const knot = compileItem(source("Murderer's Knot"));
    assert.deepEqual([knot.directDamage.category, knot.directDamage.type], ["persistent", "bleed"]);
    assert.deepEqual(knot.resolution.outcomes.success.effects.map((effect) => effect.slug), ["off-guard"]);
    // Not outright: a save's degrees, a Strike's hit, an area.
    assert.equal(readDirectDamage("Effect The target must attempt a DC 20 Fortitude save. Success The creature takes 2d6 acid damage."), null);
    assert.equal(readDirectDamage("Effect Make a Strike. On a successful hit, the target takes an additional 1d6 force damage."), null);
    assert.equal(readDirectDamage("Effect Each creature within 10 feet takes 2d6 fire damage."), null);
    // Ammunition: PF2e's own rules deal it.
    assert.equal(compileItem(source("Big Rock Bullet"))?.directDamage ?? null, null);
});

test("Forge Warden: its card sends 2d6 fire to the presser's targets through the ability module's card", async () => {
    const shield = foundry.giveItem(warden, source("Forge Warden"));
    const index = compileActivations(source("Forge Warden")).findIndex((entry) => entry.activation.name === "Forge Fires");
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: shield.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.ok(card, "the target card");
    assert.match(card.content, /No save/);
    assert.match(card.content, /2d6 fire damage/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [brute.token.uuid], userId: "player" });
    await settle();
    const [posted] = foundry.posted.slice(before);
    assert.deepEqual(posted.tokens.map((token) => token.name), ["Brute"]);
    assert.equal(posted.plan.resolution.sharedDamage.components[0].formula, "2d6");
    assert.match(card.content, /Brute: Forge Warden: Forge Fires&#39;s card follows/);
});

test("conditions outright on the creature an item names: Imposing Shield's frightened 2, Highhelm War Shield's grabbed", () => {
    const shield = compileActivations(source("Imposing Shield")).find((entry) => entry.plan?.resolution?.check?.roll === "automatic").plan;
    assert.equal(routeOf(shield), "save");
    assert.deepEqual(shield.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.value]), [["frightened", 2]]);
    assert.match(shield.notes.join(" "), /Frightened 3/, "the stronger one when the block took it all, a note");
    assert.ok(!shield.notes.some((note) => /^Hardness/.test(note)), "not the shield's statistics");
    assert.deepEqual(compileActivations(source("Highhelm War Shield (Lesser)"))[0].plan.resolution.outcomes.success.effects.map((effect) => effect.slug), ["grabbed"]);
    // Not one scoped to the user's own attack.
    assert.equal(readOutrightConditions("Effect The target is Off-Guard against the next melee attack you attempt against it."), null);
});

