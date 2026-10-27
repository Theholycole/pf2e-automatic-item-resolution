// The adventure books' triggers, rerolls, numbers from another roll and results for some creatures only, built on 2026-10-27
// (src/compiler/trigger-readings.js): each card's reading on the real PF2e pack item, the live pieces it needs (src/live/if-target.js's kinds,
// the reroll card's allies and changed DC, the Strike gate's critical hit), and the reroll flows against the stand-in for Foundry.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { gateMet } from "../src/compiler/strike-gate.js";
import { breathes, planFor, sunlightVulnerable } from "../src/live/if-target.js";
import { raisedResult, rerollText, triggeringRoll } from "../src/live/reroll-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
const options = { spells: spellIndex(documents("spells")), ...(claims ? { claims } : {}) };
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which) => compileActivations(item(name), options).find((entry, index) => (typeof which === "string" ? entry.activation.name === which : index === (which ?? 0)))?.plan;
const consumable = (name) => compileItem(item(name), options);
// (Nothing left to the table: not partial nor note-only, no notes unread, no GM lines on its rows.)
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect" && !(plan.unread ?? []).length && Object.values(plan.resolution?.outcomes ?? {}).every((row) => !(row?.manualInstructions ?? []).length);
const reminders = (plan) => Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.noteEffects ?? []).filter((note) => note.reminder);
const ability = (name, type = "action") => ({ name, type });

test("Smogger's thick smog: every creature in it saves, its wearer too; those that need air and aren't holding their breath −2 and Sickened 2 on a failure", () => {
    const smog = activation("Smogger", 1);
    assert.ok(done(smog));
    assert.equal(routeOf(smog), "save");
    assert.deepEqual(smog.targeting.area, { type: "emanation", value: 10 });
    assert.deepEqual(smog.ifTarget, [
        { breathes: true, bonus: { value: -2, type: "circumstance" } },
        { breathes: true, degree: "failure", effects: [{ kind: "condition", slug: "sickened", value: 2, duration: null }] },
        { breathes: true, degree: "criticalFailure", effects: [{ kind: "condition", slug: "sickened", value: 2, duration: null }] }
    ]);
    assert.ok(smog.notes.some((note) => /5 in a strong wind/.test(note)));
    // (Its first activation, the smog itself, as it was.)
    assert.equal(activation("Smogger", 0).builtin, "zone");
    // Who needs air: not a construct nor undead, nor one whose ability says so, nor one holding its breath.
    const human = { system: { traits: { value: ["human", "humanoid"] } }, items: [], itemTypes: { effect: [] } };
    assert.equal(breathes(human), true);
    assert.equal(breathes({ system: { traits: { value: ["construct"] } } }), false);
    assert.equal(breathes({ system: { traits: { value: ["undead"] } } }), false);
    assert.equal(breathes({ system: { traits: { value: ["beast"] } }, items: [ability("Doesn't Need to Breathe")] }), false);
    assert.equal(breathes({ ...human, itemTypes: { effect: [{ name: "Effect: Remaining Air", flags: { "pf2e-automatic-environment-resolution": { air: true } } }] } }), false);
    assert.equal(breathes({ ...human, itemTypes: { effect: [{ name: "Holding Breath" }] } }), false);
    const theirs = planFor(smog, human);
    assert.deepEqual(theirs.resolution.check.bonus, { value: -2, type: "circumstance" });
    assert.deepEqual(theirs.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.value]), [["sickened", 1], ["sickened", 2]]);
    assert.equal(planFor(smog, { system: { traits: { value: ["construct"] } } }), smog, "a construct saves as written");
});

test("Horn of the Sun Aurochs: its enemies' save, Frightened for those vulnerable to sunlight, and the counteract card beside it for darkness and sleep", () => {
    const horn = activation("Horn of the Sun Aurochs");
    assert.ok(done(horn));
    assert.equal(routeOf(horn), "save");
    assert.deepEqual(horn.ifTarget, [
        { sunlight: true, degree: "failure", effects: [{ kind: "condition", slug: "frightened", value: 1, duration: null }] },
        { sunlight: true, degree: "criticalFailure", effects: [{ kind: "condition", slug: "frightened", value: 2, duration: null }] }
    ]);
    const { modifier, rank, free, pick } = horn.item.counteract;
    assert.deepEqual([modifier, rank, pick], [23, 7, "one"], "+23, rank half the horn's level 13");
    assert.match(free.name, /darkness or sleep effect/);
    assert.ok(horn.notes.some((note) => /enemies within 20 feet/.test(note)) && horn.notes.some((note) => /dim light 20 feet past/.test(note)));
    // Who's vulnerable to sunlight: an ability named for it, or a vampire's vulnerabilities.
    for (const name of ["Sunlight Powerlessness", "Vulnerable to Sunlight", "Sunlight Petrification", "Vampire Vulnerabilities"]) assert.equal(sunlightVulnerable({ items: [ability(name)] }), true, name);
    assert.equal(sunlightVulnerable({ items: [ability("Light Blindness"), { name: "Sunlight Lantern", type: "equipment" }] }), false);
    const wraith = planFor(horn, { items: [ability("Sunlight Powerlessness")] });
    assert.deepEqual(wraith.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value]), [["frightened", 2]]);
    assert.equal(planFor(horn, { items: [] }), horn);
});

test("rerolls: Beckoning Cat Amulet's allies' failed Reflex saves, Silvanshee Collar's failed Lie or Make an Impression (the higher kept)", () => {
    const cat = consumable("Beckoning Cat Amulet");
    assert.ok(done(cat));
    assert.equal(routeOf(cat), "reroll");
    const { after, ...reroll } = cat.reroll;
    assert.deepEqual(reroll, { what: "save", statistic: "reflex", keep: "higher", who: "allies", within: 10, failed: true });
    assert.match(after, /same effect as its user's/, "the reroll card's own line");
    assert.equal(rerollText(cat.reroll), "Each ally targeted within 10 feet: its latest failed Reflex save, rerolled: the higher result");
    // (Its search: the ally's own latest Reflex save that failed — not a later success, nor another's.)
    const messages = [
        { id: "a", type: "saving-throw", domains: ["reflex"], actorUuid: "Actor.ally", outcome: "criticalFailure" },
        { id: "b", type: "saving-throw", domains: ["reflex"], actorUuid: "Actor.ally", outcome: "success" },
        { id: "c", type: "saving-throw", domains: ["reflex"], actorUuid: "Actor.other", outcome: "failure" }
    ];
    assert.equal(triggeringRoll(messages, cat.reroll, { actorUuid: "Actor.ally" }), "a");
    const collar = activation("Silvanshee Collar", "Awww!");
    assert.ok(done(collar));
    assert.deepEqual(collar.reroll, { what: "check", statistic: ["deception", "diplomacy"], keep: "higher", who: "self" });
    assert.deepEqual(collar.trigger.frequency, { max: 1, per: "hour", raw: "once per hour" });
});

test("Pyrefeather Token: its 5 temporary Hit Points, and the reroll card's recovery check at a DC 1 lower", () => {
    const token = consumable("Pyrefeather Token");
    assert.ok(done(token));
    assert.equal(routeOf(token), "item", "its item card, the reroll card beside it");
    assert.deepEqual(token.reroll, { what: "check", keep: "new", who: "self", recovery: true, raise: { dc: -1 } });
    assert.deepEqual(token.resolution.outcomes.success.effects.map((effect) => [effect.kind, effect.amount]), [["temp-hp", 5]]);
    assert.deepEqual(reminders(token), [], "no reminder of the whole text");
    assert.equal(rerollText(token.reroll), "Your latest recovery check: its DC 1 lower, its degree again");
    // (A 10 against DC 11 — dying 1 — fails; against 10 it succeeds.)
    assert.deepEqual(raisedResult({ oldTotal: 10, oldNatural: 10, dc: 11, raise: token.reroll.raise }), { degree: 2, total: 10, before: 1, dc: 10 });
    // (Its search: the latest flat check, not a later skill check.)
    assert.equal(triggeringRoll([{ id: "r", type: "flat-check", actorUuid: "Actor.x" }, { id: "s", type: "skill-check", actorUuid: "Actor.x" }], token.reroll, { actorUuid: "Actor.x" }), "r");
});

test("numbers from another roll: Cindergrass Poultice's typed fire damage, Grisly Scythe's void critical hit, Deflecting Branch's reflected shot", () => {
    const poultice = consumable("Cindergrass Poultice");
    assert.ok(done(poultice));
    assert.deepEqual(poultice.item.levelTemp, [{ from: "amount", of: "the fire damage it took within the last minute", multiplier: 1, max: 10, heal: true, duration: null }]);
    assert.deepEqual(poultice.resolution.outcomes.success.effects, [{ kind: "heal", formula: "2d12" }]);
    assert.deepEqual(poultice.temperature.counts, { "severe-heat": "mild-heat" });
    assert.deepEqual(reminders(poultice), []);
    const scythe = activation("Grisly Scythe");
    assert.ok(done(scythe));
    assert.equal(routeOf(scythe), "strike");
    assert.deepEqual([scythe.strike.hit, scythe.strike.own, scythe.strike.alteration], [true, true, "void"]);
    assert.match(scythe.strike.lines[0], /half the void damage/);
    assert.deepEqual(scythe.drain, { fraction: 0.5, type: "void", duration: null, heal: true, immediate: true });
    assert.deepEqual(scythe.resolution.outcomes.criticalSuccess.effects, [{ kind: "condition", slug: "sickened", value: 1, duration: null }]);
    assert.deepEqual(scythe.gate, { strike: { critical: true, maneuvers: [] } });
    // (Its gate: a critical hit with it as its user's last roll — a plain hit isn't one.)
    const roll = (outcome) => [{ actorUuid: "Actor.u", type: "attack-roll", outcome, itemUuid: "Item.s", targetUuid: "Token.t" }];
    assert.deepEqual(gateMet(scythe.gate, roll("criticalSuccess"), { actorUuid: "Actor.u", itemUuid: "Item.s" }), { ok: true, struck: "Token.t" });
    assert.match(gateMet(scythe.gate, roll("success"), { actorUuid: "Actor.u", itemUuid: "Item.s" }).why, /^a critical hit Strike/);
    const branch = activation("Deflecting Branch", 1);
    assert.ok(done(branch));
    assert.equal(routeOf(branch), "save");
    assert.deepEqual([branch.ownCheck, branch.targeting.range, branch.strikeDamage.from], [{ kind: "attack", modifier: null, choose: ["proficiency"] }, "60 feet", "triggering-miss"]);
    assert.equal(activation("Deflecting Branch", 0).builtin, "readied-bonus", "its first activation as it was");
});

// --- Live: the reroll cards, against the stand-in for Foundry. ----------------------------------------------------------------------------------

// (Shared with the other flow tests: these creatures stand 777 squares down.)
const foundry = await fakeFoundry();
const cat = foundry.makeActor({ id: "b3t-cat", name: "Kitty", owners: ["player"] });
const ally = foundry.makeActor({ id: "b3t-ally", name: "Pal" });
const other = foundry.makeActor({ id: "b3t-other", name: "Bystander" });
foundry.place(cat, 0, 77700);
foundry.place(ally, 100, 77700);
foundry.place(other, 200, 77700);
const rolled = (actor, type, context = {}) => foundry.makeMessage({ flags: { pf2e: { context: { type, ...context } } }, speaker: { actor: actor.id }, actor });
async function useCard(actor, name) {
    const given = foundry.giveItem(actor, source(name));
    const data = given.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: given.uuid, sourceId: data._stats.compendiumSource, type: given.type } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
    const count = foundry.messages.length;
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages.slice(count);
}

test("Beckoning Cat Amulet live: each ally targeted has its latest failed Reflex save rerolled, the higher kept; one with none is said so", async () => {
    const failed = rolled(ally, "saving-throw", { domains: ["saving-throw", "reflex"], outcome: "failure" });
    rolled(other, "saving-throw", { domains: ["saving-throw", "reflex"], outcome: "success" });
    const [card] = await useCard(cat, "Beckoning Cat Amulet");
    assert.equal(card.flags[MODULE_ID].card.kind, "reroll");
    const before = foundry.rerolls.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [ally.token.uuid, other.token.uuid], userId: "player" });
    await settle();
    const done = foundry.rerolls.slice(before);
    assert.deepEqual(done.map((entry) => [entry.message.id, entry.options]), [[failed.id, { keep: "higher" }]], "the ally's failed save only");
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.status, "applied");
    assert.ok(state.results.some((line) => /^Bystander: no failed reflex saving throw/.test(line)), JSON.stringify(state.results));
});

test("Pyrefeather Token live: its item card and the reroll card beside it, which works out the recovery check at a DC 1 lower", async () => {
    const recovery = rolled(cat, "flat-check", { outcome: "failure", dc: { value: 11 } });
    recovery.rolls = [{ total: 10, dice: [{ total: 10 }] }];
    const cards = await useCard(cat, "Pyrefeather Token");
    const kinds = cards.map((message) => message.flags?.[MODULE_ID]?.card?.kind);
    assert.ok(kinds.includes("reroll") && kinds.includes("item"), JSON.stringify(kinds));
    const card = cards.find((message) => message.flags?.[MODULE_ID]?.card?.kind === "reroll");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.status, "applied", JSON.stringify(state.results));
    assert.match(state.results[0], /^Kitty's recovery check \(10\) against DC 10 \(11 − 1\): a success \(was a failure\)\.$/);
});
