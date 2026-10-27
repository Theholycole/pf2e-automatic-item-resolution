// Afflictions, persistent damage and dying (2026-10-27, docs/needs.md "afflictions" and "dying"): an addiction held off for a day; a save
// against one affliction now (Affliction Suppressant (Major), Antidote and Antiplague (Major), Mantle of Amazing Health) and a counteract that
// only holds one off (Razmiri Wayfinder, Razmiri Mask's Mercy) on the counteract card; its user's own counteract numbers when better (Flame
// Navette, Contagion Metabolizer).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { counteractCandidates, counteractText } from "../src/live/counteract-card.js";
import { routeOf } from "../src/live/route.js";
import { postCounteractCard } from "../scripts/counteract.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

// (Shared with the other flow tests: these creatures stand 673 squares down.)
const foundry = await fakeFoundry();

test("an addiction held off for a day: Addiction Suppressant's grade bonus to its save, only with its note Effect's toggle ticked", () => {
    for (const [grade, bonus] of [["Lesser", 1], ["Moderate", 2], ["Greater", 3], ["Major", 4]]) {
        const plan = compileItem(item(`Addiction Suppressant (${grade})`));
        const row = plan.resolution.outcomes.success;
        assert.ok(done(plan), grade);
        assert.deepEqual([row.modifiers[0].value, row.modifiers[0].type, row.modifiers[0].selector, row.modifiers[0].duration.unit], [bonus, "item", "saving-throw", "days"]);
        const toggle = row.noteEffects[0].rules[0];
        assert.deepEqual([toggle.key, toggle.toggleable, row.modifiers[0].predicate], ["RollOption", true, [toggle.option]]);
        assert.match(row.noteEffects[0].text, /addiction DC doesn't rise/);
        assert.equal(plan.notes.length, 1);
    }
});

test("a save against one affliction on drinking it: Affliction Suppressant (Major)'s 10 minutes of suppression, Antidote and Antiplague (Major)'s cure — the counteract card in its save mode beside the item card's bonus", () => {
    const suppressant = compileItem(item("Affliction Suppressant (Major)"));
    assert.ok(done(suppressant));
    assert.deepEqual([suppressant.unread, suppressant.item.counteract.save, suppressant.item.counteract.afflictions, suppressant.item.counteract.suppress.value, suppressant.item.counteract.suppress.unit], [undefined, { maxLevel: 14 }, ["curse", "disease", "poison"], 10, "minutes"]);
    assert.equal(suppressant.resolution.outcomes.success.modifiers[0].value, 4);
    assert.equal(suppressant.resolution.outcomes.success.noteEffects.length, 0, "the whole text's reminder gone");
    assert.notEqual(routeOf(suppressant), "counteract");
    const antidote = compileItem(item("Antidote (Major)"));
    const antiplague = compileItem(item("Antiplague (Major)"));
    assert.deepEqual([antidote.item.counteract.afflictions, antidote.item.counteract.suppress, antiplague.item.counteract.afflictions], [["poison"], undefined, ["disease"]]);
    assert.equal(antidote.resolution.kind, "effect", "PF2e's Effect: Antidote still the item card's");
    // (The lower grades have no such save.)
    assert.equal(compileItem(item("Antidote (Greater)")).item?.counteract, undefined);
});

test("a save to end one, immunity after: Mantle of Amazing Health's poison or disease, immune to it for 24 hours", () => {
    const [, mantle] = compileActivations(item("Mantle of Amazing Health")).map((entry) => entry.plan);
    assert.ok(done(mantle));
    assert.deepEqual([mantle.builtin, routeOf(mantle), mantle.item.counteract.save, mantle.item.counteract.afflictions, mantle.item.counteract.immunity, mantle.item.counteract.self, mantle.trigger.frequency.per], ["counteract", "counteract", { maxLevel: null }, ["disease", "poison"], { value: 24, unit: "hours" }, true, "hour"]);
    assert.match(counteractText(mantle.item.counteract), /^A save against one disease or poison: on a success it ends, and it's immune to that one for 24 hours$/);
});

test("held off rather than removed: Razmiri Wayfinder's counteract (+17, rank 5) halts one for a day; Razmiri Mask's Mercy, Cleanse Affliction at half its user's level, suppresses one for 24 hours, its stage lowered", () => {
    const [, wayfinder] = compileActivations(item("Razmiri Wayfinder")).map((entry) => entry.plan);
    assert.ok(done(wayfinder));
    assert.deepEqual([wayfinder.builtin, wayfinder.item.counteract.modifier, wayfinder.item.counteract.rank, wayfinder.item.counteract.afflictions, wayfinder.item.counteract.within, wayfinder.item.counteract.suppress.value, wayfinder.item.counteract.suppress.unit], ["counteract", 17, 5, ["disease", "poison"], 5, 1, "days"]);
    assert.match(counteractText(wayfinder.item.counteract), /; counteracted, it's halted for 1 day rather than removed$/);
    for (const [grade, modifier] of [["Silver", 17], ["Gold", 22], ["Porcelain", 28]]) {
        const mercy = activation(`Razmiri Mask (${grade})`, "Call Upon Razmir's Mercy");
        assert.ok(done(mercy), grade);
        assert.deepEqual([mercy.builtin, mercy.item.counteract.modifier, mercy.item.counteract.fromUser, mercy.item.counteract.suppress.stageDown, mercy.item.counteract.suppress.value, mercy.trigger.frequency.max], ["counteract", modifier, { rank: "half-level" }, 1, 24, 3]);
        assert.deepEqual(mercy.item.counteract.afflictionsByRank.map((entry) => entry.rank), [3, 4]);
    }
});

test("its user's own counteract numbers when better: Flame Navette's Determination (its Will save), Contagion Metabolizer's chirurgeon with Powerful Alchemy on one made by Quick Alchemy", () => {
    const navette = compileItem(item("Flame Navette"));
    assert.ok(done(navette));
    assert.deepEqual(navette.item.counteract.fromUser, { modifier: "will", better: true, needs: { features: ["determination"] } });
    assert.ok(!navette.item.counteract.notes.some((note) => /Determination feat/.test(note)));
    for (const grade of ["Lesser", "Moderate", "Greater"]) {
        const metabolizer = compileItem(item(`Contagion Metabolizer (${grade})`));
        assert.ok(done(metabolizer), grade);
        assert.deepEqual(metabolizer.item.counteract.fromUser, { rank: "half-level", modifier: "class-dc", better: true, needs: { features: ["chirurgeon", "powerful-alchemy"], infused: true } });
        assert.ok(Number.isFinite(metabolizer.item.counteract.rank) && Number.isFinite(metabolizer.item.counteract.modifier));
    }
});

test("the save mode's rows: each affliction of its kinds and level, its DC and save; none of the creature's other Effects", () => {
    const creature = { effects: [{ id: "e", name: "Effect: Poisoned Blade", traits: ["poison"] }], afflictions: [{ id: "a", name: "Spider Venom", traits: ["poison"], level: 3, dc: 20, save: "fortitude" }, { id: "b", name: "Mummy Rot", traits: ["curse", "disease"], level: 16, dc: 34, save: "fortitude" }, { id: "c", name: "Cackle Fever", traits: ["disease"], level: 2, dc: 16 }] };
    const rows = counteractCandidates(creature, { save: { maxLevel: 14 }, afflictions: ["curse", "disease", "poison"], pick: "one" });
    assert.deepEqual(rows.map((row) => [row.id, row.dc, row.save, row.rank, row.ticked]), [["a", 20, "fortitude", null, false], ["c", 16, "fortitude", null, false]]);
    assert.deepEqual(counteractCandidates(creature, { save: { maxLevel: null }, afflictions: ["poison"], pick: "one" }).map((row) => [row.id, row.ticked]), [["a", true]]);
});

// A drinker with a poison Pseudo Afflictions tracks at stage 2, its Fortitude save the stand-in's; each 10 squares from the last.
let spot = 0;
function poisoned(id, { total = 25 } = {}) {
    const actor = foundry.makeActor({ id, name: `Poisoned ${id}`, owners: ["player"] });
    foundry.place(actor, 0, 67300 + 1000 * spot++);
    actor.created.push({ id: `${id}-venom`, type: "effect", name: "Affliction Effect: Spider Venom", system: { traits: { value: ["poison"] }, level: { value: 3 }, badge: { value: 2, max: 3 } }, flags: { "pseudo-afflictions": { save: { type: "fortitude", value: 20 }, stages: { 1: {}, 2: {}, 3: {} } } }, async update(changes) { for (const [key, value] of Object.entries(changes)) if (key === "system.badge.value") this.system.badge.value = value; return this; } });
    actor.saves = { fortitude: { roll: async ({ dc }) => ({ total, degreeOfSuccess: total >= dc.value + 10 ? 3 : total >= dc.value ? 2 : total <= dc.value - 10 ? 0 : 1 }) } };
    return actor;
}
const posted = async (plan, actor, name) => {
    const before = foundry.messages.length;
    await postCounteractCard({ message: null, plan, used: { data: { name, uuid: null, system: { traits: { value: [] } } } }, actor, token: actor.token });
    await settle();
    return foundry.messages[before];
};

test("live: Affliction Suppressant (Major)'s save card finds the poison, its Fortitude save succeeds, a note Effect holds it off for 10 minutes; Mantle of Amazing Health's success ends it and names the immunity", async () => {
    const drinker = poisoned("b2-suppressed");
    const card = await posted(compileItem(item("Affliction Suppressant (Major)")), drinker, "Affliction Suppressant (Major)");
    assert.match(card.content, /A save against one curse, disease or poison of level 14 or lower: on a success it&#39;s suppressed for 10 minutes/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    assert.deepEqual(card.flags[MODULE_ID].card.rows.map((row) => [row.name, row.dc, row.save, row.ticked]), [["Spider Venom", 20, "fortitude", true]]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true }], userId: "player" });
    await settle();
    const note = drinker.created.find((entry) => /Spider Venom suppressed/.test(entry.name));
    assert.ok(note, "its note Effect");
    assert.deepEqual([note.system.duration.value, note.system.duration.unit], [10, "minutes"]);
    assert.ok(drinker.created.some((entry) => entry.id === "b2-suppressed-venom"), "the poison stays, held off");
    const wearer = poisoned("b2-mantle");
    const [, mantle] = compileActivations(item("Mantle of Amazing Health")).map((entry) => entry.plan);
    const second = await posted(mantle, wearer, "Mantle of Amazing Health");
    await foundry.socket(SOCKET)({ action: "apply", messageId: second.id, drinker: 0, userId: "player" });
    await settle();
    await foundry.socket(SOCKET)({ action: "apply", messageId: second.id, rows: [{ ticked: true }], userId: "player" });
    await settle();
    assert.equal(wearer.created.some((entry) => entry.id === "b2-mantle-venom"), false, "the poison ended");
    const immune = wearer.created.find((entry) => /immune to Spider Venom/.test(entry.name));
    assert.deepEqual([immune?.system.duration.value, immune?.system.duration.unit], [24, "hours"]);
});

test("live: Razmiri Mask's Mercy at its user's level 10 (rank 5) counteracts the poison, lowers it to stage 1 for now and holds it off for 24 hours; at level 4 (rank 2) it counteracts nothing", async () => {
    const target = poisoned("b2-mercy");
    target.level = 10;
    const mercy = activation("Razmiri Mask (Silver)", "Call Upon Razmir's Mercy");
    const card = await posted(mercy, target, "Razmiri Mask (Silver)");
    assert.equal(card.flags[MODULE_ID].card.counteract.rank, 5);
    assert.deepEqual(card.flags[MODULE_ID].card.counteract.afflictions, ["curse", "disease", "poison"]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "player" });
    await settle();
    assert.deepEqual(card.flags[MODULE_ID].card.rows.map((row) => [row.name, row.rank, row.dc]), [["Spider Venom", 2, 20]]);
    // (The stand-in's natural 10: 27 against DC 20, a success; rank 2 ≤ 5 + 1.)
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true }], userId: "player" });
    await settle();
    const venom = target.created.find((entry) => entry.id === "b2-mercy-venom");
    assert.equal(venom.system.badge.value, 1);
    const note = target.created.find((entry) => /Spider Venom suppressed/.test(entry.name));
    assert.deepEqual([note?.system.duration.value, note?.system.duration.unit], [24, "hours"]);
    assert.match(card.content, /Spider Venom down to stage 1 for now/);
    const novice = poisoned("b2-mercy-low");
    novice.level = 4;
    const low = await posted(mercy, novice, "Razmiri Mask (Silver)");
    assert.deepEqual([low.flags[MODULE_ID].card.counteract.rank, low.flags[MODULE_ID].card.counteract.afflictions], [2, []]);
});

test("live: Flame Navette takes its user's Will save only with Determination and only when it's higher; Contagion Metabolizer its user's numbers only for a chirurgeon with Powerful Alchemy, made by Quick Alchemy", async () => {
    const fighter = poisoned("b2-navette");
    fighter.saves.will = { mod: 30 };
    const navette = compileItem(item("Flame Navette"));
    const without = await posted(navette, fighter, "Flame Navette");
    assert.equal(without.flags[MODULE_ID].card.counteract.modifier, 22, "no Determination: the item's");
    fighter.created.push({ id: "b2-determination", type: "feat", name: "Determination", system: { slug: "determination" } });
    const withFeat = await posted(navette, fighter, "Flame Navette");
    assert.deepEqual([withFeat.flags[MODULE_ID].card.counteract.modifier, withFeat.flags[MODULE_ID].card.counteract.rank], [30, 8]);
    fighter.saves.will = { mod: 12 };
    assert.equal((await posted(navette, fighter, "Flame Navette")).flags[MODULE_ID].card.counteract.modifier, 22, "lower: the item's");
    const alchemist = poisoned("b2-chirurgeon");
    alchemist.level = 12;
    alchemist.classDC = { mod: 21 };
    alchemist.created.push({ id: "b2-chir", type: "feat", name: "Chirurgeon", system: { slug: "chirurgeon" } }, { id: "b2-pa", type: "feat", name: "Powerful Alchemy", system: { slug: "powerful-alchemy" } });
    const metabolizer = compileItem(item("Contagion Metabolizer (Lesser)"));
    const bought = await posted(metabolizer, alchemist, "Contagion Metabolizer (Lesser)");
    assert.deepEqual([bought.flags[MODULE_ID].card.counteract.modifier, bought.flags[MODULE_ID].card.counteract.rank], [11, 3], "not made by Quick Alchemy: the item's");
    const before = foundry.messages.length;
    await postCounteractCard({ message: null, plan: metabolizer, used: { data: { name: "Contagion Metabolizer (Lesser)", uuid: null, system: { traits: { value: ["infused"] } } } }, actor: alchemist, token: alchemist.token });
    await settle();
    const infused = foundry.messages[before].flags[MODULE_ID].card.counteract;
    assert.deepEqual([infused.modifier, infused.rank], [21, 6]);
    assert.ok(infused.notes.some((note) => /own rank 6 and modifier \+21: higher than the item's/.test(note)));
});
