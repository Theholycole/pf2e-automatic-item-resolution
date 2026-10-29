// The 2026-10-28 batch's afflictions group (src/compiler/readings-afflictions.js): the installed "+" modules' and Battlezoo's items read in
// full. Their text is the modules' own: these tests check plan fields, never their sentences.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ROLLED_CRITICAL } from "../src/compiler/rolled-critical.js";
import { rolledCriticalRules, strikeLines, strikeRules } from "../src/live/strike-card.js";
import { healsToOthers } from "../src/live/heal-cost.js";
import { instinctAuras } from "../src/live/disaster.js";
import { setUpHealCost } from "../scripts/heal-cost.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const packs = new Map();
// A module pack's item by name (null when the module isn't installed).
function thirdParty(module, pack, name) {
    const key = `${module}/${pack}`;
    if (!packs.has(key)) {
        let docs = [];
        try { docs = readDocuments(path.join(MODULES, module, "packs", pack)).filter((doc) => doc.collection === "items"); } catch { docs = []; }
        packs.set(key, docs);
    }
    const doc = packs.get(key).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system?.level?.value) || 1 } : null;
}
const ALCHEMISTS = ["pf2e-team-plus-alchemists", "pf2e-items"];
const INVENTORS = ["pf2e-team-plus-inventors", "inventors-equipment"];
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const TIAN_XIA = ["pf2e-team-plus-tian-xia", "player-options"];
const BATTLEZOO = ["battlezoo-bestiary-pf2e", "pf2e-battlezoo-equipment"];
const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY = "pf2e-automatic-ability-resolution";
const SOCKET = `module.${MODULE_ID}`;
// (Shared with the other flow tests: these creatures stand 613 squares down.)
const foundry = await fakeFoundry();
const fighter = foundry.makeActor({ id: "b5aff-fighter", name: "Duellist", owners: ["player"] });
const foe = foundry.makeActor({ id: "b5aff-foe", name: "Envoy" });
foundry.place(fighter, 0, 61300);
foundry.place(foe, 100, 61300);
const readied = () => fighter.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.strikeRider);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("weapons loaded with two alchemical items, the weakest deciding: the ways card's pick of the grade, once, each a basic save with its rider", (t) => {
    const cannon = thirdParty(...ALCHEMISTS, "Acid Cannon");
    if (!cannon) return t.skip("Alchemists+ isn't installed");
    const plans = Object.fromEntries(["Acid Cannon", "Drum Stone Amplifier", "Electro-Magnetic Rod", "Slushwand"].map((name) => [name, compileActivations(thirdParty(...ALCHEMISTS, name))[0].plan]));
    for (const [name, plan] of Object.entries(plans)) {
        assert.ok(done(plan), name);
        assert.deepEqual([plan.builtin, plan.once, plan.ways.length], ["ways", true, 4], name);
        assert.deepEqual(plan.ways.map((way) => way.plan.resolution.check.against.value), [15, 17, 28, 37], name);
        for (const way of plan.ways) {
            assert.ok(done(way.plan), `${name}: ${way.name}`);
            assert.equal(way.plan.resolution.check.basic, true);
            assert.ok(way.plan.notes.some((note) => /^Both loaded items are spent\b.*\(1 minute\)/.test(note)), "its two loaded items spent, a line of its card");
        }
    }
    const cannonWays = plans["Acid Cannon"].ways;
    assert.deepEqual(cannonWays.map((way) => way.plan.resolution.sharedDamage.components[0].formula), ["1d6[acid,persistent]", "2d6[acid,persistent]", "6d6[acid,persistent]", "10d6[acid,persistent]"]);
    assert.deepEqual(cannonWays.map((way) => [way.plan.targeting.area.value, way.plan.targeting.range]), [[5, "30 feet"], [5, "60 feet"], [10, "90 feet"], [20, "120 feet"]]);
    const drum = plans["Drum Stone Amplifier"].ways;
    assert.deepEqual(drum.map((way) => way.plan.targeting.area), [10, 20, 30, 20].map((value) => ({ type: "emanation", value })));
    assert.deepEqual(drum.map((way) => way.plan.resolution.outcomes.criticalFailure.effects[0].slug), ["deafened", "deafened", "deafened", "deafened"]);
    assert.equal(drum[0].plan.resolution.outcomes.criticalFailure.effects[0].duration.value, 1);
    assert.equal(drum[0].plan.resolution.outcomes.failure.effects.length, 0, "only on a critical failure");
    assert.ok(drum[0].plan.notes.some((note) => /^Its emanation can be smaller, up to 10 feet\b/.test(note)));
    const rod = plans["Electro-Magnetic Rod"].ways;
    assert.deepEqual(rod.map((way) => [way.plan.targeting.target, way.plan.targeting.range]), [2, 3, 4, 5].map((count) => [`up to ${count} creatures`, "30 feet"]));
    assert.deepEqual(rod[3].plan.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.duration.expiry, effect.duration.anchor]), [["off-guard", "turn-start", "source-turn"]]);
    assert.ok(rod[0].plan.notes.some((note) => /\bcritically succeeds, the bolt doesn't arc\b/.test(note)));
    const wand = plans.Slushwand.ways;
    assert.deepEqual(wand.map((way) => [way.plan.targeting.target, way.plan.targeting.area]), [4, 4, 6, 8].map((count) => [`the creatures in ${count} contiguous squares`, null]), "Major's squares, not the burst left in its line");
    assert.deepEqual(wand.map((way) => way.plan.resolution.outcomes.criticalFailure.modifiers[0].value), [-5, -10, -10, -15]);
    assert.deepEqual(Object.values(wand[1].plan.resolution.outcomes.criticalFailure.modifiers[0]).slice(0, 3), ["all-speeds", -10, "status"]);
    assert.equal(wand[1].plan.resolution.outcomes.criticalFailure.modifiers[0].duration.anchor, "target-turn");
});

test("more dice when the roll was a critical hit before its better degree: the ceremonial swords' Focused Attack, its critical-only precision dice waiting for the roll option", (t) => {
    const sword = thirdParty(...TIAN_XIA, "Pham Lê Ngọc's Ceremonial Sword");
    if (!sword) return t.skip("Tian Xia+ isn't installed");
    for (const [grade, dice] of [["", 2], [" (Greater)", 2], [" (Major)", 6], [" (True)", 8]]) {
        const plan = compileActivations(thirdParty(...TIAN_XIA, `Pham Lê Ngọc's Ceremonial Sword${grade}`))[0].plan;
        assert.ok(done(plan), grade);
        assert.deepEqual(plan.strike.degree, { all: "one-degree-better" });
        assert.deepEqual(plan.strike.damage, [{ diceNumber: dice, dieSize: "d6", category: "precision", critical: true, predicate: [ROLLED_CRITICAL] }]);
        assert.deepEqual([plan.strike.rolledCritical, plan.strike.notes, plan.strike.requires.length], [true, [], 1]);
    }
    const plan = compileActivations(sword)[0].plan;
    const rule = strikeRules(plan, { weaponId: "w1", label: "Sword" }).find((entry) => entry.key === "DamageDice");
    assert.deepEqual([rule.selector, rule.critical, rule.predicate], ["w1-damage", true, [ROLLED_CRITICAL]]);
    assert.ok(strikeLines(plan).includes("+2d6 precision damage on a critical hit when the roll itself was one (before its better degree)"));
    assert.ok(strikeLines(plan).some((line) => /^Its target: one its user hasn't attacked yet today\b/.test(line)));
    // (The roll option only after a roll whose own outcome was a critical success — not one made a critical hit by the better degree.)
    const rules = [{ key: "AdjustDegreeOfSuccess" }];
    assert.equal(rolledCriticalRules(plan, { outcome: "criticalSuccess", unadjustedOutcome: "success" }, rules), null);
    assert.deepEqual(rolledCriticalRules(plan, { outcome: "criticalSuccess", unadjustedOutcome: "criticalSuccess" }, rules), [...rules, { key: "RollOption", domain: "all", option: ROLLED_CRITICAL }]);
    assert.equal(rolledCriticalRules(plan, { unadjustedOutcome: "criticalSuccess" }, [...rules, { key: "RollOption", domain: "all", option: ROLLED_CRITICAL }]), null, "once");
    assert.equal(rolledCriticalRules({ strike: {} }, { unadjustedOutcome: "criticalSuccess" }, rules), null);
});

test("the ceremonial sword live: the readied Strike's Effect takes the roll option only after a roll that was a critical hit itself", async (t) => {
    const source = thirdParty(...TIAN_XIA, "Pham Lê Ngọc's Ceremonial Sword");
    if (!source) return t.skip("Tian Xia+ isn't installed");
    const item = foundry.giveItem(fighter, source);
    const ready = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        assert.ok(card, "its Strike card");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
    };
    const attack = async (outcome, unadjustedOutcome) => {
        const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, unadjustedOutcome, options: ["item:melee", `item:id:${item.id}`], target: { actor: foe.uuid, token: foe.token.uuid } }, origin: { uuid: item.uuid, type: "weapon" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
    };
    const option = (effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === ROLLED_CRITICAL);
    await ready();
    assert.equal(readied().length, 1);
    await attack("criticalSuccess", "success");
    assert.equal(readied().length, 1, "kept for the damage roll");
    assert.equal(option(readied()[0]), false, "a success made a critical hit: no more dice");
    for (const effect of readied()) await fighter.deleteEmbeddedDocuments("Item", [effect.id]);
    await ready();
    await attack("criticalSuccess", "criticalSuccess");
    assert.equal(option(readied()[0]), true, "a critical hit already: its precision dice's roll option");
    for (const effect of readied()) await fighter.deleteEmbeddedDocuments("Item", [effect.id]);
});

test("Runebranded Hide: its melee Strikes' electricity dice by its resilient rune for the minute, and its own save bonus suppressed meanwhile", (t) => {
    const hide = thirdParty(...BATTLEZOO, "Runebranded Hide");
    if (!hide) return t.skip("Battlezoo's bestiary isn't installed");
    for (const [resilient, dice] of [[0, 1], [2, 3], [3, 4]]) {
        const plan = compileActivations({ ...hide, system: { ...hide.system, runes: { ...hide.system.runes, resilient } } })[0].plan;
        assert.ok(done(plan), `resilient ${resilient}`);
        assert.deepEqual(plan.item.strikeDamage.map((entry) => [entry.diceNumber, entry.dieSize, entry.damageType, entry.predicate, entry.duration.value, entry.duration.unit]), [[dice, "d6", "electricity", ["item:melee"], 1, "minutes"]]);
        const [effect] = plan.item.ruleEffects;
        assert.deepEqual(effect.rules, [{ key: "AdjustModifier", selector: "saving-throw", slug: "runebranded-hide-electricity", suppress: true }]);
        assert.deepEqual([effect.duration.value, effect.duration.unit], [1, "minutes"]);
        assert.deepEqual([plan.unread, plan.resolution.outcomes.success.noteEffects, plan.notes.length, plan.activation.time], [undefined, [], 1, "1"]);
    }
});

test("Fume Ammunition: its hit's Dazzled a note Effect granting the condition for as long as the shot's persistent acid lasts", (t) => {
    const ammo = thirdParty(...ALCHEMISTS, "Fume Ammunition");
    if (!ammo) return t.skip("Alchemists+ isn't installed");
    const plan = compileActivations(ammo)[0].plan;
    assert.ok(done(plan));
    assert.deepEqual(plan.strike.damage, [{ diceNumber: 3, dieSize: "d4", category: "persistent", damageType: "acid" }]);
    assert.deepEqual(plan.strike.notes, []);
    for (const degree of ["success", "criticalSuccess"]) {
        const row = plan.resolution.outcomes[degree];
        assert.equal(row.effects.length, 0, degree);
        assert.deepEqual(row.noteEffects.map((note) => [note.whilePersistent, note.duration, note.rules]), [["acid", null, [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh", allowDuplicate: false }]]]);
    }
    assert.equal(plan.resolution.outcomes.failure.noteEffects ?? undefined, undefined);
});

test("Alchemists+'s day-long meals: Purifying Pie's resistance to two damage types from unholy creatures traced (its types held at its value), Osteoanabolic Broth's resistance beside no fall damage", (t) => {
    const pie = thirdParty(...ALCHEMISTS, "Purifying Pie");
    if (!pie) return t.skip("Alchemists+ isn't installed");
    const eaten = compileItem(pie);
    assert.ok(done(eaten));
    assert.deepEqual(eaten.item.resist.map((entry) => [entry.type, entry.value, entry.from, entry.damage, entry.duration.value]), [["custom", 8, ["unholy"], ["spirit", "void"], 24]]);
    assert.equal(eaten.notes, undefined);
    const broth = compileItem(thirdParty(...ALCHEMISTS, "Osteoanabolic Broth"));
    assert.ok(done(broth));
    assert.deepEqual(broth.item.resist.map((entry) => [entry.type, entry.value, entry.duration.value]), [["bludgeoning", 8, 24]]);
    assert.deepEqual([broth.fall.noDamage, broth.fall.duration.value, broth.fall.duration.unit], [true, 24, "hours"]);
    assert.deepEqual([broth.unread ?? [], broth.resolution.outcomes.success.noteEffects ?? []], [[], []]);
});

test("Phial of Slurk: its failed save's Speed penalty beside the Clumsy, and the slime's end-early card by degree, others helping", (t) => {
    const phial = thirdParty(...ALCHEMISTS, "Phial of Slurk");
    if (!phial) return t.skip("Alchemists+ isn't installed");
    const plan = compileItem(phial);
    assert.ok(done(plan));
    assert.equal(plan.notes, undefined);
    for (const degree of ["failure", "criticalFailure"]) {
        const row = plan.resolution.outcomes[degree];
        assert.deepEqual(row.effects.map((effect) => [effect.slug, effect.value, effect.duration.value, effect.duration.unit]), [["clumsy", 1, 1, "hours"]], degree);
        assert.deepEqual(row.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration.unit]), [["land-speed", -5, "status", "hours"]], degree);
    }
    assert.equal(plan.resolution.outcomes.success.modifiers, undefined);
    assert.deepEqual(plan.endEarly.byDegree, { failure: { kind: "actions", count: 2, helped: true }, criticalFailure: { kind: "actions", count: 3, helped: true } });
    assert.deepEqual([plan.endEarly.degrees, plan.endEarly.conditions], [["failure", "criticalFailure"], []]);
});

test("Alkahest and Pill Furnace (Moderate): one-offs, their words the card's lines and kept to build later", (t) => {
    const alkahest = thirdParty(...ALCHEMISTS, "Alkahest");
    if (!alkahest) return t.skip("Alchemists+ isn't installed");
    const furnace = compileActivations(thirdParty(...ALCHEMISTS, "Pill Furnace (Moderate)"))[0].plan;
    for (const [name, plan] of [["Alkahest", compileItem(alkahest)], ["Pill Furnace (Moderate)", furnace]]) {
        assert.ok(done(plan), name);
        assert.equal(plan.decided, "one-off", name);
        assert.equal(plan.notes.length, 1, `${name}: its words the card's one line`);
        assert.ok(ONE_OFFS.get(name)?.build, name);
    }
});

test("Cat's Eye: See the Unseen cast on its user, its Drained 1 given as it's used", (t) => {
    const eye = thirdParty(...TIAN_XIA, "Cat's Eye");
    if (!eye) return t.skip("Tian Xia+ isn't installed");
    const plan = compileActivations(eye, options)[0].plan;
    assert.ok(done(plan));
    assert.deepEqual([plan.builtin, plan.spell.name, plan.self], ["cast-spell", "See the Unseen", true]);
    assert.deepEqual(plan.userEffects, [{ slug: "drained", value: 1, duration: null }]);
    assert.equal(plan.notes, undefined);
});

test("Phoenix Flagon: its flight's fire for most, its unholy creatures' card the spirit damage, the GM's switch a line", (t) => {
    const flagon = thirdParty(...ALCHEMISTS, "Phoenix Flagon");
    if (!flagon) return t.skip("Alchemists+ isn't installed");
    const plan = compileItem(flagon);
    assert.ok(done(plan));
    assert.deepEqual(plan.resolution.sharedDamage.components.map((component) => component.formula), ["6d6[fire]"]);
    assert.deepEqual(Object.values(plan.resolution.outcomes).map((row) => row.damage.multiplier), [0, 0, 1, 1]);
    assert.deepEqual(plan.ifTarget, [{ traits: ["unholy"], formula: "6d6[spirit]" }]);
    assert.equal(plan.resolution.check.basic, false);
    assert.equal(plan.notes.length, 2);
    assert.ok(plan.notes.some((note) => /\bthe GM may give it the fire instead\b/.test(note)));
});

test("Mimic Melange: its hour marked on its user, the bite its later basic Reflex card at the closest creature", (t) => {
    const melange = thirdParty(...ALCHEMISTS, "Mimic Melange");
    if (!melange) return t.skip("Alchemists+ isn't installed");
    const plan = compileItem(melange);
    assert.ok(done(plan));
    assert.equal(plan.resolution.check.roll, "automatic");
    assert.deepEqual(plan.resolution.outcomes.success.noteEffects.map((note) => [note.duration.value, note.duration.unit]), [[1, "hours"]]);
    assert.ok(plan.notes.some((note) => /\bDC 19 Perception check\b/.test(note)));
    const bite = plan.again.plan;
    assert.deepEqual([plan.again.later, plan.again.repeat], [true, undefined], "once: it dissolves");
    assert.deepEqual([bite.resolution.check.statistic, bite.resolution.check.basic, bite.resolution.check.against.value], ["reflex", true, 19]);
    assert.deepEqual(bite.resolution.sharedDamage.components.map((component) => component.formula), ["1d8+4[piercing]"]);
    assert.deepEqual(Object.values(bite.resolution.outcomes).map((row) => row.damage.multiplier), [0, 0.5, 1, 2]);
});

test("Quantum Duplicator: its duplicate whispered to the GM and its user, the GM's secret DC 2 flat check, its day a note Effect", (t) => {
    const duplicator = thirdParty(...INVENTORS, "Quantum Duplicator");
    if (!duplicator) return t.skip("Inventors+ isn't installed");
    const plan = compileItem(duplicator);
    assert.ok(done(plan));
    assert.equal(plan.builtin, "whisper");
    assert.equal(plan.whisper.flat.dc, 2);
    assert.ok(plan.whisper.flat.success && plan.whisper.flat.failure);
    assert.deepEqual(plan.userEffects.map((effect) => [effect.kind, effect.duration.value, effect.duration.unit]), [["note", 24, "hours"]]);
    assert.equal(plan.resolution, undefined);
});

test("Construct Controller: its own Will save card with Command's rows as note Effects, a day's immunity on its successes, constructs only", (t) => {
    const drive = thirdParty(...INVENTORS, "Construct Controller");
    if (!drive) return t.skip("Inventors+ isn't installed");
    const plan = compileItem(drive);
    assert.ok(done(plan));
    assert.equal(plan.builtin, undefined, "no longer the spell module's cast");
    assert.deepEqual([plan.resolution.check.statistic, plan.resolution.check.basic, plan.resolution.check.against.value], ["will", false, 28]);
    assert.deepEqual([plan.trigger.immunity.degrees, plan.trigger.immunity.duration, plan.trigger.immunity.slug], [["criticalSuccess", "success"], { value: 1, unit: "days" }, "construct-controller"]);
    assert.deepEqual(plan.ifTarget, [{ traits: ["construct"], lacks: true, immune: true }]);
    for (const degree of ["failure", "criticalFailure"]) {
        const [note] = plan.resolution.outcomes[degree].noteEffects;
        assert.deepEqual([note.label, note.duration.expiry, note.duration.anchor], ["Commanded", "turn-end", "target-turn"], degree);
    }
    assert.match(plan.resolution.outcomes.failure.noteEffects[0].text, /\bthe first action of its next turn\b/);
    assert.match(plan.resolution.outcomes.criticalFailure.noteEffects[0].text, /\ball its actions on its next turn\b/);
    assert.deepEqual(plan.resolution.outcomes.success.noteEffects, []);
    assert.equal(plan.notes.length, 2);
});

test("Iron Heart: the ally's 2d8 healing paid with its user's Hit Points, and 2d8 more if that leaves its user dying", (t) => {
    const heart = thirdParty("pf2e-team-plus-magic", "items", "Iron Heart");
    if (!heart) return t.skip("Magic+ isn't installed");
    const plan = compileItem(heart);
    assert.ok(done(plan));
    assert.deepEqual(plan.resolution.outcomes.success.effects, [{ kind: "heal", formula: "2d8" }]);
    assert.deepEqual(plan.item.healCost, { noTemp: true, dying: { heal: "2d8" } });
    assert.deepEqual([plan.unread, plan.notes.length], [undefined, 1]);
});

test("Iron Heart live: once the ability module's card has healed the ally, its user loses as much, its temporary Hit Points untouched, and the ally healed again as its user drops", async (t) => {
    const source = thirdParty("pf2e-team-plus-magic", "items", "Iron Heart");
    if (!source) return t.skip("Magic+ isn't installed");
    const plan = compileItem(source);
    const giver = foundry.makeActor({ id: "b5aff-giver", name: "Giver", hp: 6, max: 30, owners: ["player"] });
    giver.system.attributes.hp.temp = 4;
    const fallen = foundry.makeActor({ id: "b5aff-fallen", name: "Fallen", hp: 7, max: 30 });
    foundry.place(giver, 0, 61500);
    foundry.place(fallen, 100, 61500);
    // (Its hook, as scripts/main.js sets it up: the harness sets up scripts/live.js only.)
    setUpHealCost();
    const count = foundry.messages.length;
    // (The ability module's applied card: its heal of 7 to the ally, as its hook gives it.)
    const state = { plan, ability: { name: "Iron Heart" }, source: { actorUuid: giver.uuid, tokenUuid: giver.token.uuid, name: "Giver" } };
    await foundry.call(`${ABILITY}.applied`, { state, targets: [{ id: "t0", actorUuid: fallen.uuid, tokenUuid: fallen.token.uuid, name: "Fallen", degree: "success" }], changes: [{ op: "heal", target: "t0", amount: 7 }] });
    await settle();
    // (7 lost: its 6 Hit Points, none of its temporary ones; then 7 more for the ally — the stand-in's rolls total 7.)
    assert.equal(giver.system.attributes.hp.value, 0);
    assert.equal(giver.system.attributes.hp.temp, 4, "its temporary Hit Points set aside and back");
    assert.equal(fallen.system.attributes.hp.value, 14);
    const line = foundry.messages.slice(count).map((message) => message.content).join(" ");
    assert.match(line, /Giver loses 7 Hit Points for the healing it gave/);
    assert.match(line, /Giver is left dying: Fallen regains 2d8 more \(7\)/);
    // (Not for a card without the cost, nor a heal of its user itself.)
    const after = foundry.messages.length;
    await foundry.call(`${ABILITY}.applied`, { state, targets: [{ id: "t0", actorUuid: giver.uuid, name: "Giver" }], changes: [{ op: "heal", target: "t0", amount: 5 }] });
    await foundry.call(`${ABILITY}.applied`, { state: { ...state, plan: { ...plan, item: { ...plan.item, healCost: undefined } } }, targets: [{ id: "t0", actorUuid: fallen.uuid, name: "Fallen" }], changes: [{ op: "heal", target: "t0", amount: 5 }] });
    await settle();
    assert.equal(foundry.messages.length, after);
    assert.deepEqual(healsToOthers([{ op: "heal", target: "a", amount: 3 }, { op: "heal", target: "a", amount: 2 }, { op: "condition", target: "b" }, { op: "heal", target: "u", amount: 4 }], [{ id: "a", actorUuid: "A" }, { id: "u", actorUuid: "U" }], "U").map((entry) => [entry.target.id, entry.amount]), [["a", 5]]);
});

const MAGIC = ["pf2e-team-plus-magic", "items"];
const activation = (item, name) => compileActivations(item).find((entry) => entry.plan?.source?.name?.endsWith(`: ${name}`))?.plan;

test("Scepter of Sickening's Rotting Aura: for each slot, a zone round its user for the slot's rank in rounds, Sickened raised at each turn's end inside, a note on lowering it", (t) => {
    const scepter = thirdParty(...MAGIC, "Scepter of Sickening");
    if (!scepter) return t.skip("Magic+ isn't installed");
    const plan = activation(scepter, "Rotting Aura");
    assert.ok(done(plan));
    assert.deepEqual(plan.ways.map((way) => way.plan.spend.spellSlot.rank), [3, 4, 5, 6, 7, 8, 9, 10]);
    for (const way of plan.ways) {
        const { zone } = way.plan;
        assert.ok(done(way.plan), way.name);
        assert.equal(way.plan.builtin, "zone");
        assert.deepEqual([zone.area, zone.centre, zone.lasts.value, zone.lasts.unit], [{ type: "emanation", value: 20 }, "self", way.plan.spend.spellSlot.rank, "rounds"]);
        assert.deepEqual(zone.saves.map((save) => save.when), [["end"]]);
        assert.deepEqual(zone.saves[0].plan.resolution.outcomes.success.effects, [{ kind: "condition", slug: "sickened", value: 1, duration: null, stack: { by: 1, max: 4 } }]);
        assert.equal(zone.inside.length, 1);
        assert.match(zone.inside[0].text, /\bcan't lower its Sickened condition below 1\b/);
    }
});

test("Scepter of Purifying's Purifying Wave: for each slot, its cone's healing, then a counteract card at each creature healed (Sickened, a disease or a poison) at the slot's rank", (t) => {
    const scepter = thirdParty(...MAGIC, "Scepter of Purifying");
    if (!scepter) return t.skip("Magic+ isn't installed");
    const plan = activation(scepter, "Purifying Wave");
    assert.ok(done(plan));
    assert.deepEqual(plan.ways.map((way) => way.plan.spend.spellSlot.rank), [4, 5, 6, 7, 8, 9, 10]);
    for (const way of plan.ways) {
        const rank = way.plan.spend.spellSlot.rank;
        assert.ok(done(way.plan), way.name);
        assert.deepEqual(way.plan.resolution.outcomes.success.effects, [{ kind: "heal", formula: `${rank}d8` }]);
        assert.deepEqual(way.plan.targeting.area, { type: "cone", value: 30 });
        const { degrees, counteract } = way.plan.heldCounteract;
        assert.deepEqual([degrees, counteract.rank, counteract.modifier, counteract.conditions, counteract.afflictions, counteract.pick], [["success"], rank, 13, ["sickened"], ["disease", "poison"], "one"]);
        assert.equal(counteract.notes.length, 2);
    }
});

test("Instinct Crown (Disaster): for its rage, an Effect whose turn aura's card is its user's emanation damage again as persistent damage", (t) => {
    const crown = thirdParty("pf2e-team-plus-barbarians", "items", "Instinct Crown (Disaster)");
    if (!crown) return t.skip("Barbarians+ isn't installed");
    const plan = compileActivations(crown)[1].plan;
    assert.ok(done(plan));
    assert.deepEqual(plan.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    const [herald] = plan.item.ruleEffects;
    assert.deepEqual([herald.untilRage, herald.fromInstinct, herald.turnAuras.map((aura) => aura.at)], [true, "disaster", ["end"]]);
    assert.equal(plan.notes.length, 1);
    // (Filled from its user's instinct as it's applied: src/live/disaster.js.)
    const filled = instinctAuras(herald, { level: 10, flags: { pf2e: { disasterInstinct: { type: "eruption", damageType: "fire", trait: "fire", damage: 2 } } }, auras: new Map() });
    assert.deepEqual(filled.entry.turnAuras.map((aura) => [aura.radius, aura.plan.resolution.sharedDamage.components[0].formula]), [[5, "2[persistent,fire]"]]);
    assert.equal(filled.entry.fromInstinct, undefined);
    const wide = instinctAuras(herald, { level: 15, flags: { pf2e: { disasterInstinct: { damageType: "electricity", damage: 4 } } }, auras: new Map([["disaster-instinct", { radius: 10 }]]) });
    assert.deepEqual(wide.entry.turnAuras.map((aura) => [aura.radius, aura.plan.resolution.sharedDamage.components[0].formula]), [[10, "4[persistent,electricity]"]]);
    assert.match(instinctAuras(herald, { level: 10, flags: {} }).error, /\bhas no Disaster instinct\b/);
});

test("Instinct Crown (Disaster) live: the Effect only on a raging user with the Disaster instinct, flagged to go with its Rage", async (t) => {
    const source = thirdParty("pf2e-team-plus-barbarians", "items", "Instinct Crown (Disaster)");
    if (!source) return t.skip("Barbarians+ isn't installed");
    const herald = foundry.makeActor({ id: "b5aff-herald", name: "Herald", owners: ["player"] });
    foundry.place(herald, 0, 61700);
    const crown = foundry.giveItem(herald, source);
    const activate = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: crown.uuid, activation: 1, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return foundry.messages.find((message) => message.id === card.id);
    };
    const heralds = () => herald.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.ruleEffect === "Herald of the end");
    let card = await activate();
    assert.match(card.content, /isn&#39;t raging: no Herald of the end/);
    herald.created.push({ id: "b5aff-rage", type: "effect", slug: "effect-rage", name: "Effect: Rage", system: { traits: { value: [] } } });
    herald.flags.pf2e = {};
    card = await activate();
    assert.match(card.content, /has no Disaster instinct/);
    assert.equal(heralds().length, 0);
    herald.flags.pf2e = { disasterInstinct: { type: "storm", damageType: "electricity", trait: "electricity", damage: 2 } };
    await activate();
    const [effect] = heralds();
    assert.ok(effect, "its Effect");
    assert.equal(effect.flags[MODULE_ID].untilRage, true);
    assert.deepEqual(effect.flags[MODULE_ID].turnAuras.map((aura) => [aura.radius, aura.at, aura.plan.resolution.sharedDamage.components[0].formula]), [[5, "end", "2[persistent,electricity]"]]);
});
