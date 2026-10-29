// The third-party modules' items of the 2026-10-28 batch's strike group (src/compiler/readings-strike.js): Strikes, triggers, fortune and
// the user's own actions. Read from the installed modules' own packs; their words aren't kept here (plan fields are asserted, not text).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem as compileWith, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { worseSave, exposureCardHTML, createExposureCard } from "../src/live/poison-card.js";
import { attackChoices } from "../scripts/poisons.js";
import { riderFor, strikeEffectSource, strikeRules, strikeHint } from "../src/live/strike-card.js";
import { counteractText } from "../src/live/counteract-card.js";
import { attackRidersEffectSource, predicateFits, withSaveDC } from "../scripts/attack-riders.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
// (PF2e's spells, for the casts the items make: a cast's plan needs its spell.)
const options = { spells: spellIndex(readDocuments(`${PACKS}/spells`).filter((doc) => doc.collection === "items")) };
const compileItem = (item) => compileWith(item, options);
const packs = new Map();
const docsOf = (module, pack) => {
    const key = `${module}/${pack}`;
    if (!packs.has(key)) {
        let docs = [];
        try { docs = readDocuments(`${MODULES}/${module}/packs/${pack}`).filter((doc) => doc.collection === "items"); } catch { docs = []; }
        packs.set(key, docs);
    }
    return packs.get(key);
};
// (The item, its owner at its level; null when the module isn't installed.)
const find = (module, pack, name) => {
    const doc = docsOf(module, pack).find((entry) => entry.name === name);
    return doc ? { ...doc, ownerLevel: Number(doc.system?.level?.value) || 1 } : null;
};
const alchemists = (name) => find("pf2e-team-plus-alchemists", "pf2e-items", name);
const left = (plan) => [...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];

test("a sandwich's bonus to one roll its user picks within the hour (Halfling Sandwich, each grade): the fortune card's readied bonus, its Apply the user's own timing — the card's line, done", () => {
    for (const [name, value] of [["Halfling Sandwich (Lesser)", 1], ["Halfling Sandwich (Moderate)", 2], ["Halfling Sandwich (Greater )", 3]]) {
        const sandwich = alchemists(name);
        if (!sandwich) continue;
        const plan = compileItem(sandwich);
        assert.deepEqual([plan.builtin, routeOf(plan), plan.partial, plan.bonus.spend, plan.bonus.modifiers.map((modifier) => modifier.value)], ["readied-bonus", "fortune", undefined, ["attack-roll", "skill-check", "saving-throw"], [value, value, value]], name);
        assert.deepEqual([plan.notes.length, plan.item.immunity.duration], [1, { value: 1, unit: "days" }], name);
        assert.match(plan.notes[0], new RegExp(`^Press Apply just before the roll you pick, once within the hour after it's eaten: \\+${value} status bonus to that one attack roll, skill check or save\\.$`), name);
    }
});

test("a released gogiteth's Strikes stopping at a critical failure (Compressed Gogiteth): a one-off, its lines on the exposure card beside its three attacks", () => {
    const gogiteth = alchemists("Compressed Gogiteth");
    if (!gogiteth) return;
    const plan = compileItem(gogiteth);
    assert.deepEqual([plan.decided, plan.partial, routeOf(plan), plan.ownCheck.modifier, plan.resolution.sharedDamage.components[0].formula, plan.notes.length], ["one-off", undefined, "save", 18, "3d8+8", 2]);
});

test("candies' secondary effects (Honeyed Voice's song, Rake's Lollipop's crunch, Nectar Pastille's bite): the ways card, each way read — a minute's RollTwice to Perform, Quickened for the first turn with its day's immunity, a Strike readied with spirit dice and the holy trait", () => {
    const voice = alchemists("Honeyed Voice");
    if (voice) {
        const plan = compileItem(voice);
        const [use, song] = plan.ways;
        assert.deepEqual([plan.builtin, plan.partial, use.plan.partial, use.plan.unread, song.plan.partial, song.plan.noteOnly], ["ways", undefined, undefined, undefined, undefined, undefined]);
        assert.deepEqual(use.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value]), [["performance", 2]]);
        const [note] = song.plan.resolution.outcomes.success.noteEffects;
        assert.deepEqual([note.duration.value, note.duration.unit, note.rules], [1, "minutes", [{ key: "RollTwice", selector: "performance", keep: "higher", predicate: ["action:perform"] }]]);
    }
    const lollipop = alchemists("Rake's Lollipop");
    if (lollipop) {
        const plan = compileItem(lollipop);
        const [use, crunch] = plan.ways;
        assert.deepEqual([plan.builtin, plan.partial, use.plan.partial, left(use.plan), use.plan.item.immunity, crunch.plan.partial], ["ways", undefined, undefined, [], undefined, undefined]);
        const row = crunch.plan.resolution.outcomes.success;
        assert.deepEqual(row.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.unit, effect.duration.expiry, effect.duration.anchor]), [["quickened", 1, "rounds", "turn-end", "source-turn"]]);
        assert.deepEqual([row.noteEffects.length, crunch.plan.item.immunity.duration, crunch.plan.item.activation.trigger !== null], [1, { value: 1, unit: "days" }, true]);
    }
    const pastille = alchemists("Nectar Pastille");
    if (pastille) {
        const plan = compileItem(pastille);
        const [use, bite] = plan.ways;
        assert.deepEqual([plan.builtin, plan.partial, plan.userEffects, use.plan.builtin, use.plan.partial, left(use.plan), use.plan.castDuration.value, use.plan.castDuration.unit], ["ways", undefined, undefined, "cast-spell", undefined, [], 1, "hours"]);
        assert.deepEqual(use.plan.userEffects.map((effect) => [effect.kind, effect.rules, effect.duration.value]), [["rules", [{ key: "ActorTraits", add: ["holy"] }], 1]]);
        assert.deepEqual([routeOf(bite.plan), bite.plan.partial, bite.plan.strike.damage, bite.plan.strike.userRules], ["strike", undefined, [{ diceNumber: 4, dieSize: "d8", category: null, damageType: "spirit" }], [{ key: "AdjustStrike", mode: "add", property: "traits", value: "holy", definition: [] }]]);
    }
});

test("creatures let out of flasks that Strike once (Manticore Matrass, Cucrubit of Krooth): the spikes' two ways picked on the exposure card, one pinning its creature until it Escapes; the krooth's deadly die and the tooth's bleed, Drained and note Effect", () => {
    const matrass = alchemists("Manticore Matrass");
    if (matrass) {
        const plan = compileItem(matrass);
        assert.deepEqual([plan.partial, routeOf(plan), plan.checkChoices.length, plan.notes.length, plan.unread], [undefined, "save", 2, 2, undefined]);
        const [one, two] = plan.checkChoices.map((choice) => choice.resolution.outcomes);
        assert.deepEqual([one.success.effects, one.criticalSuccess.effects.map((effect) => effect.slug), two.success.effects, two.criticalSuccess.damage.multiplier], [[{ kind: "condition", slug: "immobilized", value: null, duration: { mode: "until-escape", escape: { dc: 21 } } }], ["immobilized"], [], 2]);
        assert.equal(plan.resolution, plan.checkChoices[0].resolution);
    }
    const gourd = alchemists("Cucrubit of Krooth");
    if (gourd) {
        const plan = compileItem(gourd);
        const { criticalSuccess, success } = plan.resolution.outcomes;
        assert.deepEqual([plan.partial, plan.ownCheck.deadly, plan.resolution.sharedDamage.components.map((component) => [component.id, component.formula, component.type, component.category])], [undefined, "d10", [["0", "2d10+5", "piercing", null], ["deadly", "1d10", "piercing", null], ["bleed", "1d6", "bleed", "persistent"]]]);
        assert.deepEqual([success.damage.sourceComponentIds, criticalSuccess.damage.sourceComponentIds, criticalSuccess.damage.componentMultipliers], [["0", "bleed"], ["0", "deadly", "bleed"], { bleed: 1, deadly: 1 }]);
        assert.deepEqual([success.effects.map((effect) => [effect.slug, effect.value, effect.duration]), success.noteEffects.length, criticalSuccess.noteEffects.length, plan.notes.length], [[["drained", 1, null]], 1, 1, 1]);
        assert.match(success.noteEffects[0].text, /DC 24/);
    }
});

test("plants used in their user's own action (Ravenous Flytrap (Lesser), Conker Flail (Lesser)): the item-action card at the plant's Athletics modifier when higher, its Escape DC and its Release the card's lines; the flail's Effect for the next turn with its object Strike, no crowbar penalty and a detonation toggle", () => {
    const trap = alchemists("Ravenous Flytrap (Lesser)");
    if (trap) {
        const plan = compileItem(trap);
        assert.deepEqual([plan.builtin, routeOf(plan), plan.partial, plan.action.slug, plan.action.minimum], ["item-action", "action", undefined, "grapple", { value: 5, skill: "athletics" }]);
        assert.match(plan.action.after, /^Its Escape DC is at least 15\b/);
    }
    const flail = alchemists("Conker Flail (Lesser)");
    if (flail) {
        const plan = compileItem(flail);
        assert.deepEqual([plan.builtin, routeOf(plan), plan.partial, plan.action.slug, plan.action.minimum, plan.action.targeted], ["item-action", "action", undefined, "force-open", { value: 5, skill: "athletics" }, false]);
        const [effect] = plan.userEffects;
        assert.deepEqual([effect.kind, effect.duration.expiry, effect.duration.anchor, effect.rules.map((rule) => rule.key)], ["rules", "turn-end", "source-turn", ["AdjustModifier", "Strike", "RollOption", "FlatModifier", "FlatModifier"]]);
        const strike = effect.rules.find((rule) => rule.key === "Strike");
        assert.deepEqual([strike.category, strike.group, strike.damage.base, strike.traits], ["simple", "flail", { damageType: "piercing", dice: 1, die: "d6" }, ["razing"]]);
        assert.ok(effect.rules.filter((rule) => rule.key === "FlatModifier").every((rule) => rule.value === 2 && rule.type === "circumstance" && rule.predicate.includes("conker-flail-detonated")));
    }
});

test("a pearl's triggering save one degree better (Black Pearl of Mewru): the fortune card beside its item card, its readied Effect's degree change and bonus for a curse's save, spent by that save — no longer a line", () => {
    const pearl = find("pf2e-team-plus-tian-xia", "player-options", "Black Pearl of Mewru");
    if (!pearl) return;
    const plan = compileItem(pearl);
    assert.deepEqual([routeOf(plan), plan.partial, plan.unread, routeOf(plan.alsoReadied)], ["item", undefined, undefined, "fortune"]);
    const { bonus } = plan.alsoReadied;
    assert.deepEqual([bonus.degree, bonus.spend, bonus.lasting, bonus.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate])], [{ selector: "saving-throw", adjustment: { failure: "to-success", criticalFailure: "to-failure" }, predicate: ["item:trait:curse"] }, ["saving-throw"], true, [["saving-throw", 2, ["item:trait:curse"]]]]);
    assert.doesNotMatch(plan.resolution.outcomes.success.noteEffects[0].text, /by hand/);
});

test("a sightglass held or worn (Pham Lê Ngọc's Sightglasses): the ways card, once a use — held, the Effect's words for reading a language through it; worn, PF2e's bonus to Society behind its place's toggle and to that place's Lore, each Effect taking the other's place", () => {
    const glass = find("pf2e-team-plus-tian-xia", "player-options", "Pham Lê Ngọc's Sightglasses");
    if (!glass) return;
    const [{ plan }] = compileActivations(glass);
    assert.deepEqual([plan.builtin, routeOf(plan), plan.once, plan.partial, plan.ways.length], ["ways", "ways", true, undefined, 2]);
    const [held, worn] = plan.ways.map((way) => way.plan.item.ruleEffects[0]);
    assert.deepEqual([held.rules, held.replaces, worn.replaces, worn.duration], [[], "sightglass", "sightglass", null]);
    assert.deepEqual(worn.rules.map((rule) => [rule.key, rule.selector ?? rule.option, rule.value ?? null, rule.predicate ?? null]), [["RollOption", "sightglass:in-xa-hoi", null, null], ["FlatModifier", "society", 2, ["sightglass:in-xa-hoi"]], ["FlatModifier", "xa-hoi-lore", 2, null]]);
});

test("a caviar's day of vitality's Quickened and no void healing (Kun Caviar): a one-off, its note Effect for the day kept", () => {
    const caviar = alchemists("Kun Caviar");
    if (!caviar) return;
    const plan = compileItem(caviar);
    assert.deepEqual([plan.decided, plan.noteOnly, plan.partial, plan.resolution.outcomes.success.noteEffects[0].duration.value], ["one-off", undefined, undefined, 24]);
});

test("a ray aimed as a simple weapon whose hit calls for a save (Miniaturization Device): its user's Dexterity and simple proficiency against AC, then the Fortitude save at the creature hit with its reach and size rows, an incapacitation effect; after a critical hit, the second step's box makes the save one degree worse", () => {
    const device = find("pf2e-team-plus-inventors", "inventors-equipment", "Miniaturization Device");
    if (device) {
        const plan = compileItem(device);
        assert.deepEqual([plan.partial, routeOf(plan), plan.ownCheck.choose, plan.thenCritical, plan.notes.length], [undefined, "save", ["simple-ranged"], "worse", 1]);
        const { thenSave } = plan;
        assert.deepEqual([thenSave.resolution.check.statistic, thenSave.resolution.check.against.value, thenSave.traits.includes("incapacitation"), thenSave.targeting.target], ["fortitude", 29, true, "the creature hit"]);
        const rows = thenSave.resolution.outcomes;
        assert.deepEqual([rows.criticalSuccess.noteEffects, rows.success.noteEffects[0].rules, rows.failure.noteEffects[0].rules, rows.criticalFailure.noteEffects[0].rules, rows.criticalFailure.noteEffects[0].duration.unit], [undefined, undefined, [{ key: "CreatureSize", value: -1, minimumSize: "tiny", resizeEquipment: true }], [{ key: "CreatureSize", value: -2, minimumSize: "tiny", resizeEquipment: true }], "hours"]);
        const worse = worseSave(thenSave).resolution.outcomes;
        assert.deepEqual([worse.criticalSuccess, worse.success, worse.failure, worse.criticalFailure], [rows.success, rows.failure, rows.criticalFailure, rows.criticalFailure]);
        const state = { ...createExposureCard({ plan, item: { name: "Device" }, user: { name: "Ari" } }), step: "then" };
        assert.match(exposureCardHTML(state, { canApply: true }), /data-air-field="critical"/);
        assert.doesNotMatch(exposureCardHTML({ ...state, step: null }, { canApply: true }), /data-air-field="critical"/);
    }
    // (Live: the same numbers as a thrown simple weapon's; a creature with no proficiencies, its best ranged Strike.)
    const pc = { level: 10, system: { abilities: { dex: { mod: 4 } }, proficiencies: { attacks: { simple: { rank: 2 }, martial: { rank: 3 }, advanced: { rank: 0 } } }, actions: [] } };
    assert.deepEqual(attackChoices(pc, ["simple-ranged"]).map((choice) => [choice.kind, choice.modifier]), [["simple-ranged", 18]]);
    const npc = { level: 5, system: { abilities: {}, actions: [{ item: { isRanged: true }, totalModifier: 13 }] } };
    assert.deepEqual(attackChoices(npc, ["simple-ranged"]).map((choice) => [choice.kind, choice.modifier]), [["ranged", 13]]);
});

test("a crown's rage against constructs (Instinct Crown (Wrecker)'s second activation): its user's watch Effect until the Rage ends with the core's ignoreResistance at its level for melee Strikes at constructs, and a save rider on a critical hit at a construct or a creature its instinct's toggle names, at its class DC", () => {
    const crown = find("pf2e-team-plus-barbarians", "items", "Instinct Crown (Wrecker)");
    if (crown) {
        const plan = compileActivations(crown)[1].plan;
        assert.deepEqual([plan.partial, plan.noteOnly, routeOf(plan), plan.trigger.frequency.per], [undefined, undefined, "item", "day"]);
        const { riders, untilRage, ignoreResistance, duration } = plan.item.attackRiders;
        assert.deepEqual([untilRage, ignoreResistance.perLevel, ignoreResistance.predicate, duration.value, duration.unit], [true, 1, ["item:melee", "target:trait:construct"], 1, "minutes"]);
        const [rider] = riders;
        assert.deepEqual([rider.on, rider.melee, rider.save.dc, rider.save.plan.resolution.check.statistic, rider.save.plan.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.value, effect.duration.value])], [["criticalSuccess"], false, "class", "fortitude", [["slowed", 1, 1]]]);
        const source = attackRidersEffectSource(plan.item.attackRiders, { item: { name: "Crown" }, level: 12 });
        assert.deepEqual([source.flags["pf2e-automatic-item-resolution"].untilRage, source.flags["pf2e-resolution-core"].ignoreResistance], [true, { types: ["physical", "bludgeoning", "piercing", "slashing"], predicate: ["item:melee", "target:trait:construct"], value: 12 }]);
        assert.deepEqual([predicateFits(rider.save.predicate, ["target:trait:construct"]), predicateFits(rider.save.predicate, ["machine-rage", "target:trait:humanoid"]), predicateFits(rider.save.predicate, ["target:trait:humanoid"]), predicateFits(rider.save.predicate, ["target:trait:construct", "item:type:spell"])], [true, true, false, false]);
        assert.equal(withSaveDC(rider.save.plan, 31).resolution.check.against.value, 31);
    }
});

test("a gadget firing its user's gauntlet as a ranged Strike, again on each Sustain (Power Gauntlet, each grade): the Strike card's readied Strikes with that gauntlet only — the gadget's damage type, no Strength, its grade's number of Strikes within its grade's time", () => {
    for (const [grade, uses, value, unit] of [["Lesser", 2, 1, "minutes"], ["Moderate", 4, 10, "minutes"], ["Greater", 7, 1, "hours"], ["Major", 10, 1, "days"]]) {
        const gadget = find("pf2e-team-plus-inventors", "inventors-equipment", `Power Gauntlet (${grade})`);
        if (!gadget) continue;
        const plan = compileItem(gadget);
        assert.deepEqual([plan.noteOnly, plan.partial, routeOf(plan), plan.strike.base, plan.strike.alteration, plan.strike.uses, plan.strike.lasts], [undefined, undefined, "strike", "gauntlet", "fire", uses, { value, unit }], grade);
        const rules = strikeRules(plan, { label: gadget.name });
        assert.deepEqual(rules.filter((rule) => rule.key === "DamageAlteration").map((rule) => rule.predicate), [["item:base:gauntlet"]], grade);
        assert.ok(rules.some((rule) => rule.key === "AdjustModifier" && rule.slug === "str" && rule.suppress), grade);
        assert.deepEqual([riderFor(plan, { outcome: "success", options: ["item:base:gauntlet"] }), riderFor(plan, { outcome: "success", options: ["item:base:longsword"] })], ["hit", null], grade);
        const source = strikeEffectSource({ state: { plan, item: { name: gadget.name }, user: { name: "Ari" } }, moduleId: "pf2e-automatic-item-resolution" });
        assert.deepEqual([source.system.duration.value, source.system.duration.unit, source.flags["pf2e-automatic-item-resolution"].card?.uses ?? Object.values(source.flags["pf2e-automatic-item-resolution"])[0].uses], [value, unit, uses], grade);
        assert.match(strikeHint(plan, "Ari"), new RegExp(`within ${value} ${unit.replace(/s$/, "")}`), grade);
    }
});

test("ammunition whose hit ties its target with a sticky string (Tackfied Trail Ammunition, each grade): the Strike card's readied ranged Strike with it, its hit a note Effect for the minute with the grade's Escape DC, AC and Hit Points; its range, the weapon's ranged Strikes and the square it may aim at instead the card's lines", () => {
    for (const [grade, dc, hp] of [["Lesser", 21, 30], ["Moderate", 27, 50], ["Greater", 36, 80]]) {
        const ammo = alchemists(`Tackfied Trail Ammunition (${grade})`);
        if (!ammo) continue;
        const [{ plan }] = compileActivations(ammo);
        assert.deepEqual([plan.noteOnly, plan.partial, routeOf(plan), plan.strike.ammo, plan.strike.range, plan.strike.lines.length], [undefined, undefined, "strike", true, "ranged", 3], grade);
        const [note] = plan.resolution.outcomes.success.noteEffects;
        assert.deepEqual([note.duration.value, note.duration.unit, plan.resolution.outcomes.criticalSuccess.noteEffects.length, plan.resolution.outcomes.failure.noteEffects], [1, "minutes", 1, undefined], grade);
        assert.match(note.text, new RegExp(`Escapes \\(DC ${dc}\\).*AC ${dc}, ${hp} Hit Points`), grade);
    }
});

test("a plant used in its user's Treat Wounds that also treats the soul (Curative Aglaophotis): the item-action card with every sentence read — Doomed lowered by 1 (2 on a critical success), a day's immunity whatever the result — and the counteract card beside it for a curse, its check that same Treat Wounds roll at rank 7", () => {
    const plant = alchemists("Curative Aglaophotis");
    if (!plant) return;
    const plan = compileItem(plant);
    assert.deepEqual([plan.partial, routeOf(plan), plan.action.within, plan.action.reduce, plan.action.immunity.duration, plan.item.reduce], [undefined, "action", true, { choose: ["doomed"], by: 1, criticalBy: 2 }, { value: 1, unit: "days" }, undefined]);
    const { counteract } = plan.item;
    assert.deepEqual([counteract.rank, counteract.afflictions, counteract.fromRoll.action], [7, ["curse"], "treat-wounds"]);
    assert.match(counteractText(counteract), /^Counteract with its user's latest Treat Wounds roll, rank 7: one effect a curse$/);
});
