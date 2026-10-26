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
    // (Its sentence said again as a note and a "by hand" line beside that very damage: gone, not partial.)
    const axe = compileActivations(source("Clear Cutter's Axe"))[0].plan;
    assert.deepEqual([axe.partial, axe.notes, axe.resolution.outcomes.success.manualInstructions], [undefined, undefined, []]);
    // A talisman: "the creature you damaged takes 1d6 bleed damage and is off-guard until …": bleed persistent, off-guard too.
    const knot = compileItem(source("Murderer's Knot"));
    assert.deepEqual([knot.directDamage.category, knot.directDamage.type], ["persistent", "bleed"]);
    assert.deepEqual(knot.resolution.outcomes.success.effects.map((effect) => effect.slug), ["off-guard"]);
    // Not outright: a save's degrees, a Strike's hit, an area.
    assert.equal(readDirectDamage("Effect The target must attempt a DC 20 Fortitude save. Success The creature takes 2d6 acid damage."), null);
    assert.equal(readDirectDamage("Effect Make a Strike. On a successful hit, the target takes an additional 1d6 force damage."), null);
    assert.equal(readDirectDamage("Effect Each creature within 10 feet takes 2d6 fire damage."), null);
    // (Bleed always persistent, as PF2e has it: Exsanguinate's too, its user's share from the bleed taken later, src/compiler/drain.js.)
    assert.equal(readDirectDamage("Effect The creature you damaged takes 1d6 bleed damage and is off-guard until the bleed ends.").category, "persistent");
    assert.equal(readDirectDamage("Effect The required creature takes 6d6 bleed damage. You gain temporary Hit Points equal to half the bleed damage the creature takes.").category, "persistent");
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
    // (Its Frightened 3 when the block took all the damage: a second button since 2026-10-26, test/options-flow.test.js.)
    const shield = compileActivations(source("Imposing Shield"))[0].plan.ways[0].plan;
    assert.equal(routeOf(shield), "save");
    assert.deepEqual(shield.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.value]), [["frightened", 2]]);
    assert.ok(!(shield.notes ?? []).some((note) => /^Hardness/.test(note)), "not the shield's statistics");
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
    // (Its first button's, "As it is": a swallowing creature's extra die is the second's.)
    const spike = compileActivations(source("Swallow-Spike"), { basicActions })[0].plan.ways[0].plan;
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
    // Sparking: blinded for a round on a critical success; dazzled while the persistent damage lasts — the ability module's condition for
    // as long as that persistent fire lasts.
    const sparking = compileItem(source("Sparking Spellgun (Lesser)"));
    assert.deepEqual(sparking.resolution.sharedDamage.components.map((entry) => entry.formula), ["4d6[fire]", "1d4[persistent,fire]"]);
    assert.deepEqual(sparking.resolution.outcomes.criticalSuccess.effects.map((effect) => [effect.slug, effect.duration?.value ?? effect.duration?.mode ?? null]), [["blinded", 1], ["dazzled", "while"]]);
    assert.deepEqual(sparking.resolution.outcomes.success.effects.find((effect) => effect.slug === "dazzled").duration, { mode: "while", persistent: "fire" });
    assert.equal(sparking.notes, undefined);
    // Moonlit: its damage at night or at other times, picked on the card.
    assert.deepEqual(compileItem(source("Moonlit Spellgun (Lesser)")).damageChoices.map((choice) => choice.formula), ["3d8[fire,silver]", "3d6[fire,silver]"]);
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
    // (Each warrior's Strike its own damage roll; the card's line says the rest Strike again, 2026-10-25.)
    assert.deepEqual([horn.ownCheck.warriors, horn.resolution.sharedDamage.rollOnce, horn.partial, horn.notes], [4, false, undefined, ["4 warriors, each Striking one of the enemies you target; with fewer targeted, the rest Strike them again in turn (a card each)."]]);
});

test("Spiritual Warhorn live: one enemy targeted, all four warriors' Strikes at it, a card each; more enemies than warriors refused", async () => {
    const bugler = foundry.makeActor({ id: "damage-bugler", name: "Bugler", owners: ["player"] });
    foundry.place(bugler, 400, 17000);
    const horn = foundry.giveItem(bugler, source("Spiritual Warhorn (Moderate)"));
    const data = horn.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: horn.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: bugler.id }, actor: bugler, token: bugler.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [brute.token.uuid] });
    await settle();
    const posted = foundry.posted.slice(before);
    assert.deepEqual([posted.length, posted.every((entry) => entry.tokens.length === 1)], [4, true]);
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

test("Phoenix Flask (src/compiler/round-burst.js): its Effect for the drinker (the Fly Speed), and its feathers' save card kept open for its minute, used once each round after the drinker flies", async () => {
    const flask = compileItem(source("Phoenix Flask"));
    assert.deepEqual([routeOf(flask), flask.resolution.kind, flask.resolution.applications[0].label, flask.again.rounds, flask.again.plan.targeting.area, component(flask.again.plan).formula], ["item", "effect", "Effect: Phoenix Flask", 10, { type: "emanation", value: 10 }, "3d4[fire]"]);
    const drinker = foundry.makeActor({ id: "damage-phoenix", name: "Phoenix", owners: ["player"] });
    foundry.place(drinker, 300, 17200);
    const item = foundry.giveItem(drinker, source("Phoenix Flask"));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const later = foundry.messages.slice(foundry.messages.indexOf(card) + 1).find((entry) => entry.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.ok(later, "the feathers' card");
    assert.match(later.content, /Each time, the first time each round Phoenix uses Fly \(including to hover in place\), at the end of that movement: target the creatures in its 10-foot emanation/);
    for (let time = 0; time < 2; time++) {
        await foundry.socket(SOCKET)({ action: "apply", messageId: later.id, userId: "player", targets: [brute.token.uuid] });
        await settle();
    }
    assert.deepEqual([later.flags[MODULE_ID].card.status, later.flags[MODULE_ID].card.uses], ["open", 2], "open for its minute, used twice");
});

test("its user's own Effect, then the save card it had (src/compiler/effect-then-card.js): Frost Breath's resistance and its exhale for later; Vermin Repellent Agent's bonus and its attackers' card for 4 hours; Matsuki's Medicinal Wine's bonus and its drinker's own save; Draft of Stellar Radiance's light and the save of whoever targets it", async () => {
    const plans = Object.fromEntries(["Frost Breath", "Vermin Repellent Agent (Lesser)", "Matsuki's Medicinal Wine", "Draft of Stellar Radiance", "Blight Bomb (Lesser)"].map((name) => [name, compileItem(source(name))]));
    const shape = (plan) => [routeOf(plan), plan.resolution.kind, plan.resolution.applications?.[0]?.label, plan.again && Object.fromEntries(Object.entries(plan.again).filter(([key]) => key !== "plan" && key !== "time"))];
    assert.deepEqual(shape(plans["Frost Breath"]), ["item", "effect", "Effect: Frost Breath", { later: true }]);
    assert.deepEqual(shape(plans["Vermin Repellent Agent (Lesser)"]), ["item", "effect", "Effect: Vermin Repellent Agent", { later: true, repeat: true, attacker: true }]);
    assert.deepEqual(plans["Vermin Repellent Agent (Lesser)"].again.time.value, 4);
    assert.deepEqual(shape(plans["Matsuki's Medicinal Wine"]), ["item", "effect", "Effect: Matsuki's Medicinal Wine", { later: false, own: true }]);
    assert.deepEqual(shape(plans["Draft of Stellar Radiance"]), ["item", "effect", "Effect: Draft of Stellar Radiance", { later: true, repeat: true, attacker: true }]);
    // (A bomb isn't one: its save is its splash's.)
    assert.equal(plans["Blight Bomb (Lesser)"]?.again, undefined);
    // (An activation whose words give its user the Effect: Final Scalecloak's nimbus, then its attackers' card for the minute; Kraken's Guard's
    // grapple bonus, then its cone's card at once. Not another creature's or a result's Effect, nor a zone's save.)
    const activation = (name, index) => compileActivations(source(name))[index].plan;
    assert.deepEqual(shape(activation("Final Scalecloak", 1)), ["item", "effect", "Effect: Embody the Storm", { later: true, repeat: true, attacker: true }]);
    assert.deepEqual(shape(activation("Kraken's Guard", 0)), ["item", "effect", "Effect: Kraken's Guard", { later: false }]);
    // (Bewitching Bloom (Magnolia)'s Effect is its chosen ally's, and so is the save card after it: test/chosen-ally.test.js.)
    for (const [name, index] of [["Sinuous Recorder", 0], ["Arctic Worm Chitin Shield", 0], ["Mamlambo Scale", 0]]) assert.equal(activation(name, index)?.again, undefined, name);
    assert.ok(!(compileItem(source("Crackling Bubble Gum (Lesser)")).ways ?? []).some((way) => way.plan?.again), "a candy's pop: its Effect is the failure's");
    const drinker = foundry.makeActor({ id: "damage-breather", name: "Breather", owners: ["player"] });
    foundry.place(drinker, 300, 17400);
    for (const name of ["Frost Breath", "Vermin Repellent Agent (Lesser)", "Matsuki's Medicinal Wine"]) {
        const item = foundry.giveItem(drinker, source(name));
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: item.toObject()._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        const card = foundry.messages[foundry.messages.indexOf(message) + 1];
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        const next = foundry.messages.slice(foundry.messages.indexOf(card) + 1).find((entry) => entry.flags?.[MODULE_ID]?.card?.kind === "expose");
        assert.ok(next, `${name}: its save card`);
        const state = next.flags[MODULE_ID].card;
        assert.deepEqual([state.status, Boolean(state.later), Boolean(state.repeat), Boolean(state.attacker), Boolean(state.own)], { "Frost Breath": ["open", true, false, false, false], "Vermin Repellent Agent (Lesser)": ["open", true, true, true, false], "Matsuki's Medicinal Wine": ["open", false, false, false, true] }[name], name);
    }
    // (Blight Breath's resistance, "for as long as you hold your breath": gone with the exhale.)
    const holder = foundry.makeActor({ id: "damage-blight", name: "Holder", owners: ["player"] });
    foundry.place(holder, 300, 17600);
    const blight = foundry.giveItem(holder, source("Blight Breath"));
    const used = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: blight.uuid, sourceId: blight.toObject()._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: holder.id }, actor: holder, token: holder.token.document });
    await foundry.call("createChatMessage", used);
    await settle();
    const itemCard = foundry.messages[foundry.messages.indexOf(used) + 1];
    await foundry.socket(SOCKET)({ action: "apply", messageId: itemCard.id, userId: "player" });
    await settle();
    const resisting = () => holder.itemTypes.effect.filter((effect) => effect.name === "Effect: Blight Breath").length;
    assert.equal(resisting(), 1, "its resistance while it holds its breath");
    const exhale = foundry.messages.slice(foundry.messages.indexOf(itemCard) + 1).find((entry) => entry.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.deepEqual(exhale.flags[MODULE_ID].card.ends.label, "Effect: Blight Breath");
    await foundry.socket(SOCKET)({ action: "apply", messageId: exhale.id, userId: "player", targets: [brute.token.uuid] });
    await settle();
    assert.equal(resisting(), 0, "gone with the exhale");
});

test("Horn of the Archon's Archon's Note: its allies' +1 status bonus to attack rolls and saves for 1 round at the allies targeted, then its enemies' Fortitude save card (plan.again)", async () => {
    const [note] = compileActivations(source("Horn of the Archon"));
    assert.deepEqual([routeOf(note.plan), note.plan.allyArea, note.plan.resolution.outcomes.success.modifiers.map((modifier) => `${modifier.selector} ${modifier.value} ${modifier.type}`), note.plan.again.plan.resolution.check.statistic, note.plan.partial], ["save", true, ["attack-roll 1 status", "saving-throw 1 status"], "fortitude", undefined]);
    const herald = foundry.makeActor({ id: "damage-herald", name: "Herald", owners: ["player"] });
    foundry.place(herald, 300, 17800);
    const horn = foundry.giveItem(herald, source("Horn of the Archon"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: horn.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.ok(card, "the allies' card");
    const posted = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [warden.token.uuid] });
    await settle();
    assert.deepEqual(foundry.posted.slice(posted).map((entry) => entry.plan.resolution.check.roll), ["automatic"], "the allies' bonus");
    const save = foundry.messages.slice(foundry.messages.indexOf(card) + 1).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.ok(save, "the enemies' save card");
    assert.equal(save.flags[MODULE_ID].card.plan.resolution.check.statistic, "fortitude");
});

test("a save harder for some creatures or not for them (src/compiler/kind-saves.js, plan.ifTarget): Lamentation of the Faithless's holy creatures at -2 status and its unholy ones immune; Anglerfish Lantern's water creatures; Daybreak Ammunition's darkvision", async () => {
    const { planFor, targetGroups } = await import("../src/live/if-target.js");
    const [lament] = compileActivations(source("Lamentation of the Faithless"));
    assert.deepEqual([lament.plan.ifTarget, lament.plan.partial], [[{ traits: ["unholy"], immune: true }, { traits: ["holy"], bonus: { value: -2, type: "status" } }], undefined]);
    const holy = { system: { traits: { value: ["holy", "celestial"] } } };
    const unholy = { traits: new Set(["unholy", "fiend"]) };
    const plain = { system: { traits: { value: ["humanoid"] } } };
    assert.deepEqual(planFor(lament.plan, holy).resolution.check.bonus, { value: -2, type: "status" });
    assert.equal(planFor(lament.plan, unholy), null);
    assert.equal(planFor(lament.plan, plain), lament.plan);
    const groups = targetGroups(lament.plan, [{ name: "Angel", actor: holy }, { name: "Fiend", actor: unholy }, { name: "Guard", actor: plain }, { name: "Priest", actor: { system: { traits: { value: ["holy"] } } } }]);
    assert.deepEqual(groups.map((group) => [group.plan === null ? "immune" : group.plan === lament.plan ? "plain" : group.plan.resolution.check.bonus.value, group.tokens.map((token) => token.name)]), [[-2, ["Angel", "Priest"]], ["immune", ["Fiend"]], ["plain", ["Guard"]]]);
    // (Locust Leather's swarms that fail take 1d6 persistent poison besides the basic save's 5d6, 2026-10-26: their failure rows mixed.)
    const fumes = compileActivations(source("Locust Leather")).find((entry) => entry.activation.name === "Poison Fumes").plan;
    assert.deepEqual([fumes.ifTarget, Boolean(fumes.partial)], [[{ traits: ["swarm"], failDamage: "1d6[persistent,poison]" }], false]);
    const swarmed = planFor(fumes, { system: { traits: { value: ["swarm", "animal"] } } }).resolution.outcomes;
    assert.deepEqual([swarmed.failure.damage.mode, swarmed.criticalFailure.damage.formulas, swarmed.success.damage.mode, planFor(fumes, plain)], ["mixed", [{ formula: "1d6[persistent,poison]" }], "shared", fumes]);
    const [lantern] = compileActivations(source("Anglerfish Lantern"));
    assert.deepEqual(planFor(lantern.plan, { system: { traits: { value: ["water", "elemental"] } } }).resolution.check.bonus, { value: -2, type: "circumstance" });
    // (Slumber Arrow: only a living creature saves, its failure a Speed penalty and its critical failure Slowed 1 beside it, src/compiler/guards.js.)
    const [arrow] = compileActivations(source("Slumber Arrow"));
    assert.equal(planFor(arrow.plan, { system: { traits: { value: ["undead", "zombie"] } } }), null);
    assert.equal(planFor(arrow.plan, plain), arrow.plan);
    const rows = arrow.plan.resolution.outcomes;
    assert.deepEqual([rows.failure.effects, rows.failure.modifiers.map((modifier) => [modifier.selector, modifier.value]), rows.criticalFailure.effects.map((effect) => [effect.slug, effect.value]), arrow.plan.partial], [[], [["all-speeds", -5]], [["slowed", 1]], undefined]);
    const [daybreak] = compileActivations(source("Daybreak Ammunition"));
    assert.deepEqual(planFor(daybreak.plan, { system: { perception: { senses: [{ type: "darkvision" }] } } }).resolution.check.bonus, { value: -2, type: "circumstance" });
    // (Live: one card per group; none for the immune, a line instead.)
    const priest = foundry.makeActor({ id: "damage-lament-priest", name: "Priest" });
    priest.system.traits = { value: ["holy"] };
    foundry.place(priest, 300, 18200);
    const wielder = foundry.makeActor({ id: "damage-lament-wielder", name: "Mourner", owners: ["player"] });
    foundry.place(wielder, 400, 18200);
    const weapon = foundry.giveItem(wielder, source("Lamentation of the Faithless"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: weapon.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    const posted = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [priest.token.uuid, brute.token.uuid] });
    await settle();
    assert.deepEqual(foundry.posted.slice(posted).map((entry) => entry.plan.resolution.check.bonus?.value ?? 0).sort(), [-2, 0]);
});

test("a spellgun against a defense's DC, with conditions and no damage (the module's own wording)", async () => {
    const { spellgunPlan } = await import("../src/compiler/spellguns.js");
    const html = "<p>Activate the spellgun by aiming it at one creature and making your choice of a spell attack roll or a firearm attack roll against the target's Fortitude DC. This spellgun has a range increment of 30 feet.</p><p><strong>Critical Success</strong> The target is Slowed 1 until the end of your next turn.</p><p><strong>Success</strong> As critical success, except the target is Clumsy instead of slowed.</p>";
    const plan = spellgunPlan(html, { source: { name: "Test Gun" } });
    assert.deepEqual([plan.resolution.check.against.statistic, plan.resolution.sharedDamage, plan.resolution.outcomes.success.damage.mode], ["fortitude", undefined, "none"]);
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => plan.resolution.outcomes[degree].effects.map((effect) => effect.slug)), [["slowed"], ["clumsy"]]);
});

test("a spellgun whose success is its critical success at full damage and a smaller Speed penalty (the module's own wording)", async () => {
    const { spellgunPlan } = await import("../src/compiler/spellguns.js");
    const html = "<p>Activate the spellgun by aiming it at one creature and making your choice of a spell attack roll or a firearm attack roll against the target's AC. This spellgun has a range increment of 30 feet.</p><p><strong>Critical Success</strong> The target takes @Damage[3d6[cold]] damage and takes a -15-foot status penalty to its Speeds for 1 round.</p><p><strong>Success</strong> As critical success, except the target takes full damage and takes a -10-foot status penalty.</p>";
    const plan = spellgunPlan(html, { source: { name: "Test Gun" } });
    const outcomes = plan.resolution.outcomes;
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => [outcomes[degree].damage.multiplier, outcomes[degree].modifiers.map((modifier) => `${modifier.selector} ${modifier.value}`)]), [[1, ["all-speeds -15"]], [1, ["all-speeds -10"]]]);
    assert.equal(plan.notes, undefined, "nothing left to the GM");
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

test("Bewildering Spellgun: an attack against AC (not the Will save its success row names), confused for a minute; the success's Will save at the end of each of its turns ends it", () => {
    const gun = compileItem(source("Bewildering Spellgun"));
    assert.deepEqual([gun.resolution.check.roll, gun.resolution.check.against.statistic, gun.ownCheck.choose], ["skill", "ac", ["spell", "firearm"]]);
    assert.deepEqual(["criticalSuccess", "success"].map((degree) => gun.resolution.outcomes[degree].effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit])), [[["confused", 1, "minutes"]], [["confused", 1, "minutes"]]]);
    assert.deepEqual([gun.resolution.outcomes.success.effects[0].duration.saveEnds, gun.notes], [{ save: "will", dc: 25, mode: "end" }, undefined]);
});

test("conditions on the creatures targeted: Gallows Tooth's off-guard before its Strike, Jade Bauble's on enemies in reach; Energizing Treat on the creature fed", () => {
    const effects = (plan) => plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.expiry]);
    const gallows = compileItem(source("Gallows Tooth"));
    assert.deepEqual([routeOf(gallows), effects(gallows)], ["save", [["off-guard", "turn-end"]]]);
    // (The Strike itself its user's own PF2e roll, the creature off-guard to it already: the card's line, not a note.)
    assert.deepEqual([gallows.then, gallows.notes, gallows.partial], ["Make a melee Strike against it (PF2e's own)", [], undefined]);
    const jade = compileItem(source("Jade Bauble"));
    assert.deepEqual([routeOf(jade), effects(jade), jade.notes ?? []], ["save", [["off-guard", "turn-start"]], []]);
    const treat = compileItem(source("Energizing Treat"));
    assert.deepEqual([treat.item.recipient, treat.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit])], ["drinker", [["quickened", 1, "minutes"]]]);
});

test("talismans after a hit: Putrescent Glob's save (read without its Trigger line), Taljjae Tassel's Grievous rune for the attack, Ensnaring Disk's Disarm with +2", () => {
    const glob = compileItem(source("Putrescent Glob"));
    assert.deepEqual([routeOf(glob), glob.resolution.check.against.value, glob.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.value]), glob.resolution.outcomes.criticalFailure.effects.map((effect) => effect.slug)], ["save", 23, [["sickened", 2]], ["sickened", "slowed"]]);
    const tassel = compileItem(source("Taljjae Tassel"));
    assert.deepEqual([tassel.item.rune.key, tassel.item.rune.duration.expiry], ["grievous", "turn-end"]);
    const disk = compileItem(source("Ensnaring Disk"));
    assert.deepEqual([disk.builtin, disk.action.slug, disk.action.bonus], ["item-action", "disarm", { value: 2, type: "item" }]);
});

test("Burr Shield: the bleed its burr inflicts on the Strike's target, outright and nothing left to note", () => {
    const burr = compileActivations(source("Burr Shield"))[0].plan;
    assert.deepEqual([burr.resolution.check.roll, component(burr).formula, component(burr).type, component(burr).category, burr.targeting.target], ["automatic", "1d10", "bleed", "persistent", "1 creature"]);
    assert.deepEqual(burr.notes ?? [], []);
});

test("damage the text treats as silver: the material in its formulas, for PF2e's weaknesses (Moonlit Spellgun, Silver Crescent, Fiendsbane Shield)", async () => {
    const { damageMaterial } = await import("../src/compiler/materials.js");
    const moonlit = compileItem(source("Moonlit Spellgun (Lesser)"));
    assert.deepEqual(moonlit.damageChoices.map((choice) => choice.formula), ["3d8[fire,silver]", "3d6[fire,silver]"]);
    // (Its ray is its secondary effect: the ways card's second way, src/compiler/secondary.js.)
    assert.equal(component(compileItem(source("Silver Crescent (Lesser)")).ways[1].plan).formula, "4d6[vitality,silver]");
    assert.equal(compileActivations(source("Fiendsbane Shield"))[0].plan.resolution.sharedDamage.components[0].formula, "3d6[slashing,silver]");
    // (Not without the words; healing stays healing.)
    const plan = { resolution: { sharedDamage: { components: [{ id: "0", formula: "2d6[fire]" }] } } };
    assert.equal(damageMaterial(plan, "It deals fire damage."), plan);
    assert.equal(damageMaterial({ resolution: { sharedDamage: { components: [{ id: "0", formula: "(2d6)[healing]" }] } } }, "This is treated as silver.").resolution.sharedDamage.components[0].formula, "(2d6)[healing]");
});

test("a rider only for a creature silver gets past (Moonlit Spellgun's critical success, Enfeebled 1 for a minute): plan.ifTarget, its card's plan for those creatures only — a weakness to silver, or a resistance with silver its exception", async () => {
    const { materialGetsPast, planFor, targetGroups } = await import("../src/live/if-target.js");
    const moonlit = compileItem(source("Moonlit Spellgun (Lesser)"));
    assert.deepEqual([moonlit.ifTarget.map((entry) => [entry.material, entry.degree, entry.effects[0].slug, entry.effects[0].value, entry.effects[0].duration.value]), moonlit.partial, moonlit.notes], [[["silver", "criticalSuccess", "enfeebled", 1, 1]], undefined, undefined]);
    const weak = { name: "Werewolf", attributes: { weaknesses: [{ type: "silver", value: 5 }], resistances: [] } };
    const resisting = { name: "Devil", attributes: { weaknesses: [], resistances: [{ type: "physical", value: 5, exceptions: ["silver"] }] } };
    const plain = { name: "Bandit", attributes: { weaknesses: [{ type: "cold-iron", value: 5 }], resistances: [] } };
    assert.deepEqual([weak, resisting, plain].map((actor) => materialGetsPast(actor, "silver")), [true, true, false]);
    assert.deepEqual(planFor(moonlit, weak).resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), ["dazzled", "enfeebled"]);
    assert.equal(planFor(moonlit, plain), moonlit);
    const groups = targetGroups(moonlit, [{ name: "W", actor: weak }, { name: "B", actor: plain }, { name: "D", actor: resisting }]);
    assert.deepEqual(groups.map((group) => [group.tokens.map((token) => token.name).join(""), group.plan.resolution.outcomes.criticalSuccess.effects.length]), [["WD", 2], ["B", 1]]);
});

test("an activation's retaliation: Numerian Steel Breastplate's 1d10 electricity for a minute at whoever touches its wearer or hits it from next to it, the card kept open; Instinct Crown (Dragon)'s 2d6 of its dragon's type (picked) until the rage ends", () => {
    const [field] = compileActivations(source("Numerian Steel Breastplate"));
    assert.equal(routeOf(field.plan), "later");
    assert.deepEqual([field.plan.retaliation, field.plan.resolution.sharedDamage.components[0].formula, field.plan.partial], [{ adjacentMelee: true, rounds: 10 }, "1d10[electricity]", undefined]);
    const dragon = compileActivations(source("Instinct Crown (Dragon)"))[1].plan;
    assert.deepEqual([routeOf(dragon), dragon.retaliation.rounds, dragon.damageChoices.map((choice) => choice.formula).slice(0, 3)], ["later", 10, ["2d6[acid]", "2d6[cold]", "2d6[electricity]"]]);
    // (Until the rage ends: its card closes as the Rage Effect goes, scripts/live.js — 2026-10-25, no longer a note.)
    assert.deepEqual([dragon.notes, dragon.partial, dragon.retaliation.untilRage], [undefined, undefined, true]);
});

test("Grim Ring: drained gained from an undead lowered by 1 on its user, and the undead targeted takes 2d6 vitality — both, one card; its sentence no longer a note", async () => {
    const ring = compileActivations(source("Grim Ring"))[0].plan;
    assert.deepEqual([ring.item.reduce, ring.resolution.sharedDamage.components[0].formula, ring.partial, ring.notes], [[{ slug: "drained", by: 1 }], "2d6", undefined, undefined]);
    const wearer = foundry.makeActor({ id: "damage-grim", name: "Grim Wearer", owners: ["player"], conditions: ["drained"] });
    const ghoul = foundry.makeActor({ id: "damage-ghoul", name: "Ghoul", undead: true });
    foundry.place(wearer, 0, 17400);
    foundry.place(ghoul, 100, 17400);
    wearer.conditions.set("drained", 2);
    const item = foundry.giveItem(wearer, source("Grim Ring"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.match(card.content, /Grim Wearer: drained lowered by 1\./);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [ghoul.token.uuid], userId: "player" });
    await settle();
    assert.equal(foundry.posted.slice(before)[0]?.plan.resolution.sharedDamage.components[0].formula, "2d6");
    assert.equal(wearer.conditions.get("drained"), 1);
});

test("retaliation while a resistance lasts, for creatures of one trait (plan.item.retaliate, a third-party salve's — read from its module's pack when installed): after the item card's Apply, a retaliation card kept open for that time, its damage at an ooze targeted, refused at another creature", async (context) => {
    let salve = null;
    try {
        salve = readDocuments(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-alchemists/packs/pf2e-items`).find((doc) => doc.collection === "items" && doc.name === "Alkaline Mire (Lesser)");
    } catch {
        salve = null;
    }
    if (!salve) return context.skip("the third-party module isn't installed");
    const plan = compileItem(salve);
    assert.deepEqual([plan.item.resist[0].type, plan.item.retaliate.retaliation.only, plan.item.retaliate.retaliation.rounds, plan.item.retaliate.resolution.sharedDamage.components[0].formula, plan.partial, plan.unread], ["acid", { traits: ["ooze"] }, 10, "4", undefined, undefined]);
    const wearer = foundry.makeActor({ id: "damage-salve", name: "Salved", owners: ["player"] });
    const ooze = foundry.makeActor({ id: "damage-ooze", name: "Ooze" });
    const rat = foundry.makeActor({ id: "damage-rat", name: "Rat" });
    ooze.system.traits = { value: ["ooze"] };
    foundry.place(wearer, 0, 17600);
    foundry.place(ooze, 100, 17600);
    foundry.place(rat, 200, 17600);
    const item = foundry.giveItem(wearer, salve);
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats?.compendiumSource ?? null, type: "consumable" } } }, speaker: { actor: wearer.id }, actor: wearer, token: wearer.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const later = foundry.messages.slice(count).find((entry) => entry.flags?.[MODULE_ID]?.card?.kind === "expose");
    assert.ok(later, "the retaliation card");
    assert.match(later.content, /Each time a creature with the ooze trait hits Salved with an unarmed Strike while it lasts/);
    const errors = foundry.notifications.length;
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId: later.id, userId: "player", targets: [rat.token.uuid] });
    } catch {
        // (Checked by its notification.)
    }
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Rat has no ooze trait/.test(text)), foundry.notifications.slice(errors).join(" / "));
    const posted = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: later.id, userId: "player", targets: [ooze.token.uuid] });
    await settle();
    assert.deepEqual(foundry.posted.slice(posted).map((entry) => entry.tokens.map((token) => token.name)), [["Ooze"]]);
});
