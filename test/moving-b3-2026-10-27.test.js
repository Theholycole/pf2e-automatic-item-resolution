// Moving creatures and the user, forms, vehicles and several creatures at once — the adventure books' items (2026-10-27, docs/needs.md
// "Moving creatures and the user"): src/compiler/moving-readings.js, src/compiler/item-actions.js's sized Escape, scripts/falls.js's net, on
// PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";
import { NOTES_CHECKED } from "../src/compiler/notes-checked.js";
import { netsUnder } from "../scripts/falls.js";
import { attackChoices } from "../scripts/poisons.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const options = { spells: spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items")), basicActions: compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug))) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options);
const activation = (name, which = null) => {
    const entries = activations(name);
    return (typeof which === "number" ? entries[which] : which === null ? entries[0] : entries.find((entry) => entry.activation.name === which)).plan;
};
const consumable = (name) => compileItem(item(name), options);
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const row = (plan) => plan.resolution.outcomes.success;

test("Miraculous Escape: PF2e's Escape at its +4 circumstance bonus, Tiny for the moment and the Step after a success a line of the card", () => {
    const escape = activation("Miniaturization Module", "Miraculous Escape");
    assert.ok(done(escape));
    assert.equal(escape.builtin, "item-action");
    assert.equal(escape.action.slug, "escape");
    assert.deepEqual(escape.action.bonus, { value: 4, type: "circumstance" });
    assert.equal(escape.action.whole, true);
    assert.match(escape.action.after, /^Tiny for the Escape, then its own size again whatever the result; on a success, Step into an adjacent space/);
    assert.equal(escape.trigger.frequency.per, "hour");
});

test("Void Shackles' Affix Shackle: PF2e's Effect: Manacles on the creature targeted, the shackles' rules on its note Effect, their 10d6 void its own save card kept", () => {
    const affix = activation("Void Shackles", "Affix Shackle");
    assert.ok(done(affix));
    assert.equal(affix.item.recipient, "targets");
    assert.deepEqual(row(affix).nativeEffects, [{ uuid: "Compendium.pf2e.equipment-effects.Item.OJg3cA6viR3sA3jB", label: "Effect: Manacles" }]);
    const note = row(affix).noteEffects[0];
    for (const words of [/six successful DC 42 Thievery checks/, /in the Void, DC 43/, /rank 9, \+25/, /10d6 void damage \(DC 37 basic Fortitude/, /can't pass through solid objects/, /afterlife/]) assert.match(note.text, words);
    assert.equal(note.duration, null);
    const save = affix.again.plan.resolution;
    assert.deepEqual(save.check, { roll: "save", statistic: "fortitude", basic: true, against: { dc: "fixed", value: 37 } });
    assert.equal(save.sharedDamage.components[0].formula, "10d6[void]");
    assert.equal(affix.again.own, true);
    assert.equal(affix.again.repeat, true);
    assert.match(affix.notes[0], /level 17 or lower/);
    // (Release Shackle as it was: its Will save's rows.)
    assert.equal(activation("Void Shackles", "Release Shackle").resolution.kind, "save");
});

test("Mask of Shifting Monstrosity: its +4 to Deception DC kept, what it's against and the look it takes words on its 8-hour Effect", () => {
    const meld = activation("Mask of Shifting Monstrosity", "Monstrosity Meld");
    assert.ok(done(meld));
    assert.equal(meld.unread, undefined);
    assert.deepEqual(row(meld).modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["deception-dc", 4, "item"]]);
    assert.equal(row(meld).noteEffects.length, 1);
    const note = row(meld).noteEffects[0];
    assert.equal(note.reminder, undefined);
    assert.deepEqual([note.duration.value, note.duration.unit], [8, "hours"]);
    for (const words of [/non-humanoid/, /Impersonate/, /actively Seeking/, /even if it's untrained/]) assert.match(note.text, words);
});

test("Euphorium checked: its note holds an appearance only", () => {
    assert.ok(NOTES_CHECKED.has("Euphorium"));
    const cake = consumable("Euphorium");
    assert.ok(done(cake));
    assert.equal(cake.decided, "checked");
});

test("Invisible Net: its 30-foot square a zone for the minute, falls onto it no damage (zone.fall, read by api.fallEases through netsUnder)", () => {
    const net = consumable("Invisible Net");
    assert.ok(done(net));
    assert.equal(net.builtin, "zone");
    assert.deepEqual(net.zone.area, { type: "square", value: 30 });
    assert.equal(net.zone.centre, "placed");
    assert.deepEqual([net.zone.lasts.value, net.zone.lasts.unit], [1, "minutes"]);
    assert.deepEqual(net.zone.fall, { noDamage: true });
    assert.match(net.zone.notes.join(" "), /more than 30 feet away/);
    // (Live: a Region of the ability module's flagged so, holding the token's centre at its own bottom.)
    const tested = [];
    const region = (fall, inside) => ({ name: "Invisible Net", elevation: { bottom: 0 }, flags: { "pf2e-automatic-ability-resolution": { zone: { zone: { fall }, itemName: "Invisible Net" } } }, testPoint: (point) => (tested.push(point), inside) });
    const scene = { grid: { size: 100 }, regions: { contents: [region({ noDamage: true }, true), region(null, true), region({ noDamage: true }, false)] } };
    const token = { x: 200, y: 300, width: 1, height: 1, elevation: 40, parent: scene };
    assert.deepEqual(netsUnder(token), [{ noDamage: true, source: "Invisible Net" }]);
    assert.deepEqual(tested[0], { x: 250, y: 350, elevation: 0 });
    assert.deepEqual(netsUnder({ ...token, parent: { grid: { size: 100 }, regions: { contents: [] } } }), []);
});

test("Anchor Spear's embedded spear: a note Effect on the creature it damaged, its DC 32 Athletics check to pull it out a card kept for it, damage by degree", () => {
    const [extend, embed] = activations("Anchor Spear").map((entry) => entry.plan);
    assert.equal(extend.builtin, "objects");
    assert.ok(done(embed));
    assert.equal(embed.item.recipient, "targets");
    assert.match(row(embed).noteEffects[0].text, /Burrows or Climbs, normal terrain is difficult terrain for it and difficult terrain greater difficult terrain/);
    const removal = embed.again.plan.resolution;
    assert.deepEqual(removal.check, { roll: "save", statistic: "athletics", basic: false, against: { dc: "fixed", value: 32 } });
    assert.deepEqual(Object.fromEntries(Object.entries(removal.outcomes).map(([degree, entry]) => [degree, entry.damage.formulas?.[0]?.formula ?? null])), { criticalSuccess: null, success: "1d8[piercing]", failure: "1d8[piercing]", criticalFailure: "2d8[piercing]" });
    assert.match(embed.again.when, /Interact action/);
});

test("Bomber's Saddle: one item dropped a line of the card (a bomb's Strike its user's own), the whole payload a one-off", () => {
    const [one, payload] = activations("Bomber's Saddle").map((entry) => entry.plan);
    assert.ok(done(one));
    assert.match(one.notes[0], /^Drop one item from the compartment/);
    assert.ok(done(payload));
    assert.equal(payload.decided, "one-off");
    assert.ok(ONE_OFFS.has("Bomber's Saddle"));
});

test("Gravity Inverter: its cylinder a zone for 4 rounds tossed up to 30 feet, Off-Guard inside (PF2e's GrantItem), the floating and the fall lines of the zone card", () => {
    const inverter = consumable("Gravity Inverter");
    assert.ok(done(inverter));
    assert.deepEqual(inverter.zone.area, { type: "burst", value: 10 });
    assert.equal(inverter.zone.range, 30);
    assert.deepEqual([inverter.zone.lasts.value, inverter.zone.lasts.unit], [4, "rounds"]);
    assert.equal(inverter.zone.inside[0].rules[0].uuid, "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg");
    assert.equal(inverter.zone.notes.length, 3);
    assert.match(inverter.zone.notes[2], /can fly takes none/);
});

test("Elixir of the Peaks: its bonus and cold protection kept, the mountains and the altitude saves words on its Effect for its time", () => {
    for (const [grade, bonus, time] of [["Lesser", 1, [1, "hours"]], ["Moderate", 2, [1, "days"]], ["Greater", 3, [1, "days"]], ["Major", 3, [7, "days"]]]) {
        const elixir = consumable(`Elixir of the Peaks (${grade})`);
        assert.ok(done(elixir), grade);
        assert.equal(elixir.unread, undefined);
        assert.ok(elixir.temperature);
        const note = row(elixir).noteEffects.find((entry) => entry.label === "Mountain elixir");
        assert.match(note.text, new RegExp(`\\+${bonus} to its saving throws against high altitude`));
        assert.deepEqual([note.duration.value, note.duration.unit], time);
        assert.ok(!row(elixir).noteEffects.some((entry) => entry.reminder));
    }
});

test("Splendid Floodlight: both activations one card's lines (a one-off)", () => {
    assert.ok(ONE_OFFS.has("Splendid Floodlight"));
    for (const entry of activations("Splendid Floodlight")) {
        assert.ok(done(entry.plan));
        assert.equal(entry.plan.decided, "one-off");
    }
});

test("Bonmuan Swapping Stone: two ways — thrown at a space, its user teleported within 100 feet; hurled at a creature, a ranged Strike whose hit brings it beside its user unless its Will save resists", () => {
    for (const [grade, dc] of [["Lesser", 28], ["Moderate", 31], ["Greater", 37], ["Major", 43]]) {
        const stone = consumable(`Bonmuan Swapping Stone (${grade})`);
        assert.ok(done(stone), grade);
        assert.equal(stone.builtin, "ways");
        assert.equal(stone.once, true);
        const [throwAt, hurl] = stone.ways.map((way) => way.plan);
        assert.deepEqual([throwAt.builtin, throwAt.teleport.within], ["teleport", 100]);
        assert.deepEqual(hurl.ownCheck, { kind: "attack", modifier: null, choose: ["ranged-proficiency"], increment: 15 });
        assert.deepEqual(hurl.thenSave.resolution.check.against, { dc: "fixed", value: dc });
        assert.equal(hurl.thenSave.resolution.check.statistic, "will");
        assert.deepEqual(hurl.thenSave.placed.rows, { failure: { within: 120 }, criticalFailure: { within: 120 } });
        assert.equal(hurl.thenSave.placed.nearSource, 5);
        assert.ok(hurl.thenSave.traits.includes("teleportation"));
        assert.equal(stone.spell, undefined);
    }
    // (Live: Dexterity and the best of its simple, martial and advanced ranks; a creature with none, its best ranged Strike.)
    const pc = { level: 10, system: { abilities: { dex: { mod: 4 } }, proficiencies: { attacks: { simple: { rank: 2 }, martial: { rank: 3 }, advanced: { rank: 0 } } }, actions: [] } };
    assert.deepEqual(attackChoices(pc, ["ranged-proficiency"]).map((choice) => [choice.kind, choice.modifier]), [["ranged-proficiency", 20]]);
    const npc = { level: 5, system: { abilities: {}, actions: [{ item: { isRanged: true }, totalModifier: 13 }] } };
    assert.deepEqual(attackChoices(npc, ["ranged-proficiency"]).map((choice) => [choice.kind, choice.modifier]), [["ranged", 13]]);
});

test("Dream Hunter's Lodge's Oneiric Expedition: its Mythic Point spent, the night's journey a line of the card", () => {
    const trip = activation("Dream Hunter's Lodge", "Oneiric Expedition");
    assert.ok(done(trip));
    assert.deepEqual(trip.spend, { mythicPoints: 1 });
    assert.match(trip.notes[0], /8 hours later it's back in the Dimension of Dreams/);
});

test("Runescribed Disk: its move action triggers no reactions, a line of the card", () => {
    const disk = consumable("Runescribed Disk");
    assert.ok(done(disk));
    assert.match(disk.notes[0], /triggers no reactions/);
});

test("Witchwyrd Beacon: its attunement a note Effect with no end of its own, the site's link a line", () => {
    const [attune, link] = activations("Witchwyrd Beacon").map((entry) => entry.plan);
    assert.ok(done(attune));
    assert.equal(row(attune).noteEffects[0].duration, null);
    assert.match(row(attune).noteEffects[0].text, /senses whenever that beacon is activated/);
    assert.ok(done(link));
    assert.match(link.notes[0], /without line of sight/);
});

test("Beloved's Bracelets' Grant Mythic Power: a Mythic Point spent, the silver wearer's one mythic-proficiency skill check on its note Effect", () => {
    const grant = activation("Beloved's Bracelets", "Grant Mythic Power");
    assert.ok(done(grant));
    assert.deepEqual(grant.spend, { mythicPoints: 1 });
    assert.equal(grant.item.recipient, "targets");
    assert.match(row(grant).noteEffects[0].text, /skill check at mythic proficiency/);
    assert.match(grant.notes[0], /maximum Mythic Points are 1 lower/);
});

test("Admirer's Bouquet handed over: its +1 kept on the ally, how long and the new save its words on the ally's Effect", () => {
    const bouquet = activations("Admirer's Bouquet")[1].plan;
    assert.ok(done(bouquet));
    assert.equal(bouquet.unread, undefined);
    assert.equal(row(bouquet).modifiers[0].selector, "saving-throw");
    assert.match(row(bouquet).noteEffects[0].text, /new save against that effect at once, with this \+1 — once a day/);
});

test("Gourd Home's shrinking: the night's pocket space a line of the card", () => {
    const gourd = activations("Gourd Home")[1].plan;
    assert.ok(done(gourd));
    assert.match(gourd.notes[0], /extradimensional space for 8 hours/);
    assert.match(gourd.notes[0], /inactive for 24 hours/);
});

test("Paradise Light's Sanctum: its fast healing PF2e's inside the zone, the hostile-action save a Note there and a line", () => {
    const sanctum = activation("Paradise Light", "Sanctum");
    assert.ok(done(sanctum));
    const [rules] = sanctum.zone.inside;
    assert.deepEqual(rules.rules[0], { key: "FastHealing", value: 2 });
    assert.equal(rules.rules[1].key, "Note");
    assert.match(rules.rules[1].text, /DC 28 Will save/);
    assert.deepEqual(sanctum.zone.modifiers.map((modifier) => modifier.selector), ["will", "wis-based"]);
    assert.equal(sanctum.zone.notes.length, 2);
});

test("Elysian Clairglass's Seek and Speak and Mariner's Astrolabe's Calculate: what they show whispered to the GM and the user", () => {
    const glass = activation("Elysian Clairglass", "Seek and Speak");
    assert.ok(done(glass));
    assert.equal(glass.builtin, "whisper");
    assert.equal(glass.spell, undefined);
    assert.match(glass.whisper.text, /Clairaudience and Clairvoyance/);
    const astrolabe = activation("Mariner's Astrolabe", "Calculate");
    assert.ok(done(astrolabe));
    assert.match(astrolabe.whisper.text, /\+1 item bonus to checks to identify celestial bodies/);
});

test("Effervescent Decoction: its hour of bubbles words on its drinker's Effect", () => {
    const decoction = consumable("Effervescent Decoction");
    assert.ok(done(decoction));
    const note = row(decoction).noteEffects[0];
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "hours"]);
    assert.match(note.text, /rises 10 feet a round/);
});

test("Dupe's Gold Nugget: its target's leaden limbs for 2 rounds, a Fortitude save card kept for each Stride, a failure −10 feet for that Stride", () => {
    const nugget = consumable("Dupe's Gold Nugget");
    assert.ok(done(nugget));
    assert.equal(nugget.item.recipient, "targets");
    assert.deepEqual([row(nugget).noteEffects[0].duration.value, row(nugget).noteEffects[0].duration.unit], [2, "rounds"]);
    const stride = nugget.again.plan.resolution;
    assert.deepEqual(stride.check.against, { dc: "fixed", value: 23 });
    assert.deepEqual(stride.outcomes.failure.modifiers[0], { selector: "land-speed", value: -10, type: "status", duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } });
    assert.deepEqual(nugget.again.time, { value: 2, unit: "rounds" });
    assert.match(nugget.again.when, /Strides/);
});

test("Marvelous Calliope unfolded: +1 to Performance while it's up, its narrower words and its folding on its user's Effect", () => {
    const calliope = activations("Marvelous Calliope")[0].plan;
    assert.ok(done(calliope));
    assert.deepEqual(row(calliope).modifiers, [{ selector: "performance", value: 1, type: "item", duration: null }]);
    assert.match(row(calliope).noteEffects[0].text, /Performance checks to play it/);
});
