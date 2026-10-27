// The user's answers 2 and 3 (2026-10-26): a spell-cast card counts partial when a note adds a rule the cast doesn't play
// (src/compiler/honest.js withCastNotes), not when it only restates the spell; a note-only item counts done once its text was checked
// for anything a card could play (src/compiler/notes-checked.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const first = (name) => compileActivations(item(name), options)[0].plan;

test("a cast's note adding a rule makes it partial — The Courtesan's Impersonate one degree better against lower-level creatures (The Winged Serpent's 10 minutes, its example once, played since)", () => {
    const courtesan = first("The Courtesan");
    assert.equal(courtesan.builtin, "cast-spell");
    assert.equal(courtesan.partial, true);
});

test("a note only restating the spell doesn't — Satchel of Numberless Seeds' Protector Tree within its own 30 feet", () => {
    const satchel = first("Satchel of Numberless Seeds");
    assert.equal(satchel.builtin, "cast-spell");
    assert.ok(satchel.notes.some((note) => /within 30 feet/.test(note)));
    assert.equal(satchel.partial, undefined);
});

test("a note-only item checked as having nothing to play counts done — Spyglass Eye", () => {
    const eye = first("Spyglass Eye");
    assert.deepEqual([eye.noteOnly, eye.decided, eye.automation.level], [undefined, "checked", "automatic"]);
});

test("a counteract modifier in other words is the cast's, and saying it again isn't a rule — Chalice of Ozem's +19, Rod of Negation's 1d20+23", () => {
    const chalice = first("Chalice of Ozem");
    assert.deepEqual([chalice.attack, chalice.partial], [19, undefined]);
    const rod = first("Rod of Negation");
    assert.deepEqual([rod.attack, rod.partial], [23, undefined]);
});

test("the cast's own rank said again isn't a rule — Cultist Cowl (Major)'s Crisis of Faith heightened to 7th rank", () => {
    const cowl = first("Cultist Cowl (Major)");
    assert.deepEqual([cowl.rank, cowl.partial], [7, undefined]);
});

test("a cast's own duration: Dust of Disappearance's 1-minute Invisibility, The Mountain Man's hour from 15th level; the card says it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { castDurationAt } = await import("../src/compiler/cast-duration.js");
    const { lastsWords } = await import("../src/live/cast-card.js");
    const dust = compileItem(item("Dust of Disappearance"), options);
    assert.deepEqual([dust.castDuration.value, dust.castDuration.unit, dust.partial], [1, "minutes", undefined]);
    const man = first("The Mountain Man");
    assert.deepEqual(castDurationAt(man.castDuration, 14), { value: 5, unit: "minutes" });
    assert.deepEqual(castDurationAt(man.castDuration, 15), { value: 1, unit: "hours" });
    assert.equal(lastsWords(man.castDuration), "lasts 5 minutes (1 hour from level 15)");
    // (Not the spell's own: Spectacles of Understanding's hour of Translate.)
    assert.equal(first("Spectacles of Understanding").castDuration, undefined);
});

test("a cast's own range: Medusa's Scream's 30-foot Petrify (the spell's is 120), Tiger Shield's melee reach; the card says it", async () => {
    const { rangeWords } = await import("../src/compiler/cast-range.js");
    const scream = first("Medusa's Scream");
    assert.deepEqual([scream.castRange.feet, scream.partial], [30, undefined]);
    assert.equal(rangeWords(scream.castRange), "range 30 feet");
    assert.equal(first("Tiger Shield").castRange.reach, true);
});

test("healing at the end of each turn beside a cast, for the item's time: Enveloping Light's 1d4 for 5 rounds", () => {
    const light = first("Enveloping Light");
    assert.deepEqual([light.turnHeal.formula, light.castDuration.value, light.castDuration.unit, light.partial], ["1d4", 5, "rounds", undefined]);
});

test("a bonus beside the cast: Psyche Salts (Moderate)'s +2 item bonus to saves against mental effects for 10 minutes, PF2e's rule for it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const salts = compileItem(item("Psyche Salts (Moderate)"), options);
    assert.deepEqual([salts.attack, salts.castBonus.modifiers[0].selector, salts.castBonus.modifiers[0].value, salts.castBonus.modifiers[0].predicate, salts.partial], [17, "saving-throw", 2, ["item:trait:mental"], undefined]);
});

test("a zone's save checked for what it leaves (2026-10-27): Biting Snare's Speed penalty until it's healed makes the zone partial (Tar Rocket Snare's once, its critical failure's push read since); Spark Wafer's column for a round is the zone's own", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    assert.equal(compileItem(item("Biting Snare"), options).partial, true);
    const rocket = compileItem(item("Tar Rocket Snare"), options);
    assert.deepEqual([rocket.partial, rocket.zone.saves[0].plan.resolution.outcomes.criticalFailure.forcedMovement.distance], [undefined, 10]);
    assert.equal(compileItem(item("Spark Wafer"), options).partial, undefined);
    // (An example isn't a rule: Trip Snare's "For example, three trip snares …".)
    assert.equal(compileItem(item("Trip Snare"), options).partial, undefined);
});

test("a snare that strikes again for a while: Bleeding Spines Snare's area for 1 minute after it's set off, the same save on entering or ending a turn there", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const spines = compileItem(item("Bleeding Spines Snare"), options);
    assert.deepEqual([spines.zone.once, spines.zone.then.lasts.value, spines.zone.then.lasts.unit, spines.zone.then.saves[0].when], [true, 1, "minutes", ["enter", "end"]]);
    assert.equal(spines.zone.then.saves[0].plan.resolution.check.basic, true);
});

test("a conjured creature as its item's text has it (2026-10-27): Fossil Fragment's traits for its type and its immunities, the Petrified Wood tree Immobilized with no weaknesses; a creature rule left makes the card partial", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [tree] = activations(item("Fossil Fragment (Petrified Wood)"), options);
    const creature = tree.plan.creatures[0];
    assert.deepEqual([creature.replaceType, creature.immunities.includes("death-effects"), creature.own, tree.plan.partial], [true, true, { noWeaknesses: true, conditions: ["immobilized"] }, undefined]);
    const [dog] = activations(item("Wondrous Figurine (Onyx Dog)"), options);
    assert.deepEqual([dog.plan.creatures[0].own.rules[0].predicate, dog.plan.partial], [["action:track"], true]);
});

test("how a creature ends an item's effect early (2026-10-27): Fire-Douse Snare's DC 10, then DC 5, then outright; Grease Snare's three Interact actions", async () => {
    const { readEndEarly } = await import("../src/compiler/end-early.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const douse = readEndEarly(plainText(item("Fire-Douse Snare").system.description.value));
    assert.deepEqual([douse.how, douse.conditions], [{ kind: "flat", steps: [10, 5, "auto"] }, ["blinded", "dazzled"]]);
    assert.deepEqual(readEndEarly(plainText(item("Grease Snare").system.description.value)).how, { kind: "actions", count: 3 });
    const { compileItem } = await import("../src/compiler/index.js");
    assert.equal(compileItem(item("Fire-Douse Snare"), options).partial, undefined);
});

test("a save row's own way out (2026-10-27): Blindpepper Bolt's success, one manipulate action — the save's endEarly for that row alone, its note gone", async () => {
    const { tryWords } = await import("../src/live/end-early-card.js");
    const [{ plan: bolt }] = compileActivations(item("Blindpepper Bolt"), options);
    const endEarly = bolt.strike.save.endEarly;
    assert.deepEqual([endEarly.how, endEarly.degrees, bolt.partial], [{ kind: "actions", count: 1, trait: "manipulate" }, ["success"], undefined]);
    assert.equal((bolt.strike.notes ?? []).some((note) => /wipe/.test(String(note))), false);
    assert.equal(tryWords(endEarly, { step: 0 }), "1 manipulate action spent");
});

test("a snare's mark on the creature (2026-10-27): Marking Snare's failure and critical failure each leave a 24-hour note Effect of the +2 to Track it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const snare = compileItem(item("Marking Snare"), options);
    const outcomes = snare.zone.saves[0].plan.resolution.outcomes;
    const marks = ["success", "failure", "criticalFailure"].map((degree) => (outcomes[degree].noteEffects ?? []).filter((note) => note.label === "Marked").length);
    assert.deepEqual([marks, outcomes.failure.manualInstructions, outcomes.failure.noteEffects[0].duration.value, snare.partial], [[0, 1, 1], undefined, 24, undefined]);
    assert.match(outcomes.failure.noteEffects[0].text, /\+2 circumstance bonus to Track this creature/);
});

test("a creature swallowed, then spat out to fall (2026-10-27): Worm Vial's Eat — its critical failure doubled, the 20-foot fall's 10 bludgeoning and Prone, the spit a placed move within 30 feet, its 15-foot range", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const vial = compileItem(item("Worm Vial"), options);
    const { failure, criticalFailure } = vial.resolution.outcomes;
    assert.deepEqual([failure.damage.formulas.map((entry) => entry.formula), criticalFailure.damage.formulas.map((entry) => entry.formula)], [["(3d6+9)[bludgeoning]", "10[bludgeoning]"], ["2*(3d6+9)[bludgeoning]", "10[bludgeoning]"]]);
    assert.deepEqual([failure.effects.map((effect) => effect.slug), vial.placed.rows, vial.targeting.range, vial.partial], [["prone"], { failure: { within: 30 }, criticalFailure: { within: 30 } }, "15 feet", undefined]);
    assert.match(vial.notes.join(" "), /^Or Burrow instead: the worm tunnels up to 80 feet \(40 through solid stone\)/);
});

test("a snare's setter worse off than the others (2026-10-27): Piercing Whistle Snare — its own save card Deafened 1 minute on a failure, the burst within 10 feet for the others (othersOnly) 1 round", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const snare = compileItem(item("Piercing Whistle Snare"), options);
    const deaf = (plan, degree) => plan.resolution.outcomes[degree].effects.find((effect) => effect.slug === "deafened").duration;
    const own = snare.zone.saves[0].plan;
    const burst = snare.zone.burst;
    assert.deepEqual([snare.zone.saves.length, burst.othersOnly, burst.area, snare.partial], [1, true, { type: "emanation", value: 10 }, undefined]);
    assert.deepEqual([deaf(own, "failure").unit, deaf(own, "criticalFailure").unit, deaf(burst.plan, "failure").unit, deaf(burst.plan, "criticalFailure").unit], ["minutes", "hours", "rounds", "hours"]);
    // (Sanctified Beans' two save cards each play what the other leaves: no sentence left over.)
    assert.equal(compileItem(item("Sanctified Beans"), options).partial, undefined);
});

test("a trap set off by opening it (2026-10-27): Fire Box — not a snare square, its basic Reflex save card for those its 15-foot cone reaches, used when someone opens it", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const box = compileItem(item("Fire Box"), options);
    assert.deepEqual([box.builtin, box.trigger.event, box.targeting.area, box.resolution.check.basic, box.resolution.check.against.value, box.partial], [undefined, "use", { type: "cone", value: 15 }, true, 17, undefined]);
    assert.match(box.notes[0], /^Use it when someone opens the box: its 15-foot cone goes a way the GM picks at random, always through the one who opened it/);
});

test("what a row makes a creature drop of what it holds (2026-10-27): Deadweight Snare's critical failure, the metal items — plan.dropHeld; the drop card ticks what looks metal", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { createDropCard, dropCardHTML, looksMetal } = await import("../src/live/drop-card.js");
    const snare = compileItem(item("Deadweight Snare"), options);
    const save = snare.zone.saves[0].plan;
    assert.deepEqual([save.dropHeld.degrees, save.dropHeld.metallic, save.resolution.outcomes.criticalFailure.noteEffects, snare.partial], [["criticalFailure"], true, undefined, undefined]);
    const weapon = (name, group, material = null) => ({ type: "weapon", name, system: { group, material: { type: material } } });
    assert.deepEqual([looksMetal(weapon("Longsword", "sword")), looksMetal(weapon("Club", "club")), looksMetal(weapon("Longbow", "bow")), looksMetal(weapon("Club", "club", "cold-iron")), looksMetal({ type: "shield", name: "Steel Shield", system: {} }), looksMetal({ type: "shield", name: "Wooden Shield", system: {} })], [true, false, false, true, true, false]);
    const card = createDropCard({ dropHeld: save.dropHeld, item: { name: "Deadweight Snare" }, user: { name: "Setter" }, creatures: [{ actorUuid: "Actor.a", name: "Walker", held: [{ id: "1", name: "Longsword", metal: true }, { id: "2", name: "Club", metal: false }] }] });
    assert.deepEqual(card.entries[0].held.map((one) => one.ticked), [true, false]);
    assert.match(dropCardHTML(card, { canApply: true }), /data-air-drop="0:0" checked.*data-air-drop="0:1">/s);
});

test("a property rune's DC and dice (2026-10-27): Storm Arrow from a shock-rune weapon — DC 27, the rune's dice none for the Strike; its own 3d12 kept for the save (Corpsecaller Round's 4d10 too)", async () => {
    const { strikeRules } = await import("../src/live/strike-card.js");
    const [{ plan: arrow }] = compileActivations(item("Storm Arrow"), options);
    assert.deepEqual([arrow.strike.runeDC.rune, arrow.strike.runeDC.dc, arrow.strike.withoutRune, arrow.strike.notes, arrow.partial], ["shock", 27, "shock", [], undefined]);
    assert.equal(arrow.strike.save.resolution.sharedDamage.components[0].formula, "3d12[electricity]");
    const rule = strikeRules(arrow, { weaponId: "bow", label: "Storm Arrow" }).find((entry) => entry.key === "DamageAlteration");
    assert.deepEqual([rule.property, rule.value, rule.slug, rule.mode], ["dice-number", 0, "shock", "override"]);
    const [{ plan: round }] = compileActivations(item("Corpsecaller Round"), options);
    assert.equal(round.strike.save.resolution.sharedDamage.components[0].formula, "4d10[void]");
});

test("lights put out beside a Strike's extra damage (2026-10-27): Void Sickle's Light Harvest — +1d6 void on its next melee Strike, the lights a line of the card", async () => {
    const { strikeLines } = await import("../src/live/strike-card.js");
    const [{ plan: sickle }] = compileActivations(item("Void Sickle"), options);
    assert.deepEqual([sickle.strike.damage[0].damageType, sickle.strike.notes, sickle.partial], ["void", [], undefined]);
    assert.ok(strikeLines(sickle).includes("Non-magical light sources within 30 feet go out as it's used (turn those lights off on the map)"));
});

test("a new save against an affliction beside a flat check (2026-10-27): Quenching Potion's poison, which can't worsen from it — recovery.afflictionSave", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { readRecovery, recoveryNotes } = await import("../src/compiler/recovery.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const potion = compileItem(item("Quenching Potion"), options);
    assert.deepEqual([potion.item.recovery.afflictionSave, potion.item.recovery.dc, potion.partial], [{ traits: ["poison"], noWorse: true }, 10, undefined]);
    const text = plainText(item("Quenching Potion").system.description.value);
    assert.deepEqual([recoveryNotes(text), readRecovery(text).types], [[], ["acid", "fire", "poison", "void"]]);
});

test("an aura over PF2e's own aura Effect (2026-10-27): Nightmare's Lament's Fuming Cloak — the zone on its wielder with Aura: Fuming Cloak, the turn-start Sickened 2 save (negates) with its minute's immunity", async () => {
    const [{ plan: cloak }] = compileActivations(item("Nightmare's Lament"), options);
    const save = cloak.zone.saves[0];
    assert.deepEqual([cloak.builtin, cloak.ownEffect.label, cloak.zone.area, save.when, save.plan.resolution.check.against.value, save.plan.trigger.immunity.duration, cloak.partial], ["zone", "Aura: Fuming Cloak", { type: "emanation", value: 15 }, ["start"], 23, { value: 1, unit: "minutes" }, undefined]);
    assert.deepEqual(save.plan.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.value]), [["sickened", 2]]);
    assert.match(cloak.zone.notes.join(" "), /holding its breath .* \(the GM's call\)\.$/);
});

test("pulling free with a skill check (2026-10-27): Antler Arrow — its save's endEarly for the rows that immobilize, DC 10 Athletics (15 after a critical hit, the card's tick)", async () => {
    const { tryWords } = await import("../src/live/end-early-card.js");
    const [{ plan: arrow }] = compileActivations(item("Antler Arrow"), options);
    const endEarly = arrow.strike.save.endEarly;
    assert.deepEqual([endEarly.how, endEarly.degrees, endEarly.conditions, arrow.strike.notes, arrow.partial], [{ kind: "check", skill: "athletics", dc: 10, criticalDC: 15 }, ["failure", "criticalFailure"], ["immobilized"], [], undefined]);
    assert.deepEqual([tryWords(endEarly, { step: 0 }), tryWords(endEarly, { step: 0 }, true)], ["an Interact action: a DC 10 Athletics check", "an Interact action: a DC 15 Athletics check"]);
});

test("a way to end it for each row (2026-10-27): Glittering Snare — an Interact action on a success, a 2-action manipulate activity on a failure, a 3-action one on a critical failure; its container a line", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { tryWords } = await import("../src/live/end-early-card.js");
    const snare = compileItem(item("Glittering Snare"), options);
    const endEarly = snare.zone.saves[0].plan.endEarly;
    assert.deepEqual([endEarly.degrees, snare.partial], [["success", "failure", "criticalFailure"], undefined]);
    assert.deepEqual(["success", "failure", "criticalFailure"].map((degree) => tryWords(endEarly, { step: 0, degree })), ["1 Interact action spent", "2 manipulate actions spent", "3 manipulate actions spent"]);
    assert.match(snare.zone.notes[0], /or to open the container it's hidden in/);
});

test("a row's modifier ended by actions others can help with (2026-10-27): Crackling Bubble Gum's pop — its failing rows' endEarly, a total of 3 Interact actions", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { tryWords } = await import("../src/live/end-early-card.js");
    const pop = compileItem(item("Crackling Bubble Gum (Lesser)"), options).ways[1].plan;
    assert.deepEqual([pop.endEarly.degrees, pop.endEarly.how], [["failure", "criticalFailure"], { kind: "actions", count: 3, helped: true }]);
    assert.equal(tryWords(pop.endEarly, { step: 0, degree: "failure" }), "3 Interact actions spent (by it or creatures helping, not all at once)");
});

test("a cast spell ended early by a save, and its first save worse after a critical hit (2026-10-27): Silencing Ammunition — cast.endEarly, DC 25 Will to tug it out; saveFirst.criticalPenalty -2", async () => {
    const { tryWords } = await import("../src/live/end-early-card.js");
    const [{ plan: arrow }] = compileActivations(item("Silencing Ammunition"), options);
    const cast = arrow.strike.cast;
    assert.deepEqual([cast.saveFirst.criticalPenalty, cast.endEarly.how, cast.endEarly.effects, arrow.strike.notes, arrow.partial], [{ value: -2, type: "circumstance" }, { kind: "check", save: "will", dc: 25 }, ["Spell Effect: Silence"], [], undefined]);
    assert.equal(tryWords(cast.endEarly, { step: 0 }), "an Interact action: a DC 25 Will save");
});

test("a missile that reveals the creature it stays in (2026-10-27): Beacon Shot — its hit's note Effect, Hidden while Invisible for 1 minute; pulled out by the end-early card's DC 20 Athletics", async () => {
    const [{ plan: shot }] = compileActivations(item("Beacon Shot"), options);
    const note = shot.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([note.duration.value, note.duration.unit, note.rules[0].predicate, shot.strike.endEarly.how, shot.strike.notes, shot.partial], [1, "minutes", ["self:condition:invisible"], { kind: "check", skill: "athletics", dc: 20 }, [], undefined]);
});

test("an affliction under its own heading, handed over by the activation that names it: Devil's Trident's sewer haze — the DC 25 exposure, the disease's own name and traits", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [critical] = activations(item("Devil's Trident"), options);
    const resolution = critical.plan.resolution;
    assert.deepEqual([resolution.check.against.value, resolution.afflictionHandoff.name, resolution.afflictionHandoff.traits, resolution.afflictionHandoff.dc, resolution.outcomes.criticalFailure.affliction.stage], [25, "Sewer Haze", ["disease", "virulent"], 23, 2]);
});

test("a longer reach for the item's own Strikes: Soulpiercer's Extend, an Effect saying the 15 feet until the end of its user's next turn (PF2e has no rule for it)", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { weaponEffectSource } = await import("../src/live/card.js");
    const [extend] = activations(item("Soulpiercer"), options);
    const reach = extend.plan.item.weapon[0];
    assert.deepEqual([reach.property, reach.value, reach.duration.expiry, extend.plan.partial], ["reach", 15, "turn-end", undefined]);
    const source = weaponEffectSource(reach, { item: { name: "Soulpiercer", uuid: "Actor.a.Item.b" } });
    assert.deepEqual([source.system.rules, /reach of 15 feet/.test(source.system.description.value)], [[], true]);
});

test("a square that only makes a noise when set off (2026-10-27): Alarm Snare's and Popdust's zone, gone once a creature enters, its set-off a note to the GM; Alarm Snare not by a Tiny creature (only.minSize, ability 411cb9f)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { zoneActions, zoneSetOff } = await import("../../pf2e-automatic-ability-resolution/src/live/zones.js");
    const snare = compileItem(item("Alarm Snare"), options);
    assert.deepEqual([snare.builtin, snare.zone.once, snare.partial, snare.zone.saves[0].only], ["zone", true, undefined, { minSize: "sm" }]);
    assert.match(snare.zone.saves[0].note, /\(100 to 500 feet\)/);
    assert.deepEqual([zoneActions(snare.zone, "tokenEnter", { size: "tiny" }).length, zoneActions(snare.zone, "tokenEnter", { size: "sm" }).map((action) => action.kind)], [0, ["note"]]);
    // (Hoof Stakes Snare's Large or larger; Trip Snare's Medium or smaller, only.maxSize, ability 4461e8f.)
    assert.deepEqual(compileItem(item("Hoof Stakes Snare"), options).zone.saves[0].only, { minSize: "lg" });
    const trip = compileItem(item("Trip Snare"), options);
    assert.deepEqual(trip.zone.saves[0].only, { maxSize: "med" });
    assert.deepEqual([zoneActions(trip.zone, "tokenEnter", { size: "lg" }).length, zoneActions(trip.zone, "tokenEnter", { size: "med" }).map((action) => action.kind)], [0, ["save"]]);
    const popdust = compileItem(item("Popdust"), options);
    const actions = zoneActions(popdust.zone, "tokenEnter", {});
    assert.deepEqual([actions.map((action) => action.kind), zoneSetOff(popdust.zone, actions), popdust.partial], [["note"], true, undefined]);
});

test("a wider scatter for the next Strike (2026-10-27): Magnetite Scope's Expansion, an Effect saying the 5 feet for the turn that a Strike with a scatter weapon ends (PF2e has no rule for a scatter radius)", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { weaponEffectSource } = await import("../src/live/card.js");
    const [expansion] = activations(item("Magnetite Scope"), options);
    const scatter = expansion.plan.item.weapon[0];
    assert.deepEqual([scatter.property, scatter.value, scatter.duration.expiry, expansion.plan.partial], ["scatter", 5, "turn-end", undefined]);
    const source = weaponEffectSource(scatter, { item: { name: "Magnetite Scope", uuid: "Actor.a.Item.b" } });
    assert.deepEqual([source.system.rules, source.flags["pf2e-automatic-item-resolution"].endsOnStrike], [[], { trait: "scatter" }]);
    assert.match(source.system.description.value, /scatter radius 5 feet wider/);
    assert.equal(activations(item("Magnetite Scope (Greater)"), options)[0].plan.item.weapon[0].value, 10);
});

test("an Effect a Strike with a weapon of a trait ends: only that Strike (scripts/ends-on-strike.js)", async () => {
    const { endOnStrike } = await import("../scripts/ends-on-strike.js");
    const deleted = [];
    const actor = { itemTypes: { effect: [{ id: "scatter", flags: { "pf2e-automatic-item-resolution": { endsOnStrike: { trait: "scatter" } } } }, { id: "other", flags: {} }] }, deleteEmbeddedDocuments: async (type, ids) => deleted.push(...ids) };
    const strike = (traits) => ({ actor, flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: ["action:strike", ...traits.map((trait) => `item:trait:${trait}`)] } } } });
    assert.deepEqual(await endOnStrike(strike(["agile"])), []);
    assert.deepEqual(await endOnStrike(strike(["concussive", "scatter-10"])), ["scatter"]);
    assert.deepEqual(deleted, ["scatter"]);
});

test("a light's radius its user picks (2026-10-27): Twilight Lantern's dim moonlight, 60 feet standard, from 5 feet up to double (Lesser) or quadruple (Major) it", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { lightText, lightEffectSource } = await import("../src/live/card.js");
    const [lesser] = activations(item("Twilight Lantern (Lesser)"), options);
    const [light] = lesser.plan.item.light;
    assert.deepEqual([light.bright, light.dim, light.pick, lesser.plan.partial], [0, 60, { min: 5, max: 120 }, undefined]);
    assert.equal(activations(item("Twilight Lantern (Major)"), options)[0].plan.item.light[0].pick.max, 240);
    assert.match(lightText({ ...light, dim: 15 }), /^Dim light in 15 feet \(its radius picked, 5 to 120 feet\), until put out/);
    assert.deepEqual(lightEffectSource({ ...light, dim: 15 }, { item: { name: "Twilight Lantern (Lesser)" } }).system.rules[0].value, { bright: 0, dim: 15 });
});

test("its user's own actions as the whole of an activation (2026-10-27): Swiftmount Saddle's Mount, Spangled Rider's Suit's dismount, Maestro's Chair's Stride and Sustain, Sandals of the Stag's jump — a line of the card", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const lines = ["Swiftmount Saddle", "Spangled Rider's Suit", "Maestro's Chair", "Sandals of the Stag", "Clockwork Diving Suit"].map((name) => activations(item(name), options).find((entry) => entry.plan?.notes?.length)?.plan);
    assert.ok(lines.every((plan) => plan && /\(its own (?:actions?|action on the map|move on the map)\)\.$/.test(plan.notes[0]) && !plan.partial && !plan.noteOnly));
    assert.equal(lines[0].notes[0], "Mount the creature wearing it (its own action on the map).");
});

test("a creature its user picks off-guard to its next melee attack this turn (2026-10-27): Boots of the Dead's One of You, the core's scope", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [boots] = activations(item("Boots of the Dead"), options);
    const [offGuard] = boots.plan.resolution.outcomes.success.effects;
    assert.deepEqual([boots.plan.targeting.target, offGuard.slug, offGuard.scope, offGuard.duration.expiry, boots.plan.trigger.frequency.per], ["1 undead creature", "off-guard", { against: "actor", attacks: "melee", uses: 1 }, "turn-end", "hour"]);
});

test("a whetstone's own rules on its weapon (2026-10-27): Pinpoint Arrowhead's cover one degree less — +1 to the weapon's ranged Strikes at a target in lesser or standard cover, +2 in greater, by the weapon's id; Flare Snare's flare a note to the GM", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { attackRidersEffectSource } = await import("../scripts/attack-riders.js");
    const pinpoint = compileItem(item("Pinpoint Arrowhead"), options);
    const [rider] = pinpoint.item.attackRiders.riders;
    assert.deepEqual([rider.weapon, rider.rules.map((rule) => rule.value), pinpoint.item.attackRiders.duration.value, pinpoint.partial], [true, [1, 2], 1, undefined]);
    const source = attackRidersEffectSource(pinpoint.item.attackRiders, { item: { name: "Pinpoint Arrowhead" }, weapon: { id: "bow1", name: "Shortbow" } });
    assert.deepEqual(source.system.rules.map((rule) => rule.predicate.at(-1)), ["item:id:bow1", "item:id:bow1"]);
    assert.match(source.system.description.value, /With Shortbow: its ranged Strikes treat the target&#39;s cover as one degree less/);
    const flare = compileItem(item("Flare Snare"), options);
    assert.deepEqual([flare.builtin, flare.zone.once, /2 miles off by day or 5 miles/.test(flare.zone.saves[0].note)], ["zone", true, true]);
});

test("own actions as card lines and whetstone words (2026-10-27): The Cricket's long Stride, Windstep Sheath's Step with Quick Draw on the weapon picked", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { compileItem } = await import("../src/compiler/index.js");
    const cricket = activations(item("The Cricket"), options).find((entry) => entry.plan?.notes?.length).plan;
    assert.match(cricket.notes[0], /^Stride .* up to three times its Speed, triggering no reactions .*\(its own move on the map\)\.$/);
    const sheath = compileItem(item("Windstep Sheath"), options);
    const [rider] = sheath.item.attackRiders.riders;
    assert.deepEqual([rider.weapon, rider.rules, sheath.partial], [true, [], undefined]);
    assert.match(rider.words, /^Quick Draw .* Step, .*\(its own action\)$/);
});

test("a condition its user avoids gaining once (2026-10-27): Immortal Bastion's Doomed or Wounded, Urn of Ashes' Doomed (the urn's own doom a line) — a readied Effect flagged prevents", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { ruleEffectSource } = await import("../src/live/card.js");
    const bastion = activations(item("Immortal Bastion"), options).find((entry) => entry.plan?.item?.ruleEffects)?.plan;
    const [entry] = bastion.item.ruleEffects;
    assert.deepEqual([entry.prevents, entry.duration.unit, bastion.partial], [["doomed", "wounded"], "rounds", undefined]);
    assert.deepEqual(ruleEffectSource(entry, { item: { name: "Immortal Bastion" } }).flags["pf2e-automatic-item-resolution"].prevents, ["doomed", "wounded"]);
    const urn = activations(item("Urn of Ashes"), options).find((one) => one.plan?.item?.ruleEffects)?.plan;
    assert.deepEqual([urn.item.ruleEffects[0].prevents, urn.partial], [["doomed"], true]);
});

test("a cast said again in other words (2026-10-27): Talonstrike Blade's 'on the creature you just dealt damage to, with a DC of 34', Dazzling Shortbow's burst within 60 feet (its range, the burst's radius past it); Greater Brilliant's ignored resistances are PF2e's rune's", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const talons = activations(item("Talonstrike Blade (Greater)"), options).find((entry) => entry.plan?.builtin === "cast-spell").plan;
    assert.deepEqual([talons.dc, talons.partial], [34, undefined]);
    const [shortbow] = activations(item("Dazzling Shortbow"), options);
    assert.deepEqual([shortbow.plan.castRange.feet, shortbow.plan.castRange.area, shortbow.plan.partial], [60, 10, undefined]);
    const [brilliant] = activations(item("Brilliant (Greater)"), options);
    assert.deepEqual([brilliant.plan.builtin, brilliant.plan.partial], ["counteract", undefined]);
    // (Songbird's Brush keeps its good-aligned creatures, the GM's: partial.)
    assert.equal(first("Songbird's Brush").partial, true);
});

test("one cast of several the words name (2026-10-27): Spark Dancer's Fireball or Lightning Bolt at 7th rank, its user's pick on the card", () => {
    const dancer = first("Spark Dancer");
    assert.deepEqual([dancer.choices.map((choice) => `${choice.spell.name}@${choice.rank}`), dancer.dc, dancer.partial], [["Fireball@7", "Lightning Bolt@7"], 30, undefined]);
});

test("a cast's rank and DC from its caster (2026-10-27): The Inquisitor's Mind Probe at half its level rounded down (at least 5) and its class DC or spell DC, its two actions the activation's", async () => {
    const { castRankAt } = await import("../src/compiler/cast-owner.js");
    const { castCardHTML } = await import("../src/live/cast-card.js");
    const inquisitor = first("The Inquisitor");
    assert.deepEqual([inquisitor.castRank.min, inquisitor.castDC.from, Boolean(inquisitor.castTime), inquisitor.partial], [5, "class-spell", true, undefined]);
    assert.deepEqual([castRankAt(inquisitor.castRank, 8), castRankAt(inquisitor.castRank, 13)], [5, 6]);
    const html = castCardHTML({ status: "open", plan: inquisitor, item: { name: "The Inquisitor" }, user: { name: "Cleric" }, drinker: null, drinkers: [], choice: 0, results: [] });
    assert.match(html, /rank half its caster&#39;s level, rounded down \(at least 5\), DC its caster&#39;s class DC or spell DC, the higher/);
});

test("an item spent by a flat check after its use (2026-10-27): Aeon Stone (Pale Lavender Ellipsoid)'s DC 5, into an Aeon Stone (Consumed) on a failure; the card says it", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { counteractCardHTML } = await import("../src/live/counteract-card.js");
    const [stone] = activations(item("Aeon Stone (Pale Lavender Ellipsoid)"), options);
    const { burnout } = stone.plan.item.counteract;
    assert.deepEqual([burnout.dc, burnout.becomes.name, stone.plan.partial], [5, "Aeon Stone (Consumed)", undefined]);
    const html = counteractCardHTML({ status: "open", step: "pick", drinkers: [], drinker: 0, user: { name: "Wizard" }, item: { name: "Aeon Stone" }, counteract: stone.plan.item.counteract, rows: [], results: [] });
    assert.match(html, /Then a flat check \(DC 5\); if it fails, the item turns into Aeon Stone \(Consumed\)\./);
});

test("a cast's own time, not sustained or sustained longer (2026-10-27): the Ethereal rune's Ethereal Jaunt for 10 minutes without concentration, Phantom Shroud's Sustain up to 10 minutes", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { lastsWords } = await import("../src/live/cast-card.js");
    const ethereal = activations(item("Ethereal"), options).find((entry) => entry.plan?.builtin === "cast-spell").plan;
    assert.deepEqual([ethereal.castDuration.value, ethereal.castDuration.sustained, ethereal.partial], [10, undefined, undefined]);
    const shroud = activations(item("Phantom Shroud"), options).find((entry) => entry.plan?.builtin === "cast-spell").plan;
    assert.deepEqual([shroud.castDuration.value, shroud.castDuration.sustained, shroud.partial], [10, true, undefined]);
    assert.equal(lastsWords(shroud.castDuration), "lasts 10 minutes at most, while its user Sustains it (end it sooner if they stop)");
});

test("a condition on its user with the cast (2026-10-27): Locket of Sealed Nightmares' fatigued beside its 9th-rank Hallucination, Sleep or Weird", async () => {
    const { castCardHTML } = await import("../src/live/cast-card.js");
    const locket = first("Locket of Sealed Nightmares");
    assert.deepEqual([locket.castSelf.slug, locket.choices.length, locket.partial], ["fatigued", 3, undefined]);
    const html = castCardHTML({ status: "open", plan: locket, item: { name: "Locket" }, user: { name: "Bard" }, drinker: null, drinkers: [], choice: 0, results: [] });
    assert.match(html, /With it, its user becomes fatigued\./);
});

test("another spell from a level on (2026-10-27): The Sickness's Abyssal Plague, or Spiritual Epidemic from 15th level, at half its caster's level (at least 6) and its class DC or spell DC", async () => {
    const { castCardHTML } = await import("../src/live/cast-card.js");
    const sickness = first("The Sickness");
    assert.deepEqual([sickness.choices.map((choice) => [choice.spell.name, choice.minLevel ?? null]), sickness.castRank.min, sickness.castDC.from, sickness.partial], [[["Abyssal Plague", null], ["Spiritual Epidemic", 15]], 6, "class-spell", undefined]);
    const html = castCardHTML({ status: "open", plan: sickness, item: { name: "The Sickness" }, user: { name: "Oracle" }, drinker: null, drinkers: [], choice: 0, results: [] }, { canApply: true });
    assert.match(html, /Spiritual Epidemic \(from level 15\)/);
});

test("harrow cards' rank and DC in other words (2026-10-27): The Winged Serpent's 'level of this spell … (minimum 9th)', The Betrayal's class DC alone, The Joke's Laughing Fit on up to 10 creatures", async () => {
    const { castCardHTML } = await import("../src/live/cast-card.js");
    assert.equal(first("The Winged Serpent").castRank.min, 9);
    const betrayal = first("The Betrayal");
    assert.deepEqual([betrayal.castRank.min, betrayal.castDC.from], [6, "class"]);
    const joke = first("The Joke");
    assert.deepEqual([joke.castTargets.max, joke.castDC.from, joke.partial], [10, "class", undefined]);
    const html = castCardHTML({ status: "open", plan: joke, item: { name: "The Joke" }, user: { name: "Bard" }, drinker: null, drinkers: [], choice: 0, results: [] });
    assert.match(html, /DC its caster&#39;s class DC, up to 10 targets/);
});

test("the same spell on another creature from a level on (2026-10-27): The Winged Serpent's Foresight on its user, or by touch on another from 17th level", async () => {
    const { castCardHTML } = await import("../src/live/cast-card.js");
    const serpent = first("The Winged Serpent");
    assert.deepEqual([serpent.choices.map((choice) => [choice.self, choice.minLevel ?? null, Boolean(choice.touch)]), serpent.partial], [[[true, null, false], [false, 17, true]], undefined]);
    const html = castCardHTML({ status: "open", plan: serpent, item: { name: "The Winged Serpent" }, user: { name: "Oracle" }, drinker: null, drinkers: [], choice: 0, results: [] }, { canApply: true });
    assert.match(html, /Foresight on another creature by touch \(from level 17\)/);
});

test("its user's own doing as lines and words (2026-10-27): Conrasu Coin (Bythos)'s longer Stride with Nimble Roll, a line of its card; Sure-Step Potion's sure footing, words on its Effect for the hour", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const coin = compileItem(item("Conrasu Coin (Bythos)"), options);
    assert.deepEqual([coin.partial, coin.bonus.limits], [undefined, ["With the Nimble Roll feat, if the attack misses, it can Stride up to 20 feet instead (its own move)."]]);
    // (And Immovable Potion's DC 40 to move it, words on its Effect.)
    const anchored = compileItem(item("Immovable Potion"), options);
    assert.deepEqual([anchored.partial, anchored.item.ruleEffects[0].words], [undefined, "The DC to move it from its place, knocking it Prone too, is 40"]);
    const potion = compileItem(item("Sure-Step Potion"), options);
    assert.deepEqual([potion.partial, potion.item.ruleEffects[0].name, potion.item.ruleEffects[0].duration.unit], [undefined, "sure footing", "hours"]);
});

test("a snare's own area and trait (2026-10-27): Spirit Trap's 10-foot square, set off only by a creature with the spirit trait (only.traits)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { zoneActions } = await import("../../pf2e-automatic-ability-resolution/src/live/zones.js");
    const trap = compileItem(item("Spirit Trap"), options);
    assert.deepEqual([trap.zone.area, trap.zone.saves[0].only, trap.partial], [{ type: "square", value: 10 }, { traits: ["spirit"] }, undefined]);
    assert.deepEqual([zoneActions(trap.zone, "tokenEnter", { traits: ["humanoid"] }).length, zoneActions(trap.zone, "tokenEnter", { traits: ["spirit", "undead"] }).map((action) => action.kind)], [0, ["save"]]);
});

test("healing just after the triggering damage (2026-10-27): Crown of the Fire Eater's lower of 15 and the fire damage before resistance, beside its fire resistance 15", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { readiedWords } = await import("../src/live/fortune-card.js");
    const { damageOfType } = await import("../scripts/heal-after.js");
    const crown = activations(item("Crown of the Fire Eater"), options).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual([crown.bonus.resistance.value, crown.bonus.healAfter, crown.partial], [15, { type: "fire", max: 15 }, undefined]);
    assert.match(readiedWords(crown), /then it regains Hit Points equal to its fire damage before resistance, at most 15/);
    assert.equal(damageOfType({ instances: [{ type: "fire", total: 9 }, { type: "slashing", total: 4 }, { type: "fire", total: 3 }] }, "fire"), 12);
});

test("a snare's save for everyone around its square (2026-10-27): Shrapnel Snare's and Puff Dragon's 10-foot emanation, Bomb Snare's around the creature — the ability module's zone.burst, no save of its own", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const shrapnel = compileItem(item("Shrapnel Snare"), options);
    assert.deepEqual([shrapnel.zone.saves, shrapnel.zone.burst.area, shrapnel.zone.burst.plan.resolution.check.against.value, shrapnel.partial], [[], { type: "emanation", value: 10 }, 31, undefined]);
    // (Its critical success's slip, "The creature in unaffected,", read as meant.)
    assert.deepEqual(shrapnel.zone.burst.plan.resolution.outcomes.criticalSuccess.manualInstructions, undefined);
    assert.deepEqual(compileItem(item("Puff Dragon"), options).zone.burst.area, { type: "emanation", value: 10 });
    const bomb = compileItem(item("Bomb Snare"), options);
    assert.deepEqual([bomb.zone.burst.area, bomb.zone.burst.from], [{ type: "emanation", value: 5 }, "creature"]);
    // (Aimed back the way the creature came, ability baa2411: Flame Drake Snare's cone, Frost Worm Snare's line.)
    const drake = compileItem(item("Flame Drake Snare"), options);
    assert.deepEqual([drake.zone.burst.area, drake.partial], [{ type: "cone", value: 15 }, undefined]);
    assert.deepEqual(compileItem(item("Frost Worm Snare"), options).zone.burst.area, { type: "line", value: 30 });
});

test("a readied bonus its user's own doing ends (2026-10-27): Scale of Igroon's Stealth bonus, ended by another activation or a Shield Block; the Immovable rune's Force Open DC in words", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const { readiedWords } = await import("../src/live/fortune-card.js");
    const scale = activations(item("Scale of Igroon"), options).find((entry) => entry.plan?.builtin === "readied-bonus").plan;
    assert.deepEqual([scale.bonus.endsOn, scale.partial], [{ activate: true, shieldBlock: true }, undefined]);
    assert.match(readiedWords(scale), /ending if it Activates another item or uses Shield Block/);
    const immovable = activations(item("Immovable"), options).find((entry) => entry.plan?.item?.ruleEffects).plan;
    assert.deepEqual([immovable.partial, /DC 40 Athletics check to Force Open/.test(immovable.item.ruleEffects[0].words)], [undefined, true]);
});

test("an item's own PF2e toggle for these jumps (2026-10-27): Kinburi's Sandals of Bounding's Light-Footed Bound, its +2 till the turn's end, the two jumps its user's own", async () => {
    const { compileActivations: activations } = await import("../src/compiler/permanent.js");
    const [bound] = activations(item("Kinburi's Sandals of Bounding"), options);
    assert.deepEqual([bound.plan.builtin, bound.plan.modes[0].plan.option, bound.plan.until, bound.plan.partial], ["modes", "light-footed-bound", "turn-end", undefined]);
    assert.match(bound.plan.notes[0], /two High Jumps or Long Jumps.*\(its own actions\)\.$/);
});
