// Unique items' and artifacts' own rules, built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be
// automated"): src/compiler/unique-rules.js and the cards that play them.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { featUseCardHTML, createFeatUseCard, oneMoreUse, spentFeats } from "../src/live/feat-use-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const plans = (name) => compileActivations(item(name), options).map((entry) => entry.plan);
const success = (plan) => plan.resolution.outcomes.success;

test("Ancestral Embrace: one more use of the ancestry feat just used, the feat-use card's — its spent feats a day picked, one use given back", () => {
    const [embrace] = plans("Ancestral Embrace");
    assert.deepEqual([embrace.builtin, embrace.featUse.category, embrace.trigger.frequency.max, embrace.partial, embrace.noteOnly], ["feat-use", "ancestry", 1, undefined, undefined]);
    assert.equal(routeOf(embrace), "feat-use");
    const feats = [
        { id: "a", name: "Fey Disappearance", system: { category: "ancestry", frequency: { max: 1, value: 0, per: "day" } } },
        { id: "b", name: "Unused Gift", system: { category: "ancestry", frequency: { max: 1, value: 1, per: "day" } } },
        { id: "c", name: "Hourly Trick", system: { category: "ancestry", frequency: { max: 1, value: 0, per: "PT1H" } } },
        { id: "d", name: "Class Power", system: { category: "class", frequency: { max: 1, value: 0, per: "day" } } }
    ];
    const spent = spentFeats(embrace.featUse, feats);
    assert.deepEqual(spent.map((feat) => feat.id), ["a"]);
    assert.equal(oneMoreUse(spent[0], "Valeros").value, 1);
    assert.equal(oneMoreUse({ ...spent[0], value: 1 }, "Valeros"), null);
    const html = featUseCardHTML(createFeatUseCard({ plan: embrace, item: { name: "Ancestral Embrace" }, user: { name: "Valeros" }, feats: spent }), { canApply: true });
    assert.match(html, /data-air-field="pick"/);
    assert.match(html, /Fey Disappearance \(0\/1\)/);
});

test("Ancestral Embrace: Legend Lore about its ancestry in 1 hour with no secondary casters, a note Effect on its user for that hour", () => {
    const lore = plans("Ancestral Embrace")[1];
    assert.deepEqual([lore.builtin, lore.partial, lore.noteOnly, lore.automation.level], [undefined, undefined, undefined, "automatic"]);
    const [note] = success(lore).noteEffects;
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "hours"]);
    assert.match(note.text, /Legend Lore/);
    assert.match(note.text, /no secondary casters/);
});

test("Ancestral Embrace: Avatar with the armor's own Speeds and Strikes — PF2e's BattleForm on its user for the minute, the blowgun's poison dice its own", () => {
    const avatar = plans("Ancestral Embrace")[2];
    assert.deepEqual([avatar.builtin, avatar.partial, avatar.rank, avatar.trigger.frequency.max], [undefined, undefined, 10, 1]);
    assert.ok(avatar.traits.includes("polymorph"));
    const [note] = success(avatar).noteEffects;
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "minutes"]);
    const [form, poison] = note.rules;
    assert.equal(form.key, "BattleForm");
    assert.deepEqual([form.overrides.size, form.overrides.tempHP, form.overrides.armorClass.modifier, form.overrides.speeds.land, form.overrides.skills.athletics.modifier], ["huge", 30, "25 + @actor.level", 70, 35]);
    assert.deepEqual(form.overrides.strikes.spear.traits, ["unarmed", "reach-15", "thrown-50"]);
    assert.deepEqual(form.overrides.strikes.spear.damage, { dice: 6, die: "d6", modifier: 6, damageType: "piercing" });
    assert.deepEqual([form.overrides.strikes.blowgun.ability, form.overrides.strikes.blowgun.range.max, form.overrides.strikes.blowgun.modifier], ["dex", 120, 33]);
    assert.deepEqual([poison.key, poison.diceNumber, poison.dieSize, poison.damageType, poison.predicate[0]], ["DamageDice", 5, "d6", "poison", "item:slug:blowgun"]);
    assert.match(note.text, /walks on air/);
    assert.match(note.text, /ignores difficult terrain/);
    assert.equal(routeOf(avatar), "item");
});

test("Forgefather's Seal's Retributive Rebuff: Earthquake at DC 40 on the attacker, and the readied card's resistance 100 against the attack beside it", async () => {
    const { routeOf: route } = await import("../src/live/route.js");
    const [rebuff] = plans("Forgefather's Seal");
    assert.deepEqual([rebuff.builtin, rebuff.spell.name, rebuff.dc, rebuff.partial, rebuff.notes], ["cast-spell", "Earthquake", 40, undefined, undefined]);
    assert.match(rebuff.castLines.at(-1), /60-foot burst/);
    assert.deepEqual([rebuff.alsoReadied.builtin, rebuff.alsoReadied.bonus.resistance, rebuff.alsoReadied.bonus.against], ["readied-bonus", { type: "all-damage", value: 100 }, true]);
    assert.equal(route(rebuff), "cast");
    assert.equal(route(rebuff.alsoReadied), "fortune");
});

test("Forgefather's Seal's Seal of Mending: an item within reach remade to full Hit Points up to level 24, the shields' repair stopped till its next rest", async () => {
    const { objectsText } = await import("../src/live/objects-card.js");
    const { pauseEffectSource } = await import("../src/live/shield-repair.js");
    const mending = plans("Forgefather's Seal")[1];
    assert.deepEqual([mending.builtin, mending.partial, mending.objects.op, mending.objects.reach, mending.objects.maxLevel, mending.objects.pauses], ["objects", undefined, "repair", true, 24, { what: "shield-repair", untilRest: true }]);
    assert.equal(routeOf(mending), "objects");
    const words = objectsText(mending.objects, { name: "Forgefather's Seal" });
    assert.match(words, /even if destroyed/);
    assert.match(words, /within its reach, of level 24 or lower/);
    assert.match(words, /don't recover Hit Points at the start of its turns until its next daily preparations/);
    const pause = pauseEffectSource(mending.objects.pauses, { item: { name: "Forgefather's Seal" }, user: {} });
    assert.deepEqual([pause.flags["pf2e-automatic-item-resolution"].pauses, pause.flags["pf2e-automatic-item-resolution"].untilRest, pause.system.duration.unit], ["shield-repair", true, "unlimited"]);
});

test("Forgefather's Seal's passive: its wearer's held shields recover 10 Hit Points at each turn's start, a destroyed one not, never past the maximum", async () => {
    const { readShieldRepair, shieldRepairs } = await import("../src/compiler/shield-repair.js");
    const repair = readShieldRepair(item("Forgefather's Seal").system.description.value);
    assert.deepEqual(repair, { hp: 10 });
    assert.equal(readShieldRepair(item("Ancestral Embrace").system.description.value), null);
    const shields = [{ id: "a", name: "Steel Shield", hp: { value: 15, max: 20 } }, { id: "b", name: "Tower Shield", hp: { value: 0, max: 20 } }, { id: "c", name: "Buckler", hp: { value: 6, max: 6 } }, { id: "d", name: "Sturdy", hp: { value: 30, max: 100 } }];
    assert.deepEqual(shieldRepairs(shields, repair).map((entry) => [entry.id, entry.to]), [["a", 20], ["d", 40]]);
});

test("Cane of the Maelstrom's Creation: unlimited, and a second choice with its user's Crafting check for a delicate or complex object", () => {
    const creation = plans("Cane of the Maelstrom")[2];
    assert.deepEqual([creation.builtin, creation.partial, creation.notes, creation.castDuration.unit, creation.choices.length], ["cast-spell", undefined, undefined, "unlimited", 2]);
    assert.equal(creation.choices[0].castCheck, undefined);
    assert.deepEqual(creation.choices[1].castCheck, { statistic: "crafting", why: "to make it a delicate or complex object", dc: null });
    assert.match(creation.choices[1].when, /Crafting check/);
    assert.equal(routeOf(creation), "cast");
});

test("Shadowed Scale, the Jungle Secret: a body its user's last melee Strike killed turned to soil — the gate, its note Effect on that body, marked", async () => {
    const { gateMet } = await import("../src/compiler/strike-gate.js");
    const [soil] = plans("Shadowed Scale, the Jungle Secret");
    assert.deepEqual(soil.gate, { strike: { range: "melee", maneuvers: [], any: true, killed: true } });
    assert.deepEqual([soil.atTarget, soil.partial, soil.noteOnly, soil.builtin], [true, undefined, undefined, undefined]);
    assert.equal(routeOf(soil), "save");
    const [note] = success(soil).noteEffects;
    assert.deepEqual([note.label, note.duration, note.rules[0].option], ["Decomposed into soil", null, "decomposed-into-soil"]);
    assert.match(note.text, /Miracle or Wish/);
    // (Any of its user's melee Strikes, not the mask's own: a hit with a sword counts, a ranged one doesn't.)
    const roll = { actorUuid: "Actor.a", type: "attack-roll", outcome: "success", itemUuid: "Item.sword", targetUuid: "Token.t", ranged: false };
    assert.deepEqual(gateMet(soil.gate, [roll], { actorUuid: "Actor.a", itemUuid: "Item.mask" }), { ok: true, struck: "Token.t" });
    assert.equal(gateMet(soil.gate, [{ ...roll, ranged: true }], { actorUuid: "Actor.a", itemUuid: "Item.mask" }).ok, false);
});

test("Shadowed Scale, the Jungle Secret: Summon Plant or Fungus at half the decomposed body's level, rounded up", async () => {
    const { rankFromLevel } = await import("../src/compiler/unique-rules.js");
    const summon = plans("Shadowed Scale, the Jungle Secret")[1];
    assert.deepEqual([summon.builtin, summon.spell.name, summon.partial, summon.notes, summon.requirementUnread], ["cast-spell", "Summon Plant or Fungus", undefined, undefined, undefined]);
    assert.deepEqual(summon.castRankBy, { mark: "decomposed-into-soil", within: 5, half: true, target: "the decomposed body" });
    assert.deepEqual([rankFromLevel(summon.castRankBy, 15), rankFromLevel(summon.castRankBy, 0), rankFromLevel(summon.castRankBy, 8)], [8, 1, 4]);
    assert.equal(summon.castLines.length, 2);
});

test("Anima Robe (Heroic)'s Who Are They?: Illusory Creature at rank 8 for up to a minute, Sustained by the robe's own action", async () => {
    const { lastsWords } = await import("../src/live/cast-card.js");
    const they = plans("Anima Robe (Heroic)")[3];
    assert.deepEqual([they.spell.name, they.rank, they.partial, they.castDuration.value, they.castDuration.unit, they.castDuration.sustained], ["Illusory Creature", 8, undefined, 1, "minutes", "item"]);
    assert.match(lastsWords(they.castDuration), /the item Sustains it with an action of its own, not its user's/);
});

test("Kaldemash's Lament: its damage type picked on the ways card, PF2e's DamageAlteration till changed again (the last one replaced)", () => {
    const [retype] = plans("Kaldemash's Lament");
    assert.equal(routeOf(retype), "ways");
    assert.deepEqual(retype.ways.map((way) => way.name), ["Electricity", "Fire", "Force"]);
    const fire = retype.ways[1].plan;
    assert.equal(routeOf(fire), "item");
    const [effect] = fire.item.ruleEffects;
    assert.deepEqual([effect.duration, effect.replaces, effect.rules[0].key, effect.rules[0].property, effect.rules[0].value, effect.rules[0].predicate[0]], [null, "damage-type", "DamageAlteration", "damage-type", "fire", "item:slug:kaldemashs-lament"]);
});

test("Kaldemash's Lament: flying on its own for 3 rounds — its targets Off-Guard to it, its Strikes at +31 when its user's own are lower", async () => {
    const { attackFloorRule } = await import("../src/live/card.js");
    const flying = plans("Kaldemash's Lament")[1];
    assert.deepEqual([flying.noteOnly, flying.partial, routeOf(flying)], [undefined, undefined, "item"]);
    const [effect] = flying.item.ruleEffects;
    assert.deepEqual([effect.duration.value, effect.duration.unit, effect.attackFloor], [3, "rounds", { value: 31, slug: "kaldemashs-lament" }]);
    assert.deepEqual([effect.rules[0].key, effect.rules[0].affects, effect.rules[0].uuid.endsWith("AJh5ex99aV6VTggg")], ["EphemeralEffect", "target", true]);
    assert.match(effect.words, /Off-Guard/);
    assert.match(effect.words, /holsters itself/);
    assert.deepEqual(attackFloorRule(effect.attackFloor, 28, "Kaldemash's Lament"), { key: "FlatModifier", selector: "strike-attack-roll", predicate: ["item:slug:kaldemashs-lament"], type: "untyped", value: 3, label: "Kaldemash's Lament (+31)" });
    assert.equal(attackFloorRule(effect.attackFloor, 33, "Kaldemash's Lament"), null);
});

test("Soulspark Candle: lit, a 40-foot zone around its user with PF2e's deity rules for those inside and its light; put out by prayer; its undead limned", () => {
    const [light, out, limn] = plans("Soulspark Candle");
    assert.deepEqual([light.builtin, light.zone.area, light.zone.centre, light.zone.lasts, light.zone.untilReused, routeOf(light)], ["zone", { type: "emanation", value: 40 }, "self", null, true, "zone"]);
    const [blessed, cursed] = light.zone.inside[0].rules;
    assert.deepEqual([blessed.predicate, blessed.value, cursed.predicate, cursed.value], [["deity:primary:pharasma"], 3, [{ or: ["deity:primary:urgathoa", "self:mode:undead"] }], -3]);
    assert.deepEqual(light.ownLight, { bright: 20, dim: 40, duration: null, note: "until it's put out" });
    assert.ok(light.zone.notes.some((note) => /turns black/.test(note)));
    assert.deepEqual([out.builtin, out.gate, out.item.putsOut.lingers.option, routeOf(out)], [undefined, { lit: true }, "limned-in-candlelight", "item"]);
    assert.deepEqual([limn.atTarget, limn.onlyAgainst, limn.gate, routeOf(limn)], [true, { traits: ["undead"] }, { lit: true }, "save"]);
    const [note] = success(limn).noteEffects;
    assert.deepEqual([note.duration, note.rules[0].option], [null, "limned-in-candlelight"]);
    assert.match(note.text, /Concealed rather than Undetected/);
});

test("The Marriage: a bond with the willing creature targeted, both sides' Effects; its condition countered by the counteract card, the user's on a failure", async () => {
    const { bondCounteract, bondEffectSource, bondOf, bondWords, counteredBy } = await import("../src/live/bond-card.js");
    const [marriage] = plans("The Marriage");
    assert.deepEqual([marriage.builtin, marriage.trigger.frequency.max, routeOf(marriage)], ["bond", 1, "bond"]);
    assert.deepEqual(marriage.bond, { reach: 5, telepathy: 120, conditions: ["blinded", "confused", "controlled", "fascinated", "frightened", "slowed", "stunned"], counter: { modifier: "class-dc", rank: 10, failCopies: true } });
    const source = bondEffectSource(marriage.bond, { item: { name: "The Marriage", uuid: "Item.m" }, user: { actorUuid: "Actor.u" }, self: "Kyra", other: "Seelah", partner: "Actor.s", role: "user" });
    assert.deepEqual([bondOf(source).item, bondOf(source).partner, bondOf(source).role, source.system.duration.unit], ["Item.m", "Actor.s", "user", "unlimited"]);
    assert.match(bondWords(marriage.bond, { self: "Kyra", other: "Seelah", role: "user" }), /telepathy within 120 feet/);
    assert.equal(counteredBy({ ...bondOf(source), role: "partner" }, "frightened"), "frightened");
    assert.equal(counteredBy({ ...bondOf(source), role: "partner" }, "sickened"), null);
    assert.equal(counteredBy(bondOf(source), "frightened"), null);
    assert.deepEqual(bondCounteract(bondOf(source), "stunned", 24), { conditions: ["stunned"], modifier: 24, rank: 10, failCopies: true, endsBond: "Item.m", notes: [] });
});

test("The Unicorn: the GM's pick of a common alchemical or magical consumable up to its user's level, gone after a minute; none found, no use spent", async () => {
    const { foundMisfit, foundText, vanishesAt } = await import("../src/live/found-card.js");
    const [unicorn] = plans("The Unicorn");
    assert.deepEqual([unicorn.builtin, unicorn.trigger.frequency.max, routeOf(unicorn)], ["found-item", 1, "found"]);
    assert.deepEqual(unicorn.found, { rarity: "common", kinds: ["alchemical", "magical"], maxLevel: "user", vanish: { value: 1, unit: "minutes" }, refundsNone: true });
    assert.match(unicorn.notes[0], /greater healing potion/);
    const potion = equipment.find((doc) => doc.name === "Healing Potion (Greater)");
    assert.equal(foundMisfit(potion, unicorn.found, 20), null);
    assert.match(foundMisfit(potion, unicorn.found, 5), /above level 5/);
    assert.match(foundMisfit(item("The Unicorn"), unicorn.found, 20), /isn't a consumable/);
    assert.match(foundMisfit({ ...potion, system: { ...potion.system, traits: { ...potion.system.traits, rarity: "rare" } } }, unicorn.found, 20), /isn't common/);
    assert.equal(vanishesAt(unicorn.found, 1000), 1060);
    assert.match(foundText(unicorn.found, 20), /level 20 or lower, the GM's pick; it vanishes unless used within 1 minute/);
});

test("Viridian Crown's View Subject: the spell module's Scrying at DC 43, whom it may scry and a willing target's choice its lines", () => {
    const view = plans("Viridian Crown")[1];
    assert.deepEqual([view.builtin, view.spell.name, view.dc, view.partial, routeOf(view)], ["cast-spell", "Scrying", 43, undefined, "cast"]);
    assert.equal(view.castLines.length, 2);
    assert.match(view.castLines[0], /an elf who has accepted/);
});
