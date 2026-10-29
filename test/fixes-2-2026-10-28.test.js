// Fixes from the 2026-10-28 case writers' reading of the third and fourth batches' live play: what of them is pure, here.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { gateMet } from "../src/compiler/strike-gate.js";
import { strikeRules, strikeLines } from "../src/live/strike-card.js";
import { createDropCard, dropCardHTML, listedItems } from "../src/live/drop-card.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activations = (name) => compileActivations(item(name)).map((entry) => entry.plan);

test("A Strike gate looks past the hit's damage roll: the attack roll before it is its user's latest roll", () => {
    const gate = { strike: { any: true, range: null, maneuvers: [], critical: false } };
    const hit = { actorUuid: "Actor.u", type: "attack-roll", outcome: "success", itemUuid: "Item.w", slug: null, targetUuid: "Scene.s.Token.t", ranged: false };
    const damage = { ...hit, type: "damage-roll" };
    const taken = { ...hit, type: "damage-taken", actorUuid: "Actor.u" };
    assert.deepEqual(gateMet(gate, [hit, damage, taken], { actorUuid: "Actor.u", itemUuid: "Item.w" }), { ok: true, struck: "Scene.s.Token.t" });
    // (A miss after it still refuses.)
    assert.equal(gateMet(gate, [hit, damage, { ...hit, outcome: "failure" }], { actorUuid: "Actor.u", itemUuid: "Item.w" }).ok, false);
});

test("Grisly Scythe's critical hit turns only its slashing void: the DamageAlteration's predicate on the damage's own type", () => {
    const plan = activations("Grisly Scythe").find((entry) => entry?.strike?.alteration);
    assert.equal(plan.strike.alterationFrom, "slashing");
    const rule = strikeRules(plan, { weaponId: "w1", label: "Grisly Scythe" }).find((entry) => entry.key === "DamageAlteration");
    assert.deepEqual([rule.value, rule.predicate], ["void", ["damage:type:slashing"]]);
    assert.ok(strikeLines(plan).some((line) => /All its slashing damage is void/.test(line)));
});

test("The Eye of the Slumberer's Vortex: a burst placed on the Eye, ended by its next use (dismissOnReuse)", () => {
    const vortex = activations("The Eye of the Slumberer").find((plan) => plan?.zone?.terrain?.some((entry) => entry.movement?.includes("swim")));
    assert.deepEqual([vortex.zone.area.type, vortex.zone.centre, vortex.zone.untilReused, vortex.zone.dismissOnReuse], ["burst", "placed", true, true]);
});

// (The user's answer to question 6, 2026-10-29: the backbiting curse as Archives of Nethys' Curses 3 has it.)
test("The Liar: a ways card — a creature's weapon after its Will save at its user's class or spell DC, ticked on the drop card; or its user's own", () => {
    const [plan] = activations("The Liar");
    assert.deepEqual([plan.builtin, plan.trigger.frequency.max, plan.ways.map((way) => routeOf(way.plan))], ["ways", 1, ["save", "objects"]]);
    const [carried, own] = plan.ways.map((way) => way.plan);
    assert.deepEqual(carried.resolution.check, { roll: "save", statistic: "will", basic: false, against: { dc: "owner", statistic: "class-spell" } });
    assert.deepEqual([carried.dropHeld.degrees, carried.dropHeld.types, carried.dropHeld.curse], [["failure", "criticalFailure"], ["weapon"], "backbiting"]);
    assert.deepEqual(own.objects, { op: "curse", curse: "backbiting" });
    // (Only its weapons listed, and the card's button says what it does.)
    const items = [{ id: "a", name: "Longsword", type: "weapon", carryType: "held" }, { id: "b", name: "Shield", type: "shield", carryType: "held" }, { id: "c", name: "Dagger", type: "weapon", carryType: "worn" }];
    assert.deepEqual(listedItems(items, carried.dropHeld).map((one) => one.name), ["Longsword", "Dagger"]);
    const card = createDropCard({ dropHeld: carried.dropHeld, item: { name: "The Liar" }, user: { name: "Reader" }, creatures: [{ actorUuid: "Actor.x", name: "Foe", held: [{ id: "a", name: "Longsword" }] }] });
    assert.match(dropCardHTML(card, { canApply: true }), /Curse the ticked weapon/);
});
