// Items wired to the other modules' new contracts (2026-10-28: the ability module's zone sides, filters and exit saves, its skill checks at a
// fixed DC, secret checks, damage options and note Effects' escape and rolled durations; the core's ignored resistances and immunities; the
// environment module's transparent walls): each item's old stand-in — a card line, a note, its partial — gone for the new field.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("Cube of Nex: its crossing saves either way (pushed back out, pulled back in), the living ones by only.notTraits, its walls of force transparent — done", () => {
    const [walls] = activations("Cube of Nex");
    assert.deepEqual([done(walls), walls.ways.every((way) => done(way.plan))], [true, true]);
    const [, nonliving, living, , force] = walls.ways.map((way) => way.plan);
    const [inward, outward] = nonliving.zone.saves;
    assert.deepEqual([inward.when, outward.when, inward.only, outward.only], [["enter"], ["exit"], { traits: ["construct", "undead"] }, { traits: ["construct", "undead"] }]);
    assert.deepEqual([inward.plan.resolution.outcomes.failure.forcedMovement.kind, outward.plan.resolution.outcomes.failure.forcedMovement.kind, outward.plan.resolution.outcomes.criticalFailure.forcedMovement.direction], ["push", "pull", "toward"]);
    assert.deepEqual(living.zone.saves.map((save) => save.only), [{ notTraits: ["construct", "undead"] }, { notTraits: ["construct", "undead"] }]);
    assert.deepEqual([routeOf(force), force.structure.transparent, "invisible" in force.structure], ["walls-around", true, false]);
});

test("Lesser Cube of Nex: its crossing saves on entering and leaving, the living face's by only.notTraits (no card to dismiss), its walls transparent", () => {
    const [cube] = activations("Lesser Cube of Nex");
    assert.equal(done(cube), true);
    const [, nonliving, living, , force] = cube.ways.map((way) => way.plan);
    // (Crossing saves one each way since the merge, 2026-10-29: in, pushed back out; out, pulled back in.)
    assert.deepEqual([nonliving.zone.saves.map((save) => save.when), living.zone.saves.map((save) => save.when), living.zone.saves[0].only], [[["enter"], ["exit"]], [["enter"], ["exit"]], { notTraits: ["construct", "undead"] }]);
    assert.ok(!living.zone.notes.some((note) => /dismiss its card/.test(note)));
    // (Its walls on the walls-around route since the merge, plan.structure — 2026-10-29.)
    assert.equal(force.structure.transparent, true);
});

test("The Eclipse, Spiral Athame, The Uprising, Hunter's Dawn: done on the ability module's who \"foes\", only.all, condition filters and damage options", () => {
    const [eclipse] = activations("The Eclipse");
    assert.deepEqual([done(eclipse), eclipse.item.alsoZone.zone.inside[0].who], [true, "foes"]);
    const [, ward] = activations("Spiral Athame");
    assert.deepEqual([done(ward), ward.zone.saves[0].only], [true, { all: ["undead", "summoned"] }]);
    assert.ok(!ward.zone.notes.some((note) => /ability module/.test(note)));
    const [mob] = activations("The Uprising");
    assert.deepEqual([done(mob), mob.zone.saves[1].only, mob.zone.damage[0].only], [true, { lacks: { conditions: ["grabbed"] } }, { conditions: ["grabbed"] }]);
    const [javelin] = activations("Hunter's Dawn");
    assert.equal(done(javelin), true);
    for (const way of javelin.ways) {
        assert.deepEqual([done(way.plan), way.plan.damageOptions, way.plan.thenSave.damageOptions], [true, ["item:rune:property:ghost-touch"], ["item:rune:property:ghost-touch"]]);
        assert.ok(!way.plan.notes.some((note) => /by hand/.test(note)));
    }
});

test("Globe of Shrouds: its haze around its user — its allies Concealed with +2 status to Stealth, an invisible foe only concealed, both kept till their next turn's start once they leave", () => {
    const [haze] = activations("Globe of Shrouds");
    assert.deepEqual([done(haze), routeOf(haze), haze.zone.area, haze.zone.centre], [true, "zone", { type: "emanation", value: 20 }, "self"]);
    const [allies, foes] = haze.zone.inside;
    assert.deepEqual([allies.who, allies.lingers, allies.rules.map((rule) => [rule.key, rule.selector ?? rule.uuid, rule.value ?? null])], ["allies", "turn-start", [["GrantItem", "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W", null], ["FlatModifier", "stealth", 2]]]);
    assert.deepEqual([foes.who, foes.lingers, foes.rules[0].predicate, foes.rules[0].reevaluateOnUpdate], ["foes", "turn-start", ["self:condition:invisible"], true]);
});

test("Strand of the Seven Births: the image's light a zone for the hour — its allies' +2 to saves against auditory effects, its foes' DC 23 Will save on entering or ending a turn there, Fascinated and the penalty while inside", () => {
    const [image] = activations("Strand of the Seven Births");
    assert.deepEqual([done(image), routeOf(image), image.zone.area, image.zone.lasts.value, image.zone.lasts.unit], [true, "zone", { type: "burst", value: 20 }, 1, "hours"]);
    assert.deepEqual([image.zone.inside[0].who, image.zone.inside[0].rules[0].selector, image.zone.inside[0].rules[0].value, image.zone.inside[0].rules[0].predicate], ["allies", "saving-throw", 2, ["item:trait:auditory"]]);
    const [save] = image.zone.saves;
    assert.deepEqual([save.when, save.who, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value, save.plan.trigger.immunity.duration], [["enter", "end"], "foes", "will", 23, { value: 24, unit: "hours" }]);
    const [held] = save.plan.resolution.outcomes.failure.noteEffects;
    assert.deepEqual([held.whileInside, held.rules[0].uuid, held.rules[2].value], [true, "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg", -2]);
});

test("Portable Seal (all three): its save on a summoned creature entering it or making a melee Strike into it (when strike-into) — done", () => {
    for (const grade of ["Lesser", "Moderate", "Major"]) {
        const seal = compileItem(item(`Portable Seal (${grade})`), options);
        assert.deepEqual([done(seal), seal.zone.saves[0].when, seal.zone.saves[0].only], [true, ["enter", "strike-into"], { traits: ["summoned"] }], grade);
        assert.ok(!(seal.notes ?? []).length && !seal.zone.notes.some((note) => /by hand/.test(note)), grade);
    }
});

test("Godsbreath Bow: its ranged Strike with the bow, on a hit its vortex at the creature hit for 3 minutes — difficult terrain, the extra 1d8 on a physical ranged attack's damage inside, the Fortitude save for one flying through", async () => {
    const { strikeLines } = await import("../src/live/strike-card.js");
    const [bow] = activations("Godsbreath Bow");
    assert.deepEqual([done(bow), bow.strike.range, bow.strike.own, bow.strike.damage, bow.strike.zoneAt, bow.trigger.frequency.per], [true, "ranged", true, [], "target", "day"]);
    const zone = bow.strike.zone;
    assert.deepEqual([zone.area, zone.lasts.value, zone.lasts.unit, zone.terrain, zone.incoming], [{ type: "burst", value: 30 }, 3, "minutes", [{ movement: ["walk", "fly"], difficulty: 2 }], { damage: "1d8[bludgeoning]", attacks: ["ranged", "physical"] }]);
    const [fly] = zone.saves;
    assert.deepEqual([fly.when, fly.own, fly.only, fly.plan.resolution.check.statistic, fly.plan.resolution.check.against.value, fly.plan.resolution.outcomes.failure.noteEffects[0].duration.expiry], [["enter", "move"], true, { moving: "fly" }, "fortitude", 34, "turn-end"]);
    // (Its own line on the Strike card, not the aura's.)
    const lines = strikeLines(bow);
    assert.ok(lines.some((line) => /^On a hit: its vortex, a 30-foot burst/.test(line)) && !lines.some((line) => /aura on the target/.test(line)));
});

test("Mindsponge's surgery: its user's DC 28 Medicine check at the creature (the ability module's fixed-DC check card), worded so on the card", async () => {
    const { saveText } = await import("../src/live/poison-card.js");
    const absorb = compileActivations(item("Mindsponge"), options).find((entry) => entry.activation.name === "Absorb Memories").plan;
    const [prepare] = absorb.ways.map((way) => way.plan);
    assert.deepEqual([done(absorb), done(prepare), routeOf(prepare), prepare.resolution.check, saveText(prepare)], [true, true, "save", { roll: "skill", statistic: "medicine", against: { dc: "fixed", value: 28 } }, "DC 28 Medicine check"]);
});

test("Essence Prism: its secret check played (check.secret), its line saying so — done", () => {
    const [set] = activations("Essence Prism");
    assert.deepEqual([done(set), set.resolution.check.secret, set.checkChoices.every((choice) => choice.resolution.check.secret)], [true, true, true]);
    assert.ok(set.notes.some((note) => /blind roll/.test(note)) && !set.notes.some((note) => /the GM rolls it/.test(note)));
});

test("Paradigm Cube: its six colours on the ways card — the flat check a d20 table (a d6 table of the six below 11), or a Mythic Point for the colour and its enhancement; each a 60-foot zone of its allies' +2 for the minute", async () => {
    const { isTable } = await import("../src/live/table-card.js");
    const [cube] = activations("Paradigm Cube");
    assert.deepEqual([done(cube), routeOf(cube), cube.ways.length, cube.trigger.frequency.max, cube.once], [true, "ways", 12, 6, true]);
    const [red, , yellow, green, blue, indigo, mythicRed, mythicOrange, mythicYellow, , mythicBlue] = cube.ways;
    assert.deepEqual([red.frequency.max, red.frequencyKey, mythicRed.frequencyKey, mythicRed.plan.spend], [1, "red", "red", { mythicPoints: 1 }]);
    // (The flat check: 11 or more the colour picked, less the d6 of the six.)
    const flat = red.plan;
    assert.deepEqual([isTable(flat), flat.table.die, flat.table.rows.map((row) => [row.low, row.high, routeOf(row.plan)])], [true, "1d20", [[1, 10, "table"], [11, 20, "zone"]]]);
    const random = flat.table.rows[0].plan;
    assert.deepEqual([random.table.die, random.table.rows.map((row) => row.plan.zone.inside[0].label)], ["1d6", ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo"]]);
    const zone = flat.table.rows[1].plan.zone;
    assert.deepEqual([zone.area, zone.centre, zone.lasts.value, zone.lasts.unit, zone.inside.length, zone.inside[0].who, zone.inside[0].rules], [{ type: "emanation", value: 60 }, "self", 1, "minutes", 1, "allies", [{ key: "FlatModifier", selector: "intimidation", type: "item", value: 2, predicate: ["action:coerce"] }]]);
    // (Its mythic enhancements: mythic proficiency its level + 10; Yellow's frightened foes Slowed; Blue's failures' Stupefied in words.)
    assert.deepEqual(mythicRed.plan.zone.inside[0].rules[1], { key: "FlatModifier", selector: "saving-throw", type: "proficiency", slug: "paradigm-cube-mythic", label: "Paradigm Cube (mythic proficiency)", value: "@actor.level + 10", predicate: [{ or: ["item:trait:mental", "item:trait:incapacitation"] }] });
    assert.deepEqual(mythicOrange.plan.zone.inside[0].rules.map((rule) => rule.selector), ["performance", "perception", "diplomacy"]);
    assert.deepEqual([mythicYellow.plan.zone.inside[1].who, mythicYellow.plan.zone.inside[1].rules[0].predicate], ["foes", ["self:condition:frightened"]]);
    assert.deepEqual([mythicBlue.plan.zone.inside[1].who, mythicBlue.plan.zone.inside[1].rules, /Stupefied 2/.test(mythicBlue.plan.zone.inside[1].text)], ["foes", [], true]);
    assert.deepEqual([yellow.plan.table.rows[1].plan.zone.inside.length, green.plan.table.rows[1].plan.zone.inside[0].rules[0].selector, blue.plan.table.rows[1].plan.zone.inside[0].rules[0].predicate, indigo.plan.table.rows[1].plan.zone.inside[0].rules[0].predicate], [1, "lore-skill-check", ["action:sense-motive"], ["action:hide"]]);
    assert.ok(indigo.plan.table.rows[1].plan.zone.notes.some((note) => /^Darkness as 6th-rank Darkness/.test(note)));
});

test("Soulspark Candle: its flames past fire resistance and immunity, putting it out (the ability module ends its zones) with an hour before it's lit again; its undead limned by a zone's Effect kept a minute", () => {
    const [light, out, limn, blast] = activations("Soulspark Candle");
    assert.deepEqual([light, out, limn, blast].map(done), [true, true, true, true]);
    assert.deepEqual([out.item.putsOut, routeOf(out)], [{}, "item"]);
    // (Its undead limned: a zone of the light's size on its user, its Effect for undead but not haunts, kept a minute after leaving or the light's end.)
    assert.deepEqual([routeOf(limn), limn.zone.area, limn.zone.centre, limn.zone.lasts, limn.gate], ["zone", { type: "emanation", value: 40 }, "self", null, { lit: true }]);
    assert.deepEqual(limn.zone.inside.map(({ only, label, lingers, rules }) => ({ only, label, lingers, rules })), [{ only: { traits: ["undead"], lacks: { traits: ["haunt"] } }, label: "Limned in blue fire", lingers: { value: 1, unit: "minutes" }, rules: [] }]);
    // (Its flames: every fire resistance and immunity ignored, the candle out as it's used, its lighting (activation 0) waiting the hour.)
    assert.deepEqual([blast.resolution.ignoreResistance, blast.resolution.ignoreImmunity, blast.item.putsOut, blast.trigger.recharge], [[{ value: null, types: ["fire"] }], ["fire"], {}, { value: 1, unit: "hours", shared: [0], sharedWords: "lighting it" }]);
    assert.deepEqual([routeOf(blast), blast.onlyAgainst, blast.gate], ["save", { traits: ["undead"] }, { lit: true }]);
    assert.ok(blast.notes.some((note) => /\+35 check \(legendary\) to disable it/.test(note)));
});

test("Halcyon Heart: the netted demon's misfortune note Effect ends with its Escape at DC 44 (the ability module's note escape)", () => {
    const [net] = activations("Halcyon Heart");
    const demon = net.ifTarget.find((entry) => entry.degree === "success").noteEffects[0];
    assert.deepEqual([done(net), demon.escape, /Remove this/.test(demon.text)], [true, { dc: 44 }, false]);
});

test("Magnetic Suit (all three): attracting, its allies' bonus a zone on its wearer for the 10 minutes (who \"allies\"), beside its own Effect", () => {
    for (const [name, radius] of [["Magnetic Suit", 10], ["Magnetic Suit (Greater)", 15], ["Magnetic Suit (Major)", 20]]) {
        const suit = compileItem(item(name));
        const [attract, repel] = suit.ways.map((way) => way.plan);
        const zone = attract.item.alsoZone;
        assert.deepEqual([done(suit), attract.again, routeOf(attract), zone.zone.area, zone.zone.lasts.value, zone.zone.inside.map((entry) => entry.who), repel.item?.alsoZone], [true, undefined, "item", { type: "emanation", value: radius }, 10, ["allies"], undefined], name);
        assert.ok(!(attract.notes ?? []).some((note) => /card that follows/.test(note)), name);
    }
});

test("Dreaming Round: Unconscious once its Slowed reaches 3 (the ability module's escalate.atValue), no higher by it; waking the note Effect's", () => {
    const [round] = activations("Dreaming Round");
    for (const degree of ["failure", "criticalFailure"]) {
        const slowed = round.resolution.outcomes[degree].effects.find((effect) => effect.slug === "slowed");
        assert.deepEqual([slowed.duration.saveEnds.escalate.atValue, slowed.duration.saveEnds.max], [{ 3: "unconscious" }, 3], degree);
        assert.match(round.resolution.outcomes[degree].noteEffects[0].text, /^At Slowed 3 its actions are gone/);
    }
    assert.equal(done(round), true);
});

test("Penetrating Ammunition: its Strike card with the arrow, one attack roll at each creature in the 60-foot line (its natural 20 the first one's), every resistance 10 lower", async () => {
    const { volleyLines } = await import("../src/compiler/volley.js");
    const { strikeHint } = await import("../src/live/strike-card.js");
    const [ammo] = activations("Penetrating Ammunition");
    assert.deepEqual([done(ammo), routeOf(ammo), ammo.strike.ammo, ammo.strike.ignoreResistance, ammo.strike.volley], [true, "strike", true, { value: 10, types: ["*"] }, { each: "creature", area: "60-foot line", oneRoll: { count: null, naturalFirst: true } }]);
    assert.match(volleyLines(ammo.strike.volley)[0], /^One Strike at each creature in the 60-foot line targeted: one attack roll/);
    assert.match(strikeHint(ammo, "Ezren"), /at each creature targeted when it's readied: its one attack roll is each one's \(a natural 20 only the first one's\)\.$/);
    assert.ok(ammo.strike.lines.some((line) => /1d6 bleed/.test(line)) && ammo.strike.lines.some((line) => /last square/.test(line)));
});
