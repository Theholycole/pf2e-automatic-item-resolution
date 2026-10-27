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
