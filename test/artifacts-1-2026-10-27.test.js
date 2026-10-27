// Unique items' and artifacts' activations built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be
// automated"): the readings of src/compiler/artifact-readings.js, every sentence of each effect read, and what they extend elsewhere
// (Graymist's reaction, Shadowmist Cape's reading). The first group's list, highest level first.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { saveText } from "../src/live/poison-card.js";
import { ruleEffectSource, temperatureEffectSource } from "../src/live/card.js";
import { plainText } from "../src/compiler/rows.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const text = (name) => plainText(equipment.find((entry) => entry.name === name).system.description.value);
const activations = (name) => compileActivations(item(name), { spells }).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), { spells }).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const rowsOf = (plan) => plan.resolution.outcomes;

test("Essence Prism: its user's own secret DC 30 check, the essence's skills picked; each refraction its creatures Paralyzed and noted for the hour", () => {
    const [set, split, combine] = activations("Essence Prism");
    assert.deepEqual([set.ownSave, set.resolution.kind, set.resolution.check.statistic, set.resolution.check.against.value, set.resolution.check.secret, routeOf(set, text("Essence Prism"))], [true, "save", "arcana", 30, true, "save"]);
    assert.deepEqual(set.checkChoices.map((choice) => choice.label), ["Mental essence: Arcana", "Mental essence: Occultism", "Material essence: Arcana", "Material essence: Nature", "Spiritual essence: Occultism", "Spiritual essence: Religion", "Vital essence: Nature", "Vital essence: Religion"]);
    assert.match(set.checkChoices[7].resolution.outcomes.failure.noteEffects[0].text, /some other quality .*vital essence/);
    assert.equal(saveText(set), "DC 30 Arcana check (secret)");
    for (const plan of [split, combine]) {
        const row = rowsOf(plan).success;
        assert.deepEqual([done(plan), row.effects[0].slug, row.effects[0].duration.value, row.effects[0].duration.unit, row.noteEffects[0].duration.unit, routeOf(plan, text("Essence Prism"))], [true, "paralyzed", 1, "hours", "hours", "save"]);
    }
    assert.match(rowsOf(split).success.noteEffects[0].text, /2 levels lower .*stronger is 1 level lower and the weaker 3 or more/);
    assert.match(rowsOf(combine).success.noteEffects[0].text, /1 or 2 levels higher/);
});

test("Cayden's Tankard: a fear effect counteracted for its targets (its creator's save the open part); the conditions' Effects ended too", () => {
    const [fear, freed, indestructible] = activations("Cayden's Tankard");
    assert.deepEqual([fear.partial, fear.reduce.map((entry) => [entry.slug, entry.who ?? "self", entry.granter])], [true, [["frightened", "self", "ends"], ["frightened", "targets", "ends"]]]);
    assert.deepEqual([done(freed), freed.reduce.length, freed.reduce.every((entry) => entry.granter === "ends" && entry.granterWeeks === 1), Boolean(freed.item.speedPenaltiesEnd)], [true, 12, true, true]);
    assert.ok(freed.notes.some((line) => /Escape .*next attempt automatically/.test(line)));
    assert.equal(indestructible.spell.name, "Indestructibility");
});

test("Mirror of Sorshen: Second Glance the DC 35 Will save (Fascinated, a DC 30 save to end it); Irresistible Desire Controlled for 30 days", () => {
    const glance = activation("Mirror of Sorshen", "Second Glance");
    assert.deepEqual([done(glance), glance.resolution.check.against.value, rowsOf(glance).failure.effects[0].slug, glance.traits.includes("incapacitation"), routeOf(glance, text("Mirror of Sorshen"))], [true, 35, "fascinated", true, "save"]);
    assert.match(rowsOf(glance).failure.noteEffects[0].text, /DC 30 Will save to end it/);
    const desire = activation("Mirror of Sorshen", "Irresistible Desire");
    const row = rowsOf(desire).success;
    assert.deepEqual([done(desire), row.effects[0].slug, row.effects[0].duration.value, row.effects[0].duration.unit, routeOf(desire, text("Mirror of Sorshen"))], [true, "controlled", 30, "days", "save"]);
    assert.match(row.noteEffects[0].text, /DC 35 Will save to break free/);
});

test("Radiant Spark: the Binding Circle's hour on its user; the DC 49 Will save, Drained 2, death on a failure, 24 hours' immunity", () => {
    const [, binding, consume] = activations("Radiant Spark");
    assert.deepEqual([done(binding), rowsOf(binding).success.noteEffects[0].duration.value], [true, 1]);
    const rows = rowsOf(consume);
    assert.deepEqual([done(consume), consume.resolution.check.against.value, rows.success.effects[0].slug, rows.success.effects[0].value, rows.failure.terminal.kind, rows.criticalFailure.terminal.kind, consume.trigger.immunity.duration.value], [true, 49, "drained", 2, "death", "death", 24]);
    assert.match(rows.criticalFailure.noteEffects[0].text, /until the Radiant Spark is destroyed/);
});

test("Shadowpiercer: Absorb Shadows' temporary Hit Points typed on the card and its darkness counteracted; Rebuff Gloom's counteract for a Mythic Point or Drained 2", () => {
    const absorb = activation("Shadowpiercer", "Absorb Shadows");
    const row = rowsOf(absorb).success;
    assert.deepEqual([done(absorb), absorb.item.levelTemp[0].multiplier, row.noteEffects.length, row.noteEffects[0].label, row.noteEffects[0].duration.unit, routeOf(absorb)], [true, 4, 1, "Absorbed Shadows", "hours", "item"]);
    const rebuff = activation("Shadowpiercer", "Rebuff Gloom");
    assert.deepEqual(rebuff.ways.map((way) => [routeOf(way.plan), way.plan.item.counteract.modifier, way.plan.item.counteract.rank]), [["counteract", 46, 10], ["counteract", 46, 10]]);
    assert.deepEqual([rebuff.ways[0].plan.spend, rebuff.ways[1].plan.userEffects], [{ mythicPoints: 1 }, [{ kind: "condition", slug: "drained", value: 2 }]]);
});

test("Graymist: hidden from the creature that missed, as Shadowmist Cape's reading has it", () => {
    const [reaction] = activations("Graymist");
    assert.deepEqual([done(reaction), rowsOf(reaction).success.noteEffects[0].label], [true, "Lost in the mist"]);
});

test("Scale of Igroon's reflection and Phoenix Fighting Fan's Sustain by Strikes: the parts another module must add, partial", () => {
    assert.equal(activations("Scale of Igroon")[2].partial, true);
    const fan = activations("Phoenix Fighting Fan")[0];
    assert.deepEqual([fan.partial, fan.dc, fan.castRange.feet, fan.castDuration.value, routeOf(fan)], [true, 34, 30, 1, "cast"]);
});

test("Deck of Harrowed Tales casts Gate; Slithermaw's Bane (Heroic)'s Terrain Adaptation: eighteen ways, until its user's next rest", () => {
    const [gate] = activations("Deck of Harrowed Tales");
    assert.deepEqual([done(gate), gate.spell.name, gate.rank, routeOf(gate)], [true, "Gate", 10, "cast"]);
    const adapt = activation("Slithermaw's Bane (Heroic)", "Terrain Adaptation");
    assert.deepEqual([done(adapt), adapt.ways.length, adapt.ways[6].name], [true, 18, "Forest, protected from heat"]);
    const forest = adapt.ways[7].plan;
    const [effect] = forest.item.ruleEffects;
    assert.deepEqual([effect.rules[0].value, effect.rules[1].predicate[0], forest.temperature.counts["extreme-cold"], effect.untilRest, routeOf(forest)], [{ environment: "forest", feature: "all" }, "terrain:forest", "mild-cold", true, "item"]);
    // (Its Effects flagged for scripts/until-rest.js: gone at rest, each in place of the last.)
    const made = ruleEffectSource(effect, { item: { name: "Slithermaw's Bane (Heroic)", uuid: "Item.x" } });
    assert.deepEqual([made.flags["pf2e-automatic-item-resolution"].untilRest, made.flags["pf2e-automatic-item-resolution"].replaces, made.system.duration.unit], [true, true, "unlimited"]);
    assert.equal(temperatureEffectSource(forest.temperature, { item: { name: "x" } }).flags["pf2e-automatic-item-resolution"].untilRest, true);
});
