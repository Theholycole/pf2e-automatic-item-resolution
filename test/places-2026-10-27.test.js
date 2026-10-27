// Batch 3's places (2026-10-27, docs/needs.md): the adventure books' items whose leftovers were an area, a wall or a room, what a creature
// sees or senses, or an illusion — read in src/compiler/area-readings.js, src/compiler/visibility.js and src/compiler/illusions.js, the
// Essence Forges' crafting a one-off. Each test on PF2e's own item.

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
    assert.ok(doc, name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options);
const activation = (name, which = null) => activations(name).find((entry) => entry.activation.name === which).plan;
const consumable = (name) => compileItem(item(name), options);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const success = (plan) => plan.resolution.outcomes.success;
const note = (plan) => success(plan).noteEffects[0];

test("the exploration lenses: a note Effect while fitted, its bonus PF2e's toggle — Identify Magic in the Detecting lens's light, spotting while Searching with the Searching one", () => {
    const detecting = activation("Exploration Lens (Detecting)");
    assert.ok(done(detecting));
    const lens = note(detecting);
    assert.deepEqual([lens.duration, lens.rules.map((rule) => rule.key)], [null, ["RollOption", "FlatModifier"]]);
    assert.deepEqual(lens.rules[1], { key: "FlatModifier", selector: "skill-check", type: "item", value: 2, predicate: ["exploration-lens-identify"] });
    assert.match(lens.text, /pulsates faintly.*the GM shows where/);
    const searching = note(activation("Exploration Lens (Searching)"));
    assert.deepEqual([searching.rules[1].selector, searching.rules[1].value], ["perception", 2]);
    assert.match(searching.text, /the GM rolls it in secret/);
});

test("a block, a room, a lure: Barricade Stone (Cube)'s stone for good, the Privacy Ward Fulus' rooms with Stealth inside, Thumper Snare's minute", () => {
    const cube = consumable("Barricade Stone (Cube)");
    assert.deepEqual([cube.builtin, cube.zone.area, cube.zone.centre, cube.zone.range, cube.zone.lasts], ["zone", { type: "square", value: 20 }, "placed", 20, null]);
    assert.match(cube.zone.notes.join(" "), /Hardness 14, 56 Hit Points/);
    for (const [name, side, bonus, hours, hides] of [["Privacy Ward Fulu (Hallway)", 5, 1, 1, false], ["Privacy Ward Fulu (Room)", 10, 1, 8, true], ["Privacy Ward Fulu (Chamber)", 10, 2, 24, true]]) {
        const fulu = consumable(name);
        assert.ok(done(fulu), name);
        assert.deepEqual([fulu.zone.area.value, fulu.zone.lasts.value, fulu.zone.lasts.unit], [side, hours, "hours"], name);
        assert.deepEqual(fulu.zone.inside[0].rules[1], { key: "FlatModifier", selector: "stealth", type: "item", value: bonus, predicate: ["privacy-ward-fulu"] }, name);
        assert.equal(fulu.zone.notes.some((line) => /Undetected instead to creatures of level \d+ or lower/.test(line)), hides, name);
    }
    assert.match(consumable("Privacy Ward Fulu (Chamber)").zone.notes[2], /level 9 or lower/);
    const thumper = consumable("Thumper Snare");
    assert.deepEqual([thumper.builtin, thumper.zone.lasts.value, thumper.zone.lasts.unit], ["zone", 1, "minutes"]);
});

test("Setup Snare: the ways card's Reflex save or Will save (fear and mental, visual or auditory), a failure's push and Clumsy to the end of the creature's next turn, at its level's DC", () => {
    const snare = consumable("Setup Snare");
    assert.deepEqual([snare.builtin, snare.once, snare.ways.map((way) => way.name)], ["ways", true, ["A Reflex save", "A Will save (fear, mental, visual)", "A Will save (fear, mental, auditory)"]]);
    for (const [index, statistic] of [[0, "reflex"], [1, "will"], [2, "will"]]) {
        const zone = snare.ways[index].plan.zone;
        const save = zone.saves[0];
        assert.deepEqual([routeOf(snare.ways[index].plan), zone.once, save.only, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value], ["zone", true, { minSize: "sm" }, statistic, 18]);
        const { failure, criticalFailure, success: passed } = save.plan.resolution.outcomes;
        assert.deepEqual([failure.forcedMovement.distance, failure.effects[0].value, criticalFailure.forcedMovement.distance, criticalFailure.effects[0].value, passed.effects], [5, 1, 10, 2, []]);
        assert.deepEqual(failure.effects[0].duration, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" });
    }
    assert.deepEqual(snare.ways[1].plan.zone.saves[0].plan.traits.slice(-3), ["fear", "mental", "visual"]);
});

test("the cave worm repellents: a coated creature's 24 hours (its worms' behaviour and their save at its level's DC), or a sprinkled area out of combat", () => {
    for (const [name, worm, dc] of [["Purple Worm Repellent", "purple worm", 31], ["Azure Worm Repellent", "azure worm", 34], ["Crimson Worm Repellent", "crimson worm", 38]]) {
        const repellent = consumable(name);
        assert.deepEqual([repellent.builtin, repellent.ways.map((way) => way.name)], ["ways", ["Applied to a creature", "Sprinkled round an area"]], name);
        const [coated, sprinkled] = repellent.ways.map((way) => way.plan);
        assert.equal(coated.item.recipient, "targets");
        const words = note(coated);
        assert.deepEqual([words.duration.value, words.duration.unit], [24, "hours"]);
        assert.match(words.text, new RegExp(`Each ${worm} avoids.*DC ${dc} Fortitude save`));
        assert.match(sprinkled.notes[0], new RegExp(`random encounter with ${worm}s`));
    }
});

test("a light, a whisper, a door, a dig: Lance of Sun's Radiance's torch at the object, Ring of Fair Assessment's values, Cowl of Keys' doorway, Shoony Shovel", () => {
    const lance = activation("Lance of Sun's Radiance", "Banish Darkness");
    assert.ok(done(lance));
    assert.deepEqual([lance.item.placedLight.bright, lance.item.placedLight.dim, lance.item.placedLight.duration.value, lance.item.placedLight.duration.unit, lance.trigger.frequency.per], [20, 40, 1, "hours", "hour"]);
    const ring = activation("Ring of Fair Assessment", "Fair Assessment");
    assert.equal(ring.builtin, "whisper");
    assert.match(ring.whisper.text, /within 30 feet.*Society check to Decipher Writing against that creature's Will DC/);
    const [, doorway] = activations("Cowl of Keys").map((entry) => entry.plan);
    assert.ok(done(doorway));
    assert.match(doorway.notes[0], /up to 10 feet of material/);
    const [shovel] = activations("Shoony Shovel").map((entry) => entry.plan);
    assert.ok(done(shovel));
    assert.match(shovel.notes[0], /one 5-foot cube every 10 minutes/);
    assert.equal(shovel.trigger.frequency.per, "day");
});

test("terrain and Speed on a note Effect: Fungal Stride's PF2e rule for difficult terrain (its resistance in words), Slippery Ribbon's Tumble Through to the end of the turn", () => {
    const stride = activation("Boots of the Blight", "Fungal Stride");
    assert.ok(done(stride));
    assert.deepEqual(note(stride).rules, [{ key: "ActiveEffectLike", mode: "add", path: "system.movement.terrain.difficult.ignored", value: { environment: "all", feature: "all" } }]);
    assert.deepEqual([note(stride).duration.value, note(stride).duration.unit], [10, "minutes"]);
    assert.match(note(stride).text, /resistance 10 to damage from hazardous terrain/);
    const ribbon = consumable("Slippery Ribbon");
    assert.ok(done(ribbon));
    assert.deepEqual([note(ribbon).duration.value, note(ribbon).duration.expiry], [0, "turn-end"]);
});

test("houses out of combat: Shadow Manse's mansion and its DC 30 exits, Dream Hunter's Lodge's trophies (+3 to the next Recall Knowledge about dream creatures, on those targeted)", () => {
    const [manse] = activations("Shadow Manse").map((entry) => entry.plan);
    assert.ok(done(manse));
    assert.equal(manse.notes.length, 4);
    assert.match(manse.notes[2], /DC 30 Occultism check.*DC 30 Athletics check/);
    assert.match(manse.notes[3], /for 8 hours/);
    const lodge = activation("Dream Hunter's Lodge", "Expand Lodge");
    assert.ok(done(lodge));
    assert.equal(lodge.item.recipient, "targets");
    const trophies = note(lodge);
    assert.deepEqual([trophies.duration.value, trophies.rules[1].value, trophies.rules[1].removeAfterRoll], [24, 3, "if-enabled"]);
});

test("Effortless Garden: its 40-foot square for 24 hours, or for good spending a Mythic Point — the ways card's two zones", () => {
    const garden = consumable("Effortless Garden");
    assert.deepEqual([garden.builtin, garden.ways.map((way) => way.name)], ["ways", ["As it is", "Spending a Mythic Point"]]);
    const [plain, mythic] = garden.ways.map((way) => way.plan);
    assert.deepEqual([plain.zone.area, plain.zone.lasts.value, plain.spend], [{ type: "square", value: 40 }, 24, undefined]);
    assert.deepEqual([mythic.zone.lasts, mythic.spend], [null, { mythicPoints: 1 }]);
    assert.match(plain.zone.notes[1], /flower beds \(difficult terrain\) or hedgerows/);
});

test("casts' lines: Passage Charm's shadow wall (its Hardness 7 in bright light), Fan of Falling Words' Illusory Scene on its user", () => {
    const charm = activation("Passage Charm", "Shape the Shadows");
    assert.deepEqual([charm.builtin, done(charm), charm.castDuration.value, charm.notes.length], ["cast-spell", true, 24, 2]);
    assert.match(charm.notes[1], /Hardness halved, to 7/);
    const fan = activation("Fan of Falling Words", "Whispered World");
    assert.deepEqual([fan.builtin, done(fan), fan.dc], ["cast-spell", true, 27]);
    assert.match(fan.notes[1], /centred on its user/);
});

test("Hagbane Biscuit: PF2e's toggles for a hag's disguise and lore, its weapons cold iron against hags (as Greenwatcher's), and a hag's or changeling's eating it the DC 18 save card", () => {
    const biscuit = consumable("Hagbane Biscuit");
    assert.ok(done(biscuit));
    const words = note(biscuit);
    assert.deepEqual(words.rules.map((rule) => rule.key), ["RollOption", "FlatModifier", "RollOption", "FlatModifier", "AdjustStrike"]);
    assert.deepEqual(words.rules[4], { key: "AdjustStrike", mode: "add", property: "materials", value: "cold-iron", predicate: ["target:trait:hag"] });
    assert.deepEqual(success(biscuit).modifiers.map((modifier) => [modifier.selector, modifier.predicate]), [["saving-throw", ["origin:trait:hag"]]]);
    const { traits, save, works } = biscuit.item.unlessKind;
    assert.deepEqual([traits, works, save.resolution.check.statistic, save.resolution.check.against.value], [["hag", "changeling"], true, "fortitude", 18]);
    assert.equal(save.resolution.outcomes.success.noteEffects[0], words);
    assert.deepEqual(save.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value]), [["sickened", 1]]);
    assert.deepEqual(save.resolution.outcomes.failure.effects, []);
});

test("senses and sight on a note Effect: fiendsense in words, see-invisibility PF2e's, keener blood sight, fog seen through, Empty Robes' unseen wearer", () => {
    const fiend = note(activation("Hellhusk Shroud", "Hellish Senses"));
    assert.deepEqual([fiend.duration.value, fiend.rules], [10, undefined]);
    assert.match(fiend.text, /imprecise sense within 60 feet/);
    const husk = activation("Hellhusk Shroud", "Horned Husk");
    assert.ok(done(husk));
    assert.deepEqual(note(husk).rules, [{ key: "FlatModifier", selector: "deception", type: "status", value: 1, predicate: ["action:lie"] }]);
    const glasses = activations("Spectral Opera Glasses")[0].plan;
    assert.ok(done(glasses));
    assert.deepEqual([note(glasses).rules, note(glasses).duration.value], [[{ key: "Sense", selector: "see-invisibility" }], 1]);
    const blood = consumable("Blood Sight Elixir (Major)");
    assert.deepEqual([done(blood), blood.unread, blood.item.senses[0].acuity, success(blood).noteEffects.length], [true, undefined, "precise", 1]);
    assert.match(note(blood).text, /half their Hit Points or less/);
    const eye = consumable("Ixamè's Eye");
    assert.deepEqual([done(eye), eye.notes, eye.weatherIgnores.ignores, note(eye).duration.value], [true, undefined, ["fog-mist"], 1]);
    const robes = activation("Hollow Robes", "Empty Robes");
    assert.deepEqual([done(robes), robes.unread, success(robes).modifiers[0].selector, note(robes).duration.value], [true, undefined, "intimidation", 1]);
});

test("Sage's Bloom's three Recall Knowledge checks, a Nature critical failure only a failure (PF2e's AdjustDegreeOfSuccess); Netherwalk Incense's 8 hours on those it takes", () => {
    const bloom = consumable("Sage's Bloom");
    assert.ok(done(bloom));
    assert.deepEqual(note(bloom).rules, [{ key: "AdjustDegreeOfSuccess", selector: "nature", adjustment: { criticalFailure: "to-failure" } }]);
    const incense = consumable("Netherwalk Incense");
    assert.deepEqual([done(incense), incense.item.recipient, note(incense).duration.value, note(incense).duration.unit], [true, "targets", 8, "hours"]);
    assert.match(incense.targeting.target, /up to 10 willing creatures within 20 feet/);
});

test("the Essence Forges' Craft an Item: a one-off (crafting through Forge Points), its words the card's line", () => {
    for (const grade of ["Lesser", "Moderate", "Greater"]) {
        const forge = activation(`Essence Forge (${grade})`, "Craft an Item");
        assert.deepEqual([done(forge), forge.decided], [true, "one-off"], grade);
    }
});
