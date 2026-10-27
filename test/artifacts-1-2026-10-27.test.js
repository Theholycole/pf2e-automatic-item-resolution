// Unique items' and artifacts' activations built in full (2026-10-27, the user: "unique effects that are on unique rarity items should be
// automated"): the readings of src/compiler/artifact-readings.js, every sentence of each effect read, and what they extend elsewhere
// (Graymist's reaction, Shadowmist Cape's reading). The first group's list, highest level first.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { saveText } from "../src/live/poison-card.js";
import { ruleEffectSource, temperatureEffectSource } from "../src/live/card.js";
import { plainText } from "../src/compiler/rows.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const text = (name) => plainText(equipment.find((entry) => entry.name === name).system.description.value);
const activations = (name) => compileActivations(item(name), { spells }).map((entry) => entry.plan);
const activation = (name, which) => compileActivations(item(name), { spells }).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const rowsOf = (plan) => plan.resolution.outcomes;

test("Essence Prism: its user's own secret DC 30 check, the essence's skills picked; each refraction its creatures Paralyzed and noted for the hour", () => {
    const [set, split, combine] = activations("Essence Prism");
    assert.deepEqual([set.ownSave, set.resolution.kind, set.resolution.check.statistic, set.resolution.check.against.value, set.resolution.check.secret, routeOf(set, text("Essence Prism"))], [true, "save", "arcana", 30, true, "save"]);
    assert.deepEqual(set.checkChoices.map((choice) => choice.label), ["Mental essence: Arcana", "Mental essence: Occultism", "Material essence: Arcana", "Material essence: Nature", "Spiritual essence: Occultism", "Spiritual essence: Religion", "Vital essence: Nature", "Vital essence: Religion"]);
    assert.match(set.checkChoices[7].resolution.outcomes.failure.noteEffects[0].text, /some other quality .*vital essence/);
    assert.equal(saveText(set), "DC 30 Arcana check (secret)");
    for (const plan of [split, combine]) {
        const row = rowsOf(plan).success;
        assert.deepEqual([done(plan), row.effects[0].slug, row.effects[0].duration.value, row.effects[0].duration.unit, row.noteEffects[0].duration.unit, routeOf(plan, text("Essence Prism"))], [true, "paralyzed", 1, "hours", "hours", "save"]);
    }
    assert.match(rowsOf(split).success.noteEffects[0].text, /2 levels lower .*stronger is 1 level lower and the weaker 3 or more/);
    assert.match(rowsOf(combine).success.noteEffects[0].text, /1 or 2 levels higher/);
});

test("Cayden's Tankard: a fear effect counteracted for its targets (its creator's save the open part); the conditions' Effects ended too", () => {
    const [fear, freed, indestructible] = activations("Cayden's Tankard");
    assert.deepEqual([fear.partial, fear.reduce.map((entry) => [entry.slug, entry.who ?? "self", entry.granter])], [true, [["frightened", "self", "ends"], ["frightened", "targets", "ends"]]]);
    assert.deepEqual([done(freed), freed.reduce.length, freed.reduce.every((entry) => entry.granter === "ends" && entry.granterWeeks === 1), Boolean(freed.item.speedPenaltiesEnd)], [true, 12, true, true]);
    assert.ok(freed.notes.some((line) => /Escape .*next attempt automatically/.test(line)));
    assert.equal(indestructible.spell.name, "Indestructibility");
});

test("Mirror of Sorshen: Second Glance the DC 35 Will save (Fascinated, a DC 30 save to end it); Irresistible Desire Controlled for 30 days", () => {
    const glance = activation("Mirror of Sorshen", "Second Glance");
    assert.deepEqual([done(glance), glance.resolution.check.against.value, rowsOf(glance).failure.effects[0].slug, glance.traits.includes("incapacitation"), routeOf(glance, text("Mirror of Sorshen"))], [true, 35, "fascinated", true, "save"]);
    assert.match(rowsOf(glance).failure.noteEffects[0].text, /DC 30 Will save to end it/);
    const desire = activation("Mirror of Sorshen", "Irresistible Desire");
    const row = rowsOf(desire).success;
    assert.deepEqual([done(desire), row.effects[0].slug, row.effects[0].duration.value, row.effects[0].duration.unit, routeOf(desire, text("Mirror of Sorshen"))], [true, "controlled", 30, "days", "save"]);
    assert.match(row.noteEffects[0].text, /DC 35 Will save to break free/);
});

test("Radiant Spark: the Binding Circle's hour on its user; the DC 49 Will save, Drained 2, death on a failure, 24 hours' immunity", () => {
    const [, binding, consume] = activations("Radiant Spark");
    assert.deepEqual([done(binding), rowsOf(binding).success.noteEffects[0].duration.value], [true, 1]);
    const rows = rowsOf(consume);
    assert.deepEqual([done(consume), consume.resolution.check.against.value, rows.success.effects[0].slug, rows.success.effects[0].value, rows.failure.terminal.kind, rows.criticalFailure.terminal.kind, consume.trigger.immunity.duration.value], [true, 49, "drained", 2, "death", "death", 24]);
    assert.match(rows.criticalFailure.noteEffects[0].text, /until the Radiant Spark is destroyed/);
});

test("Shadowpiercer: Absorb Shadows' temporary Hit Points typed on the card and its darkness counteracted; Rebuff Gloom's counteract for a Mythic Point or Drained 2", () => {
    const absorb = activation("Shadowpiercer", "Absorb Shadows");
    const row = rowsOf(absorb).success;
    assert.deepEqual([done(absorb), absorb.item.levelTemp[0].multiplier, row.noteEffects.length, row.noteEffects[0].label, row.noteEffects[0].duration.unit, routeOf(absorb)], [true, 4, 1, "Absorbed Shadows", "hours", "item"]);
    const rebuff = activation("Shadowpiercer", "Rebuff Gloom");
    assert.deepEqual(rebuff.ways.map((way) => [routeOf(way.plan), way.plan.item.counteract.modifier, way.plan.item.counteract.rank]), [["counteract", 46, 10], ["counteract", 46, 10]]);
    assert.deepEqual([rebuff.ways[0].plan.spend, rebuff.ways[1].plan.userEffects], [{ mythicPoints: 1 }, [{ kind: "condition", slug: "drained", value: 2 }]]);
});

test("Graymist: hidden from the creature that missed, as Shadowmist Cape's reading has it", () => {
    const [reaction] = activations("Graymist");
    assert.deepEqual([done(reaction), rowsOf(reaction).success.noteEffects[0].label], [true, "Lost in the mist"]);
});

test("Scale of Igroon's reflection and Phoenix Fighting Fan's Sustain by Strikes: the parts another module must add, partial", () => {
    assert.equal(activations("Scale of Igroon")[2].partial, true);
    const fan = activations("Phoenix Fighting Fan")[0];
    assert.deepEqual([fan.partial, fan.dc, fan.castRange.feet, fan.castDuration.value, routeOf(fan)], [true, 34, 30, 1, "cast"]);
});

test("Deck of Harrowed Tales casts Gate; Slithermaw's Bane (Heroic)'s Terrain Adaptation: eighteen ways, until its user's next rest", () => {
    const [gate] = activations("Deck of Harrowed Tales");
    assert.deepEqual([done(gate), gate.spell.name, gate.rank, routeOf(gate)], [true, "Gate", 10, "cast"]);
    const adapt = activation("Slithermaw's Bane (Heroic)", "Terrain Adaptation");
    assert.deepEqual([done(adapt), adapt.ways.length, adapt.ways[6].name], [true, 18, "Forest, protected from heat"]);
    const forest = adapt.ways[7].plan;
    const [effect] = forest.item.ruleEffects;
    assert.deepEqual([effect.rules[0].value, effect.rules[1].predicate[0], forest.temperature.counts["extreme-cold"], effect.untilRest, routeOf(forest)], [{ environment: "forest", feature: "all" }, "terrain:forest", "mild-cold", true, "item"]);
    // (Its Effects flagged for scripts/until-rest.js: gone at rest, each in place of the last.)
    const made = ruleEffectSource(effect, { item: { name: "Slithermaw's Bane (Heroic)", uuid: "Item.x" } });
    assert.deepEqual([made.flags["pf2e-automatic-item-resolution"].untilRest, made.flags["pf2e-automatic-item-resolution"].replaces, made.system.duration.unit], [true, true, "unlimited"]);
    assert.equal(temperatureEffectSource(forest.temperature, { item: { name: "x" } }).flags["pf2e-automatic-item-resolution"].untilRest, true);
});

test("The Beating: Pernicious Poltergeist at its user's rank and DC, its burst difficult terrain beside it (the cast's zone)", () => {
    const [beating] = activations("The Beating");
    assert.deepEqual([done(beating), beating.castRank.min, beating.castDC.from, beating.castZone.zone.area, beating.castZone.zone.terrain, beating.castZone.zone.range, routeOf(beating)], [true, 6, "class-spell", { type: "burst", value: 10 }, [{ movement: ["walk"], difficulty: 2 }], 60, "cast"]);
});

test("The Crows and The Juggler: one object of what a creature has, into its user's hand or on the ground by degree (the drop card)", async () => {
    const [crows] = activations("The Crows");
    assert.deepEqual([done(crows), crows.dropHeld.degrees, crows.dropHeld.take, crows.dropHeld.maxBulk, crows.resolution.check.statistic, routeOf(crows), rowsOf(crows).failure.noteEffects[0].duration.anchor], [true, ["criticalSuccess", "success"], ["criticalSuccess"], 2, "thievery", "save", "target-turn"]);
    assert.ok(Object.values(rowsOf(crows)).every((row) => !row.manualInstructions));
    const [juggler] = activations("The Juggler");
    assert.deepEqual([done(juggler), juggler.dropHeld.take, juggler.dropHeld.maxBulk, routeOf(juggler)], [true, ["success"], 1, "save"]);
    const { createDropCard, dropCardHTML, listedItems } = await import("../src/live/drop-card.js");
    const items = [{ id: "a", name: "Greatsword", type: "weapon", carryType: "held", bulk: 2 }, { id: "b", name: "Maul", type: "weapon", carryType: "worn", bulk: 3 }, { id: "c", name: "Potion", type: "consumable", carryType: "worn", bulk: 0.1 }, { id: "d", name: "Gem", type: "treasure", carryType: "worn", bulk: 0, inContainer: true }, { id: "e", name: "Feat", type: "feat" }];
    assert.deepEqual(listedItems(items, crows.dropHeld).map((one) => one.id), ["a", "c"]);
    const card = createDropCard({ dropHeld: crows.dropHeld, item: { name: "The Crows" }, user: { name: "Kyra" }, creatures: [{ actorUuid: "Actor.o", name: "Ogre", held: [{ id: "a", name: "Greatsword" }], take: true }] });
    assert.deepEqual([card.entries[0].held[0].ticked, /into its user's hand/.test(dropCardHTML(card, { canApply: true })), /Move the ticked item/.test(dropCardHTML(card, { canApply: true }))], [false, true, true]);
});

test("The Rakshasa: its user healed, its pledged follower's Hit Points lost by its user's level (temporary Hit Points if it dies), its immunity the follower's", () => {
    const [rakshasa] = activations("The Rakshasa");
    assert.deepEqual([done(rakshasa), rowsOf(rakshasa).success.effects[0].kind, rakshasa.item.hpLoss.amount, rakshasa.item.hpLoss.killedTemp, rakshasa.item.immunity.on, rakshasa.unread, routeOf(rakshasa)], [true, "heal", { level: 1 }, { level: 1 }, "targets", undefined, "item"]);
    assert.equal((rowsOf(rakshasa).success.noteEffects ?? []).length, 0);
});

test("The Wanderer: any common permanent item of Light Bulk two levels below its user's in hand for a minute (the objects card's pick)", async () => {
    const [wanderer] = activations("The Wanderer");
    assert.deepEqual([done(wanderer), wanderer.objects.op, wanderer.objects.choose.any, wanderer.objects.lasts, wanderer.objects.whileAttended, routeOf(wanderer)], [true, "create", { rarity: "common", levelsBelow: 2, maxBulk: 0.1 }, { value: 1, unit: "minutes" }, true, "objects"]);
    const { anyItemChoices, objectsText } = await import("../src/live/objects-card.js");
    const rows = [
        { _id: "1", name: "Wayfinder", type: "equipment", system: { level: { value: 2 }, traits: { rarity: "common", value: [] }, bulk: { value: 0.1 } } },
        { _id: "2", name: "Dagger", type: "weapon", system: { level: { value: 0 }, traits: { rarity: "common", value: [] }, bulk: { value: 0.1 } } },
        { _id: "3", name: "Longsword", type: "weapon", system: { level: { value: 0 }, traits: { rarity: "common", value: [] }, bulk: { value: 1 } } },
        { _id: "4", name: "Rare Ring", type: "equipment", system: { level: { value: 2 }, traits: { rarity: "rare", value: [] }, bulk: { value: 0 } } },
        { _id: "5", name: "Potion", type: "consumable", system: { level: { value: 1 }, traits: { rarity: "common", value: [] }, bulk: { value: 0.1 } } },
        { _id: "6", name: "High Ring", type: "equipment", system: { level: { value: 9 }, traits: { rarity: "common", value: [] }, bulk: { value: 0 } } }
    ];
    assert.deepEqual(anyItemChoices(rows, wanderer.objects.choose.any, 10).map((one) => one.id), ["2", "1"]);
    assert.match(objectsText(wanderer.objects), /level its user's level −2 or lower, in hand \(picked\) for 1 minute, gone once it's dropped/);
});

test("Blood-Drinker's Drink Blood: twice the felled creature's level in temporary Hit Points, three times while its user holds Fleshrender too", async () => {
    const drink = activation("Blood-Drinker", "Drink Blood");
    assert.deepEqual([done(drink), drink.item.levelTemp[0].multiplier, drink.item.levelTemp[0].ifHeld, drink.unread, routeOf(drink)], [true, 2, { name: "Fleshrender", multiplier: 3 }, undefined, "item"]);
    const { levelTempText } = await import("../src/live/card.js");
    assert.match(levelTempText(drink.item.levelTemp[0]), /three times while it holds Fleshrender too\), for 1 minute$/);
});

test("Guiding Chisel: a building of up to ten 10-foot cubes, the structure card's three square shapes, hewn stone with a stone door, the last one replaced", async () => {
    const [chisel] = activations("Guiding Chisel");
    assert.deepEqual([done(chisel), routeOf(chisel), chisel.structure.sizes, chisel.structure.kind, chisel.structure.within, chisel.structure.replaces], [true, "structure", [{ feet: 30, height: 10 }, { feet: 20, height: 20 }, { feet: 10, height: 100 }], "wall-hewn", 1000, true]);
    const { createStructureCard, sizeText, structureCardHTML, structureTemplate } = await import("../src/live/structure-card.js");
    const state = createStructureCard({ plan: chisel, item: { name: "Guiding Chisel", uuid: "Item.c" }, user: { name: "Dwarf", actorUuid: "Actor.d" } });
    assert.deepEqual([sizeText(chisel.structure.sizes[1]), /Place it/.test(structureCardHTML(state, { canApply: true }))], ["A 20-foot-square building, 20 feet high (8 cubes)", true]);
    assert.deepEqual(structureTemplate(state, { x: 500, y: 300 }, 2), { name: "Guiding Chisel's building", at: { x: 500, y: 300 }, shape: "square", feet: 10, height: 100, kind: "wall-hewn", door: { kind: "door-stone", side: "south" }, pushOut: true, source: { actorUuid: "Actor.d", itemUuid: "Item.c", name: "Guiding Chisel" } });
});

test("Guiding Star Orb's embedded place on its user, in place of the last; the soulhearts' maximum Hit Points for each PC, the soulheart destroyed", () => {
    const embed = activation("Guiding Star Orb", "Embed Location");
    assert.deepEqual([done(embed), embed.item.ruleEffects[0].replaces, routeOf(embed)], [true, true, "item"]);
    for (const [name, value] of [["Soulheart (Major)", 3], ["Soulheart (Greater)", 2]]) {
        const bolster = activation(name, "Bolster Maiserene Phantom");
        assert.deepEqual([done(bolster), bolster.item.recipient, bolster.item.destroyed, bolster.item.ruleEffects[0].rules[0], routeOf(bolster)], [true, "targets", true, { key: "FlatModifier", selector: "hp", value, label: "Soulheart" }, "item"], name);
    }
    assert.equal(activations("Phoenix Fighting Fan")[1].item.destroyed, true);
});

test("Flame of the Radiant Spark: claimed, a candle's blue light on its user (one at a time); spent, 6th-rank Raise Dead, the flame gone", () => {
    const flame = compileItem(item("Flame of The Radiant Spark"), { spells });
    assert.deepEqual([done(flame), flame.builtin, flame.ways.map((way) => routeOf(way.plan)), routeOf(flame)], [true, "ways", ["item", "cast"], "ways"]);
    const [claim, spend] = flame.ways.map((way) => way.plan);
    assert.deepEqual([claim.item.ruleEffects[0].rules[0].key, claim.item.ruleEffects[0].replaces, spend.spell.name, spend.rank, spend.castEndsRule], ["TokenLight", "any", "Raise Dead", 6, "Flame of the Radiant Spark"]);
});

test("Whispering Remnant's Enthrall: what the enthralled see a note on its user, its waking's DC 30 Will save its own card for later; Liver Bloodstone's Bless for the minute", () => {
    const words = activation("Whispering Remnant", "Hear My Words");
    assert.deepEqual([done(words), words.spell.name, words.dc, words.castAgain.own, words.castAgain.plan.resolution.check.against.value, words.castAgain.plan.resolution.outcomes.failure.effects[0].slug, words.castAgain.plan.resolution.outcomes.failure.effects[0].duration.value], [true, "Enthrall", 30, true, 30, "stupefied", 24]);
    assert.match(words.castNote.text, /commonplace/);
    const fervor = activation("Liver Bloodstone of Arazni", "Arazni's Fervor");
    assert.deepEqual([done(fervor), fervor.spell.name, fervor.castDuration.value], [true, "Bless", 1]);
});

test("Starless Scope's look: its user's +2 to Recall Knowledge and the DC 27 Will save's starlight (its penalty, the incorporeal trait gone or Slowed 1); Horn of Rust's spells and its tetanus after the shards' damage", async () => {
    const look = activations("Starless Scope")[1];
    const rows = rowsOf(look);
    assert.deepEqual([done(look), look.userEffects[0].kind, look.userEffects[0].rules[0].predicate, rows.success.noteEffects[0].rules.length, rows.failure.noteEffects[0].rules.map((rule) => rule.key), rows.criticalFailure.noteEffects[0].rules[0].value, rows.criticalFailure.noteEffects[0].duration.unit, (rows.failure.effects ?? []).length], [true, "rules", ["action:recall-knowledge"], 1, ["FlatModifier", "ActorTraits", "GrantItem"], -2, "minutes", 0]);
    const [spells_, aura] = activations("Horn of Rust");
    assert.deepEqual([done(spells_), spells_.choices.map((choice) => [choice.spell.name, choice.rank]), spells_.castDC.from], [true, [["Divine Lance", null], ["Noxious Vapors", 1], ["Shatter", 2], ["Stinking Cloud", 3]], "spell"]);
    const after = aura.zone.saves[0].plan.afterDamage;
    assert.deepEqual([done(aura), after.degrees, after.plan.resolution.check.against.value, after.plan.resolution.afflictionHandoff.onset, after.plan.resolution.afflictionHandoff.stages.map((stage) => stage.text)], [true, ["success", "failure", "criticalFailure"], 19, { value: 10, unit: "days" }, ["Clumsy 1 (1 week)", "Clumsy 2 and can't speak (1 day)", "Paralyzed with spasms (1 day)", "death"]]);
    const { afterDamagePlans } = await import("../scripts/after-damage.js");
    assert.deepEqual(afterDamagePlans(after, [{ tokenUuid: "Token.a", degree: "failure" }, { tokenUuid: "Token.b", degree: "criticalSuccess" }]).map((entry) => entry.plan.struckToken), ["Token.a"]);
});
