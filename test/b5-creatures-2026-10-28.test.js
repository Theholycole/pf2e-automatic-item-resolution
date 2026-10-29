// The 2026-10-28 batch's creatures group (src/compiler/readings-creatures.js, src/compiler/creatures-group.js): the installed modules' items
// — the "+" modules' and Battlezoo's — read from their own packs, their words not kept here. Each test asserts on plan fields; one skips when
// its module isn't installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { ruleEffectSource } from "../src/live/card.js";
import { afterHealing, isHealing } from "../src/live/healing-uses.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const packs = new Map();
const docsOf = (module, pack) => {
    const key = `${module}/${pack}`;
    if (!packs.has(key)) {
        let docs = [];
        try {
            docs = readDocuments(path.join(MODULES, module, "packs", pack)).filter((doc) => doc.collection === "items");
        } catch {
            docs = [];
        }
        packs.set(key, docs);
    }
    return packs.get(key);
};
const find = (module, pack, name) => {
    const doc = docsOf(module, pack).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system?.level?.value) || 1 } : null;
};
const ALCHEMISTS = ["pf2e-team-plus-alchemists", "pf2e-items"];
const alchemist = (name) => find(...ALCHEMISTS, name);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;

test("a sleeper's week of fitful dreams (Battlezoo's skagappa): a note Effect for 7 days on the creature targeted, its flat check's DC; the mindlink's information and the placing the card's lines", (t) => {
    const item = find("battlezoo-bestiary-pf2e", "pf2e-battlezoo-equipment", "Skagappa");
    if (!item) return t.skip("Battlezoo isn't installed");
    const plan = compileItem(item);
    const note = success(plan).noteEffects[0];
    assert.deepEqual([done(plan), routeOf(plan), plan.item.recipient, plan.targeting.target, note.duration.value, note.duration.unit, plan.activation.time], [true, "item", "targets", "1 creature", 7, "days", "1"]);
    assert.match(note.text, /DC 5 flat check/);
    assert.equal(plan.notes.length, 3);
    assert.match(plan.notes[1], /DC 15 Occultism check/);
});

test("clay homunculi, each grade's count and time: the module's own creature conjured beside its user as minions, gone when their time is up", (t) => {
    if (!alchemist("Homunculus Clay (Lesser)")) return t.skip("Alchemists+ isn't installed");
    const read = [["Lesser", 2, 1, "minutes"], ["Moderate", 4, 10, "minutes"], ["Greater", 8, 1, "hours"]].map(([grade]) => compileItem(alchemist(`Homunculus Clay (${grade})`)));
    assert.deepEqual(read.map((plan) => [done(plan), routeOf(plan), plan.creatures[0].count, plan.max, plan.lasts.value, plan.lasts.unit, plan.creatures[0].traits]), [[true, "conjure", 2, 2, 1, "minutes", ["minion"]], [true, "conjure", 4, 4, 10, "minutes", ["minion"]], [true, "conjure", 8, 8, 1, "hours", ["minion"]]]);
    assert.match(read[0].creatures[0].from.uuid, /^Compendium\.pf2e-team-plus-alchemists\.pf2e-actors\.Actor\.[A-Za-z0-9]{16}$/);
    assert.ok(read[2].notes.some((note) => /lasts 1 hour/.test(note)));
});

test("an eater's Effects until its next daily preparations: an overland Speed behind its toggle, a bonus against fear (and the moderate grade's quicker recovery in its words)", (t) => {
    const coddle = alchemist("Traveler's Coddle");
    if (!coddle) return t.skip("Alchemists+ isn't installed");
    const march = compileItem(coddle).item.ruleEffects[0];
    assert.deepEqual([march.untilRest, march.duration.value, march.rules[0].toggleable, march.rules[0].value, march.rules[1].selector, march.rules[1].value, march.rules[1].predicate], [true, 24, true, false, "land-speed", 5, ["air-overland-travel"]]);
    const [lesser, moderate] = ["Lesser", "Moderate"].map((grade) => compileItem(alchemist(`Emboldening Haggis (${grade})`)));
    assert.deepEqual([lesser, moderate].map((plan) => [done(plan), routeOf(plan), plan.item.ruleEffects[0].untilRest, plan.item.ruleEffects[0].rules[0].predicate[0], (plan.unread ?? []).length]), [[true, "item", true, "item:trait:fear", 0], [true, "item", true, "item:trait:fear", 0]]);
    assert.doesNotMatch(lesser.item.ruleEffects[0].words, /frightened/);
    assert.match(moderate.item.ruleEffects[0].words, /frightened can go down by 2 instead of 1/);
});

test("an attribute modifier picked on the ways card (Food of the Gods): +1, or up to +4, PF2e's own add then upgrade on that attribute, until the next daily preparations", (t) => {
    const food = alchemist("Food of the Gods");
    if (!food) return t.skip("Alchemists+ isn't installed");
    const plan = compileItem(food);
    assert.deepEqual([done(plan), routeOf(plan), plan.ways.length], [true, "ways", 6]);
    const wisdom = plan.ways.find((way) => way.name === "Wisdom").plan;
    const [add, upgrade] = wisdom.item.ruleEffects[0].rules;
    assert.deepEqual([routeOf(wisdom), add.mode, add.path, add.value, upgrade.mode, upgrade.value, wisdom.item.ruleEffects[0].untilRest], ["item", "add", "system.abilities.wis.mod", 1, "upgrade", 4, true]);
});

test("more healing each time its eater is healed (Medicinal Hotpot): PF2e's healing-received dice and modifier, three uses counted down on its Effect", (t) => {
    if (!alchemist("Medicinal Hotpot (Lesser)")) return t.skip("Alchemists+ isn't installed");
    const effects = ["Lesser", "Moderate", "Greater"].map((grade) => compileItem(alchemist(`Medicinal Hotpot (${grade})`)).item.ruleEffects[0]);
    assert.deepEqual(effects.map((effect) => [effect.rules[0].selector, effect.rules[0].diceNumber, effect.rules[0].dieSize, effect.rules[1].value, effect.healingUses, effect.untilRest]), [["healing-received", 1, "d6", 1, 3, true], ["healing-received", 3, "d6", 3, 3, true], ["healing-received", 5, "d6", 5, 3, true]]);
    const source = ruleEffectSource(effects[0], { item: { name: "Medicinal Hotpot (Lesser)" } });
    assert.deepEqual([source.flags["pf2e-automatic-item-resolution"].healingUses, source.flags["pf2e-automatic-item-resolution"].untilRest], [3, true]);
    assert.deepEqual([isHealing({ damage: -8 }), isHealing({ damage: 8 }), isHealing({ damage: { total: -3 } }), isHealing({})], [true, false, true, false]);
    assert.deepEqual([afterHealing(3), afterHealing(1)], [{ left: 2, gone: false }, { left: 0, gone: true }]);
});

test("a detection strip, a gumbo's reaction: note Effects for their time — what the strip shows the GM's, the reaction its eater's own", (t) => {
    const strips = alchemist("Detection Strips");
    if (!strips) return t.skip("Alchemists+ isn't installed");
    const strip = compileItem(strips);
    assert.deepEqual([done(strip), routeOf(strip), strip.item.recipient, success(strip).noteEffects[0].duration.value, success(strip).noteEffects[0].duration.unit], [true, "item", "user", 24, "hours"]);
    assert.match(success(strip).noteEffects[0].text, /within 30 feet of it: the GM says when/);
    const gumbo = compileItem(alchemist("Reefclaw Gumbo"));
    const note = success(gumbo).noteEffects[0];
    assert.deepEqual([done(gumbo), routeOf(gumbo), note.label, note.duration.value, note.duration.unit], [true, "item", "Reefclaw Frenzy", 1, "hours"]);
    assert.match(note.text, /immune to this for 1 day/);
});

test("a beanstalk climbed: PF2e's Climb, its user's Effect of the stalk's bonus to Climb and Grab an Edge behind its toggle, the stalk's lines on the action card", (t) => {
    if (!alchemist("Cloud Giant Bean (Moderate)")) return t.skip("Alchemists+ isn't installed");
    const [moderate, greater] = ["Moderate", "Greater"].map((grade) => compileItem(alchemist(`Cloud Giant Bean (${grade})`)));
    assert.deepEqual([moderate, greater].map((plan) => [done(plan), routeOf(plan), plan.action.slug, plan.userEffects[0].rules[1].value, plan.userEffects[0].duration.value]), [[true, "action", "climb", 2, 1], [true, "action", "climb", 3, 1]]);
    assert.deepEqual(moderate.userEffects[0].rules[2].predicate, ["air-on-beanstalk", "action:grab-an-edge"]);
    assert.match(moderate.action.after, /up to 300 feet high/);
    assert.match(moderate.action.after, /8 Small, 4 Medium, 2 Large or 1 Huge creatures/);
    assert.match(greater.action.after, /8 Medium, 4 Large, 2 Huge or 1 Gargantuan creatures/);
});

test("a barnacle tree's snapdrakes: the ability module's summon card, how many opened its options, each a minion and a mount for an hour", (t) => {
    const seed = alchemist("Barnacle Tree Seed");
    if (!seed) return t.skip("Alchemists+ isn't installed");
    const plan = compileItem(seed);
    assert.deepEqual([done(plan), routeOf(plan), plan.options.length, plan.options[4].creatures[0].count, plan.max, plan.lasts.value, plan.lasts.unit, plan.creatures[0].traits], [true, "conjure", 5, 5, 5, 1, "hours", ["minion", "mount"]]);
    assert.match(plan.creatures[0].from.uuid, /^Compendium\.pf2e\.rage-of-elements-bestiary\.Actor\./);
});

test("an incorporeal trap (each Phantasm Plug): the ability module's zone at its square, saves for incorporeal creatures not held yet, the held one's Slowed escalating by its saves while it's in the area", (t) => {
    const lesser = find("pf2e-team-plus-inventors", "inventors-equipment", "Phantasm Plug (Lesser)");
    if (!lesser) return t.skip("Inventors+ isn't installed");
    const read = ["Lesser", "Moderate", "Greater", "Major"].map((grade) => compileItem(find("pf2e-team-plus-inventors", "inventors-equipment", `Phantasm Plug (${grade})`)));
    assert.deepEqual(read.map((plan) => [done(plan), routeOf(plan), plan.zone.centre, plan.zone.area.value, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.saves[0].plan.resolution.check.against.value]), [[true, "zone", "snare", 15, 3, "rounds", 17], [true, "zone", "snare", 15, 5, "rounds", 22], [true, "zone", "snare", 15, 1, "minutes", 30], [true, "zone", "snare", 15, 1, "minutes", 39]]);
    const save = read[0].zone.saves[0];
    assert.deepEqual([save.when, save.only], [["initial", "end"], { traits: ["incorporeal"], lacks: { conditions: ["immobilized"] } }]);
    const [slowed, immobilized] = save.plan.resolution.outcomes.failure.effects;
    assert.deepEqual([slowed.slug, slowed.value, slowed.stack.by, slowed.duration.saveEnds.escalate, slowed.duration.saveEnds.alsoEnds, slowed.duration.saveEnds.rounds, immobilized.slug], ["slowed", 1, 1, { criticalSuccess: -2, success: -1, failure: 1, criticalFailure: 2 }, ["immobilized"], 3, "immobilized"]);
    assert.deepEqual([save.plan.resolution.outcomes.criticalFailure.effects[0].value, save.plan.resolution.outcomes.success.effects[0].duration.value, save.plan.trigger.immunity.degrees, read[3].zone.saves[0].plan.resolution.outcomes.failure.effects[0].duration.saveEnds.rounds], [2, 1, ["criticalSuccess"], 10]);
    assert.match(save.plan.resolution.outcomes.failure.noteEffects[0].text, /trapped \(incapacitation\)/);
});

const activations = (module, pack, name) => {
    const doc = find(module, pack, name);
    return doc ? compileActivations(doc).map((entry) => entry.plan) : null;
};

test("an instinct crown's rune and companion (Barbarians+): a property rune of its user's level or lower lent to a weapon while it rages, its companion's Rage with Quickened until that rage ends", (t) => {
    const rune = activations("pf2e-team-plus-barbarians", "items", "Instinct Crown (Rune)");
    if (!rune) return t.skip("Barbarians+ isn't installed");
    const lent = rune[1];
    assert.deepEqual([done(lent), routeOf(lent), lent.item.rune.untilRage, lent.item.rune.own, lent.item.rune.choices.every((choice) => choice.key), lent.item.rune.choices.some((choice) => choice.name === "Greater Flaming"), lent.item.rune.choices.some((choice) => choice.name === "Flaming")], [true, "item", true, false, true, false, true]);
    assert.ok(lent.notes.some((note) => /Requirements/.test(note)));
    const untamed = activations("pf2e-team-plus-barbarians", "items", "Instinct Crown (Untamed)")[1];
    assert.deepEqual([done(untamed), routeOf(untamed), untamed.item.recipient, untamed.resolution.applications[0].recipients, untamed.resolution.applications[0].rage, untamed.item.untilRage.conditions[0].slug], [true, "item", "targets", "targets", undefined, "quickened"]);
    assert.match(untamed.item.ruleEffects[0].words, /Rend that target/);
});

test("a scepter's spellshape more often (Scepter of Heightening's Height of Your Power): each slot's way a note Effect for as many rounds as its rank", (t) => {
    const scepter = activations("pf2e-team-plus-magic", "items", "Scepter of Heightening");
    if (!scepter) return t.skip("Magic+ isn't installed");
    const height = compileActivations(find("pf2e-team-plus-magic", "items", "Scepter of Heightening"), { claimsWhy: () => null }).map((entry) => entry.plan).find((plan) => plan?.source?.name === "Scepter of Heightening: Height of Your Power");
    if (!height) return t.skip("the spell module plays it here");
    const five = height.ways.find((way) => way.plan.spend?.spellSlot?.rank === 5).plan;
    const note = five.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(height), done(five), note.duration.value, note.duration.unit], [true, true, 5, "rounds"]);
});

test("a summoned mech with no stat block (Mountain Mech Mahjong Tile): its user's pick of a construct, a minion for its four hours, one at a time", (t) => {
    const tile = activations("pf2e-team-plus-tian-xia", "player-options", "Mountain Mech Mahjong Tile");
    if (!tile) return t.skip("Tian Xia+ isn't installed");
    const mech = tile[0];
    assert.deepEqual([done(mech), routeOf(mech), mech.pick, mech.max, mech.lasts.value, mech.lasts.unit, mech.trigger.frequency.per], [true, "conjure", { all: ["construct"], maxLevel: 9 }, 1, 4, "hours", "day"]);
});

test("a chaos table read row by row (Rumbustious Robes' Pocket Full of Chaos): every row its own card, a 20's two more rolls with 20s ignored; its other activation and two more items one-offs", (t) => {
    const robes = activations("pf2e-team-plus-magic", "items", "Rumbustious Robes");
    if (!robes) return t.skip("Magic+ isn't installed");
    const [ask, chaos] = robes;
    assert.deepEqual([done(ask), ask.decided, done(chaos), routeOf(chaos), chaos.table.rows.every((row) => row.plan)], [true, "one-off", true, "table", true]);
    const row = (low) => chaos.table.rows.find((entry) => entry.low === low).plan;
    assert.deepEqual([row(2).item.swapPlaces, routeOf(row(4)), row(4).creatures[0].count, routeOf(row(6)), row(7).userEffects[0].slug, row(8).castDuration.formula, row(8).self, row(12).resolution.native.healing.components[0].formula, row(13).userEffects[0].slug, routeOf(row(14)), row(14).ways.length], [true, "conjure", { formula: "1d12" }, "save", "prone", "1d8", true, "32", "stunned", "ways", 2]);
    assert.deepEqual([row(15).resolution.check.statistic, row(15).resolution.check.against.value, row(15).targeting.area, row(17).zone.concealed, row(17).zone.area.value, row(18).whisper.flat.dc, row(20).table.rolls, row(20).table.ignore, row(20).table.rows.find((entry) => entry.low === 20).plan], ["reflex", 34, { type: "emanation", value: 5 }, true, 20, 7, 2, [20], undefined]);
    assert.match(row(5).notes.at(-1), /on a 1, its user is the target instead/);
    const vial = activations("pf2e-team-plus-alchemists", "pf2e-misc", "Protoplasmic Template");
    const furnace = activations(...ALCHEMISTS, "Pill Furnace (Greater)");
    assert.deepEqual([vial[0].decided, done(vial[0]), furnace[0].decided, done(furnace[0])], ["one-off", true, "one-off", true]);
});
