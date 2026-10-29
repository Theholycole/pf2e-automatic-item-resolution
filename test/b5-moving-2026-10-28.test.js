// Moving creatures and the user, the installed modules' items, 2026-10-28 (docs/needs.md "Moving creatures and the user"): pushes on a hit,
// and what the modules' movers do. Their items are read from the installed packs (skipped when a module isn't there); the assertions are on
// plan fields, not on the modules' words.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { netsUnder } from "../scripts/falls.js";
import { NOTES_CHECKED } from "../src/compiler/notes-checked.js";
import { spellIndex } from "../src/compiler/cast-words.js";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const spells = spellIndex(readDocuments(`${PACKS}/spells`).filter((doc) => doc.collection === "items"));
const basicActions = compileBasicActions(readDocuments(`${PACKS}/actions`).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
const cache = new Map();
const docsOf = (module, pack) => {
    const key = `${module}/${pack}`;
    if (!cache.has(key)) {
        let docs = [];
        try { docs = readDocuments(`${MODULES}/${module}/packs/${pack}`).filter((doc) => doc.collection === "items"); } catch { docs = []; }
        cache.set(key, docs);
    }
    return cache.get(key);
};
// (A module's item with its owner's level, or null when the module isn't installed.)
const third = (module, pack, name) => {
    const doc = docsOf(module, pack).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 } : null;
};
const ALCHEMISTS = ["pf2e-team-plus-alchemists", "pf2e-items"];
const INVENTORS = ["pf2e-team-plus-inventors", "inventors-equipment"];
const left = (plan) => [...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];

test("the Agglomerative Cannonball's grades: the Strike card's push on a critical hit (or on any hit, farther on a critical), its own rule's damage said and the razing trait PF2e's AdjustStrike", async () => {
    const { strikeLines, strikeRules } = await import("../src/live/strike-card.js");
    for (const [grade, damage, hit, critical] of [["Lesser", 1, null, 5], ["Moderate", 3, null, 10], ["Greater", 6, 5, 10], ["Major", 10, 5, 15]]) {
        const round = third(...ALCHEMISTS, `Agglomerative Cannonball (${grade})`);
        if (!round) return;
        const [entry] = compileActivations(round);
        const plan = entry.plan;
        const { outcomes } = plan.resolution;
        assert.deepEqual([plan.builtin, plan.partial, routeOf(plan), left(plan), plan.strike.ammo, plan.strike.ownRules, plan.strike.traits], [undefined, undefined, "strike", [], true, [`${damage} bludgeoning damage`], ["razing"]], grade);
        assert.deepEqual([outcomes.success.forcedMovement?.distance ?? null, outcomes.criticalSuccess.forcedMovement.distance, outcomes.criticalSuccess.forcedMovement.kind, outcomes.criticalSuccess.forcedMovement.direction], [hit, critical, "push", "away"], grade);
        assert.ok(strikeLines(plan).includes("It gains the razing trait"), grade);
        assert.ok(strikeLines(plan).includes(`On a critical hit: pushed ${critical} feet away`), grade);
        const [trait] = strikeRules(plan, { ammoId: "round1", label: round.name }).filter((rule) => rule.key === "AdjustStrike");
        assert.deepEqual([trait.property, trait.value, trait.definition], ["weapon-traits", "razing", [{ or: ["item:ammo:id:round1", "ammo:id:round1"] }]], grade);
    }
});

test("used as part of its user's own move: Buoyant Hyacinth (Lesser)'s Swim card with its user's note Effect for the minutes it floats; Surfing Grass's longer Crawl the move card, its Prone gone when the card's applied", () => {
    const hyacinth = third(...ALCHEMISTS, "Buoyant Hyacinth (Lesser)");
    if (!hyacinth) return;
    const swim = compileItem(hyacinth, { basicActions });
    const [note] = swim.userEffects;
    assert.deepEqual([swim.builtin, swim.action.slug, swim.partial, swim.action.after, routeOf(swim)], ["item-action", "swim", undefined, "", "action"]);
    assert.deepEqual([note.kind, note.duration.value, note.duration.unit], ["note", 10, "minutes"]);
    assert.match(note.text, /^Each Swim goes 5 feet farther\. Underwater, it floats up 30 feet\b/);
    const grass = compileItem(third(...ALCHEMISTS, "Surfing Grass"), { basicActions });
    assert.deepEqual([grass.partial, routeOf(grass), grass.reduce, grass.item.move.within, grass.item.move.from, grass.item.move.move.verb, grass.notes.length], [undefined, "item", [{ slug: "prone", by: "all" }], 15, "self", "Crawl", 1]);
});

test("Impact Jelly: its 10-foot square a zone placed for the minute, falls into it 50 feet shorter through netsUnder (the environment module's), its nonlethal damage and its check to land standing passed on — the environment module plays them (core 0.7.8, env 0.2.2)", () => {
    const jelly = third(...ALCHEMISTS, "Impact Jelly");
    if (!jelly) return;
    const plan = compileItem(jelly, { basicActions });
    assert.deepEqual([plan.builtin, plan.partial, plan.noteOnly, routeOf(plan), plan.zone.area, plan.zone.centre, plan.zone.lasts.value, plan.zone.lasts.unit], ["zone", undefined, undefined, "zone", { type: "square", value: 10 }, "placed", 1, "minutes"]);
    assert.deepEqual(plan.zone.fall, { shorter: 50, nonlethal: true, landCheck: { statistics: ["acrobatics", "athletics"], dc: 10, add: 1, per: 10 } });
    assert.equal(plan.zone.notes.length, 3);
    const region = (fall) => ({ name: "Impact Jelly", elevation: { bottom: 0 }, flags: { "pf2e-automatic-ability-resolution": { zone: { zone: { fall }, itemName: "Impact Jelly" } } }, testPoint: () => true });
    const token = (fall) => ({ x: 0, y: 0, width: 1, height: 1, elevation: 30, parent: { grid: { size: 100 }, regions: { contents: [region(fall)] } } });
    assert.deepEqual(netsUnder(token(plan.zone.fall)), [{ shorter: 50, nonlethal: true, landCheck: plan.zone.fall.landCheck, source: "Impact Jelly" }]);
    // (A net's still none at all; a zone with no fall eases nothing.)
    assert.deepEqual(netsUnder(token({ noDamage: true })), [{ noDamage: true, source: "Impact Jelly" }]);
    assert.deepEqual(netsUnder(token({})), []);
});

test("note-only and checked: Lily Landing Pad's pad (the map's, its user's own jump) and Spirit Box's spirits (speech) — counted done", () => {
    for (const name of ["Lily Landing Pad", "Spirit Box"]) {
        const doc = third(...(name === "Spirit Box" ? INVENTORS : ALCHEMISTS), name);
        assert.ok(NOTES_CHECKED.has(name), name);
        if (!doc) continue;
        const plan = compileItem(doc, { basicActions });
        assert.deepEqual([plan.noteOnly, plan.decided, plan.resolution.outcomes.success.noteEffects.length], [undefined, "checked", 1], name);
    }
});

test("a creature let out to act once: Cauthooj Egg's Thievery +22 against the Reflex DC of the creature targeted, the drop card after a success; Liquid Ore Louse's +11 spit against the holder's AC, its object's acid and broken shield lines", () => {
    const egg = third(...ALCHEMISTS, "Cauthooj Egg");
    if (!egg) return;
    const thief = compileItem(egg, { basicActions });
    assert.deepEqual([thief.partial, routeOf(thief), thief.targeting.range, thief.resolution.check, thief.dropHeld.degrees, thief.dropHeld.one, thief.dropHeld.attended, thief.notes.length], [undefined, "save", "35 feet", { roll: "skill", statistic: "thievery", against: { dc: "target", statistic: "reflex" }, modifier: 22 }, ["criticalSuccess", "success"], true, true, 3]);
    const louse = compileItem(third(...ALCHEMISTS, "Liquid Ore Louse"), { basicActions });
    assert.deepEqual([louse.partial, routeOf(louse), louse.resolution.check, louse.notes.length], [undefined, "save", { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: 11 }, 3]);
    assert.match(louse.notes[1], /\b3d6 acid damage, ignoring its Hardness\b/);
    assert.ok(Object.values(louse.resolution.outcomes).every((row) => row.damage.mode === "none" && !row.effects.length), "the creature itself takes nothing");
});

test("a spell made by a creature let out: Dweomerflacon's Dispelling Globe for a minute (the cast's own time), placed round the cat; Encapsulated Titanosaur's Earthquake centred within 30 feet — lines for where, and what the creature changes", () => {
    for (const [grade, rank, modifier] of [["Lesser", 4, 13], ["Moderate", 6, 17], ["Greater", 8, 22]]) {
        const flask = third(...ALCHEMISTS, `Dweomerflacon (${grade})`);
        if (!flask) return;
        const plan = compileItem(flask, { basicActions, spells });
        assert.deepEqual([plan.builtin, plan.partial, plan.spell.name, plan.rank, plan.attack, plan.castDuration.value, plan.castDuration.unit, plan.notes.length], ["cast-spell", undefined, "Dispelling Globe", rank, modifier, 1, "minutes", 2], grade);
    }
    const titanosaur = compileItem(third(...ALCHEMISTS, "Encapsulated Titanosaur"), { basicActions, spells });
    assert.deepEqual([titanosaur.partial, titanosaur.spell.name, titanosaur.rank, titanosaur.dc, titanosaur.castRange.feet, titanosaur.castRange.area, titanosaur.notes.length], [undefined, "Earthquake", 8, 35, 30, 60, 2]);
});

test("Splitting Tree Splatter's grades: the Shove card at the flower's modifier (its own bonus for the Moderate and Greater), its success rows a note Effect granting PF2e's Off-Guard until deleted — the surface met the map's", () => {
    for (const [grade, minimum, own] of [["Lesser", 5, null], ["Moderate", 10, 1], ["Greater", 16, 2]]) {
        const flower = third(...ALCHEMISTS, `Splitting Tree Splatter (${grade})`);
        if (!flower) return;
        const plan = compileItem(flower, { basicActions });
        const { outcomes } = plan.action.basic.resolution;
        assert.deepEqual([plan.builtin, plan.partial, plan.action.slug, plan.action.after, plan.action.minimum.value, plan.action.minimum.ownBonus?.value ?? null], ["item-action", undefined, "shove", "", minimum, own], grade);
        for (const degree of ["success", "criticalSuccess"]) {
            const [note] = outcomes[degree].noteEffects;
            assert.deepEqual([note.duration, note.rules[0].key, note.rules[0].uuid, Boolean(outcomes[degree].forcedMovement)], [null, "GrantItem", "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg", true], `${grade} ${degree}`);
        }
        assert.ok(!outcomes.failure.noteEffects?.length && !outcomes.criticalFailure.noteEffects?.length, grade);
    }
});

test("Marble Mines' grades: a zone placed within 15 feet for the minute, difficult terrain, a Reflex save at each turn's start in it (Prone on a failure); their setting off a one-off, a line of the zone card", async () => {
    const { ONE_OFFS } = await import("../src/compiler/one-offs.js");
    for (const [grade, size, dc] of [["Lesser", 5, 15], ["Moderate", 5, 20], ["Greater", 10, 29], ["Major", 15, 38]]) {
        assert.ok(ONE_OFFS.has(`Marble Mines (${grade})`), grade);
        const doc = third(...INVENTORS, `Marble Mines (${grade})`);
        if (!doc) continue;
        const plan = compileItem(doc, { basicActions });
        const [save] = plan.zone.saves;
        assert.deepEqual([plan.builtin, plan.partial, plan.decided, routeOf(plan), plan.zone.area, plan.zone.centre, plan.zone.range, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.terrain[0].difficulty], ["zone", undefined, "one-off", "zone", { type: "square", value: size }, "placed", 15, 1, "minutes", 2], grade);
        assert.deepEqual([save.when, save.plan.resolution.check.statistic, save.plan.resolution.check.basic, save.plan.resolution.check.against.value, save.plan.resolution.outcomes.failure.effects[0].slug, save.plan.resolution.outcomes.success.effects.length], [["start"], "reflex", false, dc, "prone", 0], grade);
        assert.equal(plan.zone.notes.length, 3, grade);
    }
});

test("Junkcraft Jetpack: the move card's Fly within 60 feet, kept open for each turn's Sustain, its user's note Effect for the minute (no ground moves, no fall while it burns); the turn's check and the last fall lines", () => {
    const pack = third(...INVENTORS, "Junkcraft Jetpack");
    if (!pack) return;
    const plan = compileItem(pack, { basicActions });
    const [note] = plan.userEffects;
    assert.deepEqual([plan.builtin, plan.partial, routeOf(plan), plan.teleport.within, plan.teleport.from, plan.teleport.move.verb, plan.teleport.move.again, plan.teleport.move.lines.length], ["teleport", undefined, "teleport", 60, "self", "Fly", true, 3]);
    assert.deepEqual([note.kind, note.duration.value, note.duration.unit, plan.notes.length], ["note", 1, "minutes", 1]);
});

test("a trail its user's Strides leave: Instinct Crown (Breach)'s Effect flagged trail and untilRage; the walked legs of a move, the squares they cross, the zone (difficult terrain, a minute, +2 melee damage for its maker inside)", async () => {
    const { walkedLegs, trailCells, trailZone } = await import("../src/live/trails.js");
    const { ruleEffectSource } = await import("../src/live/card.js");
    const crown = third("pf2e-team-plus-barbarians", "items", "Instinct Crown (Breach)");
    if (crown) {
        const plan = compileActivations(crown)[1].plan;
        const [own] = plan.userEffects;
        assert.deepEqual([plan.noteOnly, plan.partial, routeOf(plan), own.kind, own.untilRage, own.trail.lasts.value, own.trail.lasts.unit, own.trail.inside[0].who, own.trail.inside[0].rules[0].selector, own.trail.inside[0].rules[0].value, plan.notes.length], [undefined, undefined, "item", "rules", true, 1, "minutes", "own", "melee-strike-damage", 2, 3]);
        const source = ruleEffectSource(own, { item: { name: crown.name }, user: {} });
        assert.deepEqual([Boolean(source.flags["pf2e-automatic-item-resolution"].trail), source.flags["pf2e-automatic-item-resolution"].untilRage], [true, true]);
    }
    // (Walked legs only: a flown or teleported one leaves none; no action said is a walk.)
    const movement = { origin: { x: 0, y: 0 }, passed: { waypoints: [{ x: 200, y: 0, action: "walk" }, { x: 200, y: 300, action: "fly" }, { x: 400, y: 300 }] } };
    assert.deepEqual(walkedLegs(movement), [{ from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }, { from: { x: 200, y: 300 }, to: { x: 400, y: 300 } }]);
    assert.deepEqual(walkedLegs({ origin: { x: 0, y: 0 }, destination: { x: 100, y: 0, action: "displace" } }), []);
    const cells = trailCells({ origin: { x: 0, y: 0 }, destination: { x: 200, y: 0 } }, { w: 100, h: 100 }, 100);
    assert.deepEqual(cells, [{ x: 100, y: 0 }, { x: 200, y: 0 }]);
    const zone = trailZone({ lasts: { mode: "fixed", value: 1, unit: "minutes" }, inside: [{ who: "own", rules: [] }], notes: ["n"] }, cells);
    assert.deepEqual([zone.area.type, zone.area.cells, zone.terrain, zone.lasts.value, zone.inside[0].who, zone.notes], ["squares", cells, [{ movement: ["walk"], difficulty: 2 }], 1, "own", ["n"]]);
});
