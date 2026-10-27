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

test("what's told is whispered: Glasses of Sociability's name remembered (a disguise fools it), Undead Detection Dye's colors and the GM's secret DC 20", () => {
    const glasses = activation("Glasses of Sociability", "Have We Met?");
    assert.deepEqual([glasses.builtin, routeOf(glasses), glasses.item.activation.name], ["whisper", "whisper", "Have We Met?"]);
    assert.match(glasses.whisper.text, /A disguise fools it/);
    const dye = compileItem(item("Undead Detection Dye"));
    assert.deepEqual([dye.builtin, routeOf(dye), dye.item.type], ["whisper", "whisper", "consumable"]);
    assert.match(dye.whisper.text, /indigo a wraith/);
    assert.match(dye.whisper.text, /secret Deception or Stealth check \(DC 20\)/);
});

test("Potion of Disguise: its reminder replaced by the disguise's words beside its +4 to Deception DC, both for the 24 hours the GM's secret 2d12 can reach; each grade's size", () => {
    for (const grade of ["Lesser", "Moderate", "Greater"]) {
        const plan = compileItem(item(`Potion of Disguise (${grade})`));
        const [bonus] = row(plan).modifiers;
        const [note] = row(plan).noteEffects;
        assert.deepEqual([done(plan), plan.unread, bonus.selector, bonus.value, note.label, note.duration.value, note.duration.unit, row(plan).noteEffects.length], [true, undefined, "deception-dc", 4, "Disguised", 24, "hours", 1], grade);
        assert.match(note.text, /rolled by the GM in secret/);
    }
    assert.match(row(compileItem(item("Potion of Disguise (Lesser)"))).noteEffects[0].text, /not below Small/);
    assert.match(row(compileItem(item("Potion of Disguise (Greater)"))).noteEffects[0].text, /Impersonate a specific individual/);
});

test("Emergency Disguise: −2 circumstance to Impersonate with it for 24 hours, not with Quick Disguise (PF2e's predicates), its words on its wearer", () => {
    const plan = compileItem(item("Emergency Disguise"));
    assert.deepEqual([done(plan), row(plan).modifiers], [true, [{ selector: "deception", value: -2, type: "circumstance", predicate: ["action:impersonate", { not: "feat:quick-disguise" }], duration: { mode: "fixed", value: 24, unit: "hours", expiry: "turn-start", anchor: "effect-start" } }]]);
    assert.match(row(plan).noteEffects[0].text, /worth up to 3 gp/);
});

test("Tentacle Potion: the ways card, once — the limb for its time, or a fortified tail as the next better potion (the moderate's for the lesser; the greater's Strike for the moderate)", () => {
    const lesser = compileItem(item("Tentacle Potion (Lesser)"));
    assert.deepEqual([done(lesser), lesser.builtin, lesser.once, routeOf(lesser), lesser.ways.map((way) => way.name)], [true, "ways", true, "ways", ["Tentacle", "Fortified tail"]]);
    const [limb, tail] = lesser.ways.map((way) => way.plan);
    assert.deepEqual([row(limb).noteEffects[0].duration.value, row(tail).noteEffects[0].duration.value, limb.item.recipient], [1, 8, "drinker"]);
    assert.match(row(limb).noteEffects[0].text, /can't hold items/);
    assert.match(row(tail).noteEffects[0].text, /light Bulk/);
    const moderate = compileItem(item("Tentacle Potion (Moderate)"));
    const fortified = moderate.ways[1].plan;
    assert.deepEqual([row(fortified).noteEffects[0].duration.value, fortified.item.attacks.map((attack) => [attack.die, attack.type, attack.traits])], [24, [["d6", "bludgeoning", ["unarmed", "sweep"]]]]);
    assert.equal(moderate.ways[0].plan.item.attacks, undefined);
});

test("Trustworthy Round: its called target the card's lines; Herd Mask's swap a one-off; Clockwork Disguise, Hand-Hewed Face and Foe-Sensing Rod checked as having nothing to play", () => {
    const round = activations("Trustworthy Round")[0];
    assert.deepEqual([done(round), round.notes.length], [true, 2]);
    assert.match(round.notes[0], /no ability can redirect it/);
    assert.deepEqual([activations("Herd Mask")[0].decided, done(activations("Herd Mask")[0])], ["one-off", true]);
    for (const plan of [activation("Clockwork Disguise", "Deploy Disguise"), activation("Hand-Hewed Face", "Fresh Face"), compileItem(item("Foe-Sensing Rod"))]) assert.deepEqual([plan.decided, done(plan)], ["checked", true], plan.source.name);
});

test("Arclord Eye's Open the Eye: PF2e's magicsense (imprecise, 30 feet) for 10 minutes, what it learns the GM's in words beside it", () => {
    const plan = activation("Arclord Eye", "Open the Eye");
    assert.deepEqual([done(plan), plan.item.senses.map((sense) => [sense.selector, sense.acuity, sense.range, sense.duration.value])], [true, [["magicsense", "imprecise", 30, 10]]]);
    assert.match(row(plan).noteEffects[0].text, /meant to deceive escapes it/);
});

test("Clarity Goggles: the GM's secret counteract in words on its user for the 10 minutes, at half the goggles' level as its rank (the PFS note)", () => {
    const ranks = ["Lesser", "Moderate", "Greater"].map((grade) => activations(`Clarity Goggles (${grade})`)[0]);
    assert.deepEqual(ranks.map((plan) => [done(plan), /at rank (\d+)/.exec(row(plan).noteEffects[0].text)[1], row(plan).noteEffects[0].duration.value]), [[true, "4", 10], [true, "7", 10], [true, "10", 10]]);
    assert.match(row(ranks[0]).noteEffects[0].text, /rank 3 or lower or a creature of level 8 or lower/);
});

test("Sun Sight's counteract at what its rays hit a one-off beside the cast; Illusory Program checked as flavor", () => {
    const sun = activations("Sun Sight")[0];
    assert.deepEqual([sun.builtin, sun.decided, done(sun)], ["cast-spell", "one-off", true]);
    assert.deepEqual([compileItem(item("Illusory Program")).decided, done(compileItem(item("Illusory Program")))], ["checked", true]);
});

test("Dust of Appearance: each creature its presser targets in the burst coated for a minute (words: no Concealed, Invisible or duplicates); the illusions shown up the GM's", () => {
    const plan = compileItem(item("Dust of Appearance"));
    assert.deepEqual([done(plan), plan.item.recipient, row(plan).noteEffects[0].duration.value, row(plan).noteEffects[0].duration.unit, plan.item.uses.autoDestroy], [true, "targets", 1, "minutes", true]);
    assert.match(plan.notes[1], /level 3 or lower/);
});

test("Talespinner's Lyre, Illusory Backdrop, Secret-Keeper's Mask, Pocket Stage, Pocket Gala: illusions seen for what they are, the map's and the GM's — the backdrop's disbelief at its level's DC, the GM's to change", () => {
    const lyre = compileItem(item("Talespinner's Lyre"));
    assert.deepEqual([done(lyre), row(lyre).noteEffects[0].duration.value, lyre.disbelief], [true, 1, undefined]);
    assert.match(row(lyre).noteEffects[0].text, /while its user Sustains it/);
    const backdrop = activation("Illusory Backdrop", "Set the Scene");
    assert.deepEqual([done(backdrop), backdrop.disbelief.dc, backdrop.disbelief.dcFrom, backdrop.disbelief.lasts], [true, 27, "level", { value: 1, unit: "hours" }]);
    assert.match(disbeliefText(backdrop.disbelief), /Perception DC 27 \(its level's: the item gives none, the GM may change it\)$/);
    for (const plan of [activations("Secret-Keeper's Mask (Gray Master)")[0], activation("Pocket Stage", "Play with Dolls"), activations("Pocket Gala")[0]]) assert.deepEqual([done(plan), plan.notes.length, plan.disbelief], [true, 2, undefined], plan.source.name);
    assert.match(activations("Pocket Gala")[0].notes[0], /60-by-45-foot ballroom 20 feet high/);
});

test("Tales in Timber's Statue Disguise: Illusory Disguise's rules and Oaken Resilience's at each armor's rank, on two note Effects for the hour", () => {
    for (const [name, rank] of [["Tales in Timber", 2], ["Tales in Timber (Greater)", 4], ["Tales in Timber (Major)", 6]]) {
        const plan = activation(name, "Statue Disguise");
        const [statue, oaken] = row(plan).noteEffects;
        assert.deepEqual([done(plan), statue.duration.value, statue.duration.unit, statue.rules.map((rule) => [rule.selector, rule.type]), oaken.rules.map((rule) => [rule.key, rule.value])], [true, 1, "hours", [["deception", "status"], ["deception", "proficiency"]], [["Resistance", rank], ["Weakness", 3 * rank / 2]]], name);
        assert.match(statue.text, /Speak with Plants/);
    }
});

test("Dreamer's Butterfly's Wake the Dream: +1 status to Identify Magic for a round on each onlooker targeted, only for dream or sleep magic in its words", () => {
    const plan = activation("Dreamer's Butterfly", "Wake the Dream");
    assert.deepEqual([done(plan), plan.item.recipient, row(plan).modifiers], [true, "targets", [{ selector: "skill-check", value: 1, type: "status", predicate: ["action:identify-magic"], duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } }]]);
    assert.match(row(plan).noteEffects[0].text, /dream or sleep trait/);
});

test("Veiled Figurehead (Greater)'s Veil!: in place of the cast, Illusory Disguise's rules on everyone aboard its presser targets for 24 hours, and the GM's disbelief card (DC 33) for the whole illusion", () => {
    const plan = activation("Veiled Figurehead (Greater)", "Veil!");
    assert.deepEqual([done(plan), plan.builtin, routeOf(plan), plan.item.recipient, plan.disbelief.dc, plan.disbelief.lasts, plan.trigger.frequency.per], [true, undefined, "item", "targets", 33, { value: 24, unit: "hours" }, "day"]);
    const [crew] = row(plan).noteEffects;
    assert.deepEqual([crew.duration.value, crew.rules.length], [24, 2]);
    assert.match(plan.notes[1], /Target everyone on board/);
});

test("Illusory Disguise cast on its user: Aeon Stone (Western Star)'s hidden aeon stones and Masquerade Scarf (Greater)'s scarf the cast card's lines, no longer partial", () => {
    for (const plan of [activation("Aeon Stone (Western Star)", "Illusory Disguise"), activation("Masquerade Scarf (Greater)", "Masquerade")]) {
        assert.deepEqual([plan.builtin, plan.spell.name, done(plan), plan.notes.length], ["cast-spell", "Illusory Disguise", true, 2], plan.source.name);
    }
    assert.match(activation("Masquerade Scarf (Greater)", "Masquerade").notes[0], /taken off/);
});
