// An item's changes to the spell it casts, played by the spell module's castFromItem (2026-10-29, the user's answer to question 8): the readings
// of src/compiler/cast-changes.js and the cast card's castChanges (src/live/cast-card.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { spellIndex } from "../src/compiler/index.js";
import { castChanges } from "../src/live/cast-card.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const first = (name) => compileActivations(item(name), { spells })[0].plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const ALL = ["withoutTraits", "addTraits", "area", "actions", "damageType"];

test("Ivory Baton (both): Dominate at constructs only, without its mental trait; the golem antimagic and the baton's whereabouts card lines", () => {
    for (const [name, dc] of [["Ivory Baton", 30], ["Ivory Baton (Greater)", 39]]) {
        const plan = first(name);
        assert.deepEqual([done(plan), routeOf(plan), plan.spell.name, plan.dc, plan.castTraits.only, plan.castTraits.immune, plan.castWithoutTraits, plan.castLines.length, plan.notes, plan.decided], [true, "cast", "Dominate", dc, ["construct"], [], ["mental"], 2, undefined, undefined], name);
        assert.deepEqual(castChanges(plan, {}, ALL), { options: { withoutTraits: ["mental"] }, lines: [] });
        assert.deepEqual(castChanges(plan, {}, []).lines, ["The spell without its mental trait: by hand (the spell module doesn't take withoutTraits yet)."]);
    }
});

test("Fan of Soothing Winds (both): the 3-action Heal in a 30-foot cone with the air trait, its undead DC, a rank by the beads", () => {
    for (const [name, dc] of [["Fan of Soothing Winds", 28], ["Fan of Soothing Winds (Greater)", 34]]) {
        const plan = first(name);
        assert.deepEqual([done(plan), plan.dc, plan.castActions, plan.castArea, plan.castAddTraits, plan.choices.length, plan.notes], [true, dc, 3, { type: "cone", value: 30 }, ["air"], 3, undefined], name);
        assert.deepEqual(castChanges(plan, plan.choices[0], ALL).options, { addTraits: ["air"], area: { type: "cone", value: 30 }, actions: 3 });
    }
});

test("Gate Attenuator: the chosen element's spell gains that element's trait (Thunderstrike metal); the Greater and Major ones' spells have it already", () => {
    const plan = first("Gate Attenuator");
    assert.deepEqual([done(plan), plan.castElementTrait, plan.choices.map((choice) => choice.element)], [true, true, ["air", "earth", "fire", "metal", "water", "wood"]]);
    const thunder = plan.choices.find((choice) => choice.spell.name === "Thunderstrike");
    assert.deepEqual(castChanges(plan, thunder, ALL).options, { addTraits: ["metal"] });
    for (const name of ["Gate Attenuator (Greater)", "Gate Attenuator (Major)"]) assert.deepEqual([done(first(name)), first(name).castElementTrait], [true, undefined], name);
});

test("Shining Wayfinder: its Bless's aura grows 5 feet a step (its single concentrate action once a turn, the spell's Sustain button)", () => {
    const plan = compileActivations(item("Shining Wayfinder"), { spells })[1].plan;
    assert.deepEqual([done(plan), plan.spell.name, plan.castGrowth, plan.castLines.length, plan.notes], [true, "Bless", { feet: 5 }, 1, undefined]);
    assert.deepEqual(castChanges(plan, {}, ["growth"]).options, { growth: { feet: 5 } });
});

test("Everburning Coal: Wall of Ice made fire — its fire trait for cold and water, its fire damage; its sections' weakness and evaporating card lines", () => {
    const plan = compileActivations(item("Everburning Coal"), { spells }).map((entry) => entry.plan).find((one) => one?.spell?.name === "Wall of Ice");
    assert.deepEqual([done(plan), plan.castAddTraits, plan.castWithoutTraits, plan.castDamageType.type, plan.castLines.length, plan.notes], [true, ["fire"], ["cold", "water"], "fire", 2, undefined]);
    assert.deepEqual(castChanges(plan, {}, ALL).options, { withoutTraits: ["cold", "water"], addTraits: ["fire"] });
});

test("Animate Dreamer's Unleash Spell: its Spell Reservoir's spell cast at its own numbers (+25, DC 33) at a creature within 120 feet — the spell module's reservoirCast", () => {
    const plan = compileActivations(item("Animate Dreamer"), { spells }).map((entry) => entry.plan).find((one) => one?.objects?.op === "cast-reservoir");
    assert.deepEqual([done(plan), routeOf(plan), plan.objects], [true, "objects", { op: "cast-reservoir", self: true, attack: 25, dc: 33, within: 120 }]);
});

test("Phoenix Fighting Fan: Quandary at DC 34 for a minute, kept up by its user's Strikes with the fan (castSustain by strike)", () => {
    const plan = compileActivations(item("Phoenix Fighting Fan"), { spells })[0].plan;
    assert.deepEqual([done(plan), plan.spell.name, plan.dc, plan.castDuration.value, plan.castSustain, plan.castLines.length], [true, "Quandary", 34, 1, { by: "strike" }, 2]);
});

test("strike sustain: a turn after the cast's without a Strike ends the cast's Effects; one with a Strike, or the cast's own turn, keeps them", async () => {
    const { endIfNotStruck } = await import("../scripts/strike-sustain.js");
    const made = [];
    const effect = (name) => ({ name, system: { context: { origin: { item: "Spell.1" } } }, delete: async () => made.push(`deleted ${name}`) });
    const target = { itemTypes: { effect: [effect("Quandary")] } };
    const flags = new Map();
    const user = { name: "Fan User", setFlag: async (_m, key, value) => flags.set(key, value), unsetFlag: async (_m, key) => flags.delete(key), itemTypes: { effect: [] } };
    const saved = { game: globalThis.game, canvas: globalThis.canvas, ChatMessage: globalThis.ChatMessage };
    globalThis.game = { actors: [user, target], combat: null };
    globalThis.canvas = { scene: { tokens: [] } };
    globalThis.ChatMessage = { create: async (data) => made.push(data.content), getSpeaker: () => ({}) };
    try {
    const flag = { spellUuid: "Spell.1", weaponId: "fan", name: "Phoenix Fighting Fan", combatId: "C", from: 1, struck: null };
    flags.set("strikeSustain", flag);
    assert.equal(await endIfNotStruck(user, flag, { id: "C", round: 1 }), null);
    assert.equal(await endIfNotStruck(user, { ...flag, struck: 2 }, { id: "C", round: 2 }), null);
    await endIfNotStruck(user, flag, { id: "C", round: 2 });
    assert.deepEqual([made[0], flags.has("strikeSustain"), /didn't Strike/.test(made[1])], ["deleted Quandary", false, true]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Dreadsmoke Thurible: Mist's smoke the ability module's zone round its user for the minute, concealed inside; undead and void effects seeing through it card lines", () => {
    const plan = compileActivations(item("Dreadsmoke Thurible"), { spells })[0].plan;
    assert.deepEqual([done(plan), routeOf(plan), plan.zone.area, plan.zone.centre, plan.zone.concealed, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.notes.length], [true, "zone", { type: "burst", value: 20 }, "self", true, 1, "minutes", 3]);
});
