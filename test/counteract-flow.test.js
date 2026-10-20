// An item that counteracts what afflicts its drinker, against the stand-in for Foundry: the reading, step 1 (what it
// finds on the drinker, with PF2e's numbers where it has them), step 2 (the counteract checks, PF2e's counteract rule,
// what's removed).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { counteractCandidates, counteracts } from "../src/live/counteract-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 140 squares down.)
const foundry = await fakeFoundry();
const weak = foundry.makeActor({ id: "counter-weak", name: "Weakened", owners: ["player"], conditions: ["enfeebled", "clumsy"] });
foundry.place(weak, 0, 14000);
weak.created.push({ id: "effect-enfeeble", type: "effect", name: "Effect: Ray of Enfeeblement", system: { traits: { value: [] }, level: { value: 1 } } });
weak.conditionFlags.enfeebled = { pf2e: { grantedBy: { id: "effect-enfeeble" } } };

test("the reading: its modifier and rank, what it counteracts, each or one or the highest", () => {
    assert.deepEqual(compileItem(source("Surging Serum (Lesser)")).item.counteract, { modifier: 8, rank: 2, conditions: ["clumsy", "enfeebled"], traits: [], afflictions: [], pick: "each" });
    assert.equal(routeOf(compileItem(source("Surging Serum (Lesser)"))), "counteract");
    assert.equal(compileItem(source("Contagion Metabolizer (Lesser)")).item.counteract.pick, "highest");
    assert.deepEqual(compileItem(source("Fu Water")).item.counteract.conditions, ["confused", "fascinated", "frightened", "stupefied"]);
    // Panacea Fruit heals too: that card stays, the counteract card beside it.
    const fruit = compileItem(source("Panacea Fruit"));
    assert.notEqual(routeOf(fruit), "counteract");
    assert.deepEqual(fruit.item.counteract.afflictions, ["curse", "disease", "poison"]);
    // PF2e's rule: a success counteracts up to a rank above, a failure only a lower rank.
    assert.deepEqual([counteracts(2, 2, 3), counteracts(2, 2, 4), counteracts(1, 2, 1), counteracts(1, 2, 2), counteracts(3, 2, 5), counteracts(0, 9, 1)], [true, false, true, false, true, false]);
    // A condition an Effect grants is that Effect's row.
    const rows = counteractCandidates({ effects: [{ id: "e", name: "E", traits: [], level: 1 }], conditions: [{ id: "c1", slug: "enfeebled", grantedBy: "e" }, { id: "c2", slug: "clumsy" }] }, { conditions: ["clumsy", "enfeebled"], traits: [], afflictions: [], pick: "each" });
    assert.deepEqual(rows.map((row) => [row.kind, row.id, row.ticked]), [["effect", "e", true], ["condition", "c2", true]]);
});

test("Surging Serum: finds the Effect granting enfeebled and the plain clumsy; a success ends the Effect, a failure keeps clumsy", async () => {
    const serum = foundry.giveItem(weak, source("Surging Serum (Lesser)"));
    const data = serum.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: serum.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: weak.id }, actor: weak, token: weak.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "counteract");
    assert.match(card.content, /Counteract \+8, rank 2: each effect inflicting clumsy or enfeebled/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.step, "pick");
    assert.deepEqual(state.rows.map((row) => [row.name, row.rank, row.ticked]), [["Effect: Ray of Enfeeblement", 1, true], ["Clumsy 1", null, true]]);
    // Without the GM's numbers for clumsy: refused.
    const errors = foundry.notifications.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 17 }, { ticked: true }], userId: "player" });
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Give the DC and rank for Clumsy 1/.test(text)));
    // The stand-in rolls a natural 10: 18 against DC 17 is a success (rank 1 ≤ 2 + 1: counteracted); 18 against DC 25 a
    // failure (rank 2 isn't below 2: not counteracted).
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 17 }, { ticked: true, dc: 25, rank: 2 }], userId: "player" });
    await settle();
    assert.equal(weak.created.some((entry) => entry.id === "effect-enfeeble"), false, "the Effect ended");
    assert.equal(weak.hasCondition("clumsy"), true, "clumsy stays");
    assert.match(card.content, /Effect: Ray of Enfeeblement: 18 against DC 17: a success, counteracted/);
    assert.match(card.content, /Clumsy 1: 18 against DC 25: a failure, not counteracted/);
});

test("counteracts on an activation: Bracers of Pain's \"the effect causing your condition\" (its Trigger's conditions), Skarja's Heartstone's 1d20+23", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const pain = compileActivations(source("Bracers of Pain"))[0].plan;
    assert.deepEqual([pain.builtin, pain.item.counteract.modifier, pain.item.counteract.rank, pain.item.counteract.conditions], ["counteract", 22, 6, ["immobilized", "paralyzed", "slowed", "stupefied"]]);
    const skarja = compileActivations(source("Skarja's Heartstone"))[0].plan;
    assert.deepEqual([skarja.item.counteract.modifier, skarja.item.counteract.rank, skarja.item.counteract.afflictions], [23, 7, ["disease"]]);
});

test("Etheric Essence Disruptor: a spell's Effect on a creature within 30 feet — the creatures there to pick, that one's spell Effects listed, the tradition a note", async () => {
    const plan = compileItem(source("Etheric Essence Disruptor (Lesser)"));
    assert.deepEqual([plan.builtin, plan.targeting.range, plan.item.counteract.modifier, plan.item.counteract.rank, plan.item.counteract.spells, plan.item.counteract.within], ["counteract", 30, 7, 2, true, 30]);
    assert.deepEqual(plan.item.counteract.notes, ["Only an active divine or occult spell: tick one that is."]);
    assert.equal(routeOf(plan), "counteract");
    const engineer = foundry.makeActor({ id: "counter-engineer", name: "Engineer", owners: ["player"] });
    const blessed = foundry.makeActor({ id: "counter-blessed", name: "Blessed Foe" });
    foundry.place(engineer, 0, 14500);
    foundry.place(blessed, 300, 14500);
    blessed.created.push({ id: "effect-bless", type: "effect", name: "Spell Effect: Bless", system: { traits: { value: [] }, level: { value: 1 } } }, { id: "effect-other", type: "effect", name: "Effect: Rage", system: { traits: { value: [] } } });
    const disruptor = foundry.giveItem(engineer, source("Etheric Essence Disruptor (Lesser)"));
    const data = disruptor.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: disruptor.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: engineer.id }, actor: engineer, token: engineer.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.match(card.content, /Counteract \+7, rank 2: one spell on a creature within 30 feet/);
    const state = card.flags[MODULE_ID].card;
    const at = state.drinkers.findIndex((entry) => entry.name === "Blessed Foe");
    assert.ok(at > 0, "the creature 15 feet away is offered");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: at, userId: "player" });
    await settle();
    assert.deepEqual(card.flags[MODULE_ID].card.rows.map((row) => [row.name, row.kind, row.rank, row.ticked]), [["Spell Effect: Bless", "effect", 1, true]]);
    // (The stand-in's natural 10: 17 against DC 15 is a success, rank 1 ≤ 2 + 1.)
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 15 }], userId: "player" });
    await settle();
    assert.equal(blessed.created.some((entry) => entry.id === "effect-bless"), false, "Bless ended");
    assert.equal(blessed.created.some((entry) => entry.id === "effect-other"), true, "not a spell's: kept");
});

test("Contagion Metabolizer (Lesser): a poison Pseudo Afflictions tracks is an affliction — its counteract rank half its level, its DC the affliction's save — not a plain Effect", async () => {
    const drinker = foundry.makeActor({ id: "counter-poisoned", name: "Poisoned", owners: ["player"] });
    foundry.place(drinker, 0, 14700);
    drinker.created.push({ id: "effect-venom", type: "effect", name: "Affliction Effect: Viper Venom", system: { traits: { value: ["poison"] }, level: { value: 3 } }, flags: { "pseudo-afflictions": { save: { type: "fortitude", value: 16 }, stages: { 1: {} } } } });
    const metabolizer = foundry.giveItem(drinker, source("Contagion Metabolizer (Lesser)"));
    const data = metabolizer.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: metabolizer.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    assert.deepEqual(card.flags[MODULE_ID].card.rows.map((row) => [row.name, row.kind, row.rank, row.dc]), [["Viper Venom", "affliction", 2, 16]]);
});

test("Violet Ray's Electric Love: one condition on an adjacent creature (+22, rank 6, the condition's source its DC); The Teamster: one of its user's conditions from its list (+31, rank by its level)", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const [ray] = compileActivations(source("Violet Ray"));
    assert.deepEqual([ray.plan.builtin, ray.plan.item.counteract.modifier, ray.plan.item.counteract.rank, ray.plan.item.counteract.pick, ray.plan.item.counteract.within, ray.plan.targeting.range], ["counteract", 22, 6, "one", 5, 5]);
    assert.deepEqual(ray.plan.item.counteract.conditions, ["blinded", "clumsy", "confused", "deafened", "drained", "enfeebled", "sickened", "stupefied"]);
    assert.ok(ray.plan.item.counteract.notes.includes("Its DC and rank are those of what caused the condition."));
    const [teamster] = compileActivations(source("The Teamster"));
    assert.deepEqual([teamster.plan.builtin, teamster.plan.item.counteract.modifier, teamster.plan.item.counteract.pick, teamster.plan.item.counteract.within ?? null], ["counteract", 31, "one", null]);
    assert.ok(["paralyzed", "petrified", "grabbed", "doomed"].every((slug) => teamster.plan.item.counteract.conditions.includes(slug)));
    assert.match(teamster.plan.item.counteract.notes[0], /more than 4 levels lower/);
});

test("a counteract aimed at what isn't on a creature (Antimagic Armor's triggering spell at +26, rank 7; Countering Charm's rank the stored spell's): straight to its one row, the GM's DC and rank, the result reported, nothing removed", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const [antimagic] = compileActivations(source("Antimagic"));
    assert.deepEqual([routeOf(antimagic.plan), antimagic.plan.item.counteract.modifier, antimagic.plan.item.counteract.rank, antimagic.plan.item.counteract.free.name], ["counteract", 26, 7, "the triggering spell"]);
    const [charm] = compileActivations(source("Countering Charm (Major)"));
    assert.equal(charm.plan.item.counteract.rank, null);
    const armor = foundry.giveItem(weak, source("Countering Charm (Major)"));
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: armor.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.at(-1);
    const state = card.flags[MODULE_ID].card;
    assert.deepEqual([state.kind, state.step, state.rows.map((row) => row.name)], ["counteract", "pick", ["the triggering spell"]]);
    assert.match(card.content, /data-air-ownrank/);
    // (Without the item's own rank: refused; with it, 10 + 30 = 40 against DC 30 is a critical success — rank 9 ≤ 8 + 3, counteracted.)
    const errors = foundry.notifications.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 30, rank: 9 }], ownRank: "", userId: "player" });
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Give the item's counteract rank/.test(text)));
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 30, rank: 9 }], ownRank: "8", userId: "player" });
    await settle();
    assert.match(card.content, /the triggering spell: 40 against DC 30: a critical success, counteracted \(end it by hand\)/);
});

test("more counteracts at what isn't on a creature: Twilight Lantern's darkness effect, Draconal Mask's triggering illusion, Frost Brand's magical fire", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const lantern = compileActivations(source("Twilight Lantern (Major)"))[1];
    assert.deepEqual([lantern.plan.item.counteract.modifier, lantern.plan.item.counteract.free.name], [28, "the darkness effect"]);
    const [mask] = compileActivations(source("Draconal Mask"));
    assert.deepEqual([mask.plan.item.counteract.rank, mask.plan.item.counteract.free.name], [9, "the triggering illusion"]);
    const [brand] = compileActivations(source("Frost Brand"));
    assert.deepEqual([brand.plan.item.counteract.modifier, brand.plan.item.counteract.free.name], [27, "the magical fire"]);
});

test("a counteract beside another reading on an activation: Golden Gloves' halo — its enemies' Fortitude save, then one affliction its user suffers counteracted at +31, rank 9", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const [gloves] = compileActivations(source("Golden Gloves"));
    assert.deepEqual([routeOf(gloves.plan), gloves.plan.item.counteract.modifier, gloves.plan.item.counteract.rank, gloves.plan.item.counteract.afflictions, gloves.plan.item.counteract.pick], ["save", 31, 9, ["curse", "disease", "poison"], "one"]);
});

test("Herald's Ring's Reflect Sound: the triggering effect counteracted at +23 (rank 7, half its level), each degree's reflected damage a note for the GM", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const reflect = compileActivations(source("Herald's Ring"))[1];
    assert.equal(routeOf(reflect.plan), "counteract");
    const counteract = reflect.plan.item.counteract;
    assert.deepEqual([counteract.modifier, counteract.rank, counteract.free.name], [23, 7, "the effect"]);
    assert.deepEqual(counteract.notes.map((note) => note.split(":")[0]), ["Critical success", "Success", "Failure", "Critical failure"]);
    assert.match(counteract.notes[1], /^Success: Half of the damage is reflected back at its source, and the other half is negated \(by hand\)\.$/);
});

test("Flame Navette (Determination): one condition on its user ends outright, no numbers; a spell or magical Effect is counteracted at +22, rank 8; no one else offered", async () => {
    const navette = compileItem(source("Flame Navette"));
    assert.equal(routeOf(navette), "counteract");
    const counteract = navette.item.counteract;
    assert.deepEqual([counteract.modifier, counteract.rank, counteract.pick, counteract.self, counteract.endsConditions], [22, 8, "one", true, true]);
    assert.ok(counteract.conditions.includes("frightened") && counteract.conditions.includes("persistent-damage"));
    const scared = foundry.makeActor({ id: "counter-scared", name: "Scared", owners: ["player"], conditions: ["frightened"] });
    foundry.place(scared, 0, 14100);
    // (A creature beside it isn't offered: Determination is its user's.)
    const friend = foundry.makeActor({ id: "counter-friend", name: "Friend", owners: ["player"], conditions: ["frightened"] });
    foundry.place(friend, 100, 14100);
    scared.created.push({ id: "effect-slow", type: "effect", name: "Spell Effect: Haste Undone", system: { traits: { value: ["arcane"] }, level: { value: 3 } } });
    scared.created.push({ id: "effect-plain", type: "effect", name: "Effect: Rousing Speech", system: { traits: { value: [] }, level: { value: 1 } } });
    const item = foundry.giveItem(scared, source("Flame Navette"));
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: scared.id }, actor: scared, token: scared.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "counteract");
    assert.deepEqual(card.flags[MODULE_ID].card.drinkers.map((entry) => entry.name), ["Scared"]);
    assert.match(card.content, /Counteract \+22, rank 8: one spell or magical effect on you, or one condition, which ends outright/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    const state = card.flags[MODULE_ID].card;
    assert.deepEqual(state.rows.map((row) => [row.kind, row.name, Boolean(row.ends)]), [["effect", "Spell Effect: Haste Undone", false], ["condition", "Frightened 1", true]]);
    assert.match(card.content, /Frightened 1<\/label> \(ends outright\)/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: false }, { ticked: true }], userId: "player" });
    await settle();
    assert.equal(scared.hasCondition("frightened"), false);
    assert.match(card.content, /Frightened 1: ended\./);
});

test("counteracts at a triggering spell or affliction in more words: Bloodstone Doll's \"counteract check against the triggering spell\" (+9, rank 2; its control of the summoned creature the GM's), The Theater and The Locksmith at their user's numbers — half its level, rounded up, its class DC − 10", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const doll = compileItem(source("Bloodstone Doll (Minor)"));
    assert.deepEqual([routeOf(doll), doll.item.counteract.modifier, doll.item.counteract.rank, doll.item.counteract.free.name], ["counteract", 9, 2, "the triggering spell"]);
    assert.match(doll.item.counteract.notes.join(" "), /You gain control of the summoned creature/);
    const [theater] = compileActivations(source("The Theater"));
    assert.deepEqual([theater.plan.item.counteract.free.name, theater.plan.item.counteract.fromUser], ["the misfortune effect", { modifier: "class-dc", rank: "half-level" }]);
    const [locksmith] = compileActivations(source("The Locksmith"));
    assert.equal(locksmith.plan.item.counteract.free.name, "the triggering affliction");
    // (Its user at level 9, class DC 27: rank 5, +17.)
    const champion = foundry.makeActor({ id: "counter-champion", name: "Champion", owners: ["player"] });
    foundry.place(champion, 0, 29000);
    champion.level = 9;
    champion.classDC = { mod: 17, dc: { value: 27 } };
    const card = foundry.giveItem(champion, source("The Theater"));
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: card.uuid, activation: 0, userId: "player" });
    await settle();
    const state = foundry.messages.at(-1).flags[MODULE_ID].card;
    assert.deepEqual([state.kind, state.counteract.rank, state.counteract.modifier, state.rows.map((row) => row.name)], ["counteract", 5, 17, ["the misfortune effect"]]);
});
