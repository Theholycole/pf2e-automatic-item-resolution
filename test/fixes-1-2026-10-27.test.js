// The bugs found reading the second batch's code (2026-10-27), fixed: the DCs PF2e's Treat Poison and Stop Bleeding lack, a temporary immunity
// held to on the counteract card and only once a check was made, Awakened Adamantine Shot's ignored resistance for its one Strike, and the
// smaller ones beside them — each on PF2e's own items, against the stand-in for Foundry.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { postCounteractCard } from "../scripts/counteract.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY_ID = "pf2e-automatic-ability-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which = null) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));

// (Shared with the other flow tests: these creatures stand 1500 squares down.)
const foundry = await fakeFoundry();
let spot = 0;
const creature = (id, name = id) => {
    const actor = foundry.makeActor({ id, name, owners: ["player"] });
    foundry.place(actor, 0, 150000 + 1000 * spot++);
    return actor;
};
const medic = creature("fix1-medic", "Medic");
const immunities = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY_ID]?.immunity);
const results = (card) => card.flags[MODULE_ID].card.results.join(" | ");

// A consumable used by the medic (PF2e's Use message), its card; → apply(outcome) at the patient, PF2e's action recorded.
async function usedOn(name, patient) {
    const given = foundry.giveItem(medic, source(name));
    const data = given.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: given.uuid, sourceId: data._stats.compendiumSource, type: given.type } } }, speaker: { actor: medic.id }, actor: medic, token: medic.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    return async (outcome) => {
        foundry.nextOutcome.value = outcome;
        const uses = foundry.actionUses.length;
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [patient.token.uuid], userId: "player" });
        await settle();
        foundry.nextOutcome.value = "success";
        return { card, use: foundry.actionUses.slice(uses)[0] };
    };
}
// (PF2e's First Aid has two variants: the stand-in's actions have none.)
async function withVariants(run) {
    const get = globalThis.game.pf2e.actions.get;
    globalThis.game.pf2e.actions.get = (slug) => ({ ...get(slug), variants: new Map([["stabilize", {}], ["stop-bleeding", {}]]) });
    try {
        return await run();
    } finally {
        globalThis.game.pf2e.actions.get = get;
    }
}
const poison = (actor, { name, traits, dc, stage = 3 }) => actor.createEmbeddedDocuments("Item", [{ type: "effect", name: `Affliction Effect: ${name}`, system: { badge: { value: stage, max: 4 }, traits: { value: traits }, level: { value: 3 } }, flags: { "pseudo-afflictions": { stages: [{}, {}, {}, {}], save: { type: "fortitude", value: dc } } } }]);

// --- Treat Poison's and Stop Bleeding's DCs (bugs 11 and 16) -------------------------------------------------------------------------------------

test("Artevil Suspension: Treat Poison at the DC of the poison it may treat (its ingested one, not the injury poison beside it)", async () => {
    const patient = creature("fix1-poisoned");
    await poison(patient, { name: "Tainted Wine", traits: ["poison", "ingested"], dc: 22 });
    await poison(patient, { name: "Blade Venom", traits: ["poison", "injury"], dc: 30 });
    const apply = await usedOn("Artevil Suspension", patient);
    const { card, use } = await apply("success");
    assert.deepEqual([use.slug, use.options.difficultyClass], ["treat-poison", { value: 22 }]);
    assert.match(results(card), /Tainted Wine down to stage 2/);
});

test("Treat Poison with no poison to treat: PF2e's roll has no DC, and the card says why rather than 'cancelled'", async () => {
    const patient = creature("fix1-clean");
    const apply = await usedOn("Artevil Suspension", patient);
    const { card, use } = await apply(null);
    assert.equal(use.options.difficultyClass, undefined);
    assert.match(results(card), /no result — fix1-clean has no poison with a DC to treat \(an ingested one\), so PF2e's roll has no DC/);
    assert.equal(card.flags[MODULE_ID].card.status, "open");
});

test("Crying Angel Pendant: Stop Bleeding at its bleed's DC (the higher of two), and a success ends the bleed", async () => {
    const patient = creature("fix1-bleeding");
    const low = foundry.givePersistent(patient, { damageType: "bleed", dc: 15, formula: "1d6" });
    const high = foundry.givePersistent(patient, { damageType: "bleed", dc: 18, formula: "2d6" });
    const apply = await usedOn("Crying Angel Pendant", patient);
    const { card, use } = await withVariants(() => apply("success"));
    assert.deepEqual([use.options.variant, use.options.difficultyClass], ["stop-bleeding", { value: 18 }]);
    // (Ended outright: deleted — the stand-in's delete records it.)
    assert.deepEqual([low.id, high.id].filter((id) => (patient.deleted ?? []).includes(id)).length, 2, "the bleed ended");
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("Yarrow-Root Bandage: its one check at 5 more than the higher of its stabilize DC and its bleed's", async () => {
    const patient = creature("fix1-dying-bleeding");
    patient.conditions.set("dying", 1);
    patient.system.attributes.dying = { value: 1, recoveryDC: 10 };
    foundry.givePersistent(patient, { damageType: "bleed", dc: 25, nextRoll: 30 });
    const apply = await usedOn("Yarrow-Root Bandage", patient);
    const { use } = await withVariants(() => apply("success"));
    // (Stabilize 5 + 10 + 1 = 16, the bleed's 25: 25 + 5.)
    assert.deepEqual([use.options.variant, use.options.difficultyClass], ["stabilize", { value: 30 }]);
});

// --- A temporary immunity only once a check is made, and on the counteract card (bugs 12 and 15) -------------------------------------------------

test("Curled Cure Gel: a cancelled Treat Wounds gives no immunity, the card stays open; the check made, the creature treated is immune", async () => {
    const patient = creature("fix1-patient");
    patient.conditions.set("clumsy", 2);
    const apply = await usedOn("Curled Cure Gel", patient);
    const cancelled = await apply(null);
    assert.equal(cancelled.card.flags[MODULE_ID].card.status, "open");
    assert.match(results(cancelled.card), /no result \(cancelled\)/);
    assert.equal(immunities(patient).length, 0, "no Immune: Effect for a check never made");
    await apply("success");
    assert.deepEqual(immunities(patient).map((effect) => effect.flags[ABILITY_ID].immunity.slug), ["curled-cure-gel"]);
    assert.equal(cancelled.card.flags[MODULE_ID].card.status, "applied");
});

async function refused(messageId, data) {
    const errors = foundry.notifications.length;
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId, ...data, userId: "player" });
    } catch {
        // (Checked by its notification.)
    }
    await settle();
    return foundry.notifications.slice(errors).join(" / ");
}
const postedCounteract = async (plan, actor, name) => {
    const before = foundry.messages.length;
    await postCounteractCard({ message: null, plan, used: { data: { name, uuid: null, system: { traits: { value: [] } } } }, actor, token: actor.token });
    await settle();
    return foundry.messages[before];
};

test("Flame Navette: its one a day kept on the counteract card; given once the card applies (not on its find step), and the next refused", async () => {
    const fighter = creature("fix1-navette");
    fighter.conditions.set("frightened", 2);
    fighter.saves = { will: { mod: 5 } };
    const navette = compileItem(item("Flame Navette"));
    const card = await postedCounteract(navette, fighter, "Flame Navette");
    assert.deepEqual([card.flags[MODULE_ID].card.immunity?.slug, card.flags[MODULE_ID].card.immunity?.duration], ["flame-navette", { value: 1, unit: "days" }]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    assert.deepEqual([card.flags[MODULE_ID].card.step, immunities(fighter).length], ["pick", 0], "found, not yet given");
    const row = card.flags[MODULE_ID].card.rows.findIndex((entry) => entry.slug === "frightened");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: card.flags[MODULE_ID].card.rows.map((entry, index) => ({ ticked: index === row })), userId: "player" });
    await settle();
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
    assert.ok(!fighter.conditions.has("frightened"), "frightened ended outright");
    const [immune] = immunities(fighter);
    assert.deepEqual([immunities(fighter).length, immune?.flags[ABILITY_ID].immunity.slug, immune?.system.duration.value, immune?.system.duration.unit], [1, "flame-navette", 1, "days"]);
    const next = await postedCounteract(navette, fighter, "Flame Navette");
    assert.match(await refused(next.id, { drinker: 0 }), /fix1-navette is still immune to Flame Navette/);
    assert.equal(next.flags[MODULE_ID].card.step, "find");
});

test("Contagion Metabolizer: the drinker picked on the counteract card is the one made immune for its hour, not its user", async () => {
    const alchemist = creature("fix1-alchemist");
    const drinker = foundry.makeActor({ id: "fix1-drinker", name: "Drinker", owners: ["player"] });
    foundry.place(drinker, 100, alchemist.token.document.y);
    await poison(drinker, { name: "Sewer Fever", traits: ["disease"], dc: 18, stage: 2 });
    const card = await postedCounteract(compileItem(item("Contagion Metabolizer (Lesser)")), alchemist, "Contagion Metabolizer (Lesser)");
    const at = card.flags[MODULE_ID].card.drinkers.findIndex((entry) => entry.actorUuid === drinker.uuid);
    assert.ok(at > 0, "the drinker beside its user");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: at, userId: "player" });
    await settle();
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: card.flags[MODULE_ID].card.rows.map(() => ({ ticked: true })), userId: "player" });
    await settle();
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
    assert.deepEqual([immunities(drinker).map((effect) => [effect.flags[ABILITY_ID].immunity.slug, effect.system.duration.value, effect.system.duration.unit]), immunities(alchemist).length], [[["contagion-metabolizer", 1, "hours"]], 0]);
});
