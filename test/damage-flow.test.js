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

test("outright damage to the target beside a save only for others: the target's part, the others' save a note", () => {
    // (The module's own wording, not a third-party item's.)
    const read = readDirectDamage("Effect Your target takes 3d6 cold damage and is Slowed 1. All the target's allies within 10 feet take 1d6 cold damage with a basic Reflex save. Creatures who critically fail their save are slowed 1.");
    assert.deepEqual([read.formula, read.type, read.effects.map((effect) => effect.slug)], ["3d6", "cold", ["slowed"]]);
    assert.match(read.notes.join(" "), /allies within 10 feet/);
    // A save for the target itself: not outright.
    assert.equal(readDirectDamage("Effect Your target takes 3d6 cold damage. It must succeed at a DC 20 Fortitude save or be Slowed 1."), null);
});


test("a check with the item's own modifier: PF2e's basic Grapple rows at +13, an attack of its own at +14 against AC", async () => {
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const cannon = compileActivations(source("Tentacle Cannon"), { basicActions }).find((entry) => entry.plan?.ownCheck).plan;
    assert.equal(routeOf(cannon), "save");
    assert.deepEqual([cannon.resolution.check.statistic, cannon.resolution.check.modifier, cannon.resolution.check.against.statistic], ["athletics", 13, "fortitude"]);
    assert.ok(cannon.resolution.outcomes.success.effects.some((effect) => effect.slug === "grabbed"), "Grapple's own row");
    const spike = compileActivations(source("Swallow-Spike"), { basicActions })[0].plan;
    assert.deepEqual([spike.resolution.check.statistic, spike.resolution.check.modifier, spike.resolution.check.against.statistic], ["attack", 14, "ac"]);
    assert.deepEqual([spike.resolution.outcomes.success.damage.multiplier, spike.resolution.outcomes.criticalSuccess.damage.multiplier], [1, 2]);
    // Without the ability module's compiled actions, no Grapple plan.
    assert.equal(compileActivations(source("Tentacle Cannon")).find((entry) => entry.plan?.ownCheck), undefined);
});

test("Necklace of Fireballs: a bead's basic Reflex save in a 20-foot burst, the bead picked on the card", async () => {
    const [bead] = compileActivations(source("Necklace of Fireballs III"));
    assert.equal(routeOf(bead.plan), "save");
    assert.deepEqual([bead.plan.resolution.check.statistic, bead.plan.resolution.check.basic, bead.plan.resolution.check.against.value, bead.plan.targeting.area], ["reflex", true, 27, { type: "burst", value: 20 }]);
    assert.deepEqual(bead.plan.damageChoices.map((choice) => choice.formula), ["10d6[fire]", "8d6[fire]", "6d6[fire]"]);
    const necklace = foundry.giveItem(warden, source("Necklace of Fireballs III"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: necklace.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.match(card.content, /data-air-field="damageChoice"/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [brute.token.uuid], damageChoice: 2, userId: "player" });
    await settle();
    const [posted] = foundry.posted.slice(before);
    assert.equal(posted.plan.resolution.sharedDamage.components[0].formula, "6d6[fire]");
});

test("damage a successful save negates: a save at the creatures targeted, the damage on a failure (Mycoweave Shield)", async () => {
    const { plainText } = await import("../src/compiler/rows.js");
    const [spores] = compileActivations(source("Mycoweave Shield (Lesser)"));
    const check = spores.plan.resolution.check;
    assert.deepEqual([spores.plan.resolution.kind, check.statistic, check.against.value, check.basic], ["save", "fortitude", 16, false]);
    assert.deepEqual(spores.plan.resolution.sharedDamage.components.map((component) => [component.formula, component.category]), [["1d6[persistent,poison]", "persistent"]]);
    assert.deepEqual(["success", "failure"].map((degree) => spores.plan.resolution.outcomes[degree].damage.multiplier), [0, 1]);
    assert.equal(routeOf(spores.plan, plainText(spores.activation.html)), "save");
});


test("spellguns: an attack against AC at the user's spell or firearm attack, their damage on a success and double on a critical success", async () => {
    const torrent = compileItem(source("Torrent Spellgun (Lesser)"));
    assert.equal(routeOf(torrent), "save");
    assert.deepEqual([torrent.resolution.check.roll, torrent.resolution.check.against.statistic, torrent.ownCheck.choose, torrent.targeting.range], ["skill", "ac", ["spell", "firearm"], "30 feet"]);
    assert.deepEqual([component(torrent).formula, torrent.resolution.outcomes.criticalSuccess.damage.multiplier, torrent.resolution.outcomes.criticalSuccess.forcedMovement, torrent.resolution.outcomes.success.forcedMovement], ["2d6[bludgeoning]", 2, { kind: "push", distance: 10 }, { kind: "push", distance: 5 }]);
    // Sparking: blinded for a round on a critical success; dazzled while the persistent damage lasts — no time, a note.
    const sparking = compileItem(source("Sparking Spellgun (Lesser)"));
    assert.deepEqual(sparking.resolution.sharedDamage.components.map((entry) => entry.formula), ["4d6[fire]", "1d4[persistent,fire]"]);
    assert.deepEqual(sparking.resolution.outcomes.criticalSuccess.effects.map((effect) => [effect.slug, effect.duration?.value ?? null]), [["blinded", 1], ["dazzled", null]]);
    assert.match(sparking.notes.join(" "), /while the persistent damage lasts/);
    // Moonlit: its damage at night or at other times, picked on the card.
    assert.deepEqual(compileItem(source("Moonlit Spellgun (Lesser)")).damageChoices.map((choice) => choice.formula), ["3d8[fire]", "3d6[fire]"]);
    // Live: the card offers the user's spell attack and firearm attack; the save card's check is the one picked.
    const gunner = foundry.makeActor({ id: "damage-gunner", name: "Gunner", owners: ["player"] });
    foundry.place(gunner, 200, 17000);
    gunner.spellcasting = { contents: [{ statistic: { check: { mod: 11 } } }, { statistic: { check: { mod: 14 } } }] };
    gunner.system.actions = [{ item: { group: "firearm" }, totalModifier: 9 }, { item: { group: "sword" }, totalModifier: 13 }];
    const gun = foundry.giveItem(gunner, source("Torrent Spellgun (Lesser)"));
    const data = gun.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: gun.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: gunner.id }, actor: gunner, token: gunner.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices.map((choice) => choice.label), ["Spell attack +14", "Firearm attack +9"]);
    assert.match(card.content, /data-air-field="attackChoice"/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [brute.token.uuid], attackChoice: 1 });
    await settle();
    const posted = foundry.posted.slice(before)[0];
    assert.deepEqual([posted.plan.resolution.check.statistic, posted.plan.resolution.check.modifier], ["firearm attack", 9]);
});
