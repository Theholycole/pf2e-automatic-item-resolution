// Illusions and disbelief (2026-10-27, docs/needs.md "illusions"): the readings of src/compiler/illusions.js — the GM's disbelief card at the
// item's DC (or its user's), with a second check where the text gives one, a note Effect for the illusion's time, and the card's lines.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readProficiencyRequirement } from "../src/compiler/requirement.js";
import { plainText } from "../src/compiler/rows.js";
import { routeOf } from "../src/live/route.js";
import { createDisbeliefCard, disbeliefCardHTML, disbeliefText, withAttempt } from "../src/live/disbelief-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const row = (plan) => plan.resolution.outcomes.success;

test("Deck of Mischief's Card Trick: the GM's disbelief card for a creature that Seeks or touches the card (DC 20), no time of its own; what's left in the deck and the swap the card's lines", () => {
    const plan = activation("Deck of Mischief", "Card Trick");
    assert.deepEqual([done(plan), routeOf(plan), plan.disbelief], [true, "item", { dc: 20, statistic: "perception", when: "Seeks or touches the card" }]);
    assert.equal(plan.notes.length, 2);
    assert.match(plan.notes[0], /left in the deck/);
    assert.equal(createDisbeliefCard({ plan, item: { name: "Deck of Mischief" }, user: { name: "Rogue" }, worldTime: 50 }).until, null);
});

test("Wooden Nickel: against its user's Deception DC, filled in when the card is posted; its Crafting check a second one that also sees through; the 10 minutes on its user", () => {
    const plan = compileItem(item("Wooden Nickel"));
    assert.deepEqual([done(plan), plan.disbelief.dc, plan.disbelief.against, plan.disbelief.lasts, plan.disbelief.also.statistic], [true, null, "deception", { value: 10, unit: "minutes" }, "crafting"]);
    assert.deepEqual([row(plan).noteEffects[0].duration.value, row(plan).noteEffects[0].duration.unit], [10, "minutes"]);
    // (Its master in Deception now the card's requirement check.)
    assert.deepEqual(readProficiencyRequirement(plainText(item("Wooden Nickel").system.description.value)), { kind: "skill", slugs: ["deception"], rank: 3, words: "master in Deception" });
    assert.equal(disbeliefText(plan.disbelief), "A creature that touches or Interacts with an affected object can try to disbelieve it: Perception against its user's Deception DC; Crafting against its user's Deception DC sees what the object truly is (a fitting Lore instead: rolled by hand)");
    let state = createDisbeliefCard({ plan, item: { name: "Wooden Nickel" }, user: { name: "Rogue" }, worldTime: 0, userDCs: { deception: 27 } });
    assert.deepEqual([state.plan.disbelief.dc, state.plan.disbelief.also.dc, state.until], [27, 27, 600]);
    assert.match(disbeliefText(state.plan.disbelief), /Perception DC 27 \(its user's Deception DC\); Crafting DC 27/);
    // (A Crafting success sees through it as well; a failure isn't counted as fooled by the illusion.)
    state = withAttempt(state, { name: "Merchant", degree: "success", also: true });
    state = withAttempt(state, { name: "Guard", degree: "failure", also: true });
    assert.deepEqual([state.saw, state.fooled], [["Merchant"], []]);
    assert.match(state.results[0], /^Merchant \(Crafting\): success, sees what the object truly is/);
    const html = disbeliefCardHTML(state, { canApply: true });
    assert.match(html, /<select data-air-field="check"><option value="0">Perception: disbelieve<\/option><option value="1">Crafting: /);
    assert.match(html, />Roll it \(the creatures targeted\)</);
});

test("Camp Shroud: the GM's disbelief card for a creature outside that Seeks or Searches, at each grade's DC, for 12 hours, put out with the fire; the mist the map's", () => {
    const dcs = ["Minor", "Lesser", "Moderate", "Greater", "Major"].map((grade) => compileItem(item(`Camp Shroud (${grade})`)));
    assert.deepEqual(dcs.map((plan) => [done(plan), plan.disbelief.dc]), [[true, 18], [true, 23], [true, 27], [true, 30], [true, 35]]);
    const major = dcs[4];
    assert.deepEqual([major.disbelief.lasts, major.disbelief.ends, major.item.uses.autoDestroy], [{ value: 12, unit: "hours" }, "Putting out the fire ends it.", true]);
    assert.match(major.notes[0], /30-foot emanation/);
    assert.match(disbeliefText(major.disbelief), /^A creature that is outside the area and Seeks or Searches/);
});

test("Veiled Figurehead's Veil!: the ship's new look on its user for 6 hours, Dismissed by removing it, and the GM's disbelief card (DC 25) for one that boards or Seeks", () => {
    const plan = activation("Veiled Figurehead", "Veil!");
    assert.deepEqual([done(plan), plan.disbelief.dc, plan.disbelief.when, plan.disbelief.lasts, plan.trigger.frequency.per], [true, 25, "boards the ship or Seeks to examine it", { value: 6, unit: "hours" }, "day"]);
    assert.deepEqual([row(plan).noteEffects[0].duration.value, row(plan).noteEffects[0].duration.unit], [6, "hours"]);
    assert.match(row(plan).noteEffects[0].text, /Dismiss it: remove this Effect/);
});

test("Misdirecting Haversack: the GM's disbelief card for a creature inspecting a document (DC 20), Society DC 20 to Decipher Writing its second check, which doesn't see through it", () => {
    const [disguise, revert] = activations("Misdirecting Haversack");
    assert.deepEqual([done(disguise), disguise.disbelief.dc, disguise.disbelief.also], [true, 20, { statistic: "society", dc: 20, what: "reads its real text (Decipher Writing)" }]);
    assert.equal(revert.builtin, "whisper");
    let state = createDisbeliefCard({ plan: disguise, item: { name: "Misdirecting Haversack" }, user: { name: "Spy" } });
    state = withAttempt(state, { name: "Clerk", degree: "criticalSuccess", also: true });
    assert.deepEqual([state.saw, state.results[0]], [[], "Clerk (Society): critical success, reads its real text (Decipher Writing)"]);
    state = withAttempt(state, { name: "Clerk", degree: "success" });
    assert.deepEqual(state.saw, ["Clerk"]);
});
