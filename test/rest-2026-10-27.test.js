// The adventure books' other entries (2026-10-27, docs/needs.md): counteracting, choices on the card, objects, casts with the item's changes,
// actions, creatures made or controlled, information, minds and speech — the readings of src/compiler/adventure-readings.js, and the card
// parts they need (src/live/cast-card.js castLinks and castDamage, src/live/action-card.js mythic proficiency).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { oneOff } from "../src/compiler/one-offs.js";
import { withAdventureReading } from "../src/compiler/adventure-readings.js";
import { notesChecked } from "../src/compiler/notes-checked.js";
import { castLinkSource, castLinksWords } from "../src/live/cast-card.js";
import { castDamageSource } from "../src/live/card.js";
import { actionText } from "../src/live/action-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const effects = readDocuments(path.join(PACKS, "equipment-effects")).filter((doc) => doc.collection === "items");
const spells = readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
// (The spells, for casts read by the spell's name: Weapon Storm, Speak with Animals.)
const options = { spells: spellIndex(spells) };
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;

test("a missile's other damage at one creature: Cape of Justice's Force Shuriken, the ways card at any target or at the offender", () => {
    const shuriken = activation("Cape of Justice", "Force Shuriken");
    assert.deepEqual([done(shuriken), routeOf(shuriken), shuriken.ways.map((way) => way.name)], [true, "ways", ["At any target", "At its designated offender"]]);
    assert.deepEqual(shuriken.ways.map((way) => way.plan.resolution.sharedDamage.components[0].formula), ["1d4+1", "2d4+2"]);
    for (const way of shuriken.ways) {
        assert.deepEqual([done(way.plan), way.plan.resolution.outcomes.success.manualInstructions], [true, undefined]);
        assert.match(way.plan.notes.join(" "), /Demoralize it as a free action/);
    }
});

test("a cast with PF2e's own Effects for it: Assassin's Bracers' Focus on the Doomed, its user's mark and the creature's fear penalty", () => {
    for (const grade of ["I", "II", "III"]) {
        const focus = activation(`Assassin's Bracers (Type ${grade})`, "Focus on the Doomed");
        assert.deepEqual([done(focus), routeOf(focus), focus.spell.name, focus.castLinks.map((link) => [link.on, link.label])], [true, "cast", "Invisibility", [["user", "Focus on the Doomed"], ["target", "Focus on the Doomed (Fear Penalty)"]]], grade);
        assert.equal(focus.castLinks[1].within, 30);
        assert.match(focus.castNote.text, /can still see it/);
    }
    const link = activation("Assassin's Bracers (Type I)", "Focus on the Doomed").castLinks;
    assert.match(castLinksWords(link), /Focus on the Doomed on its user, Focus on the Doomed \(Fear Penalty\) on the creature targeted/);
    // (PF2e's Effect, its TokenMark at the creature designated, its origin the bracers — its bonus PF2e reads from the bracers' own flag.)
    const template = effects.find((entry) => `Compendium.pf2e.equipment-effects.Item.${entry._id}` === link[0].uuid);
    const source = castLinkSource(template, link[0], { markUuid: "Scene.s.Token.t", item: { name: "Assassin's Bracers (Type I)", uuid: "Actor.a.Item.b" }, user: { actorUuid: "Actor.a", tokenUuid: "Scene.s.Token.u" } });
    assert.deepEqual([source.system.rules.find((rule) => rule.key === "TokenMark").uuid, source.system.context.origin.item], ["Scene.s.Token.t", "Actor.a.Item.b"]);
});

test("a stance on the mat and its shape: Mat of Resilience's Sturdy Foundation, PF2e's off-guard immunity; Steady Ground, the map's", () => {
    for (const name of ["Mat of Resilience", "Mat of Resilience (Greater)"]) {
        const stance = activation(name, "Sturdy Foundation");
        const note = success(stance).noteEffects[0];
        assert.deepEqual([done(stance), stance.item.recipient, note.rules], [true, "targets", [{ key: "Immunity", type: "off-guard" }]], name);
        const ground = activation(name, "Steady Ground");
        assert.equal(done(ground), true);
    }
    assert.match(activation("Mat of Resilience (Greater)", "Steady Ground").notes[0], /20-foot square or a 40-foot/);
});

test("casts with the item's changes: the pouch's roll a one-off, the helm's electricity, the brush's DC and holy creatures, the bow's own immunity", () => {
    const bones = activation("Osteomancer's Pouch", "Roll the Bones");
    assert.deepEqual([done(bones), routeOf(bones), Boolean(oneOff("Osteomancer's Pouch: Roll the Bones"))], [true, "cast", true]);
    assert.match(bones.notes.join(" "), /two 1s/);
    const storm = activation("Sacred Valkyrie Helm", "Storm's Arms");
    assert.deepEqual([done(storm), routeOf(storm), storm.ways.map((way) => way.plan.castDamage ?? null)], [true, "ways", [null, { type: "electricity" }]]);
    assert.deepEqual(storm.ways.map((way) => [way.plan.spell.name, way.plan.rank, routeOf(way.plan)]), [["Weapon Storm", 9, "cast"], ["Weapon Storm", 9, "cast"]]);
    const brush = activations("Songbird's Brush")[0];
    assert.deepEqual([done(brush), brush.dc, brush.castTraits.immune], [true, 34, ["holy"]]);
    const arrow = activation("Dragonfire Halfbow", "Dragon's Arrow");
    assert.deepEqual([done(arrow), arrow.dc, arrow.rank, arrow.castTraits.user, arrow.castTraits.immune], [true, 29, 5, true, []]);
    // (Raven Band: the cast as live play reads it — with the spell module's reads; without them the user's speech ruling's note Effect.)
    assert.equal(done(activations("Raven Band")[0]), true);
    const raven = withAdventureReading({ builtin: "cast-spell", spell: { name: "Speak with Animals" }, notes: ["birds"], partial: true }, { name: "Raven Band", words: "When you stroke the kadlaka feather, the raven band gives you the effects of Speak with Animals, except that you can speak with and understand only birds, not other animals." });
    assert.deepEqual([done(raven), raven.notes, raven.castNote.duration.value, raven.castNote.duration.unit], [true, undefined, 1, "hours"]);
    // (Speak with Animals lasts the hour its note does.)
    assert.equal(spells.find((entry) => entry.name === "Speak with Animals").system.duration.value, "1 hour");
});

test("all of a spell's damage of one type: PF2e's DamageAlteration on its caster for that spell, to the end of its next turn", () => {
    const source = castDamageSource({ type: "electricity" }, "Weapon Storm", { item: { name: "Sacred Valkyrie Helm" } });
    assert.deepEqual(source.system.rules, [{ key: "DamageAlteration", mode: "override", property: "damage-type", selectors: ["spell-damage"], value: "electricity", predicate: ["item:slug:weapon-storm"] }]);
    assert.deepEqual([source.system.duration.value, source.system.duration.unit, source.system.duration.expiry], [1, "rounds", "turn-end"]);
    // (Weapon Storm's slug is what the predicate names.)
    assert.equal(spells.find((entry) => entry.name === "Weapon Storm").system.slug ?? "weapon-storm", "weapon-storm");
});

test("a wall of stone tied to its user, a one-off; two spells at rank 5 for a slot of that rank: Telekinetic Converters' Mind Over Matter", () => {
    const wall = activations("Cavern's Heart")[0];
    assert.deepEqual([done(wall), routeOf(wall), wall.spell.name, wall.rank, Boolean(oneOff("Cavern's Heart"))], [true, "cast", "Wall of Stone", 7, true]);
    const mind = activation("Telekinetic Converters", "Mind Over Matter");
    assert.deepEqual([done(mind), routeOf(mind), mind.choices.map((choice) => [choice.spell.name, choice.rank]), mind.tradition, mind.spend, mind.castDC.from], [true, "cast", [["Telekinetic Haul", 5], ["Telekinetic Maneuver", 5]], "occult", { spellSlot: { rank: 5 } }, "spell"]);
});

test("speech, minds and information: the briolette's message, the diadem's pool, the sparrow's map, the astrolabes, the cresset's head", () => {
    const gem = compileItem(item("Whisper Briolette"));
    assert.deepEqual([done(gem), success(gem).noteEffects[0].label], [true, "Telepathic message"]);
    const diadem = activations("Moonstone Diadem")[0];
    assert.deepEqual([done(diadem), routeOf(diadem), diadem.ways.map((way) => routeOf(way.plan))], [true, "ways", ["whisper", "item"]]);
    const sparrow = compileItem(item("Marvelous Miniature, Swift Sparrow"));
    assert.deepEqual([done(sparrow), routeOf(sparrow)], [true, "whisper"]);
    assert.match(sparrow.whisper.text, /30-foot burst/);
    for (const [name, steady] of [["Astrolabe of the Falling Stars", false], ["Standard Astrolabe", true]]) {
        const calculate = activation(name, "Calculate");
        assert.deepEqual([done(calculate), routeOf(calculate), /steady ground/.test(calculate.whisper.text)], [true, "whisper", steady], name);
    }
    const head = activations("Cresset of Grisly Interrogation")[1];
    assert.deepEqual([done(head), routeOf(head), head.trigger.recharge, head.trigger.frequency.max], [true, "whisper", { value: 1, unit: "hours" }, 3]);
    assert.match(head.whisper.text, /DC 25/);
});

test("objects: Vernai Shell's Retrieve Item and its minute's wait; the recording rods checked; Quickmelt Slick's counteract card", () => {
    const retrieve = activation("Vernai Shell", "Retrieve Item");
    assert.deepEqual([done(retrieve), retrieve.trigger.recharge], [true, { value: 1, unit: "minutes" }]);
    for (const name of ["Recording Rod (Basic)", "Recording Rod (Reusable)"]) assert.deepEqual([done(compileItem(item(name))), notesChecked(name)], [true, true], name);
    for (const [name, modifier, rank] of [["Quickmelt Slick (Lesser)", 6, 1], ["Quickmelt Slick (Moderate)", 8, 2], ["Quickmelt Slick (Greater)", 19, 6]]) {
        const slick = compileItem(item(name));
        assert.deepEqual([done(slick), routeOf(slick), slick.item.counteract.modifier, slick.item.counteract.rank, slick.item.counteract.free.name], [true, "counteract", modifier, rank, "the magical ice and snow"], name);
    }
    assert.match(compileItem(item("Quickmelt Slick (Lesser)")).item.counteract.notes[0], /1 foot deep in a 5-foot square/);
});

test("a choice on the card: Elsie's vim lowers one condition a step, Token of Salt and Earth hides from one kind, Aeon Stone's capture a one-off", () => {
    const vim = compileItem(item("Elsie's Excellent Bottled Vim"));
    assert.deepEqual([done(vim), routeOf(vim), vim.ways.map((way) => way.name)], [true, "ways", ["Clumsy", "Drained", "Enfeebled", "Sickened"]]);
    const drained = success(vim.ways[1].plan).noteEffects[0];
    assert.deepEqual([drained.duration.value, drained.duration.unit, drained.rules.map((rule) => [rule.key, rule.slug, rule.selectors[0], rule.mode])], [8, "hours", [["AdjustModifier", "drained", "con-based", "add"], ["AdjustModifier", "drained", "hp", "add"]]]);
    const token = activation("Token of Salt and Earth", "Hide from the Hateful");
    assert.deepEqual([done(token), token.ways.map((way) => way.name)], [true, ["Fiends", "Fey", "Undead"]]);
    const note = success(token.ways[2].plan).noteEffects[0];
    assert.deepEqual([note.duration.value, note.rules], [1, [{ key: "RollOption", option: "air-ends-on:hostile" }]]);
    assert.match(note.text, /undead trait/);
    const prism = activations("Aeon Stone (Rainbow Prism)");
    assert.deepEqual([done(prism[0]), prism[0].decided, done(prism[1])], [true, "one-off", true]);
});

test("its user's own actions: Needle of Undeath's Make an Impression or Request at +2, Spindle Key's Pick a Lock with Occultism or at mythic proficiency", () => {
    const needle = activation("Needle of Undeath", "Speak with Undead");
    assert.deepEqual([done(needle), routeOf(needle), needle.action.slugs, needle.action.bonus], [true, "action", ["make-an-impression", "request"], { value: 2, type: "item" }]);
    const breach = activation("Spindle Key", "Breach");
    assert.deepEqual([done(breach), routeOf(breach), breach.ways.map((way) => [routeOf(way.plan), way.plan.action.statistic, Boolean(way.plan.action.mythic), way.plan.spend ?? null])], [true, "ways", [["action", "occultism", false, null], ["action", "occultism", true, { mythicPoints: 1 }]]]);
    assert.equal(actionText(breach.ways[1].plan.action), "Pick a Lock using Occultism at mythic proficiency (its level + 10)");
});

test("creatures made or controlled: the treat bag's treats and rustle, the clockwork spy, the rubber bear, the golem's inscription, the spurred mount", () => {
    const treats = activation("Motivating Treat Bag", "Toss a Treat");
    assert.deepEqual([done(treats), treats.ways.length], [true, 5]);
    assert.deepEqual(success(treats.ways[1].plan).effects[0], { kind: "temp-hp", formula: "1d6+6", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } });
    assert.deepEqual([treats.ways[2].plan.item.reduce, treats.ways[3].plan.item.reduce], [[{ slug: "sickened", by: 2, who: "targets" }], [{ slug: "frightened", by: 1, who: "targets" }]]);
    const rustle = activation("Motivating Treat Bag", "Rustle the Bag");
    assert.deepEqual([done(rustle), rustle.item.recipient, success(rustle).modifiers[0].selector, success(rustle).modifiers[0].value], [true, "targets", "all-speeds", 5]);
    const spy = activations("Winder's Ring")[1];
    assert.deepEqual([done(spy), routeOf(spy), spy.slainWait, spy.creatures[0].name], [true, "conjure", { value: 1, unit: "weeks" }, "Clockwork Spy"]);
    const bear = activations("Wondrous Figurine (Rubber Bear)")[0];
    assert.deepEqual([done(bear), bear.creatures[0].own.conditions, bear.creatures[0].own.rules[0].value], [true, ["off-guard"], -10]);
    const stylus = activations("Golem Stylus")[0];
    assert.deepEqual([done(stylus), stylus.trigger.frequency.per, stylus.ways.map((way) => routeOf(way.plan))], [true, "hour", ["save", "counteract"]]);
    assert.deepEqual(success(stylus.ways[0].plan).effects, []);
    assert.deepEqual(stylus.ways[0].plan.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.duration.value]), [["controlled", 1]]);
    assert.deepEqual([stylus.ways[1].plan.item.counteract.modifier, stylus.ways[1].plan.item.counteract.rank, stylus.ways[1].plan.item.counteract.fromUser], [10, 5, { modifier: "arcana", better: true }]);
    const spurs = activations("Heedless Spurs")[0];
    const spurred = success(spurs).noteEffects[0];
    assert.deepEqual([done(spurs), success(spurs).effects, spurred.whilePersistent, spurred.duration.value, spurred.rules[0].key], [true, [], "bleed", 1, "GrantItem"]);
});

test("saves with rows the GM had: Ghost Chasing Tiger's possession, Gearblade's limb, Flay Time's future; a healing tree, a weather ritual, the runelord's focus", () => {
    const tiger = activation("Four-Tiger Blade", "Ghost Chasing Tiger");
    assert.deepEqual([done(tiger), tiger.resolution.outcomes.failure.noteEffects[0].duration.value, tiger.resolution.outcomes.criticalFailure.noteEffects[0].label], [true, 1, "Possession counteracted"]);
    assert.ok(Object.values(tiger.resolution.outcomes).every((row) => !row.manualInstructions));
    const gear = activations("Gearblade")[0];
    assert.deepEqual([done(gear), gear.resolution.outcomes.criticalFailure.noteEffects[0].label, gear.resolution.outcomes.failure.damage.formulas[0].formula], [true, "Limb unusable", "3d12[bludgeoning]"]);
    const flay = activation("Timeflaying Blade", "Flay Time");
    const future = flay.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([done(flay), flay.spend, future.duration.valueRoll, future.duration.unit, flay.resolution.outcomes.failure.noteEffects[0].duration.unit], [true, { mythicPoints: 1 }, "1d4", "rounds", "minutes"]);
    const tree = activation("Branch of the Great Sugi", "A Multitude of Branches");
    assert.deepEqual([done(tree), tree.item.recipient, success(tree).effects], [true, "targets", [{ kind: "heal", formula: "3d8+8" }]]);
    const weather = activations("Sky-Piercing Bow")[2];
    assert.deepEqual([done(weather), routeOf(weather)], [true, "item"]);
    const rule = activation("Runic Skullcap", "Rewards of Rule");
    assert.deepEqual([done(rule), rule.spend, success(rule).noteEffects[0].label], [true, { mythicPoints: 1 }, "Rewards of Rule"]);
    assert.match(success(rule).noteEffects[0].text, /wrath: Vengeful Glare/i);
});
