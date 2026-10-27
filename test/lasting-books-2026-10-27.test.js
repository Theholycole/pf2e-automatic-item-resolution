// The adventure books' sustained, later, dying and affliction items (2026-10-27, batch 3, docs/needs.md "lasting", "dying", "afflictions"): the
// readings src/compiler/lasting.js adds for them — counteract cards, note Effects, a toggle, a cast, a whisper, saves kept open for their
// Sustains, zones, ways cards and a revival —, and what the user's rulings make of the rest (one-offs, notes checked).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const consumable = (name) => compileItem(item(name), options);
const activations = (name) => compileActivations(item(name), options);
const activation = (name, which) => activations(name).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const row = (plan) => plan.resolution.outcomes.success;

test("an affliction counteracted after a save: Golden Gloves' Heaven's Wings, its counteract card beside the save card, the sentence no longer a note", () => {
    const wings = activation("Golden Gloves", "Heaven's Wings");
    assert.deepEqual([done(wings), routeOf(wings), wings.notes, wings.item.counteract.rank, wings.item.counteract.modifier, wings.item.counteract.afflictions, wings.item.counteract.self], [true, "save", undefined, 9, 31, ["curse", "disease", "poison"], true]);
    assert.equal(wings.ifTarget[0].bonus.value, -2);
});

test("a counteract with no item to aim at: Philter of Empty Dreams' midnight milk addiction and the Potions of Annulment's deals, the counteract card's free row", () => {
    const philter = consumable("Philter of Empty Dreams");
    assert.deepEqual([done(philter), routeOf(philter), philter.item.counteract.rank, philter.item.counteract.modifier], [true, "item", 4, 15]);
    assert.match(philter.item.counteract.free.name, /midnight milk/);
    // (Its +1 to saves against what's dreamlike only with its note Effect's toggle: no PF2e trait marks such effects.)
    const [bonus] = row(philter).modifiers;
    const [note] = row(philter).noteEffects;
    assert.deepEqual([bonus.value, bonus.type, bonus.predicate, note.rules[0].option, note.duration.value, note.duration.unit], [1, "item", ["philter-of-empty-dreams:dream"], "philter-of-empty-dreams:dream", 8, "hours"]);
    assert.match(philter.notes[0], /DC 24 Fortitude/);
    for (const [grade, modifier, rank] of [["Lesser", 17, 5], ["Moderate", 24, 8], ["Greater", 30, 10]]) {
        const potion = consumable(`Potion of Annulment (${grade})`);
        assert.deepEqual([done(potion), potion.builtin, routeOf(potion), potion.item.counteract.modifier, potion.item.counteract.rank, potion.item.counteract.notes.length], [true, "counteract", "counteract", modifier, rank, 4], grade);
        assert.match(potion.item.counteract.free.counteredWords, /all parties/);
    }
});

test("rules PF2e can't play, a note Effect for their time: Moonkeep Orchid's 3 days, Restful Salve's hour, Potion of Passing Fancy, Ambrosia of Undying Hope's 8 hours, the Witchwyrd Beacon's attunement", () => {
    const orchid = row(consumable("Moonkeep Orchid")).noteEffects[0];
    assert.deepEqual([orchid.duration.value, orchid.duration.unit], [3, "days"]);
    const salve = consumable("Restful Salve");
    assert.deepEqual([done(salve), row(salve).noteEffects[0].duration.value, row(salve).noteEffects[0].duration.unit], [true, 1, "hours"]);
    assert.match(salve.notes[0], /fresh corpse/);
    const fancy = row(consumable("Potion of Passing Fancy")).noteEffects[0];
    assert.match(fancy.text, /fades over 10 minutes/);
    const ambrosia = row(consumable("Ambrosia of Undying Hope")).noteEffects[0];
    assert.deepEqual([ambrosia.duration.value, ambrosia.duration.unit], [8, "hours"]);
    assert.match(ambrosia.text, /regains 20 Hit Points/);
    // (The beacon's other activation, its link for teleports, isn't this reading's: since the merge of 2026-10-27 the moving group's, done too.)
    const [attune, link] = activations("Witchwyrd Beacon").map((entry) => entry.plan);
    assert.deepEqual([done(attune), row(attune).noteEffects[0].duration, done(link)], [true, null, true]);
});

test("breathing: Choral Toga's Elysium's Breath and the day's breaths, a note Effect named for the environment module's \"doesn't need to breathe\"", () => {
    const breath = activation("Choral Toga", "Elysium's Breath");
    const [note] = row(breath).noteEffects;
    assert.deepEqual([done(breath), note.label, note.rules, note.duration.value], [true, "doesn't need to breathe", [{ key: "Immunity", type: "olfactory" }], 8]);
    // (Elysium's Gasp, the triggers group's: since the merge of 2026-10-27 built there, done.)
    assert.ok(done(activation("Choral Toga", "Elysium's Gasp")));
    for (const [name, plain, mythic] of [["One Day's Breath", [24, "hours"], [7, "days"]], ["Three Day's Breath", [3, "days"], [30, "days"]]]) {
        const plan = consumable(name);
        assert.deepEqual([done(plan), plan.unread, plan.ways.map((way) => Boolean(way.plan.partial || way.plan.unread))], [true, undefined, [false, false]], name);
        const notes = plan.ways.map((way) => row(way.plan).noteEffects);
        assert.deepEqual(notes.map((list) => list.map((entry) => [entry.label, entry.duration.value, entry.duration.unit])), [[["doesn't need to breathe", ...plain]], [["doesn't need to breathe", ...mythic]]], name);
    }
});

test("a toggle, a cast, a whisper and a shrink: Spider Lily Tattoo's Reveal Tattoo, Ring of Recalcitrant Wishes' arcane Wish with Drained 3, Nomad's Shawl's Mind's Map, Miniaturize Me!", () => {
    const reveal = activation("Spider Lily Tattoo", "Reveal Tattoo");
    assert.deepEqual([done(reveal), routeOf(reveal), reveal.modes[0].plan], [true, "toggle", { builtin: "roll-option", option: "spider-lily-tattoo", value: "flip" }]);
    const ring = activations("Ring Of Recalcitrant Wishes")[0].plan;
    assert.deepEqual([done(ring), routeOf(ring), ring.spell.name, ring.rank, ring.tradition, ring.userEffects], [true, "cast", "Wish", 10, "arcane", [{ slug: "drained", value: 3, duration: null }]]);
    const map = activation("Nomad's Shawl", "Mind's Map");
    assert.deepEqual([routeOf(map), /free action/.test(map.whisper.text)], ["whisper", true]);
    const tiny = row(activation("Miniaturization Module", "Miniaturize Me!")).noteEffects[0];
    assert.deepEqual([tiny.rules, tiny.duration.value], [[{ key: "CreatureSize", value: "tiny", reach: { override: 0 }, resizeEquipment: true }], 10]);
});

test("a message kept, not sent: Soulspeaker's note Effect on its user in place of the Message cast", () => {
    const speaker = activations("Soulspeaker")[0].plan;
    assert.deepEqual([done(speaker), speaker.builtin, routeOf(speaker), row(speaker).noteEffects[0].duration], [true, undefined, "item", null]);
    assert.match(row(speaker).noteEffects[0].text, /rasping whisper/);
});

test("a Sustain's new save: Ebon Marionette's Will DC 28, its failure the command for the creature's next turn, the later card kept open for the minute", () => {
    const marionette = activations("Ebon Marionette")[0].plan;
    assert.deepEqual([done(marionette), routeOf(marionette), marionette.resolution.check.statistic, marionette.resolution.check.against.value, marionette.targeting.range], [true, "save", "will", 28, "40 feet"]);
    const [command] = marionette.resolution.outcomes.failure.noteEffects;
    assert.deepEqual([command.duration.anchor, command.duration.expiry, marionette.resolution.outcomes.success.noteEffects], ["target-turn", "turn-end", undefined]);
    assert.deepEqual([marionette.again.repeat, marionette.again.later, marionette.again.time.value, marionette.again.time.unit, marionette.again.plan.resolution.check.against.value], [true, true, 1, "minutes", 28]);
});

test("zones: Ember Dust's bonfire for 8 hours (1d6 fire at a turn's start in it), Dirt Sea in a Jar's quicksand for a day, by its actions", () => {
    const dust = consumable("Ember Dust");
    assert.deepEqual([done(dust), routeOf(dust), dust.zone.area, dust.zone.lasts.value, dust.zone.lasts.unit, dust.zone.damage], [true, "zone", { type: "square", value: 5 }, 8, "hours", [{ when: "start", formulas: ["1d6[fire]"] }]]);
    const jar = activations("Dirt Sea in a Jar")[0].plan;
    assert.deepEqual([done(jar), routeOf(jar), jar.ways.map((way) => [way.plan.activation.time, way.plan.zone.area.type, way.plan.zone.lasts.unit])], [true, "ways", [["1", "square", "days"], ["1", "line", "days"], ["2", "cone", "days"]]]);
    assert.deepEqual(jar.ways[2].plan.zone.saves.map((save) => save.when), [["initial"], ["enter"]]);
});

test("a stone set upright or rolled: Barricade Stone (Cylinder)'s ways, its rolling save at DC 27 for 6d6 with Wounded 1 on a critical failure", () => {
    const stone = consumable("Barricade Stone (Cylinder)");
    assert.deepEqual([done(stone), routeOf(stone), stone.ways.map((way) => routeOf(way.plan))], [true, "ways", ["item", "save"]]);
    const rolling = stone.ways[1].plan;
    assert.deepEqual([rolling.resolution.check.against.value, rolling.resolution.sharedDamage.components[0].formula, rolling.resolution.outcomes.criticalFailure.effects.map((effect) => effect.slug), rolling.again.repeat], [27, "6d6[bludgeoning]", ["prone", "wounded"], true]);
    assert.match(stone.ways[0].plan.notes[0], /80, 40 or 20 feet tall/);
});

test("a dead creature brought back: Clockwork Rejuvenator's 1 Hit Point, then fast healing 10 for the minute", () => {
    const device = consumable("Clockwork Rejuvenator");
    assert.deepEqual([done(device), routeOf(device), device.item.recipient, device.item.revive.hp, device.item.fastHealing], [true, "item", "drinker", 1, [{ value: 10, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]]);
    assert.match(device.notes[0], /last 2 rounds/);
});

test("a figurine's rat a minion for its hour, a week's wait once slain: Pyrite Rat over its conjure card", () => {
    const rat = activation("Pyrite Rat", "Transform Statue");
    assert.deepEqual([done(rat), routeOf(rat), rat.creatures[0].traits, rat.slainWait, rat.trigger.frequency.per, rat.lasts.value], [true, "conjure", ["minion"], { value: 1, unit: "weeks" }, "day", 1]);
});

test("the card's lines: Cresset of Grisly Interrogation's kept head (its questions, another group's, untouched)", () => {
    const [kept, questions] = activations("Cresset of Grisly Interrogation").map((entry) => entry.plan);
    // (Its questions, another group's: since the merge of 2026-10-27 the rest group's, done.)
    assert.deepEqual([done(kept), kept.notes.length, done(questions)], [true, 3, true]);
    assert.match(kept.notes[0], /10 minutes/);
});

test("one-offs and notes checked: Moonkeep Hyacinth, Verdant Poultice, Phoenix Fulu Holder, Disgorge Soul; Gingerbread House, Unfolding Tree House, the Wraithweave Patches", () => {
    for (const plan of [consumable("Moonkeep Hyacinth"), consumable("Verdant Poultice"), activation("Phoenix Fulu Holder", "Duplicate Fulu"), activation("Soulfeeding Mask", "Disgorge Soul")]) assert.deepEqual([plan.decided, done(plan)], ["one-off", true], plan.source.name);
    assert.equal(activation("Soulfeeding Mask", "Disgorge Soul").builtin, "cast-spell");
    for (const plan of [activations("Gingerbread House")[0].plan, activation("Unfolding Tree House", "Unfold"), ...["I", "II", "III"].map((type) => activations(`Wraithweave Patch (Type ${type})`)[0].plan)]) assert.deepEqual([plan.decided, done(plan)], ["checked", true], plan.source.name);
});
