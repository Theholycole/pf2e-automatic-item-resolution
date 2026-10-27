// The adventure books' triggers, rerolls, numbers from another roll and results for some creatures only, built on 2026-10-27
// (src/compiler/trigger-readings.js): each card's reading on the real PF2e pack item, the live pieces it needs (src/live/if-target.js's kinds,
// the reroll card's allies and changed DC, the Strike gate's critical hit), and the reroll flows against the stand-in for Foundry.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { breathes, planFor, sunlightVulnerable } from "../src/live/if-target.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
const options = { spells: spellIndex(documents("spells")), ...(claims ? { claims } : {}) };
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which) => compileActivations(item(name), options).find((entry, index) => (typeof which === "string" ? entry.activation.name === which : index === (which ?? 0)))?.plan;
// (Nothing left to the table: not partial nor note-only, no notes unread, no GM lines on its rows.)
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect" && !(plan.unread ?? []).length && Object.values(plan.resolution?.outcomes ?? {}).every((row) => !(row?.manualInstructions ?? []).length);
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
