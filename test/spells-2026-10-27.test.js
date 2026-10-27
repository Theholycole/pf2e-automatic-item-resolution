// Spells and the user's resources, spells cast with the item's changes, ships and vehicles (2026-10-27, docs/needs.md): the casts' own lines and
// changes (src/compiler/cast-changes.js), and what the user's rulings make of the rest (one-offs, card lines).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { impulseNumbers } from "../src/compiler/cast-changes.js";
import { castCardHTML, castRequest, createCastCard, impulseWords } from "../src/live/cast-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
// (PF2e's spells, for the casts' readings as live play has them.)
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activations = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), options).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const user = { name: "Caster", actorUuid: "Actor.a", tokenUuid: "Scene.s.Token.t" };

test("a cast's lines that are its user's, the map's or the GM's: Headwrap of Wisdom, Faerie Queen's Bower, Helm of the Tides, Malefic Mirror, Perfection's First Step", () => {
    const cases = [
        [activation("Headwrap of Wisdom", "Consider the Consequences"), /own instincts/],
        [activations("Faerie Queen's Bower").find((plan) => plan?.builtin === "cast-spell"), /from your square/],
        [activation("Helm of the Tides", "Raise the Tide"), /at night/],
        [activation("Malefic Mirror", "Peer Beyond"), /owner's domain/],
        [compileItem(item("Perfection's First Step"), options), /takes 10 minutes/]
    ];
    for (const [plan, line] of cases) {
        assert.equal(plan.builtin, "cast-spell");
        assert.ok(done(plan), plan.source.name);
        assert.ok(plan.castLines.some((entry) => line.test(entry)), plan.source.name);
        assert.ok(!(plan.notes ?? []).some((entry) => line.test(entry)), plan.source.name);
    }
    // (Malefic Mirror's DC as given, the viewer's familiarity a line too.)
    const mirror = activation("Malefic Mirror", "Peer Beyond");
    assert.deepEqual([mirror.dc, mirror.castLines.length], [28, 2]);
});

test("Wildwood Ink: its 10 minutes the cast's own, its recharge by its user's own One with Plants lines of the card", () => {
    const ink = activations("Wildwood Ink")[0];
    assert.ok(done(ink));
    assert.deepEqual([ink.castDuration.value, ink.castDuration.unit], [10, "minutes"]);
    assert.equal(ink.castLines.length, 3);
    assert.ok(ink.castLines.every((line) => /recharge|again/.test(line)));
});

test("Fan of Soothing Winds: its beads a choice of Heal's rank, six uses a day, the undead's DC; its cone and air trait still notes", () => {
    for (const [name, ranks, dc] of [["Fan of Soothing Winds", [4, 3, 2], 28], ["Fan of Soothing Winds (Greater)", [6, 5, 4], 34]]) {
        const fan = activation(name, "Healing Wind");
        assert.deepEqual(fan.choices.map((choice) => [choice.spell.name, choice.rank]), ranks.map((rank) => ["Heal", rank]), name);
        assert.deepEqual(fan.choices.map((choice) => choice.when), ["the first two beads", "the center two beads", "the last two beads"]);
        assert.deepEqual([fan.dc, fan.trigger.frequency.max, fan.item.activation.frequency.max], [dc, 6, 6]);
        assert.equal(fan.partial, true);
        assert.ok(fan.notes.some((note) => /cone/.test(note)) && fan.notes.some((note) => /air trait/.test(note)));
        assert.ok(!fan.notes.some((note) => /which bead/.test(note)));
    }
    const fan = activation("Fan of Soothing Winds", "Healing Wind");
    const state = { ...createCastCard({ plan: fan, item: { name: "Fan of Soothing Winds" }, user }), choice: 1 };
    assert.deepEqual([castRequest(state).rank, castRequest(state).dc], [3, 28]);
});

test("Rime Foil: Phantom Prison at DC 22, or DC 24 after a shattered plan's damage — two choices, each DC on the picker", () => {
    const foil = activations("Rime Foil")[0];
    assert.ok(done(foil));
    assert.deepEqual(foil.choices.map((choice) => [choice.rank, choice.dc]), [[5, 22], [5, 24]]);
    assert.match(foil.choices[1].when, /^if the target was damaged by a shattered plan in the last round$/);
    assert.equal(foil.notes, undefined);
    const state = createCastCard({ plan: foil, item: { name: "Rime Foil" }, user });
    const html = castCardHTML(state, { canApply: true });
    assert.match(html, /DC 22/);
    assert.match(html, /DC 24 \(if the target was damaged/);
    assert.match(html, /pairs with the Shattered Plan/);
    assert.equal(castRequest({ ...state, choice: 1 }).dc, 24);
});

test("Gate Attenuator: each spell's element, a kineticist's impulse numbers when better; the base one partial for Thunderstrike's metal trait", () => {
    for (const name of ["Gate Attenuator (Greater)", "Gate Attenuator (Major)"]) {
        const plan = activation(name, "Elemental Spell");
        assert.ok(done(plan), name);
        assert.deepEqual(plan.choices.map((choice) => choice.element), ["air", "earth", "fire", "metal", "water", "wood"]);
        assert.match(plan.castImpulse.said, /impulse DC/);
        assert.ok(plan.castLines.some((line) => /element's trait/.test(line)));
        assert.ok(!(plan.notes ?? []).some((note) => /kineticist/.test(note)), name);
    }
    const base = activation("Gate Attenuator", "Elemental Spell");
    assert.equal(base.partial, true);
    assert.ok(base.notes.some((note) => /element's trait/.test(note)));
    assert.ok(base.castImpulse);
    const major = activation("Gate Attenuator (Major)", "Elemental Spell");
    const state = createCastCard({ plan: major, item: { name: "Gate Attenuator (Major)" }, user });
    assert.ok(castCardHTML(state, { canApply: true }).includes(impulseWords.replace(/'/g, "&#39;")));
});

test("impulse numbers: the better of the item's and the kineticist's, only for one of its kinetic elements", () => {
    const choice = { element: "fire" };
    assert.deepEqual(impulseNumbers({ dc: 37, attack: 27 }, choice, { elements: ["fire", "water"], dc: 39, attack: 26 }), { dc: 39, attack: 27, impulse: true });
    assert.deepEqual(impulseNumbers({ dc: 37, attack: 27 }, choice, { elements: ["water"], dc: 39, attack: 29 }), { dc: 37, attack: 27, impulse: false });
    assert.deepEqual(impulseNumbers({ dc: 17, attack: 7 }, { element: "air" }, { elements: ["air"], dc: 16, attack: 6 }), { dc: 17, attack: 7, impulse: false });
});

test("one-off: Elemental Wayfinder (Air)'s Gentle Landing beside its Lightning Bolt — its card's lines, counted done", () => {
    const wayfinder = activations("Elemental Wayfinder (Air)")[0];
    assert.deepEqual([wayfinder.builtin, wayfinder.decided, Boolean(wayfinder.partial)], ["cast-spell", "one-off", false]);
});

test("one of a kind of PF2e's spells, picked on the cast card: Cantrip Deck's cantrips at 1st rank, DC 15, +5; Mage's Hat (Greater)'s arcane summons at 4th", () => {
    const full = compileItem(item("Cantrip Deck (Full Pack)"), options);
    assert.ok(done(full));
    assert.deepEqual([full.builtin, full.choices.length, full.dc, full.attack], ["cast-spell", 25, 15, 5]);
    assert.ok(full.choices.every((choice) => choice.rank === 1));
    assert.ok(full.choices.some((choice) => choice.spell.name === "Electric Arc") && full.castLines.some((line) => /same number of actions/.test(line)));
    const pack = compileItem(item("Cantrip Deck (5-pack)"), options);
    assert.ok(done(pack) && pack.choices.length > full.choices.length);
    assert.ok(pack.choices.some((choice) => choice.spell.name === "Light"));
    const hat = activation("Mage's Hat (Greater)", "Hat Spell");
    assert.ok(done(hat));
    assert.deepEqual(hat.choices.slice(0, 2).map((choice) => [choice.spell.name, choice.rank]), [["Summon Animal", 4], ["Summon Elemental", 4]]);
    assert.ok(hat.choices.every((choice) => choice.rank === 4));
    assert.equal(hat.trigger.frequency.per, "day");
});

test("Bleachguard Doll's cantrips picked (Light at 3rd rank, Prestidigitation, its other cantrip with no attack or save); its daily spell the creator's, partial", () => {
    const doll = activations("Bleachguard Doll")[0];
    assert.equal(doll.builtin, "cast-spell");
    assert.deepEqual(doll.choices.slice(0, 2).map((choice) => [choice.spell.name, choice.rank]), [["Light", 3], ["Prestidigitation", null]]);
    assert.ok(doll.choices.slice(2).every((choice) => choice.when === "its other cantrip" && choice.rank === 3));
    assert.ok(!doll.choices.some((choice) => ["Electric Arc", "Daze"].includes(choice.spell.name)));
    // (Light's target an object: none to target first.)
    assert.equal(doll.choices[0].targets, false);
    assert.equal(doll.partial, true);
});

test("Calligraphic Illumination: PF2e's Recall Knowledge with a +2 item bonus; Alchemist's Haversack: a versatile vial, PF2e's special resource one higher", async () => {
    const book = activation("Calligraphic Illumination", "Inscribed Insight");
    assert.deepEqual([book.builtin, book.action.slug, book.action.bonus], ["item-action", "recall-knowledge", { value: 2, type: "item" }]);
    const sack = activations("Alchemist's Haversack")[0];
    assert.deepEqual([sack.builtin, sack.focus], ["focus-point", { amount: 1, only: null, lost: null, resource: "versatile-vials" }]);
    const { focusText } = await import("../src/live/focus-card.js");
    assert.equal(focusText(sack.focus), "1 versatile vial");
});

test("Detect Anathema Fulu: 4d6 fire at its wearer, the brand a note Effect with no end, its going off the GM's call", () => {
    const fulu = compileItem(item("Detect Anathema Fulu"), options);
    assert.ok(done(fulu));
    assert.deepEqual(fulu.directDamage, { formula: "4d6", type: "fire", category: null });
    assert.deepEqual(fulu.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration]), [["Branded", null]]);
    assert.ok(fulu.notes.some((note) => /\(the GM's call\)\.$/.test(note)));
});

test("one-offs of the spells group: their words the card's lines, counted done and kept to build later (the dragon talismans' set on each way's card)", () => {
    const plans = [activation("Wandmender", "Recharge Wand"), activation("Ring of Maniacal Devices", "Fireball Trap"), activation("Ring of Maniacal Devices (Greater)", "Fireball Trap"), activations("Stone Circle")[0], activations("Stone Circle (Greater)")[0], activations("Laurel of the Empath")[2]];
    assert.deepEqual(plans.map((plan) => [plan.decided, done(plan)]), plans.map(() => ["one-off", true]));
    for (const name of ["Ruby Capacitor", "Ruby Capacitor (Greater)", "Ruby Capacitor (Major)", "Mind-Swap Potion", "Candle of Invocation"]) assert.equal(compileItem(item(name), options).decided, "one-off", name);
    // (Laurel of the Empath's first two activations stay its own cards.)
    assert.deepEqual(activations("Laurel of the Empath").slice(0, 2).map((plan) => plan.builtin), ["readied-bonus", "reroll"]);
    const scutcheon = compileItem(item("Dragonclaw Scutcheon"), options);
    assert.ok(done(scutcheon) && scutcheon.ways.every((way) => /Dragon Breath/.test(way.plan.notes.at(-1))));
});

test("a vehicle an item becomes: PF2e's Cutter, Rowboat and Bathysphere conjured beside its user for their time, their other sentences lines", () => {
    const boat = compileItem(item("Marvelous Miniature (Boat)"), options);
    assert.deepEqual([boat.builtin, boat.creatures[0].name, boat.creatures[0].from.uuid, boat.lasts.value, boat.lasts.unit, done(boat)], ["conjure", "Cutter", "Compendium.pf2e.vehicles.Actor.Qlvei5jjRXdsXUPo", 24, "hours", true]);
    const folding = activations("Folding Boat")[0];
    assert.deepEqual([folding.creatures[0].name, folding.lasts, done(folding)], ["Rowboat", null, true]);
    assert.ok(folding.notes.some((note) => /revert it to its original shape/.test(note)));
    const greater = activations("Folding Boat (Greater)")[0];
    assert.ok(greater.creatures[0].name === "Cutter" && greater.notes.includes("Ethereal sailors pilot and crew it."));
    const dive = activation("Anglerfish Lantern (Submersible)", "Dive!");
    assert.deepEqual([dive.creatures[0].name, dive.lasts.value, dive.lasts.unit, done(dive)], ["Bathysphere", 1, "hours", true]);
});

test("a boat or cart with only its text's numbers: a marker token — the swan boat's swim Speed 50 for a day, the wind-up cart's AC 15 and 24 HP for a minute", () => {
    const swan = activations("Feather Token (Swan Boat) (Ammunition)")[0];
    assert.deepEqual([swan.builtin, swan.creatures[0].stats.speeds.swim, swan.lasts.value, done(swan)], ["conjure", 50, 24, true]);
    assert.ok(!swan.notes.some((note) => /^Strike from/.test(note)));
    const cart = compileItem(item("Wind-Up Cart"), options);
    assert.deepEqual([cart.creatures[0].stats.ac, cart.creatures[0].stats.hp, cart.creatures[0].stats.speeds.land, cart.lasts.value, cart.lasts.unit, done(cart)], [15, 24, 30, 1, "minutes", true]);
});

test("a note Effect on the vehicle its user targets: Feather Token (Anchor)'s day, Kraken Figurehead's tentacles; the presser's targets (route save)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const anchor = compileItem(item("Feather Token (Anchor)"), options);
    assert.deepEqual([anchor.targeting.target, routeOf(anchor), done(anchor)], ["1 vehicle", "save", true]);
    assert.deepEqual(anchor.resolution.outcomes.success.noteEffects[0].duration.value, 24);
    for (const name of ["Kraken Figurehead", "Kraken Figurehead (Wracking)"]) {
        const lash = activation(name, "Lash Out!");
        assert.deepEqual([routeOf(lash), lash.resolution.outcomes.success.noteEffects[0].duration.value, done(lash)], ["save", 10, true], name);
        assert.match(lash.resolution.outcomes.success.noteEffects[0].text, /Swim/);
    }
});

test("two ways: Feather Token (Fan)'s sail bonus or Gust of Wind at DC 20; Wind At Your Back's group Hustle or its vehicle's Speeds", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const fan = compileItem(item("Feather Token (Fan)"), options);
    assert.deepEqual(fan.ways.map((way) => routeOf(way.plan)), ["save", "cast"]);
    assert.deepEqual([fan.ways[1].plan.spell.name, fan.ways[1].plan.dc], ["Gust of Wind", 20]);
    const wind = activations("Wind At Your Back")[0];
    assert.deepEqual(wind.ways.map((way) => routeOf(way.plan)), ["item", "save"]);
    assert.match(wind.ways[1].plan.resolution.outcomes.success.noteEffects[0].text, /\+10-foot circumstance bonus to its Speeds \(\+20 feet/);
    assert.deepEqual(wind.ways[0].plan.resolution.outcomes.success.noteEffects[0].duration.value, 8);
});

test("About Face! the map's, Mariner's Mien Quickened for its minute with its action's note, the miniatures' camping-set flavor no boat", () => {
    const about = activation("Aboutface Figurehead", "About Face!");
    assert.ok(done(about) && /turn its token about/.test(about.notes[0]));
    for (const name of ["Mariner’s Mien (Greater)", "Mariner’s Mien (Lesser)"]) {
        const mien = activation(name, "Set the Course");
        const quickened = mien.resolution.outcomes.success.effects.find((effect) => effect.slug === "quickened");
        assert.deepEqual([quickened.duration.value, quickened.duration.unit, mien.unread, done(mien)], [1, "minutes", undefined, true], name);
        assert.match(mien.resolution.outcomes.success.noteEffects.at(-1).text, /Take Control/);
    }
    for (const name of ["Marvelous Miniature (Campfire)", "Marvelous Miniature (Chest)", "Marvelous Miniature (Ladder)"]) assert.equal(compileItem(item(name), options).decided, "card-line", name);
});

test("one-offs of the vehicles: Kraken Figurehead (Wracking)'s Grab Them!, Hongbao of Many Things, Violin of the Waves", () => {
    assert.deepEqual([activation("Kraken Figurehead (Wracking)", "Grab Them!").decided, activations("Hongbao of Many Things")[0].decided, activations("Violin of the Waves")[0].decided], ["one-off", "one-off", "one-off"]);
});
