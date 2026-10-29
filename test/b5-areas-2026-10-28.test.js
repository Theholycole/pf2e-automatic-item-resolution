// The 2026-10-28 batch's areas group (src/compiler/readings-areas.js): the installed modules' items read from their own packs — their words
// are theirs, so these tests assert on plan fields only, and skip an item whose module isn't installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { pulseCards, pulseFits, pulseFlag, pulseStep, pulseText } from "../src/live/pulse.js";
import { createWaysCard, waysCardHTML, waysLeft, waysSpent } from "../src/live/ways-card.js";
import { strikeLines, strikeRules } from "../src/live/strike-card.js";
import { bombCardHTML, createBombCard, splashRadiusOf } from "../src/live/bomb-card.js";
import { routeOf } from "../src/live/route.js";
import { vehicleFor, vehicleLength, vehicleZone } from "../src/live/vehicle-aura.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")) };
const packsOf = new Map();
// A module's item by name (its item packs, not its Starfinder copies), or null when it isn't installed.
function thirdParty(module, name) {
    if (!packsOf.has(module)) {
        const manifest = path.join(MODULES, module, "module.json");
        const docs = [];
        if (existsSync(manifest)) {
            for (const pack of JSON.parse(readFileSync(manifest, "utf8")).packs ?? []) {
                if (pack.type !== "Item" || /^sf/i.test(pack.name)) continue;
                try { docs.push(...readDocuments(path.join(MODULES, module, pack.path)).filter((doc) => doc.collection === "items")); } catch { /* (a pack it can't read) */ }
            }
        }
        packsOf.set(module, docs);
    }
    const doc = packsOf.get(module).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system?.level?.value) || 1 } : null;
}
const consumable = (module, name) => {
    const doc = thirdParty(module, name);
    return doc ? compileItem(doc, options) : null;
};
const activations = (module, name) => {
    const doc = thirdParty(module, name);
    return doc ? compileActivations(doc, options).map((entry) => entry.plan) : null;
};
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;
const TIAN_XIA = "pf2e-team-plus-tian-xia";
const ALCHEMISTS = "pf2e-team-plus-alchemists";
const INVENTORS = "pf2e-team-plus-inventors";
const BATTLEZOO = "battlezoo-bestiary-pf2e";

test("Sky Dragon's Eyes (each grade): the weather's fog and mist ignored for its time through the environment module, a spell's or a zone's fog on the eater's note Effect", () => {
    for (const [grade, value, unit] of [["Lesser", 10, "minutes"], ["Moderate", 1, "hours"], ["Greater", 24, "hours"]]) {
        const plan = consumable(TIAN_XIA, `Sky Dragon's Eyes (${grade})`);
        if (!plan) return;
        assert.ok(done(plan), grade);
        assert.deepEqual(plan.weatherIgnores, { ignores: ["fog-mist"], duration: { mode: "fixed", value, unit, expiry: "turn-start" } });
        assert.deepEqual(success(plan).noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit]), [["Mist vision", value, unit]]);
        assert.equal(plan.item.recipient, "drinker");
    }
});

test("Boreal Mint (each grade): its Secondary Effect's cone save on the ways card, a line to target only the fire creatures and one for the fires put out; the Major's unclosed damage link mended", () => {
    for (const [grade, formula, dc] of [["Lesser", "4d6[cold]", 18], ["Greater", "8d6[cold]", 29], ["Major", "10d6[cold]", 33]]) {
        const plan = consumable(ALCHEMISTS, `Boreal Mint (${grade})`);
        if (!plan) return;
        assert.ok(done(plan), grade);
        assert.deepEqual(plan.ways.map((way) => way.name), ["Its use", "Its secondary effect"]);
        const breath = plan.ways[1].plan;
        assert.deepEqual([breath.targeting.area, breath.resolution.sharedDamage.components[0].formula, breath.resolution.check.against.value, breath.resolution.check.basic], [{ type: "cone", value: 15 }, formula, dc, true]);
        assert.equal(breath.notes.length, 2);
        assert.match(breath.notes[0], /fire trait or are immune/);
    }
});

test("Volatile Vial: hazardous fire placed within 20 feet for a minute, its damage on moving in and at a turn's start by the item's own level rules; from 12th its user picks the area on the ways card", () => {
    const doc = thirdParty(ALCHEMISTS, "Volatile Vial");
    if (!doc) return;
    const [plan] = compileActivations(doc, options).map((entry) => entry.plan);
    assert.ok(done(plan));
    assert.deepEqual([plan.builtin, plan.zone.area, plan.zone.centre, plan.zone.range, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.hazard, plan.zone.damage], ["zone", { type: "square", value: 5 }, "placed", 20, 1, "minutes", { formulas: ["2[fire]"] }, [{ when: "start", formulas: ["2[fire]"] }]]);
    const at = (level) => compileActivations({ ...doc, system: { ...doc.system, level: { value: level } } }, options)[0].plan;
    assert.deepEqual(at(5).zone.hazard.formulas, ["4[fire]"]);
    const greater = at(12);
    assert.deepEqual([greater.builtin, greater.ways.map((way) => [way.name, way.plan.zone.area.type, way.plan.zone.area.value, way.plan.zone.hazard.formulas[0]])], ["ways", [["One 5-foot square", "square", 5, "8[fire]"], ["A 5-foot burst", "burst", 5, "8[fire]"]]]);
    assert.deepEqual(at(18).ways.map((way) => [way.name, way.plan.zone.hazard.formulas[0]]), [["One 5-foot square", "12[fire]"], ["A 5-foot burst", "12[fire]"], ["A 10-foot burst", "12[fire]"]]);
});

test("Expanding Foam (each grade): a burst of solid foam placed within 30 feet for good, the ability module's zone; its sections' numbers, the push out to its edge and the fires put out its lines", () => {
    for (const [grade, feet, hardness, hp, fire] of [["Lesser", 10, 14, 50, 10], ["Moderate", 20, 18, 80, 15], ["Greater", 30, 22, 120, 20]]) {
        const plan = consumable(ALCHEMISTS, `Expanding Foam (${grade})`);
        if (!plan) return;
        assert.ok(done(plan), grade);
        assert.deepEqual([plan.builtin, plan.zone.area, plan.zone.centre, plan.zone.range, plan.zone.lasts, plan.zone.terrain, plan.zone.notes.length], ["zone", { type: "burst", value: feet }, "placed", 30, null, [], 4]);
        assert.match(plan.zone.notes[3], new RegExp(`Hardness ${hardness}, ${hp} Hit Points\\b.*\\bfire resistance ${fire};`));
        assert.match(plan.zone.notes[1], /forced movement/);
    }
});

test("Draconic Steak: its Intimidation bonus only against creatures with scent, PF2e's toggle on its user's Effect, gone at its next daily preparations (a day at most)", () => {
    const plan = consumable(ALCHEMISTS, "Draconic Steak");
    if (!plan) return;
    assert.ok(done(plan));
    assert.deepEqual([success(plan).modifiers, success(plan).noteEffects, plan.unread], [[], undefined, undefined]);
    const [effect] = plan.item.ruleEffects;
    assert.deepEqual([effect.name, effect.untilRest, effect.duration.value, effect.duration.unit], ["Dragon scent", true, 24, "hours"]);
    assert.deepEqual(effect.rules, [
        { key: "RollOption", domain: "all", option: "draconic-steak-scent", toggleable: true, label: "Intimidating a creature that has scent" },
        { key: "FlatModifier", selector: "intimidation", type: "circumstance", value: 2, predicate: ["draconic-steak-scent"] }
    ]);
});

test("X-Ray Goggles: seeing through what its user picks as it Seeks, its words on its user for the 10 minutes", () => {
    const plan = consumable(INVENTORS, "X-Ray Goggles");
    if (!plan) return;
    assert.ok(done(plan));
    const [note] = success(plan).noteEffects;
    assert.deepEqual([note.label, note.duration.value, note.duration.unit], ["X-ray vision", 10, "minutes"]);
    assert.match(note.text, /\b60 feet\b.*\bWood 2 feet thick, stone 1 foot thick, common metal 2 inches thick\b/);
});

test("Toan Nguyen's Tincture: the ways card — its sight given up (Blinded for the 10 minutes) or another precise sense — each with the hearing and the Deafened after on the drinker's note Effect", () => {
    const plan = consumable(TIAN_XIA, "Toan Nguyen's Tincture");
    if (!plan) return;
    assert.ok(done(plan));
    assert.deepEqual(plan.ways.map((way) => [way.name, success(way.plan).effects.map((effect) => effect.slug), way.plan.targeting.target]), [["Its sight given up", ["blinded"], "the drinker"], ["Another precise sense given up", [], "the drinker"]]);
    for (const way of plan.ways) {
        const [note] = success(way.plan).noteEffects;
        assert.deepEqual([note.duration.value, note.duration.unit], [10, "minutes"]);
        assert.match(note.text, /Deafened for 1 minute for each conversation/);
    }
});

test("Tears of Shizuru: a pulse of two cards of its own, as it's used and at the start of its user's next 2 turns — the basic Fortitude save (3d8 force, holy) at its foes within 30 feet, Quickened with its extra action's limit at its allies there", () => {
    const plan = consumable(TIAN_XIA, "Tears of Shizuru");
    if (!plan) return;
    assert.ok(done(plan));
    const { pulse } = plan.item;
    assert.deepEqual([pulse.who, pulse.also.who, pulse.radius, pulse.own, pulse.ticks], ["foes", "allies", 30, false, 2]);
    assert.deepEqual([pulse.plan.resolution.check, pulse.plan.resolution.sharedDamage.components[0].formula, pulse.plan.traits.includes("holy")], [{ roll: "save", statistic: "fortitude", basic: true, against: { dc: "fixed", value: 35 } }, "3d8[force]", true]);
    const ally = success(pulse.also.plan);
    assert.deepEqual([ally.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.expiry]), ally.noteEffects.length], [[["quickened", 1, "turn-start"]], 1]);
    // (Its cards for a step, each named for it and at its side; counted turns, not its time.)
    assert.deepEqual(pulseCards(pulse, "Tears of Shizuru: this round").map((card) => [card.who, card.plan.source.name, card.plan.resolution.kind]), [["foes", "Tears of Shizuru: this round", "save"], ["allies", "Tears of Shizuru: this round", "check"]]);
    assert.deepEqual([pulseFits("foes", false), pulseFits("foes", true), pulseFits("allies", true), pulseFits(null, true)], [true, false, true, true]);
    const flag = pulseFlag(pulse, { item: { name: "Tears of Shizuru" }, worldTime: 100 });
    assert.deepEqual([flag.ticksLeft, flag.endsAt, pulseStep(flag, 106), pulseStep({ ...flag, ticksLeft: 0 }, 106), pulseStep(flag, 118)], [2, 118, "tick", "end", "end"]);
    assert.match(pulseText(pulse), /^Jade tears within 30 feet of its user: 3d8\[force\] damage \(basic Fortitude save, DC 35; holy\)/);
    // (A damage pulse as before: its damage plan at every creature.)
    assert.deepEqual(pulseCards({ formula: "4d6", type: "cold", radius: 10 }, "x").map((card) => [card.who, card.plan.resolution.sharedDamage.components[0].formula]), [[null, "4d6[cold]"]]);
});

test("Phlogiston Grease: the ways card — a surface made to burn (its line) or an adjacent creature's Fortitude save, DC 28, whose failure's fire changes are a note Effect on it for the minute", () => {
    const plan = consumable(ALCHEMISTS, "Phlogiston Grease");
    if (!plan) return;
    assert.ok(done(plan));
    assert.deepEqual(plan.ways.map((way) => way.name), ["On a surface", "On an adjacent creature"]);
    assert.equal(plan.ways[0].plan.notes.length, 1);
    const save = plan.ways[1].plan;
    assert.deepEqual([save.resolution.check.statistic, save.resolution.check.against.value, save.resolution.check.basic], ["fortitude", 28, false]);
    for (const degree of ["failure", "criticalFailure"]) assert.deepEqual(save.resolution.outcomes[degree].noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit]), [["Phlogiston grease", 1, "minutes"]]);
    for (const degree of ["success", "criticalSuccess"]) assert.equal(save.resolution.outcomes[degree].noteEffects, undefined);
    assert.match(save.resolution.outcomes.failure.noteEffects[0].text, /fire resistance is 5 lower\b.*\bfire damage 4 times/);
});

test("Subliming Aludel: the ways card — a bomb's gas (concealing, hazardous terrain and a turn's-start card its holder included) or a healing elixir's (concealing, PF2e's fast healing inside), each a 5-foot emanation for 4 rounds at half the aludel's level; the item's pick a one-off", async () => {
    const doc = thirdParty(ALCHEMISTS, "Subliming Aludel");
    if (!doc) return;
    const [plan] = compileActivations(doc, options).map((entry) => entry.plan);
    assert.ok(done(plan));
    assert.deepEqual(plan.ways.map((way) => [way.name, way.plan.zone.area, way.plan.zone.centre, way.plan.zone.lasts.value, way.plan.zone.concealed]), [["A bomb inside", { type: "emanation", value: 5 }, "self", 4, true], ["A healing elixir inside", { type: "emanation", value: 5 }, "self", 4, true]]);
    const [bomb, elixir] = plan.ways.map((way) => way.plan.zone);
    assert.deepEqual([bomb.hazard, bomb.saves[0].when, bomb.saves[0].own, bomb.saves[0].plan.resolution.outcomes.success.damage.formulas], [{ formulas: ["4"] }, ["start"], true, [{ formula: "4" }]]);
    assert.deepEqual(elixir.inside, [{ rules: [{ key: "FastHealing", value: 4 }] }]);
    const { oneOff } = await import("../src/compiler/one-offs.js");
    assert.ok(oneOff("Subliming Aludel"));
});

test("Terotricus Root Preserve: the spores' Fortitude save (DC 39) at the creatures near the terotricus — a failure's –10-foot status penalty to all Speeds for the minute, a critical failure's Immobilized too until it Escapes; the creature, the withering and the spores' condition its lines", () => {
    const plan = consumable(ALCHEMISTS, "Terotricus Root Preserve");
    if (!plan) return;
    assert.ok(done(plan));
    assert.deepEqual([plan.resolution.check.statistic, plan.resolution.check.against.value, plan.item.recipient, plan.notes.length], ["fortitude", 39, "user", 3]);
    const { failure, criticalFailure, success } = plan.resolution.outcomes;
    assert.deepEqual(failure.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration.value, modifier.duration.unit]), [["all-speeds", -10, "status", 1, "minutes"]]);
    assert.deepEqual(criticalFailure.effects, [{ kind: "condition", slug: "immobilized", value: null, duration: { mode: "until-escape", escape: { dc: 39 } } }]);
    assert.deepEqual([success.modifiers, success.effects], [[], []]);
});

test("Hook Chain (each grade): the ways card kept open for the grade's uses in all — hooking a creature (its user's simple-weapon ranged attack, a hit's note Effect tying the two within 30 feet), an object or square, or pulling its user beside it (the teleport card's move)", () => {
    for (const [grade, escape, hardness, hp, uses] of [["Lesser", 17, 5, 20, 2], ["Moderate", 22, 7, 30, 4], ["Greater", 30, 10, 45, 6], ["Major", 39, 15, 60, 8]]) {
        const plan = consumable(INVENTORS, `Hook Chain (${grade})`);
        if (!plan) return;
        assert.ok(done(plan), grade);
        assert.deepEqual([plan.builtin, plan.once, plan.waysMax, plan.ways.map((way) => way.name)], ["ways", undefined, uses, ["Hook a creature", "Hook an object or square", "Pull yourself to it"]]);
        const [creature, , pull] = plan.ways.map((way) => way.plan);
        assert.deepEqual([creature.ownCheck, creature.resolution.check.against], [{ kind: "attack", modifier: null, choose: ["thrown"], within: 30 }, { dc: "target", statistic: "ac" }]);
        const [hooked] = success(creature).noteEffects;
        assert.deepEqual([hooked.label, hooked.duration.value, hooked.duration.unit, creature.resolution.outcomes.failure.noteEffects], ["Hooked", 1, "minutes", undefined]);
        assert.match(hooked.text, new RegExp(`Escape \\(DC ${escape}\\).*\\bHardness ${hardness}, ${hp} Hit Points`));
        assert.deepEqual([pull.builtin, pull.teleport.within, pull.teleport.from, pull.teleport.move.verb, pull.teleport.move.lines.length], ["teleport", 30, "self", "Stride", 3]);
    }
    // (The card closes once its uses are spent.)
    const card = createWaysCard({ plan: { builtin: "ways", waysMax: 2, ways: [{ name: "A" }, { name: "B" }] }, item: { name: "Hook Chain (Lesser)" }, user: { name: "Ezren" } });
    assert.deepEqual([waysLeft(card), waysSpent(card), waysSpent({ ...card, results: ["A: its card.", "B: its card."] })], [2, false, true]);
    assert.match(waysCardHTML(card, { canApply: true }), /one of 2 ways, 2 uses left/);
    assert.equal(waysLeft({ plan: { ways: [] }, results: [] }), null);
});

test("Ice Zuggle Orb: the ways card, one way for each elemental or energy trait of a spell cast first — its next Strike with the orb, its traits swapped (and an energy trait's damage type), or supercharged by its own cold (a failure a success, a success a critical success, its splash 10 feet)", () => {
    const [plan] = activations(BATTLEZOO, "Ice Zuggle Orb") ?? [];
    if (!plan) return;
    assert.ok(done(plan));
    assert.deepEqual([plan.builtin, plan.once, plan.ways.length], ["ways", true, 13]);
    const way = (name) => plan.ways.find((entry) => entry.name === name)?.plan;
    for (const entry of plan.ways) assert.deepEqual([routeOf(entry.plan), entry.plan.strike.own, entry.plan.strike.until], ["strike", true, "turn-end"], entry.name);
    const fire = way("After a fire spell");
    assert.deepEqual([fire.strike.alteration, fire.strike.traits], ["fire", { add: ["fire"], remove: ["cold"] }]);
    assert.deepEqual(strikeRules(fire, { weaponId: "orb1" }).filter((rule) => rule.key !== "DamageAlteration"), [
        { key: "AdjustStrike", mode: "remove", property: "weapon-traits", value: "cold", definition: ["item:id:orb1"] },
        { key: "AdjustStrike", mode: "add", property: "weapon-traits", value: "fire", definition: ["item:id:orb1"] }
    ]);
    assert.deepEqual(strikeRules(fire, { weaponId: "orb1" }).find((rule) => rule.key === "DamageAlteration"), { key: "DamageAlteration", selectors: ["orb1-damage"], mode: "override", property: "damage-type", value: "fire" });
    // (An elemental trait with no damage type: its traits only.)
    const earth = way("After an earth spell");
    assert.deepEqual([earth.strike.alteration, earth.strike.traits.add], [null, ["earth"]]);
    const charged = way("After a cold spell: supercharged");
    assert.deepEqual([charged.strike.degree, charged.strike.splashRadius, charged.strike.traits], [{ failure: "one-degree-better", success: "one-degree-better" }, 10, undefined]);
    assert.deepEqual(strikeRules(charged, { weaponId: "orb1" }), [
        { key: "AdjustDegreeOfSuccess", selector: "orb1-attack", adjustment: { failure: "one-degree-better", success: "one-degree-better" } },
        { key: "RollOption", domain: "orb1-damage", option: "splash-radius:10" }
    ]);
    assert.ok(strikeLines(charged).includes("On its attack roll a failure is a success and a success is a critical success"));
    assert.ok(strikeLines(charged).includes("Its splash reaches the creatures within 10 feet of the target"));
    // (The splash card's reach, from the damage roll's options.)
    assert.deepEqual([splashRadiusOf(["splash-radius:10", "item:id:orb1"]), splashRadiusOf([]), splashRadiusOf(undefined)], [10, 5, 5]);
    const card = createBombCard({ plan: { resolution: { outcomes: {} } }, item: { name: "Ice Zuggle Orb" }, user: { name: "Ezren" }, target: { name: "Goblin" }, outcome: "success", splash: [{ type: "cold", total: 1 }], near: [], radius: 10 });
    assert.match(bombCardHTML(card), /No other creature within 10 feet/);
});

test("Sea Dragon Figurehead: Tempest Roar's zone round the ship, as far out as the ship is long, difficult terrain for 10 minutes once an hour; Tidal Boost's Speed bonus on the ship's note Effect for a round, its piloting check to keep it the note's words", () => {
    const [roar, boost] = activations(TIAN_XIA, "Sea Dragon Figurehead") ?? [];
    if (!roar) return;
    assert.ok(done(roar) && done(boost));
    assert.deepEqual([roar.builtin, routeOf(roar), roar.zone.centre, roar.zone.area, roar.zone.lasts.value, roar.zone.lasts.unit, roar.zone.terrain, roar.trigger.frequency.per], ["zone", "zone", "vehicle", { type: "emanation", value: null }, 10, "minutes", [{ movement: ["walk"], difficulty: 2 }], "hour"]);
    const [note] = success(boost).noteEffects;
    assert.deepEqual([boost.targeting.target, note.label, note.duration.value, note.duration.unit, boost.notes.length], ["1 vehicle", "Tidal boost", 1, "rounds", 1]);
    assert.match(note.text, /10 feet higher \(an item bonus/);
    assert.match(note.text, /DC 28 piloting check/);
    // (The ship: the one targeted, else the one its user stands on — the smaller of two; its length PF2e's space, else its token's longer side.)
    const ship = { id: "ship", x: 0, y: 0, width: 6, height: 2, actor: { type: "vehicle", system: { details: { space: { long: 30, wide: 10 } } } } };
    const boat = { id: "boat", x: 100, y: 0, width: 2, height: 1, actor: { type: "vehicle", system: { details: {} } } };
    const sailor = { id: "me", x: 120, y: 20, width: 1, height: 1, actor: { type: "character" } };
    assert.equal(vehicleFor({ targets: [sailor, ship], tokens: [ship, boat, sailor], user: sailor, gridSize: 100 }), ship);
    assert.equal(vehicleFor({ targets: [], tokens: [ship, boat, sailor], user: sailor, gridSize: 100 }), boat);
    assert.equal(vehicleFor({ targets: [], tokens: [ship, sailor], user: { ...sailor, x: 900 }, gridSize: 100 }), null);
    assert.deepEqual([vehicleLength(ship), vehicleLength(boat, { gridDistance: 5 })], [30, 10]);
    assert.deepEqual(vehicleZone(roar.zone, ship, { gridDistance: 5 }).area, { type: "emanation", value: 30 });
    assert.equal(vehicleZone(roar.zone, ship).centre, "self");
});
