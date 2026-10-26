// The one willing ally a Bewitching Bloom's user chooses (src/compiler/chosen-ally.js, 2026-10-26): the item card at that ally, PF2e's own
// rules on its Effect; Amaranth's floor at 1 Hit Point held as PF2e applies damage (src/live/hp-floor.js); Magnolia's Effect, then the
// ally's save card for later with its immunity.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { belowOne, fromEnemyOrHazard, tookDamage } from "../src/live/hp-floor.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const planOf = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, name);
    const [entry] = compileActivations({ ...found, ownerLevel: Number(found.system.level?.value) || 1 });
    return entry.plan;
};
const rulesOf = (plan, name) => plan.item.ruleEffects.find((entry) => entry.name === name);

test("each bloom's card is at one ally within 30 feet, once a day, read whole", () => {
    for (const name of ["Amaranth", "Bellflower", "Cherry Blossom", "Lilac", "Red Rose", "Magnolia"]) {
        const plan = planOf(`Bewitching Bloom (${name})`);
        assert.deepEqual([plan.item.recipient, plan.targeting.target, plan.targeting.range, plan.trigger.frequency.per, Boolean(plan.partial), Boolean(plan.noteOnly)], ["targets", "1 ally", "30 feet", "day", false, false], name);
    }
});

test("Cherry Blossom: PF2e's recovery DC lowered by the dying value for 1 minute, as PF2e's Nine Lives Catfolk", () => {
    const entry = rulesOf(planOf("Bewitching Bloom (Cherry Blossom)"), "recovery DC");
    assert.deepEqual(entry.rules, [{ key: "ActiveEffectLike", mode: "subtract", path: "system.attributes.dying.recoveryDC", predicate: ["self:condition:dying"], value: "@actor.conditions.dying.badge.value" }]);
    assert.deepEqual([entry.duration.value, entry.duration.unit], [1, "minutes"]);
});

test("Amaranth: the hp floor Effect until the start of its user's next turn; a hazard's or an enemy's damage uses it, an ally's doesn't", () => {
    const entry = rulesOf(planOf("Bewitching Bloom (Amaranth)"), "hp floor");
    assert.deepEqual([entry.rules, entry.duration.expiry, entry.duration.anchor, entry.duration.value], [[], "turn-start", "source-turn", 1]);
    const ally = { uuid: "Actor.ally", alliance: "party" };
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: ["origin:enemy"] }), true);
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: ["origin:ally"] }), false);
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: [], source: { uuid: "Actor.friend", alliance: "party" } }), false);
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: [], source: { uuid: "Actor.ally", alliance: "party" } }), false);
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: [], source: { uuid: "Actor.ogre", alliance: "opposition" } }), true);
    assert.equal(fromEnemyOrHazard({ target: ally, rollOptions: [] }), true);
    assert.deepEqual([belowOne({ system: { attributes: { hp: { value: 0 } } } }), belowOne({ "system.attributes.hp.value": 0 }), belowOne({ system: { attributes: { hp: { value: 4 } } } })], [0, 0, null]);
    assert.deepEqual([tookDamage({ value: 10, temp: 5 }, { value: 10, temp: 0 }), tookDamage({ value: 10, temp: 0 }, { value: 12, temp: 0 })], [true, false]);
});

test("Bellflower: +2 status to Escape while grabbed or restrained, a roll note on its saves while in the others, its new attempt a card line", () => {
    const plan = planOf("Bewitching Bloom (Bellflower)");
    const entry = rulesOf(plan, "recovery bonus");
    assert.deepEqual(entry.rules[0], { key: "FlatModifier", selector: ["acrobatics", "athletics", "unarmed-attack-roll"], type: "status", value: 2, predicate: ["action:escape", { or: ["self:condition:grabbed", "self:condition:restrained"] }] });
    assert.deepEqual([entry.rules[1].key, entry.rules[1].selector, entry.rules[1].predicate], ["Note", "saving-throw", [{ or: ["self:condition:confused", "self:condition:frightened", "self:condition:paralyzed"] }]]);
    assert.deepEqual([entry.duration.expiry, entry.duration.value], ["turn-end", 1]);
    assert.match(plan.notes[0], /Escape being grabbed, immobilized or restrained/);
});

test("Lilac: +2 status to Recall Knowledge, gone after that roll; Red Rose: the beloved's toggle on its saving throws and its turn's temporary Hit Points", () => {
    const lilac = rulesOf(planOf("Bewitching Bloom (Lilac)"), "Recall Knowledge bonus");
    assert.deepEqual(lilac.rules, [{ key: "FlatModifier", selector: "skill-check", type: "status", value: 2, predicate: ["action:recall-knowledge"], removeAfterRoll: "if-enabled" }]);
    const rose = rulesOf(planOf("Bewitching Bloom (Red Rose)"), "beloved");
    assert.deepEqual(rose.rules.map((rule) => rule.key), ["RollOption", "FlatModifier", "TempHP"]);
    assert.deepEqual([rose.rules[0].toggleable, rose.rules[2].events, rose.rules[2].predicate], [true, { onCreate: false, onTurnStart: true }, ["beloved-within-10-feet"]]);
    assert.deepEqual([rose.duration.value, rose.duration.unit], [1, "minutes"]);
});

test("Magnolia: its PF2e Effect on the ally, then the ally's Will save card for later — Fascinated until the end of its next turn, immune for 24 hours at every result", () => {
    const plan = planOf("Bewitching Bloom (Magnolia)");
    assert.deepEqual([plan.resolution.kind, plan.resolution.applications[0].label, plan.again.later], ["effect", "Effect: Bewitching Bloom (Magnolia)", true]);
    const save = plan.again.plan;
    assert.deepEqual([save.resolution.check.statistic, save.resolution.check.against.value], ["will", 20]);
    assert.deepEqual(save.resolution.outcomes.failure.effects[0].duration, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" });
    assert.deepEqual([save.trigger.immunity.slug, save.trigger.immunity.duration, save.trigger.immunity.degrees.length], ["bewitching-bloom-magnolia", { value: 24, unit: "hours" }, 4]);
});
