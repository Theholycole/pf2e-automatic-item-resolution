// The third-party modules' items of the plain group (2026-10-28, src/compiler/readings-plain.js): items used within their user's own action,
// creatures out of bottles, rows of their own, card lines and note Effects. Read from the installed modules' packs (their words not kept here:
// the tests hold plan fields); a module that isn't installed skips its tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { oneOff } from "../src/compiler/one-offs.js";
import { withDamageChoice } from "../src/compiler/beads.js";
import { chosenAction, levelDifficulty } from "../src/live/action-card.js";
import { isFortune, readiedRules } from "../src/live/fortune-card.js";
import { planFor } from "../src/live/if-target.js";
import { routeOf } from "../src/live/route.js";
import { untilRageEffectSource } from "../src/live/card.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const packs = new Map();
function find(module, pack, name) {
    const key = `${module}/${pack}`;
    if (!packs.has(key)) {
        let docs = [];
        try { docs = readDocuments(`${MODULES}/${module}/packs/${pack}`).filter((doc) => doc.collection === "items"); } catch { docs = []; }
        packs.set(key, docs);
    }
    const doc = packs.get(key).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system?.level?.value) || 1 } : null;
}
const alchemist = (name) => find("pf2e-team-plus-alchemists", "pf2e-items", name);
const consumable = (doc) => (doc ? compileItem(doc) : null);
const activationsOf = (doc) => (doc ? compileActivations(doc).map((entry) => entry.plan) : []);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect" && plan.automation?.level === "automatic";

test("used within its user's own action: the lesser grades' and the herbs' item actions read whole, their rules the action card's lines", () => {
    for (const [name, slug] of [["Cardinal Moss", "sense-direction"], ["Crook's Raskovnik", "pick-a-lock"], ["Aromatic Lavender (Lesser)", "create-a-diversion"], ["Wriggling Kudzu (Lesser)", "disable-device"]]) {
        const plan = consumable(alchemist(name));
        if (!plan) continue;
        assert.deepEqual([plan.builtin, plan.action.slug, plan.action.whole, done(plan)], ["item-action", slug, true, true], name);
        assert.ok(plan.action.after.length > 20, name);
    }
    const lavender = consumable(alchemist("Aromatic Lavender (Lesser)"));
    if (lavender) assert.match(lavender.action.after, /\bDC 15\b/);
    const kudzu = consumable(alchemist("Wriggling Kudzu (Lesser)"));
    if (kudzu) assert.deepEqual(kudzu.action.minimum, { value: 5, skill: "thievery" });
});

test("Memory Mugwort: Recall Knowledge with either skill at the danger targeted, the hard DC of its level, Stupefied 1 for a round after", () => {
    const plan = consumable(alchemist("Memory Mugwort"));
    if (!plan) return;
    const { action } = plan;
    assert.deepEqual([plan.builtin, action.targeted, action.statistics, action.slugs, action.dc, done(plan)], ["item-action", true, ["occultism", "religion"], ["recall-knowledge", "recall-knowledge"], { level: "hard" }, true]);
    assert.deepEqual([action.selfAfter.slug, action.selfAfter.value, action.selfAfter.duration.value, action.selfAfter.duration.unit], ["stupefied", 1, 1, "rounds"]);
    // (The skill picked on the card, and the DC from the creature's level: PF2e's DC of level 5 is 20, hard +2; a level −1 hazard's 13.)
    assert.equal(chosenAction({ plan, choice: 1 }).statistic, "religion");
    assert.equal(chosenAction({ plan, choice: 0 }).statistic, "occultism");
    assert.deepEqual([levelDifficulty(action, 5), levelDifficulty(action, -1), levelDifficulty({ dc: { level: "very hard" } }, 10), levelDifficulty({}, 5)], [{ value: 22 }, { value: 15 }, { value: 32 }, null]);
});

test("the lesser Nettle Balm's assisted recovery on its item card, and Warding Moly's next save against the spell rolled twice at +4", () => {
    const balm = consumable(alchemist("Nettle Balm (Lesser)"));
    if (balm) assert.deepEqual([balm.item.recovery.dc, balm.item.recovery.types, balm.notes.length, done(balm)], [4, ["acid", "fire"], 1, true]);
    const moly = consumable(alchemist("Warding Moly"));
    if (!moly) return;
    assert.deepEqual([moly.builtin, moly.action, moly.bonus.modifiers, moly.bonus.spend, isFortune(moly), done(moly), routeOf(moly)], ["readied-bonus", undefined, [{ selector: "saving-throw", type: "item", value: 4 }], ["saving-throw"], true, true, "fortune"]);
    assert.deepEqual(readiedRules(moly).map((rule) => [rule.key, rule.selector]), [["FlatModifier", "saving-throw"], ["RollTwice", "saving-throw"]]);
});

test("creatures out of bottles: the bandersnatch's bite and the pteranodon's peck at the reach their moves give, the jabberwock's burble a way each", () => {
    const bottle = consumable(alchemist("Bandersnatch Bottle"));
    if (bottle) {
        assert.deepEqual([bottle.targeting.range, bottle.ownCheck.modifier, bottle.resolution.sharedDamage.components[0].formula, bottle.notes.length, done(bottle)], ["65 feet", 28, "3d12+19", 1, true]);
    }
    const jar = consumable(alchemist("Preserved Pteranodon"));
    if (jar) assert.deepEqual([jar.targeting.range, jar.ownCheck.modifier, jar.resolution.outcomes.criticalSuccess.effects[0].slug, done(jar)], ["40 feet", 8, "dazzled", true]);
    const jabberwock = consumable(alchemist("Jabberwock Jar"));
    if (!jabberwock) return;
    const [confusion, beam] = jabberwock.ways.map((way) => way.plan);
    assert.deepEqual([jabberwock.builtin, jabberwock.notes, done(jabberwock)], ["ways", undefined, true]);
    assert.ok(confusion.traits.includes("mental") && confusion.traits.includes("emotion"));
    assert.deepEqual([confusion.targeting.range, beam.targeting.area, beam.notes.length], ["60 feet", { type: "burst", value: 40 }, 1]);
});

test("the Pickled Dragons' breath: its three crafted shapes the ways card's, each a basic Fortitude save of the type picked, a critical failure's persistent damage of that type", () => {
    // (Each grade's dice, DC, persistent damage, flight and how far from the dragon its burst may be.)
    const grades = { Minor: ["1d6", 15, "1", 15, 20], Lesser: ["2d6", 17, "1d4", 30, 20], Moderate: ["4d6", 23, "2d4", 40, 20], Greater: ["8d6", 28, "3d4", 60, 60], Major: ["14d6", 37, "4d4", 90, 20] };
    for (const [grade, [dice, dc, persistent, fly, within]] of Object.entries(grades)) {
        const plan = consumable(alchemist(`Pickled Dragon (${grade})`));
        if (!plan) continue;
        assert.deepEqual([plan.builtin, plan.once, plan.ways.length, done(plan)], ["ways", true, 3, true], grade);
        const [cone, line, burst] = plan.ways.map((way) => way.plan);
        assert.deepEqual([cone.targeting.area.type, line.targeting.area.type, cone.targeting.range, cone.resolution.check.against.value, cone.resolution.check.basic], ["cone", "line", `${fly} feet`, dc, true], grade);
        assert.equal(Number.parseInt(burst.targeting.range, 10), fly + within, grade);
        assert.equal(cone.damageChoices.length, 11, grade);
        const fire = cone.damageChoices.findIndex((choice) => choice.label === "Fire");
        const picked = withDamageChoice(cone, fire);
        assert.deepEqual(picked.resolution.sharedDamage.components.map((component) => component.formula), [`${dice}[fire]`, `${persistent}[persistent,fire]`], grade);
        assert.ok(cone.damageChoices.some((choice) => choice.label === "Mental"), grade);
    }
    const minor = consumable(alchemist("Pickled Dragon (Minor)"));
    if (minor) assert.deepEqual(minor.ways[2].plan.targeting.area, { type: "square", value: 5 });
});

test("the Brain Jars: each degree's terms a note Effect on the brain for the jar's time, the critical failure's −2 status to Deception; its 10-minute use", () => {
    const lesser = consumable(find("pf2e-team-plus-inventors", "inventors-equipment", "Brain Jar"));
    const greater = consumable(find("pf2e-team-plus-inventors", "inventors-equipment", "Brain Jar (Greater)"));
    for (const [plan, dc, time] of [[lesser, 28, [10, "minutes"]], [greater, 38, [1, "days"]]]) {
        if (!plan) continue;
        const rows = plan.resolution.outcomes;
        assert.deepEqual([plan.activation.time, plan.trigger.event, plan.resolution.check.against.value, done(plan)], ["10 minutes", "use", dc, true]);
        assert.ok(Object.values(rows).every((row) => !(row.manualInstructions ?? []).length && row.noteEffects.length === 1));
        const [penalty] = rows.criticalFailure.modifiers;
        assert.deepEqual([penalty.selector, penalty.value, penalty.type, penalty.duration.value, penalty.duration.unit], ["deception", -2, "status", ...time]);
        assert.deepEqual([rows.success.noteEffects[0].duration.value, rows.success.noteEffects[0].duration.unit], time);
    }
});

test("Construct Override: after its user's critical hit on a mindless construct, Stunned 1 or Controlled to the end of its user's next turn (a minute on a critical failure)", () => {
    const plan = consumable(find("pf2e-team-plus-magic", "items", "Construct Override"));
    if (!plan) return;
    const rows = plan.resolution.outcomes;
    assert.deepEqual([plan.gate.strike.critical, plan.gate.strike.any, plan.traits.includes("incapacitation"), done(plan)], [true, true, true, true]);
    assert.deepEqual([rows.success.effects[0].slug, rows.success.effects[0].value], ["stunned", 1]);
    assert.deepEqual([rows.failure.effects[0].slug, rows.failure.effects[0].duration.expiry, rows.failure.effects[0].duration.anchor], ["controlled", "turn-end", "source-turn"]);
    assert.deepEqual([rows.criticalFailure.effects[0].slug, rows.criticalFailure.effects[0].duration.value, rows.criticalFailure.effects[0].duration.unit], ["controlled", 1, "minutes"]);
    // (Only a mindless construct: any other creature unaffected.)
    assert.equal(planFor(plan, { system: { traits: { value: ["construct"] } } }), null);
    assert.equal(planFor(plan, { system: { traits: { value: ["humanoid", "mindless"] } } }), null);
    assert.ok(planFor(plan, { system: { traits: { value: ["construct", "mindless"] } } }));
});

test("lines and note Effects: Ant Pheromones' swarm, Moonlight Chocolate's hours awake, Oil of Malleability's hour of softened metal", () => {
    const ants = consumable(find("pf2e-team-plus-tian-xia", "player-options", "Ant Pheromones"));
    if (ants) assert.deepEqual([ants.builtin, ants.creatures[0].name, ants.lasts.value, ants.notes.length, done(ants)], ["conjure", "Army Ant Swarm", 3, 2, true]);
    const chocolate = consumable(alchemist("Moonlight Chocolate"));
    if (chocolate) assert.deepEqual([chocolate.decided, chocolate.notes.length, done(chocolate)], ["card-line", 1, true]);
    const oil = consumable(alchemist("Oil of Malleability"));
    if (!oil) return;
    const [softened] = oil.resolution.outcomes.success.noteEffects;
    assert.deepEqual([softened.duration.value, softened.duration.unit, oil.notes.length, done(oil)], [1, "hours", 1, true]);
});

test("the Barbarians+ crowns: the extra action's use on the rage Effect's words, the Zealot crown's lines, the Flesh crown's reflection a one-off", () => {
    const crown = (name) => activationsOf(find("pf2e-team-plus-barbarians", "items", name))[1];
    const bloodrager = crown("Instinct Crown (Bloodrager)");
    if (!bloodrager) return;
    assert.deepEqual([bloodrager.item.untilRage.only, bloodrager.notes, done(bloodrager)], ["Harvest Blood", undefined, true]);
    const source = untilRageEffectSource(bloodrager.item.untilRage, ["Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl"], { item: { name: "Instinct Crown (Bloodrager)" } });
    assert.match(source.system.description.value, /extra action only to Harvest Blood/);
    for (const name of ["Instinct Crown (Elemental)", "Instinct Crown (Wildblood)"]) {
        const plan = crown(name);
        assert.ok(plan.item.untilRage.only && done(plan), name);
    }
    const zealot = crown("Instinct Crown (Zealot)");
    assert.deepEqual([zealot.builtin, zealot.rollTwice.selector, zealot.notes.length, done(zealot)], ["roll-twice", "attack-roll", 2, true]);
    const flesh = crown("Instinct Crown (Flesh)");
    assert.deepEqual([flesh.decided, flesh.resolution.outcomes.success.modifiers[0].selector, Boolean(oneOff("Instinct Crown (Flesh)")), done(flesh)], ["one-off", "will", true, true]);
});

test("Silken Tail's flash a way each for the creatures its whip damaged this round (−2 to the save) and the rest; Serpentine Mirror too hot to hold; Ferromagnetizer Ammunition's struck creature", () => {
    const [tail] = activationsOf(find("battlezoo-bestiary-pf2e", "pf2e-battlezoo-equipment", "Silken Tail"));
    if (tail) {
        const [damaged, others] = tail.ways.map((way) => way.plan);
        assert.deepEqual([tail.builtin, damaged.resolution.check.bonus, others.resolution.check.bonus, damaged.targeting.area, done(tail)], ["ways", { value: -2, type: "circumstance" }, undefined, { type: "emanation", value: 5 }, true]);
        assert.equal(damaged.resolution.outcomes.failure.effects[0].slug, "dazzled");
    }
    const beam = activationsOf(find("pf2e-team-plus-tian-xia", "player-options", "Serpentine Mirror"))[1];
    if (beam) assert.deepEqual([beam.userEffects[0].kind, beam.userEffects[0].duration.value, beam.userEffects[0].duration.unit, beam.notes, done(beam)], ["note", 10, "minutes", undefined, true]);
    const [ammunition] = activationsOf(alchemist("Ferromagnetizer Ammunition"));
    if (!ammunition) return;
    const [metal, held] = ammunition.ways.map((way) => way.plan);
    assert.deepEqual([ammunition.builtin, metal.resolution.check.roll, metal.resolution.outcomes.success.effects[0].slug, routeOf(metal)], ["ways", "automatic", "encumbered", "save"]);
    assert.deepEqual([held.resolution.check.statistic, held.resolution.check.against.value, held.resolution.outcomes.failure.effects[0].slug, held.dropHeld.degrees, held.dropHeld.metallic], ["reflex", 22, "encumbered", ["criticalFailure"], true]);
});
