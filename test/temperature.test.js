// Protection from heat and cold (src/compiler/temperature.js, scripts/temperature.js, 2026-10-25): read from the items' words into the
// environment module's shape — counts, from the temperature felt to the one it counts as — on the item card's Effect for its time, or from
// api.temperatureProtections(actor) for what its worn, held and invested items do.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ENVIRONMENT_ID, plainOf, readTemperature, temperatureDuration } from "../src/compiler/temperature.js";
import { temperatureEffectSource, temperatureLine } from "../src/live/card.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });

test("the reading: protected levels count as mild (or normal with mild), steps down, one step lower, fatigue hours", () => {
    assert.deepEqual(readTemperature("For 24 hours, you are protected from the effects of severe heat. You're also protected from extreme heat.").counts, { "severe-heat": "mild-heat", "extreme-heat": "mild-heat" });
    assert.deepEqual(readTemperature("While wearing it, you are protected from mild and severe heat (but not extreme heat).").counts, { "mild-heat": "normal", "severe-heat": "normal" });
    assert.deepEqual(readTemperature("You negate the damage from severe environmental cold, reduce the damage from extreme cold to that of severe cold, and reduce the damage from incredible cold to extreme cold.").counts, { "severe-cold": "mild-cold", "extreme-cold": "severe-cold", "incredible-cold": "extreme-cold" });
    assert.deepEqual(readTemperature("For 8 hours after applying the rime, you treat extreme cold as severe cold.").counts, { "extreme-cold": "severe-cold" });
    // (Extreme cold protected: severe too.)
    assert.deepEqual(readTemperature("You also suffer no effects from extreme cold and severe heat.").counts, { "extreme-cold": "mild-cold", "severe-cold": "mild-cold", "severe-heat": "mild-heat" });
    assert.deepEqual(readTemperature("While wielded, you treat the effects of environmental cold as one degree lower.").counts, { "mild-cold": "normal", "severe-cold": "mild-cold", "extreme-cold": "severe-cold", "incredible-cold": "extreme-cold" });
    const cloak = readTemperature("Increase the time it takes to become Fatigued from temperature effects by 2 hours. A traveler's cloak has no effect at extreme or incredible temperatures.");
    assert.deepEqual([cloak.counts, cloak.fatigueHours, cloak.fatigueUpTo], [{}, 2, 2]);
    // (Not a protection.)
    assert.equal(readTemperature("The cloak offers no protection from extreme or incredible cold."), null);
    // (Its time: the one nearest before its protection.)
    assert.deepEqual(temperatureDuration("", ["For 1 hour, you have cold resistance 3, and for 8 hours, the treat negates the damage you would take from severe environmental cold."]), { mode: "fixed", value: 8, unit: "hours", expiry: "turn-start" });
});

test("a consumable's protection: the item card's own Effect for its time, flagged for the environment module", () => {
    const elixir = compileItem(item("Cooling Elixir (Moderate)"));
    assert.deepEqual([routeOf(elixir), elixir.partial, elixir.temperature.counts, elixir.temperature.duration.value], ["item", undefined, { "severe-heat": "mild-heat", "extreme-heat": "mild-heat" }, 24]);
    const effect = temperatureEffectSource(elixir.temperature, { item: { name: "Cooling Elixir (Moderate)" } });
    assert.deepEqual(effect.flags[ENVIRONMENT_ID].temperature, { counts: { "severe-heat": "mild-heat", "extreme-heat": "mild-heat" }, source: "Cooling Elixir (Moderate)" });
    assert.deepEqual([effect.system.duration.value, effect.system.duration.unit], [24, "hours"]);
    assert.equal(temperatureLine(elixir.temperature), "Severe heat counts as mild heat; Extreme heat counts as mild heat for 24 hours");
    // (Beside what else it reads; a sentence that says more stays left over here: Elixir of the Peaks' saves against high altitude — since
    // 2026-10-27 words on its note Effect, src/compiler/moving-readings.js, so the plan's whole.)
    const peaks = compileItem(item("Elixir of the Peaks (Lesser)"));
    assert.deepEqual([peaks.temperature.counts, peaks.temperature.only, peaks.partial], [{ "severe-cold": "mild-cold" }, "Only drunk while in mountainous terrain", undefined]);
    const finger = compileItem(item("Witch's Finger"));
    assert.deepEqual([finger.temperature.counts, finger.temperature.duration.value], [{ "severe-cold": "mild-cold", "extreme-cold": "severe-cold" }, 8]);
});

test("an activation's protection: Rime Jar's 8 hours (its Fatigued a note), Slithermaw's Bane's heat or cold its user's pick (its terrain parts notes)", () => {
    const jar = compileActivations(item("Rime Jar"))[0].plan;
    // (2026-10-27: its Fatigued from the cold the ways card's second button, item.reduce — src/compiler/book-strikes.js; no longer partial.)
    assert.deepEqual([jar.builtin, jar.temperature.counts, jar.temperature.duration.value, jar.partial, jar.ways[1].plan.item.reduce], ["ways", { "extreme-cold": "severe-cold" }, 8, undefined, [{ slug: "fatigued", by: "all" }]]);
    const bane = compileActivations(item("Slithermaw's Bane")).find((entry) => entry.activation.name === "Terrain Adaptation").plan;
    assert.deepEqual([bane.builtin, bane.ways.map((way) => way.name), bane.ways[1].plan.temperature.counts, bane.ways[0].plan.temperature.until, bane.partial], ["ways", ["Heat", "Cold"], { "severe-cold": "mild-cold", "extreme-cold": "mild-cold" }, "Until its user's next daily preparations", true]);
});

test("the environment module's API: worn, held and invested items as each needs; a sheet toggle's season; an ally's banner within its aura; the cloak's fatigue hours only where it works", async () => {
    // (The stand-in's own game kept for the tests after this one: only the environment module's weather here.)
    const previous = globalThis.game;
    const modules = new Map([["pf2e-automatic-environment-resolution", { api: { weather: () => ({ state: { temperature: scene.temperature } }) } }]]);
    globalThis.game = { ...(previous ?? {}), modules };
    try {
    const scene = { temperature: "severe-heat", grid: { size: 100, distance: 5 }, tokens: [] };
    const { temperatureProtections } = await import("../scripts/temperature.js");
    const own = (name, extra = {}) => ({ ...source(name), uuid: `${name}-${JSON.stringify(extra)}`, ...extra, system: { ...source(name).system, ...(extra.system ?? {}) } });
    const actorOf = (id, items, x, alliance = "party") => {
        const actor = { id, name: id, alliance, items, isAllyOf: (other) => other.alliance === alliance };
        const token = { id: `t-${id}`, actor, x, y: 0, width: 1, height: 1, parent: scene };
        actor.getActiveTokens = () => [token];
        scene.tokens.push(token);
        return actor;
    };
    const hat = own("Shade Hat", { isEquipped: true, isInvested: true });
    const coal = own("Everburning Coal", { system: { equipped: { carryType: "worn" } } });
    const cloak = own("Traveler's Cloak", { isEquipped: true });
    const ring = own("Sihedron Ring", { isEquipped: true, isInvested: false });
    const user = actorOf("user", [hat, coal, cloak, ring], 0);
    const sources = () => temperatureProtections(user, { temperature: scene.temperature }).map((entry) => entry.source);
    assert.deepEqual(sources(), ["Shade Hat", "Traveler's Cloak"], "the coal not held, the ring not invested");
    assert.deepEqual(temperatureProtections(user, { temperature: scene.temperature }).find((entry) => entry.source === "Shade Hat").counts, { "mild-heat": "normal", "severe-heat": "normal" });
    scene.temperature = "extreme-heat";
    assert.deepEqual(sources(), ["Shade Hat"], "the cloak's 2 hours not at extreme temperatures");
    // (A season picked on its sheet.)
    const shawl = own("Shawl of Seasons", { isEquipped: true, isInvested: true });
    shawl.system = { ...shawl.system, rules: shawl.system.rules.map((rule) => (rule.key === "RollOption" && rule.suboptions ? { ...rule, selection: "winter" } : rule)) };
    user.items.push(shawl);
    assert.deepEqual(temperatureProtections(user, { temperature: scene.temperature }).find((entry) => entry.source === "Shawl of Seasons").counts, { "severe-cold": "mild-cold" });
    // (An ally's banner: within 30 feet, not beyond; not a foe's.)
    const banner = own("Banner of the Restful", { isEquipped: true, system: { equipped: { carryType: "held" } } });
    const ally = actorOf("ally", [banner], 300);
    actorOf("foe", [own("Banner of the Restful", { isEquipped: true })], 100, "opposition");
    assert.ok(sources().includes("Banner of the Restful (ally's aura)"));
    assert.ok(!sources().some((name) => /foe's aura/.test(name)));
    ally.getActiveTokens()[0].x = 1000;
    assert.ok(!sources().some((name) => /ally's aura/.test(name)), "out of its aura");
    } finally {
        globalThis.game = previous;
    }
});

test("difficult terrain ignored: PF2e's own rule, its features ice, snow and plants (the environment module's undergrowth), greater too when named", () => {
    const winter = compileItem(item("Winterstep Elixir (Lesser)"));
    const [entry] = winter.item.ruleEffects;
    assert.deepEqual(entry.rules.map((rule) => [rule.path, rule.value.feature]), [["system.movement.terrain.difficult.ignored", "ice"], ["system.movement.terrain.difficult.ignored", "snow"]]);
    assert.equal(winter.partial, undefined);
    const cloak = compileActivations(item("Underbrush Cloak")).find((each) => each.activation.name === "One with the Woods").plan;
    assert.deepEqual([cloak.item.ruleEffects[0].rules[0].value.feature, cloak.item.ruleEffects[0].duration.value, cloak.item.ruleEffects[0].duration.unit, cloak.noteOnly], ["undergrowth", 1, "minutes", undefined]);
    const pattern = compileActivations(item("Frostwalker Pattern"))[0].plan.item.ruleEffects[0];
    assert.ok(pattern.rules.some((rule) => rule.path === "system.movement.terrain.greater.ignored" && rule.value.feature === "ice"));
    assert.match(pattern.words, /doesn't risk falling when crossing ice/);
    // (Three Bird Pinion's levitation, 2026-10-26: both kinds of terrain, any feature, for its minute — whole.)
    const pinion = compileItem(item("Three Bird Pinion"));
    assert.deepEqual([pinion.item.ruleEffects[0].rules.map((rule) => [rule.path, rule.value.feature]), pinion.item.ruleEffects[0].duration.value, pinion.item.ruleEffects[0].duration.unit, Boolean(pinion.partial)], [[["system.movement.terrain.difficult.ignored", "all"], ["system.movement.terrain.greater.ignored", "all"]], 1, "minutes", false]);
    // (Dragonaut's Wingsuit's Drake's Glide: its 20-foot fly Speed to the end of the turn for its two moves, a line of the card.)
    const glide = compileActivations(item("Dragonaut's Wingsuit")).find((each) => each.activation.name === "Drake's Glide").plan;
    assert.deepEqual([routeOf(glide), glide.item.speeds.map((speed) => [speed.type, speed.value, speed.duration.expiry]), glide.notes, Boolean(glide.partial)], ["item", [["fly", 20, "turn-end"]], ["Then take 2 move actions, each a Fly or a Stride (its own moves on the map)."], false]);
});
