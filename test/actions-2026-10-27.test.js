// The actions group of 2026-10-27 (src/compiler/user-actions.js and the readers it sits beside): actions and feats for the user, choices on the
// card, objects and the item itself — each read on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { NOTES_CHECKED } from "../src/compiler/notes-checked.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";
import { readItemAction } from "../src/compiler/item-actions.js";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { spellIndex } from "../src/compiler/cast-words.js";
import { skillPickRules } from "../src/compiler/skill-pick.js";
import { skillPickText } from "../src/live/card.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const notes = (plan) => plan.resolution.outcomes.success.noteEffects;

test("an armor trait's action not needed while the cloak is red: Bastion of the Inheritor's entrench melee bonus for the minute, its white cloak's bonus off", () => {
    const bastion = activation("Bastion of the Inheritor");
    assert.ok(done(bastion));
    const [note] = notes(bastion);
    assert.equal(notes(bastion).length, 1);
    assert.deepEqual([note.label, note.duration.value, note.duration.unit], ["Cloak red", 1, "minutes"]);
    assert.deepEqual(note.rules.map((rule) => [rule.key, rule.selector ?? rule.selectors, rule.type ?? null, rule.value ?? null, rule.predicate ?? null]), [["FlatModifier", "ac", "circumstance", 1, ["item:melee"]], ["AdjustModifier", ["diplomacy"], null, null, null]]);
    assert.equal(note.rules[1].slug, "bastion-of-the-inheritor");
    assert.ok(note.rules[1].suppress);
});

test("a rule PF2e can't play on a note Effect for its time: Clockwork Shield's extra reaction, Vital Earth's air (the environment module's word)", () => {
    for (const name of ["Clockwork Shield", "Clockwork Shield (Greater)"]) {
        const shield = activation(name);
        assert.ok(done(shield), name);
        assert.deepEqual(notes(shield).map((note) => [note.label, note.duration.value, note.duration.unit]), [["Extra reaction", 1, "minutes"]]);
        assert.match(notes(shield)[0].text, /for Shield Block only\.$/);
        assert.deepEqual(shield.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    }
    const earth = compileItem(item("Vital Earth"));
    assert.ok(done(earth));
    const [note] = notes(earth);
    assert.deepEqual([note.duration.value, note.duration.unit], [24, "hours"]);
    // (The environment module's breath tracker: an item named with "doesn't need to breathe" on the creature.)
    assert.match(`Vital Earth: ${note.label}`.toLowerCase(), /doesn't need to breathe/);
    assert.match(note.text, /\+1 item bonus to that Medicine check\.$/);
});

test("its user's own action, an object's or the map's: checked and its card's lines — Rope of Climbing, Immovable Rod, Philosopher's Stone, Watchful Portrait, Accolade Robe's Review", () => {
    for (const name of ["Rope of Climbing (Lesser)", "Rope of Climbing (Moderate)", "Rope of Climbing (Greater)", "Immovable Rod"]) {
        const plan = activation(name);
        assert.ok(done(plan) && plan.decided === "checked", name);
        assert.ok(NOTES_CHECKED.has(name));
    }
    assert.match(activation("Immovable Rod").notes[0], /Force Open the rod/);
    for (const [name, which] of [["Accolade Robe", "Review"], ["Accolade Robe (Greater)", "Review"]]) {
        const review = activation(name, which);
        assert.ok(done(review) && review.decided === "checked", name);
        assert.equal(review.source.name, `${name}: Review`);
        assert.match(review.notes[0], /, then Recall Knowledge\./);
    }
    // (The GM's no-effect read as nothing: its card's lines, its own source kept.)
    const stone = compileItem(item("Philosopher's Stone"));
    assert.ok(done(stone) && stone.decided === "checked");
    assert.equal(stone.source.name, "Philosopher's Stone");
    assert.match(stone.notes[0], /Force Open action \(DC 35\)/);
    const portrait = compileItem(item("Watchful Portrait"));
    assert.ok(done(portrait) && portrait.decided === "checked");
});

test("one-offs, their card's lines: Remote Trigger's bombs, Gunner's Bandolier's runes", () => {
    assert.ok(ONE_OFFS.has("Remote Trigger") && ONE_OFFS.has("Gunner's Bandolier"));
    const trigger = activation("Remote Trigger");
    assert.ok(done(trigger) && trigger.decided === "one-off");
    assert.match(trigger.notes[0], /splash damage to any creature in its square\.$/);
    for (const entry of compileActivations(item("Gunner's Bandolier"))) assert.ok(done(entry.plan) && entry.plan.decided === "one-off");
});

test("an instrument pulled into its user's hands: Instrument Harness's Ready to Play — the objects card's hand, no reactions its line", () => {
    const ready = activation("Instrument Harness", "Ready to Play");
    assert.ok(done(ready));
    assert.equal(ready.builtin, "objects");
    assert.deepEqual(ready.objects, { op: "hand" });
    assert.deepEqual(ready.notes, ["Drawing it this way doesn't trigger reactions."]);
    assert.deepEqual(ready.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
});

// --- Used within its user's own action ---------------------------------------------------------------------------------------------------------

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
const html = (name) => equipment.find((entry) => entry.name === name).system.description.value;

test("used within its user's own action, every sentence read: Lady's Blessing Oil, Yarrow-Root Bandage, Curled Cure Gel, Artevil Suspension", () => {
    const oil = readItemAction(html("Lady's Blessing Oil"));
    assert.deepEqual([oil.slug, oil.variant, oil.dc, oil.degree, oil.within], ["administer-first-aid", "stabilize", { less: 5 }, { failure: "criticalFailure" }, true]);
    const bandage = readItemAction(html("Yarrow-Root Bandage"));
    assert.deepEqual([bandage.slug, bandage.variant, bandage.both, bandage.dc], ["administer-first-aid", "stabilize", true, { more: 5 }]);
    assert.match(bandage.after, /the GM may use 5 more than the bleed's DC instead/);
    const gel = readItemAction(html("Curled Cure Gel"), item("Curled Cure Gel"));
    assert.deepEqual([gel.slug, gel.reduce, gel.immunity.slug, gel.immunity.duration], ["treat-wounds", { choose: ["clumsy", "enfeebled", "stupefied"], by: 1 }, "curled-cure-gel", { value: 24, unit: "hours" }]);
    const suspension = readItemAction(html("Artevil Suspension"));
    assert.deepEqual([suspension.slug, suspension.stage], ["treat-poison", { by: 1, min: 1, vector: "ingested", then: { slug: "sickened", value: 2 } }]);
    assert.match(suspension.after, /the GM's to say\.$/);
    for (const name of ["Lady's Blessing Oil", "Yarrow-Root Bandage", "Curled Cure Gel", "Artevil Suspension"]) {
        const plan = compileItem(item(name), { basicActions });
        assert.ok(done(plan) && plan.builtin === "item-action", name);
        assert.equal(plan.automation.level, "automatic", name);
    }
    // (First Aid's own rows with it: the ability module's stabilize.)
    assert.ok(compileItem(item("Lady's Blessing Oil"), { basicActions }).action.basic);
});

const foundry = await fakeFoundry();
const medic = foundry.makeActor({ id: "within-medic", name: "Medic", owners: ["player"] });
foundry.place(medic, 0, 90000);
async function usedOn(name, patient) {
    const given = foundry.giveItem(medic, equipment.find((entry) => entry.name === name));
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
    const get = game.pf2e.actions.get;
    game.pf2e.actions.get = (slug) => ({ ...get(slug), variants: new Map([["stabilize", {}], ["stop-bleeding", {}]]) });
    try {
        return await run();
    } finally {
        game.pf2e.actions.get = get;
    }
}

test("Lady's Blessing Oil live: First Aid's stabilize at the recovery roll DC (5 lower), a failure made a critical failure", async () => {
    const dying = foundry.makeActor({ id: "within-dying", name: "Fallen", conditions: ["dying"], hp: 0 });
    dying.system.attributes.dying = { value: 2, recoveryDC: 10 };
    foundry.place(dying, 100, 90000);
    const apply = await usedOn("Lady's Blessing Oil", dying);
    const { card, use } = await withVariants(() => apply("failure"));
    assert.deepEqual([use.slug, use.options.variant, use.options.difficultyClass], ["administer-first-aid", "stabilize", { value: 12 }]);
    assert.match(card.flags[MODULE_ID].card.results.join(" "), /: a critical failure \(a failure rolled, made a critical failure by Lady's Blessing Oil\)/);
    assert.ok(foundry.applied.some((entry) => entry.change.op === "condition" && entry.change.slug === "dying"), "the critical failure's dying raised");
});

test("Yarrow-Root Bandage live: one check at 5 more than the stabilize DC, then its bleed's assisted recovery (DC 10)", async () => {
    const bleeding = foundry.makeActor({ id: "within-bleeding", name: "Bleeder", conditions: ["dying"], hp: 0 });
    bleeding.system.attributes.dying = { value: 1, recoveryDC: 10 };
    foundry.place(bleeding, 200, 90000);
    const bleed = foundry.givePersistent(bleeding, { damageType: "bleed", dc: 15, nextRoll: 12, formula: "1d6" });
    const apply = await usedOn("Yarrow-Root Bandage", bleeding);
    const { card, use } = await withVariants(() => apply("success"));
    assert.deepEqual([use.options.variant, use.options.difficultyClass], ["stabilize", { value: 21 }]);
    assert.deepEqual(bleed.rolled, [10], "the flat check at DC 10");
    assert.ok(!bleeding.persistent.includes(bleed), "the bleed ended");
    assert.match(card.content, /ended \(flat check, DC 10\)/);
});

test("Curled Cure Gel live: Treat Wounds, then the highest of its conditions lowered; the creature treated immune for 24 hours", async () => {
    const patient = foundry.makeActor({ id: "within-patient", name: "Patient", conditions: ["clumsy", "enfeebled"] });
    patient.conditions.set("clumsy", 2);
    foundry.place(patient, 300, 90000);
    const apply = await usedOn("Curled Cure Gel", patient);
    const { card, use } = await apply("success");
    assert.equal(use.slug, "treat-wounds");
    assert.deepEqual([patient.conditions.get("clumsy"), patient.conditions.get("enfeebled")], [1, 1]);
    assert.match(card.content, /clumsy lowered by 1/);
    const immune = patient.created.find((entry) => entry.flags?.[MODULE_ID]?.immunity === "curled-cure-gel");
    assert.ok(immune, "its Immune: Effect");
    assert.deepEqual([immune.system.duration.value, immune.system.duration.unit], [24, "hours"]);
    // (Not on its user.)
    assert.ok(!medic.created.some((entry) => entry.flags?.[MODULE_ID]?.immunity === "curled-cure-gel"));
});

test("Artevil Suspension live: Treat Poison, then its ingested poison a stage lower and Sickened 2; not one given another way", async () => {
    const poisoned = foundry.makeActor({ id: "within-poisoned", name: "Poisoned" });
    foundry.place(poisoned, 400, 90000);
    const [ingested] = await poisoned.createEmbeddedDocuments("Item", [{ type: "effect", name: "Affliction Effect: Test Poison", system: { badge: { value: 3, max: 4 }, traits: { value: ["poison", "ingested"] } }, flags: { "pseudo-afflictions": { stages: [{}, {}, {}, {}], save: { type: "fortitude", value: 20 } } } }]);
    const apply = await usedOn("Artevil Suspension", poisoned);
    const applied = foundry.applied.length;
    const { card, use } = await apply("success");
    assert.equal(use.slug, "treat-poison");
    assert.equal(ingested.system.badge.value, 2);
    assert.ok(foundry.applied.slice(applied).some((entry) => entry.change.op === "condition" && entry.change.slug === "sickened" && entry.change.value === 2));
    assert.match(card.content, /down to stage 2/);
    const injured = foundry.makeActor({ id: "within-injured", name: "Injured" });
    foundry.place(injured, 500, 90000);
    const [injury] = await injured.createEmbeddedDocuments("Item", [{ type: "effect", name: "Affliction Effect: Blade Poison", system: { badge: { value: 3, max: 4 }, traits: { value: ["poison", "injury"] } }, flags: { "pseudo-afflictions": { stages: [{}, {}, {}, {}], save: { type: "fortitude", value: 20 } } } }]);
    const again = await usedOn("Artevil Suspension", injured);
    await again("success");
    assert.equal(injury.system.badge.value, 3, "an injury poison isn't lowered");
});

// --- Actions with the item's own rules -----------------------------------------------------------------------------------------------------------

test("Binding Coil: the grab's Escape DC is the coil's (20, 30 for the Greater), its user's move a line", () => {
    for (const [name, dc] of [["Binding Coil", 20], ["Binding Coil (Greater)", 30]]) {
        const coil = compileItem(item(name), { basicActions });
        assert.ok(done(coil), name);
        assert.deepEqual(coil.action.escape, { dc });
        const effects = ["success", "criticalSuccess"].flatMap((degree) => coil.action.basic.resolution.outcomes[degree].effects);
        assert.deepEqual(effects.map((effect) => [effect.slug, effect.duration.escape?.dc]), [["grabbed", dc], ["restrained", dc]]);
        // (Its own Prone on a critical failure has none.)
        assert.equal(coil.action.basic.resolution.outcomes.criticalFailure.effects[0].duration, null);
        assert.match(coil.action.after, /the DC to Escape is \d+ and you can move/);
    }
});

test("Binding Coil live: the creature hit Grabbed until it Escapes the coil's DC", async () => {
    const caught = foundry.makeActor({ id: "within-caught", name: "Caught" });
    foundry.place(caught, 600, 90000);
    const apply = await usedOn("Binding Coil", caught);
    const before = foundry.applied.length;
    await apply("success");
    const grab = foundry.applied.slice(before).find((entry) => entry.change.op === "condition" && entry.change.slug === "grabbed");
    assert.equal(grab?.change.duration?.escape?.dc, 20);
});

test("Admonishing Band: Warning Shot's Demoralize, the immunity its user keeps a line", () => {
    const band = compileItem(item("Admonishing Band"), { basicActions });
    assert.ok(done(band));
    assert.equal(band.action.slug, "demoralize");
    assert.match(band.action.after, /Warning Shot feat, the target doesn't become/);
});

test("Venomed Tongue: Create a Diversion, Feint or Lie, picked on the card, and the 2d6 persistent poison at the one it succeeded against", () => {
    const tongue = activation("Venomed Tongue");
    const read = compileActivations(item("Venomed Tongue"), { basicActions })[0].plan;
    assert.ok(done(read));
    assert.equal(read.builtin, "item-action");
    assert.deepEqual(read.action.slugs, ["create-a-diversion", "feint", "lie"]);
    for (const degree of ["success", "criticalSuccess"]) assert.deepEqual(read.action.damage[degree].resolution.sharedDamage.components.map((entry) => [entry.formula, entry.type, entry.category]), [["2d6", "poison", "persistent"]]);
    assert.deepEqual(read.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    // (Without the ability module's actions, the same reading.)
    assert.equal(tongue.builtin, "item-action");
});

test("Self-Emptying Pocket's Beguiling Presence: Create a Diversion's success row on its success, the entity's influence a line", () => {
    const presence = compileActivations(item("Self-Emptying Pocket"), { basicActions }).find((entry) => entry.activation.name === "Beguiling Presence").plan;
    assert.ok(done(presence));
    for (const degree of ["success", "criticalSuccess"]) {
        assert.deepEqual(presence.resolution.outcomes[degree].effects.map((effect) => [effect.slug, effect.scope?.against]), [["off-guard", "actor"]], degree);
        assert.equal(presence.resolution.outcomes[degree].manualInstructions, undefined);
    }
    assert.deepEqual(presence.notes, ["The entity holding the contract may influence it: a +2 item bonus or a -2 item penalty to the Performance check (the GM's call)."]);
});

test("Battle Medic's Baton: Battle Medicine its user's own, the creature's immunity to it 1 hour on its note Effect", () => {
    const baton = activation("Battle Medic's Baton");
    assert.ok(done(baton));
    assert.equal(baton.item.recipient, "targets");
    assert.deepEqual(notes(baton).map((note) => [note.label, note.duration.value, note.duration.unit]), [["Immune to Battle Medicine", 1, "hours"]]);
    assert.match(baton.notes[0], /^Its user uses Battle Medicine on the creature targeted/);
    assert.deepEqual(baton.trigger.frequency, { max: 1, per: "hour", raw: "once per hour" });
});

// --- Choices on the card ------------------------------------------------------------------------------------------------------------------------

const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const rulesOf = (note) => note.rules.map((rule) => [rule.key, rule.selector ?? rule.option, rule.value ?? null, rule.predicate ?? null]);

test("Magnetic Suit's attract or repel, the ways card: its user's Effect with toggles for metal weapons and objects, then the allies' card", () => {
    for (const [name, value, radius] of [["Magnetic Suit", 1, 10], ["Magnetic Suit (Greater)", 2, 15], ["Magnetic Suit (Major)", 3, 20]]) {
        const suit = compileItem(item(name));
        assert.ok(done(suit), name);
        assert.deepEqual(suit.ways.map((way) => way.name), ["Attract", "Repel"]);
        const [attract, repel] = suit.ways.map((way) => notes(way.plan)[0]);
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
        assert.deepEqual([attract.duration.value, attract.duration.unit], [10, "minutes"]);
        assert.deepEqual(rulesOf(attract).slice(2), [["FlatModifier", "ac", -value, [`${slug}-metal-weapon`]], ["FlatModifier", "athletics", value, ["action:climb", `${slug}-metal-object`]], ["FlatModifier", "athletics", value, ["action:grapple", "target:trait:metal"]], ["FlatModifier", "athletics", -value, ["action:shove", "target:trait:metal"]]], name);
        assert.deepEqual(rulesOf(repel).slice(2).map(([, selector, amount, predicate]) => [selector, amount, predicate[0]]), [["ac", value, `${slug}-metal-weapon`], ["athletics", value, "action:shove"], ["athletics", -value, "action:climb"], ["athletics", -value, "action:grapple"]]);
        // (Attracting, its allies within the emanation: their own card after, the presser's targets.)
        const allies = suit.ways[0].plan.again.plan;
        assert.deepEqual([allies.allyArea, allies.targeting.area, routeOf(allies)], [true, { type: "emanation", value: radius }, "save"]);
        assert.deepEqual(rulesOf(allies.resolution.outcomes.success.noteEffects[0])[1], ["FlatModifier", "ac", value, [`${slug}-drawn`]]);
        assert.equal(suit.ways[1].plan.again, undefined);
    }
});

test("Captivating Score's positive or negative emotion: each a Will save at the creatures that hear it, a failure's attitude on a note Effect", () => {
    const score = compileItem(item("Captivating Score"));
    assert.ok(done(score));
    assert.deepEqual(score.ways.map((way) => way.name), ["Positive", "Negative"]);
    for (const [way, change] of [[score.ways[0], "improves"], [score.ways[1], "worsens"]]) {
        const save = way.plan;
        assert.deepEqual([save.resolution.kind, save.resolution.check.statistic, save.resolution.check.against.value], ["save", "will", 28]);
        for (const degree of ["failure", "criticalFailure"]) {
            const [note] = save.resolution.outcomes[degree].noteEffects;
            assert.deepEqual([note.duration.value, note.duration.unit], [1, "hours"]);
            assert.match(note.text, new RegExp(`subject ${change} by one step`));
        }
        assert.deepEqual([save.resolution.outcomes.success.noteEffects, save.resolution.outcomes.criticalSuccess.noteEffects], [undefined, undefined]);
        assert.equal(save.notes.length, 2);
    }
});

test("Possibility Tome's Skim: the skill picked on the card, +3 item to Recall Knowledge with it and its critical failure a failure, for 24 hours", () => {
    const skim = activation("Possibility Tome", "Skim");
    assert.ok(done(skim));
    const pick = skim.item.skillPick;
    assert.deepEqual(pick.skills, ["arcana", "crafting", "medicine", "nature", "occultism", "religion", "society", "lore"]);
    assert.deepEqual([pick.modifier, pick.duration.value, pick.duration.unit, pick.predicate], [{ value: 3, type: "item" }, 24, "hours", ["action:recall-knowledge"]]);
    assert.deepEqual(skillPickRules(pick, 7).map((rule) => [rule.key, rule.selector, rule.predicate]), [["FlatModifier", "lore-skill-check", ["action:recall-knowledge"]], ["AdjustDegreeOfSuccess", "lore-skill-check", ["action:recall-knowledge"]]]);
    assert.match(skillPickText(pick), /^\+3 item to Recall Knowledge with the skill picked \(.*\), and a critical failure on it becomes a failure for 24 hours$/);
    assert.equal(skim.notes.length, 3);
});

test("Conch of Otherworldly Seas' Sounds of the Deep: Clairaudience's range a mile to a place underwater; Lion's Call's Locate cast, what it seeks a line", () => {
    const sounds = compileActivations(item("Conch of Otherworldly Seas"), { spells }).find((entry) => entry.activation.name === "Sounds of the Deep").plan;
    assert.ok(done(sounds));
    assert.deepEqual(sounds.castRange.words, "1 mile (to a location underwater)");
    const pride = compileActivations(item("Lion's Call"), { spells }).find((entry) => entry.activation.name === "Find the Pride").plan;
    assert.ok(done(pride));
    assert.deepEqual([pride.builtin, pride.spell.name, pride.rank], ["cast-spell", "Locate", 5]);
    assert.match(pride.notes[0], /^What it looks for, its user's pick/);
});

// --- Objects and the item itself ----------------------------------------------------------------------------------------------------------------

test("Self-Immolating Note: its 1 fire damage at the holder its user targets, when it catches fire a line", () => {
    const note = compileItem(item("Self-Immolating Note"));
    assert.ok(done(note));
    assert.equal(routeOf(note), "save");
    assert.deepEqual(note.resolution.sharedDamage.components.map((entry) => [entry.formula, entry.type]), [["1", "fire"]]);
    assert.match(note.notes[0], /^It catches fire 5 minutes after/);
});

test("Anointing Oil: Peaceful Rest cast at the corpse, the undead's Enfeebled a one-off line", () => {
    const oil = compileItem(item("Anointing Oil"), { spells });
    assert.ok(done(oil) && oil.decided === "one-off");
    assert.deepEqual([oil.builtin, oil.spell.name, routeOf(oil)], ["cast-spell", "Peaceful Rest", "cast"]);
    assert.ok(oil.notes.some((line) => /Enfeebled 1/.test(line)));
});

test("Spectacles of Understanding: every written language for the hour on its note Effect, in place of Translate's one; Aether Appendage's solid arm", () => {
    const spectacles = activation("Spectacles of Understanding");
    assert.ok(done(spectacles));
    assert.equal(spectacles.builtin, undefined);
    assert.deepEqual(notes(spectacles).map((note) => [note.label, note.duration.value, note.duration.unit]), [["Reading every language", 1, "hours"]]);
    const arm = compileActivations(item("Aether Appendage"))[0].plan;
    assert.ok(done(arm));
    const [solid] = notes(arm);
    assert.deepEqual([solid.duration.value, solid.duration.expiry], [0, "turn-end"]);
    assert.deepEqual(solid.rules.map((rule) => [rule.key, rule.property, rule.value]), [["AdjustStrike", "traits", "magical"], ["AdjustStrike", "property-runes", "ghostTouch"]]);
});

test("objects one-offs and checked: Splatrope Extruder, Violet Ray, Inexplicable Patch, Rusting Carapace, Bottled Roc; the dusts and demolition fulus", () => {
    for (const name of ["Splatrope Extruder", "Violet Ray: Electric Love", "Inexplicable Apparatus: Inexplicable Patch", "Rusting Carapace", "Bottled Roc", "Anointing Oil"]) assert.ok(ONE_OFFS.has(name), name);
    for (const [name, which] of [["Splatrope Extruder", null], ["Violet Ray", "Electric Love"], ["Inexplicable Apparatus", "Inexplicable Patch"], ["Rusting Carapace", null]]) {
        const plan = activation(name, which);
        assert.ok(done(plan) && plan.decided === "one-off", name);
    }
    assert.ok(done(compileItem(item("Bottled Roc"))));
    for (const name of ["Deteriorating Dust", "Caustic Deteriorating Dust", "Extended Deteriorating Dust", "Demolition Fulu (Lesser)", "Demolition Fulu (Moderate)", "Demolition Fulu (Greater)"]) {
        const plan = compileItem(item(name));
        assert.ok(done(plan) && plan.decided === "checked", name);
    }
});
