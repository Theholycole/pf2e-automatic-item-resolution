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

test("Spiritual Warhorn: its warriors' Strikes at the item's modifier, at up to that many enemies targeted", () => {
    const horn = compileItem(source("Spiritual Warhorn (Moderate)"));
    assert.equal(routeOf(horn), "save");
    assert.deepEqual([horn.resolution.check.modifier, component(horn).formula, component(horn).type, horn.targeting.target, horn.targeting.range], [17, "2d6", "force", "up to 4 enemies", "60 feet"]);
    assert.deepEqual([horn.resolution.outcomes.criticalSuccess.damage.multiplier, horn.resolution.outcomes.success.damage.multiplier, horn.resolution.outcomes.failure.damage.mode], [2, 1, "none"]);
});

test("Potion of Fire Retaliation: its damage to a creature that touches the drinker, on a card kept open for its minute", async () => {
    const potion = compileItem(source("Potion of Fire Retaliation (Lesser)"));
    assert.deepEqual([routeOf(potion), potion.retaliation, component(potion).formula, component(potion).type], ["later", { rounds: 10 }, "1d4", "fire"]);
    // The Moderate and higher grades: a melee weapon Strike from next to the drinker sets it off too.
    assert.deepEqual(compileItem(source("Potion of Fire Retaliation (Moderate)")).retaliation, { adjacentMelee: true, rounds: 10 });
    const drinker = foundry.makeActor({ id: "damage-retaliator", name: "Retaliator", owners: ["player"] });
    foundry.place(drinker, 300, 17000);
    const item = foundry.giveItem(drinker, source("Potion of Fire Retaliation (Lesser)"));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.match(card.content, /Each time a creature touches Retaliator while it lasts/);
    for (let time = 0; time < 2; time++) {
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [brute.token.uuid] });
        await settle();
    }
    assert.deepEqual([card.flags[MODULE_ID].card.status, card.flags[MODULE_ID].card.uses], ["open", 2], "open for its minute, used twice");
});

test("a spellgun against a defense's DC, with conditions and no damage (the module's own wording)", async () => {
    const { spellgunPlan } = await import("../src/compiler/spellguns.js");
    const html = "<p>Activate the spellgun by aiming it at one creature and making your choice of a spell attack roll or a firearm attack roll against the target's Fortitude DC. This spellgun has a range increment of 30 feet.</p><p><strong>Critical Success</strong> The target is Slowed 1 until the end of your next turn.</p><p><strong>Success</strong> As critical success, except the target is Clumsy instead of slowed.</p>";
    const plan = spellgunPlan(html, { source: { name: "Test Gun" } });
    assert.deepEqual([plan.resolution.check.against.statistic, plan.resolution.sharedDamage, plan.resolution.outcomes.success.damage.mode], ["fortitude", undefined, "none"]);
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => plan.resolution.outcomes[degree].effects.map((effect) => effect.slug)), [["slowed"], ["clumsy"]]);
});

test("Reaper's Spellgun: its damage in the critical success's row, not doubled; the success's drained a step lower", () => {
    const reaper = compileItem(source("Reaper's Spellgun"));
    const outcomes = reaper.resolution.outcomes;
    assert.deepEqual([component(reaper).formula, outcomes.criticalSuccess.damage.multiplier, outcomes.success.damage.multiplier], ["4d6[void]", 1, 1]);
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`)), [["drained 2", "doomed 1"], ["drained 1", "doomed 1"]]);
    assert.match(reaper.notes.join(" "), /fewer than half its maximum Hit Points/);
});

test("Thorn of Milani: both its own linked Effects, one after the other", () => {
    const thorn = compileItem(source("Thorn of Milani (Lesser)"));
    assert.deepEqual(thorn.resolution.applications.map((entry) => entry.label), ["Effect: Thorn of Milani (Spirit Damage)", "Effect: Thorn of Milani (Unholy Weakness)"]);
});

test("Bewildering Spellgun: an attack against AC (not the Will save its success row names), confused for a minute", () => {
    const gun = compileItem(source("Bewildering Spellgun"));
    assert.deepEqual([gun.resolution.check.roll, gun.resolution.check.against.statistic, gun.ownCheck.choose], ["skill", "ac", ["spell", "firearm"]]);
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => gun.resolution.outcomes[degree].effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit])), [[["confused", 1, "minutes"]], [["confused", 1, "minutes"]]]);
    assert.match(gun.notes.join(" "), /at the end of each of its turns/);
});

test("conditions on the creatures targeted: Gallows Tooth's off-guard before its Strike, Jade Bauble's on enemies in reach; Energizing Treat on the creature fed", () => {
    const effects = (plan) => plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.expiry]);
    const gallows = compileItem(source("Gallows Tooth"));
    assert.deepEqual([routeOf(gallows), effects(gallows)], ["save", [["off-guard", "turn-end"]]]);
    assert.match(gallows.notes.join(" "), /make a melee Strike against it/);
    const jade = compileItem(source("Jade Bauble"));
    assert.deepEqual([routeOf(jade), effects(jade), jade.notes ?? []], ["save", [["off-guard", "turn-start"]], []]);
    const treat = compileItem(source("Energizing Treat"));
    assert.deepEqual([treat.item.recipient, treat.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit])], ["drinker", [["quickened", 1, "minutes"]]]);
});
