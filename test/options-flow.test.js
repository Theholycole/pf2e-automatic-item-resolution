// Named options and what follows a condition (2026-10-26): an Effect's "choose one of the following effects" as the ways card's buttons, each
// option read on its own (src/compiler/named-options.js: Heart of Sarnax, Tactician's Helm); a condition after another ends
// (src/compiler/after-ends.js, scripts/after-ends.js); a death at 0 Hit Points from its damage; Imposing Shield's worse condition a second
// button (src/compiler/instead-way.js); Skull Bomb's thrower blinded for good; Drake Shot's Prone only on the ground.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellEffectIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { namedOptions } from "../src/compiler/named-options.js";
import { afterEndsEffectSource, afterEndsMarkSource } from "../src/live/card.js";
import { withoutAloftProne } from "../src/live/if-target.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, name);
    return { ...found, ownerLevel: Number(found.system.level?.value) || 1 };
};
const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
const planOf = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
const rowEffects = (plan, degree) => (plan.resolution.outcomes[degree]?.effects ?? []).map((effect) => [effect.slug, effect.value ?? null]);

test("Tactician's Helm: a button for each of its four options, not only Move It!'s Effect; the user's own moves a line of the card", () => {
    const plan = planOf("Tactician's Helm");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial), plan.trigger.frequency.per], ["ways", ["Charge!", "Move It!", "Protect!", "Re-Arm!"], false, "hour"]);
    assert.equal(plan.ways[1].plan.resolution.applications[0].uuid, "Compendium.pf2e.equipment-effects.Item.vgsV7eEYQ7W1fHqR");
    assert.deepEqual(plan.ways[0].plan.notes, ["Stride twice (its own actions)."]);
    assert.match(plan.ways[2].plan.notes[0], /^If you're wielding a shield, Stride to a space adjacent to an ally, then Raise your Shield/);
});

test("Heart of Sarnax: Bestow Vim's Quickened for a minute with its extra action a note Effect, Fatigued for an hour after; Crush Heart's save, its death at 0 Hit Points and its Slowed 2 after Stunned", () => {
    const plan = planOf("Heart of Sarnax");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial)], ["ways", ["Bestow Vim", "Crush Heart"], false]);
    const vim = plan.ways[0].plan;
    assert.deepEqual([vim.targeting.target, vim.targeting.range, rowEffects(vim, "success"), vim.resolution.outcomes.success.effects[0].duration.unit], ["1 living creature", "60 feet", [["quickened", null]], "minutes"]);
    assert.match(vim.resolution.outcomes.success.noteEffects[0].text, /^Its extra action: to Stride, Strike, or attempt an Athletics check/);
    assert.deepEqual(vim.afterEnds, [{ degree: "success", when: "quickened", then: { slug: "fatigued", value: null, duration: { mode: "fixed", value: 1, unit: "hours", expiry: "turn-start", anchor: "effect-start" } } }]);
    const crush = plan.ways[1].plan;
    assert.deepEqual([crush.resolution.kind, crush.resolution.postDamageTerminal, crush.traits.includes("death"), rowEffects(crush, "criticalFailure")], ["save", { kind: "death", threshold: 0 }, true, [["stunned", 3]]]);
    assert.deepEqual([crush.afterEnds[0].when, crush.afterEnds[0].then.slug, crush.afterEnds[0].then.value, crush.resolution.outcomes.criticalFailure.noteEffects], ["stunned", "slowed", 2, []]);
});

test("the options reader: only an Effect that offers them; each option's own degree rows", () => {
    assert.equal(namedOptions("<p><strong>Effect</strong> You gain 5 temporary Hit Points.</p>"), null);
    const read = namedOptions("<p><strong>Activate</strong> 1</p><p><strong>Effect</strong> Choose one of the following effects.</p><p><strong>Calm</strong> You heal 1d8.</p><p><strong>Storm</strong> (fire) A creature takes 2d6 fire damage with a DC 20 Reflex save.</p><p><strong>Success</strong> Half.</p>");
    assert.deepEqual(read.map((option) => [option.name, option.traits]), [["Calm", []], ["Storm", ["fire"]]]);
    assert.match(read[1].html, /<p><strong>Effect<\/strong> A creature takes 2d6 fire damage[^<]*<\/p><p>\s*<strong>Success<\/strong>/);
    assert.doesNotMatch(read[0].html, /Success/);
});

test("after a condition ends: the mark while it has it, then the next condition for its time granted by an Effect", () => {
    const entry = { when: "stunned", then: { slug: "slowed", value: 2, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" } } };
    const mark = afterEndsMarkSource(entry, { item: { name: "Heart of Sarnax (Crush Heart)" }, user: { actorUuid: "Actor.user" } });
    assert.deepEqual([mark.name, mark.flags["pf2e-automatic-item-resolution"].afterEnds, mark.system.duration.unit], ["Heart of Sarnax (Crush Heart): after stunned", entry, "unlimited"]);
    const slowed = afterEndsEffectSource(entry.then, { item: { name: "Heart of Sarnax (Crush Heart)" }, user: { actorUuid: "Actor.user" } });
    assert.deepEqual([slowed.name, slowed.system.rules[0].uuid, slowed.system.rules[0].alterations, slowed.system.duration.value, slowed.system.duration.unit], ["Heart of Sarnax (Crush Heart): Slowed 2", "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3", [{ mode: "override", property: "badge-value", value: 2 }], 1, "minutes"]);
});

test("live: the card applied marks a stunned creature; Stunned's deletion gives it Slowed 2, the mark used up", async () => {
    const { markAfterEnds, followAfterEnds } = await import("../scripts/after-ends.js");
    const saved = { game: globalThis.game, fromUuid: globalThis.fromUuid };
    const items = [];
    let stunned = true;
    const foe = { uuid: "Actor.foe", hasCondition: (slug) => slug === "stunned" && stunned, get itemTypes() { return { effect: items }; }, createEmbeddedDocuments: async (type, data) => data.map((one) => { const doc = { ...one, delete: async () => items.splice(items.indexOf(doc), 1) }; items.push(doc); return doc; }) };
    globalThis.game = { user: { isGM: true }, time: { worldTime: 3 }, combat: null, modules: new Map() };
    globalThis.fromUuid = async (uuid) => (uuid === "Actor.foe" ? foe : null);
    try {
        const crush = planOf("Heart of Sarnax").ways[1].plan;
        await markAfterEnds({ state: { plan: crush, source: { actorUuid: "Actor.user" }, ability: { name: "Heart of Sarnax (Crush Heart)" } }, targets: [{ actorUuid: "Actor.foe", degree: "criticalFailure" }, { actorUuid: "Actor.foe", degree: "failure" }] });
        assert.equal(items.length, 1);
        assert.deepEqual(await followAfterEnds(foe, "stunned"), []);
        stunned = false;
        const [slowed] = await followAfterEnds(foe, "stunned");
        assert.deepEqual([items.length, slowed.name, slowed.system.rules[0].alterations[0].value], [1, "Heart of Sarnax (Crush Heart): Slowed 2", 2]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Imposing Shield: Frightened 2, or Frightened 3 when the Shield Block took all the damage — two buttons, no GM line", () => {
    const plan = planOf("Imposing Shield");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial)], ["ways", ["As it is", "The Shield Block reduced the incoming damage to 0"], false]);
    assert.deepEqual([rowEffects(plan.ways[0].plan, "success"), rowEffects(plan.ways[1].plan, "success"), plan.ways[1].plan.resolution.outcomes.success.manualInstructions ?? null], [[["frightened", 2]], [["frightened", 3]], null]);
});

test("Skull Bomb: its thrower Blinded for good as it's thrown; Drake Shot's Prone only for a target on the ground", () => {
    const bomb = compileItem(item("Skull Bomb"));
    assert.deepEqual([bomb.userEffects, Boolean(bomb.partial)], [[{ slug: "blinded", value: null, duration: null }], false]);
    const shot = planOf("Drake Rifle (Fire)");
    assert.deepEqual([shot.strike.groundedProne, shot.strike.notes, Boolean(shot.partial)], [true, [], false]);
    assert.deepEqual([rowEffects(withoutAloftProne(shot, 10), "success"), rowEffects(withoutAloftProne(shot, 0), "success")], [[], [["prone", null]]]);
});

test("after its effect ends: Starsong Nectar's 24 hours from its Effect's end; Captivating Bauble's once the fascination ends, only the immune left out at once", () => {
    const nectar = compileItem(item("Starsong Nectar"));
    assert.deepEqual([nectar.item.immunity.after, nectar.item.immunity.duration, Boolean(nectar.partial)], [true, { value: 24, unit: "hours" }, false]);
    const bauble = compileItem(item("Captivating Bauble"));
    assert.deepEqual([bauble.trigger.immunity.degrees, bauble.afterEnds.map((entry) => [entry.degree, entry.when, entry.then.immunity.slug]), Boolean(bauble.partial)], [["after-end"], [["failure", "fascinated", "captivating-bauble"], ["criticalFailure", "fascinated", "captivating-bauble"]], false]);
    assert.match(afterEndsMarkSource(bauble.afterEnds[0], { item: { name: "Captivating Bauble" } }).system.description.value, /When it(?:&#39;|')s no longer fascinated, it becomes temporarily immune to it for 24 hours/);
});

test("Celestial Peachwood Sword: a failed save destroys the undead, its user's backlash 1d6 void per level; Horns of Naraga's undead user healed by the void damage taken", () => {
    const sword = planOf("Celestial Peachwood Sword");
    assert.deepEqual([sword.resolution.outcomes.failure.terminal, sword.backlash, Boolean(sword.partial)], [{ kind: "death" }, { degrees: ["failure", "criticalFailure"], perLevel: "1d6", type: "void" }, false]);
    const horns = planOf("Horns of Naraga");
    assert.deepEqual([horns.drain, Boolean(horns.partial), horns.resolution.outcomes.success.manualInstructions ?? null], [{ fraction: 1, type: "void", duration: null, heal: true, immediate: true, onlyIf: "undead" }, false, null]);
});

test("live: a card's own damage heals its undead user by what the creature lost; a living user nothing", async () => {
    const { before, usePlans } = await import("../scripts/drain.js");
    const saved = { game: globalThis.game, ChatMessage: globalThis.ChatMessage, fromUuidSync: globalThis.fromUuidSync };
    const updates = [];
    globalThis.game = { user: { isGM: true }, users: [], modules: new Map() };
    globalThis.ChatMessage = { create: async (data) => data, getSpeaker: () => ({}) };
    const foe = { uuid: "Actor.foe", name: "Foe", system: { attributes: { hp: { value: 60, temp: 0 } } }, itemTypes: { effect: [] } };
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.foe" ? foe : null);
    try {
        usePlans(() => [{ plan: planOf("Horns of Naraga") }]);
        const horns = (traits) => ({ uuid: `Item.horns-${traits.join("")}`, name: "Horns of Naraga", system: { description: { value: "x" } }, actor: { name: "Wearer", system: { traits: { value: traits }, attributes: { hp: { value: 10, max: 100 } } }, update: async (data) => updates.push(data) } });
        const damage = { instances: [{ type: "void", persistent: false, options: {}, total: 18 }] };
        const after = before(foe, { damage, item: horns(["undead"]) });
        foe.system.attributes.hp.value = 42;
        await after();
        assert.deepEqual(updates, [{ "system.attributes.hp.value": 28 }]);
        assert.equal(before(foe, { damage, item: horns(["humanoid"]) }), null);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Sweet Hag's Eye: Meltaway Mint's own Reflex DC 18, its failure's 1d4 persistent fire — not the eye's poison after it", () => {
    const mint = planOf("Sweet Hag's Eye");
    assert.deepEqual([mint.resolution.check.statistic, mint.resolution.check.against.value, Boolean(mint.partial)], ["reflex", 18, false]);
    assert.doesNotMatch(compileActivations(item("Sweet Hag's Eye"))[0].activation.html, /Sickeningly Sweet/);
});

test("Invisible Chain Shirt: Concealed to the end of its user's next turn, its hostile-action end a note Effect, the Stride a line of the card", () => {
    const plan = planOf("Invisible Chain Shirt");
    const success = plan.resolution.outcomes.success;
    assert.deepEqual([success.effects[0].slug, success.effects[0].duration.expiry, success.noteEffects[0].text, plan.notes, Boolean(plan.partial)], ["concealed", "turn-end", "It ends sooner once you use a hostile action.", ["Stride first (its user's own move)."], false]);
});

test("Verdant Branch: its fruits wither 10 minutes after they grow — flagged with the world time they go", async () => {
    const { createdItemSource } = await import("../src/live/card.js");
    const plan = planOf("Verdant Branch");
    assert.deepEqual([plan.item.creates.lasts, Boolean(plan.partial)], [{ value: 10, unit: "minutes" }, false]);
    const fruit = createdItemSource(plan.item.creates, { count: 2, worldTime: 1000 });
    assert.deepEqual([fruit.flags["pf2e-automatic-item-resolution"].expiresAt, fruit.system.quantity], [1600, 2]);
});

test("Spark Wafer: a 5-foot burst placed within 20 feet for a round, its basic Reflex save on a creature starting its turn there, its light at the zone", () => {
    const plan = compileItem(item("Spark Wafer"));
    assert.deepEqual([plan.builtin, plan.zone.centre, plan.zone.range, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.light, plan.zone.saves[0].when, Boolean(plan.partial)], ["zone", "placed", 20, 1, "rounds", { bright: 5, dim: 10 }, ["start"], false]);
    assert.deepEqual([plan.zone.saves[0].plan.resolution.check.statistic, plan.zone.saves[0].plan.resolution.check.basic], ["reflex", true]);
});

test("Tarantula Ampoule: its critical failure's exposure to the venom is a follow-up save handing on the venom's stages, not the GM's line", () => {
    const plan = compileItem(item("Tarantula Ampoule"));
    const [follow] = plan.resolution.outcomes.criticalFailure.followUps;
    assert.deepEqual([follow.check.statistic, follow.check.against.value, follow.afflictionHandoff.name, follow.afflictionHandoff.stages.length, follow.outcomes.failure.affliction.stage, plan.resolution.outcomes.criticalFailure.manualInstructions ?? null], ["fortitude", 23, "Giant Tarantula Venom", 4, 1, null]);
});

// (Plans counted whole with a rule left in their notes, found 2026-10-26: each now plays it, or says it's partial.)
test("Elysian Dew: an unholy drinker's save card in place of the aura — Fortitude DC 30, Drained 2 on a failure", () => {
    const dew = compileItem(item("Elysian Dew"));
    const { traits, save } = dew.item.unlessKind;
    assert.deepEqual([traits, save.resolution.check.statistic, save.resolution.check.against.value, save.resolution.outcomes.failure.effects[0], dew.notes ?? null], [["unholy"], "fortitude", 30, { kind: "condition", slug: "drained", value: 2, duration: null }, null]);
});

test("Flame Layer Balm: no Fiery Body at once — its wearer marked for the hour, the first fire damage it takes setting it off for a minute", async () => {
    const { armedMarkSource } = await import("../src/live/card.js");
    const balm = compileItem(item("Flame Layer Balm"), { spellEffects });
    assert.deepEqual([balm.resolution.kind, balm.item.armed.damageType, balm.item.armed.lasts.value, balm.item.armed.lasts.unit, balm.item.armed.applications[0].label, balm.item.armed.applications[0].duration, balm.notes ?? null], ["check", "fire", 1, "hours", "Spell Effect: Fiery Body", { value: 1, unit: "minutes" }, null]);
    const mark = armedMarkSource(balm.item.armed, { item: { name: "Flame Layer Balm" } });
    assert.deepEqual([mark.name, mark.system.duration.value, mark.system.duration.unit], ["Flame Layer Balm: armed", 1, "hours"]);
});

test("Golden Blade of Mzali's Elemental Form: fire, at rank 7, its extra fire damage off by PF2e's own toggle — the toggle's reset at daily preparations the user's (partial)", () => {
    const blade = planOf("Golden Blade of Mzali", 1);
    assert.deepEqual([blade.toggleOn, blade.resolution.applications[0].choice, blade.resolution.applications[0].level, blade.partial], [{ option: "used-elemental-form" }, "fire", 7, true]);
});

test("Amulet of the Hellcat: Invisible on an Effect its next Strike ends, the bright light's end in its words, the Stride and Strike a line of the card", async () => {
    const { ruleEffectSource } = await import("../src/live/card.js");
    const amulet = planOf("Amulet of the Hellcat");
    const [effect] = amulet.item.ruleEffects;
    assert.deepEqual([effect.endsOnStrike, effect.rules[0].uuid, amulet.resolution.outcomes.success.effects, Boolean(amulet.partial)], [true, "Compendium.pf2e.conditionitems.Item.zJxUflt9np0q4yML", [], false]);
    assert.match(effect.words, /out of bright light/);
    assert.equal(ruleEffectSource(effect, { item: { name: "Amulet of the Hellcat" } }).flags["pf2e-automatic-item-resolution"].endsOnStrike, true);
    const { endOnStrike, isStrikeRoll } = await import("../scripts/ends-on-strike.js");
    assert.deepEqual([isStrikeRoll({ type: "attack-roll", outcome: "success", options: ["action:strike"] }), isStrikeRoll({ type: "spell-attack-roll", outcome: "success", options: [] })], [true, false]);
    let deleted = null;
    const actor = { itemTypes: { effect: [{ id: "e1", flags: { "pf2e-automatic-item-resolution": { endsOnStrike: true } } }, { id: "e2", flags: {} }] }, deleteEmbeddedDocuments: async (type, ids) => { deleted = ids; } };
    await endOnStrike({ actor, flags: { pf2e: { context: { type: "attack-roll", outcome: "hit", options: ["action:strike"] } } } });
    assert.deepEqual(deleted, ["e1"]);
});

test("Robe of Stone's Become Stone: Elemental Form's earth chosen on PF2e's Effect, an Effect for the minute with its 30-foot tremorsense and burrowing through stone", async () => {
    const { effectSource } = await import("../src/live/card.js");
    const robe = planOf("Robe of Stone");
    const [extra] = robe.item.ruleEffects;
    assert.deepEqual([robe.resolution.applications[0].choice, extra.rules, extra.duration.value, robe.notes ?? null, Boolean(robe.partial)], ["earth", [{ key: "Sense", selector: "tremorsense", range: 30, acuity: "imprecise" }], 1, null, false]);
    const source = effectSource({ name: "Spell Effect: Elemental Form", system: { rules: [{ key: "ChoiceSet", flag: "spellEffectElementalForm", choices: [{ value: "air" }, { value: "earth" }] }] } }, { application: robe.resolution.applications[0] });
    assert.equal(source.system.rules[0].selection, "earth");
});

test("Buoyant Buckle: its swim Speed's words say it's only along the surface and ends once the pouches take damage", async () => {
    const { speedText } = await import("../src/live/card.js");
    const buckle = planOf("Buoyant Buckle");
    assert.equal(Boolean(buckle.partial), false);
    assert.match(speedText(buckle.item.speeds[0]), /; only along the water's surface; it ends if the pouches take any damage \(AC 10, Hardness 0\)$/);
});

test("Cauthooj Bagpipes' Disorienting Fugue: a critical success's immunity an hour; a critical failure's attack on itself rolled", async () => {
    const pipes = planOf("Cauthooj Bagpipes");
    assert.deepEqual([pipes.immunityLonger, pipes.selfAttack, pipes.trigger.immunity.duration, Boolean(pipes.partial)], [{ criticalSuccess: { value: 1, unit: "hours" } }, { degrees: ["criticalFailure"] }, { value: 1, unit: "minutes" }, false]);
    const { longerImmunity, selfAttacks } = await import("../scripts/after-ends.js");
    const saved = { fromUuid: globalThis.fromUuid };
    const updates = [];
    const applied = [];
    const immune = { flags: { "pf2e-automatic-ability-resolution": { immunity: { slug: pipes.trigger.immunity.slug } } }, update: async (data) => updates.push(data) };
    const foe = { itemTypes: { effect: [immune] }, system: { actions: [{ type: "strike", item: { isMelee: true }, damage: async () => ({ total: 7 }) }] }, applyDamage: async (data) => applied.push(data.damage.total) };
    globalThis.fromUuid = async () => foe;
    try {
        await longerImmunity({ state: { plan: pipes }, targets: [{ actorUuid: "Actor.foe", degree: "criticalSuccess" }, { actorUuid: "Actor.foe", degree: "success" }] });
        assert.deepEqual(updates, [{ "system.duration.value": 1, "system.duration.unit": "hours" }]);
        await selfAttacks({ state: { plan: pipes }, targets: [{ actorUuid: "Actor.foe", degree: "criticalFailure" }, { actorUuid: "Actor.foe", degree: "failure" }] });
        assert.deepEqual(applied, [7]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Chromatic Robe's Align Energy: a Mythic Point, resistance 15 to the type chosen — its words saying the others are lost and when it ends, a new use replacing it", async () => {
    const { resistanceText } = await import("../src/live/card.js");
    const robe = planOf("Chromatic Robe");
    assert.deepEqual([robe.spend, robe.item.resist[0].value, robe.item.resist[0].replaces, Boolean(robe.partial), robe.unread ?? []], [{ mythicPoints: 1 }, 15, true, false, []]);
    assert.match(resistanceText([{ ...robe.item.resist[0], type: "fire", choose: undefined }]), /^Resistance 15 to fire; no resistance from it to the other three types; until the next daily preparations \(remove it then\) or the next use$/);
});

test("Blessed Lantern Flail's Purge Unholy Magic: its Strike, then the Will save; a flat check to Cast a Spell by degree that the spell module reads", async () => {
    const { castFlatCheckSource } = await import("../src/live/card.js");
    const flail = planOf("Blessed Lantern Flail");
    const save = flail.strike.save;
    assert.deepEqual([save.resolution.check.statistic, save.resolution.check.against.value, save.castFlatCheck.success.dc, save.castFlatCheck.criticalFailure.dc, save.castFlatCheck.failure.duration.unit, Boolean(flail.partial)], ["will", 31, 5, 11, "minutes", false]);
    assert.deepEqual(Object.values(save.resolution.outcomes).map((row) => [row.noteEffects ?? null, row.manualInstructions ?? null]), [[null, null], [null, null], [null, null], [null, null]]);
    const effect = castFlatCheckSource(save.castFlatCheck.criticalFailure, { item: { name: "Blessed Lantern Flail" } });
    assert.deepEqual([effect.flags["pf2e-automatic-resolution"].runtime.castFlatCheck, effect.system.duration.value, effect.system.duration.unit], [{ dc: 11 }, 1, "minutes"]);
});

test("Perfected Robes: the next d20 roll at legendary proficiency rolled twice — a RollTwice for each of its user's legendary statistics, read off its sheet", async () => {
    const { readiedRules, rollWords } = await import("../src/live/fortune-card.js");
    const { legendaryRolls } = await import("../scripts/fortune.js");
    const robes = planOf("Perfected Robes");
    assert.deepEqual([robes.builtin, robes.rollTwice, Boolean(robes.partial)], ["roll-twice", { selector: "legendary", keep: "higher" }, false]);
    const actor = { skills: { athletics: { rank: 4, label: "Athletics" }, stealth: { rank: 3 } }, saves: { will: { rank: 4, label: "Will" } }, perception: { rank: 2 }, system: { proficiencies: { attacks: { martial: { rank: 4 } } } }, spellcasting: { contents: [] } };
    const rolls = legendaryRolls(actor);
    assert.deepEqual(rolls.map((roll) => roll.selector), ["athletics", "will", "strike-attack-roll"]);
    const rules = readiedRules({ ...robes, rollTwice: { ...robes.rollTwice, rolls } });
    assert.deepEqual(rules.map((rule) => [rule.selector, rule.removeAfterRoll, rule.predicate ?? null]), [["athletics", true, null], ["will", true, null], ["strike-attack-roll", true, ["item:proficiency:rank:4"]]]);
    assert.match(rollWords({ ...robes.rollTwice, rolls }), /^d20 roll with legendary proficiency, if it's its next action \(Athletics, Will, Strikes at legendary proficiency\)$/);
});

test("Behaviour rows as note Effects on the creature (the user's 2026-10-25 rulings): Robe of Beneficence, Successor Doll, Graverose Garland, Shining Shield", () => {
    const notes = (plan, degree) => (plan.resolution.outcomes[degree].noteEffects ?? []).map((note) => [note.label ?? null, note.text, note.duration?.value ?? null, note.duration?.unit ?? null]);
    // "As failure, and …": the row's own Stunned 2 applied; the rest a note, not the reminder again.
    const robe = planOf("Robe of Beneficence");
    assert.deepEqual([Boolean(robe.partial), rowEffects(robe, "criticalFailure"), notes(robe, "criticalFailure")], [false, [["stunned", 2]], [[null, "The creature can't use any hostile action against you for 1 round.", 1, "rounds"]]]);
    // No end of its own: until the GM removes it.
    const doll = planOf("Successor Doll", 1);
    assert.deepEqual([Boolean(doll.partial), notes(doll, "failure").map(([, , value]) => value)], [false, [null]]);
    assert.match(notes(doll, "failure")[0][1], /\bdoesn't act against you\b/);
    // Its critical failure's flight to a grave: a note Effect, its Prone when it gets there the GM's.
    const garland = planOf("Graverose Garland");
    assert.deepEqual([Boolean(garland.partial), notes(garland, "criticalFailure").map(([label]) => label)], [false, ["To its grave"]]);
    // "As failure, but the duration is 1 minute": a minute, not its reminder's round; not the shield's stat line.
    const shield = planOf("Shining Shield");
    assert.deepEqual([Boolean(shield.partial), notes(shield, "failure").map(([, , value, unit]) => `${value} ${unit}`), notes(shield, "criticalFailure").map(([, , value, unit]) => `${value} ${unit}`)], [false, ["1 rounds"], ["1 minutes"]]);
    assert.doesNotMatch(notes(shield, "criticalFailure")[0][1], /Hardness/);
});

test("Swarmeater's Clasp: a damage card at the swarm in reach, its user healed by the same roll — not by what the swarm lost, none with void healing", async () => {
    const clasp = planOf("Swarmeater's Clasp");
    assert.deepEqual([clasp.targeting.target, clasp.resolution.sharedDamage.components.map((component) => `${component.formula} ${component.type}`), clasp.resolution.outcomes.success.effects, clasp.drain, Boolean(clasp.partial), clasp.unread ?? []], ["1 swarm creature", ["3d10+8 bludgeoning"], [], { fraction: 1, type: "bludgeoning", duration: null, heal: true, immediate: true, fromRoll: true, vitality: true }, false, []]);
    const { before, usePlans } = await import("../scripts/drain.js");
    const saved = { game: globalThis.game, ChatMessage: globalThis.ChatMessage, fromUuidSync: globalThis.fromUuidSync };
    const updates = [];
    const messages = [];
    globalThis.game = { user: { isGM: true }, users: [], modules: new Map() };
    globalThis.ChatMessage = { create: async (data) => messages.push(data.content), getSpeaker: () => ({}) };
    const swarm = { uuid: "Actor.swarm", name: "Swarm", system: { attributes: { hp: { value: 60, temp: 0 } } }, itemTypes: { effect: [] } };
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.swarm" ? swarm : null);
    try {
        usePlans(() => [{ plan: clasp }]);
        const wearer = (negativeHealing) => ({ uuid: `Item.clasp-${negativeHealing}`, name: "Swarmeater's Clasp", system: { description: { value: "x" } }, actor: { name: "Wearer", system: { traits: { value: [] }, attributes: { hp: { value: 10, max: 100, negativeHealing } } }, update: async (data) => updates.push(data) } });
        const damage = { instances: [{ type: "bludgeoning", persistent: false, options: {}, total: 25 }] };
        // (The swarm resists 10 of it: its user still regains the 25 rolled.)
        const after = before(swarm, { damage, item: wearer(false) });
        swarm.system.attributes.hp.value = 45;
        await after();
        assert.deepEqual(updates, [{ "system.attributes.hp.value": 35 }]);
        await before(swarm, { damage, item: wearer(true) })();
        assert.equal(updates.length, 1);
        assert.match(messages.at(-1), /regains no Hit Points/);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Ablative Shield Plating: the shield's own temporary Hit Points for their time, its Hit Points lost coming off them first", async () => {
    const plans = ["Lesser", "Moderate", "Greater", "Major", "True"].map((grade) => compileItem(item(`Ablative Shield Plating (${grade})`), { spellEffects }));
    assert.deepEqual(plans.map((plan) => [plan.builtin ?? null, plan.item.shieldTemp.value, `${plan.item.shieldTemp.lasts.value} ${plan.item.shieldTemp.lasts.unit}`, Boolean(plan.partial)]), [[null, 5, "1 minutes", false], [null, 10, "10 minutes", false], [null, 20, "1 hours", false], [null, 30, "1 hours", false], [null, 40, "1 hours", false]]);
    const { shieldTempSource } = await import("../src/live/card.js");
    const source = shieldTempSource(plans[1].item.shieldTemp, { shield: { id: "shield1", name: "Steel Shield" }, item: { name: "Ablative Shield Plating (Moderate)" } });
    assert.deepEqual([source.name, source.system.badge, source.flags["pf2e-automatic-item-resolution"].shieldTemp, source.system.duration.value, source.system.duration.unit], ["Ablative Shield Plating (Moderate): Steel Shield", { type: "counter", value: 10, max: 10 }, { shieldId: "shield1", value: 10 }, 10, "minutes"]);
    const { absorb, afterAbsorbed, shieldToPlate } = await import("../scripts/shield-temp.js");
    const saved = { foundry: globalThis.foundry, game: globalThis.game, ChatMessage: globalThis.ChatMessage };
    const get = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);
    const set = (object, key, value) => { const parts = key.split("."); const last = parts.pop(); parts.reduce((node, part) => (node[part] ??= {}), object)[last] = value; };
    globalThis.foundry = { utils: { getProperty: get, setProperty: set } };
    globalThis.game = { users: [] };
    const messages = [];
    globalThis.ChatMessage = { create: async (data) => messages.push(data.content), getSpeaker: () => ({}) };
    try {
        const updates = [];
        const plating = { id: "plating1", name: source.name, flags: source.flags, system: { badge: { value: 10 } }, update: async (data) => updates.push(data), delete: async () => updates.push("deleted") };
        const actor = { itemTypes: { effect: [plating], shield: [] }, items: { get: (id) => (id === "plating1" ? plating : null) } };
        const shield = { id: "shield1", type: "shield", name: "Steel Shield", actor, _source: { system: { hp: { value: 20 } } } };
        actor.itemTypes.shield.push(shield);
        assert.equal(shieldToPlate(actor), shield);
        // (6 lost: all of it off the plating, the shield at 20 still.)
        const changes = { system: { hp: { value: 14 } } };
        const options = {};
        assert.equal(absorb(shield, changes, options), 6);
        assert.equal(changes.system.hp.value, 20);
        await afterAbsorbed(shield, options);
        assert.deepEqual(updates, [{ "system.badge.value": 4 }]);
        // (9 more: 4 off the plating, gone; the shield down 5.)
        plating.system.badge.value = 4;
        const more = { system: { hp: { value: 11 } } };
        const again = {};
        assert.equal(absorb(shield, more, again), 4);
        assert.equal(more.system.hp.value, 15);
        await afterAbsorbed(shield, again);
        assert.equal(updates.at(-1), "deleted");
        assert.match(messages.at(-1), /takes 4 of the Hit Points .* falls apart/);
        // (A repair isn't touched.)
        assert.equal(absorb(shield, { system: { hp: { value: 25 } } }, {}), 0);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Ring of the Tiger: its claw for the turn, the Strike its user's own (a card line); the Greater ring's extra die not on top of a striking rune's", async () => {
    const { attackEffectSource } = await import("../src/live/card.js");
    const ring = planOf("Ring of the Tiger");
    const greater = planOf("Ring of the Tiger (Greater)");
    assert.deepEqual([ring, greater].map((plan) => [Boolean(plan.partial), plan.notes, plan.unread ?? [], plan.item.attacks[0].dice, Boolean(plan.item.attacks[0].strikingCap)]), [[false, ["Then Strike with the claw (its user's own action)."], [], 1, false], [false, ["Then Strike with the claw (its user's own action)."], [], 2, true]]);
    const actorWith = (striking) => ({ system: { actions: [{ item: { system: { category: "unarmed", damage: { die: "d4" }, traits: { value: ["agile"] }, runes: { striking } } } }] } });
    const dice = (actor) => attackEffectSource(greater.item.attacks[0], { item: { name: "Ring of the Tiger (Greater)" }, actor }).system.rules[0].damage.base.dice;
    // (No striking rune: 2d6. Striking: 1d6 + the rune's 1 = 2d6. Greater striking: 1d6 + 2 = 3d6.)
    assert.deepEqual([dice(actorWith(0)), dice(actorWith(1)), dice(actorWith(2)), dice(null)], [2, 1, 1, 2]);
});

test("Freedom's Flame's Holy Retribution: a creature with a holy weakness takes its weakness's value again (untyped), the rest 15 spirit", async () => {
    const { planFor, targetGroups } = await import("../src/live/if-target.js");
    const flame = planOf("Freedom's Flame", 1);
    assert.deepEqual([Boolean(flame.partial), flame.ifTarget, flame.resolution.outcomes.success.manualInstructions ?? []], [false, [{ weakness: "holy", weaknessDamage: true }], []]);
    const fiend = { attributes: { weaknesses: [{ type: "holy", value: 10 }] } };
    const ogre = { attributes: { weaknesses: [{ type: "cold-iron", value: 5 }] } };
    const formula = (actor) => planFor(flame, actor).resolution.sharedDamage.components[0].formula;
    assert.deepEqual([formula(fiend), formula(ogre)], ["10[untyped]", "15[spirit]"]);
    assert.equal(targetGroups(flame, [{ actor: fiend }, { actor: ogre }]).length, 2);
});

test("Coldstar Pistols' two Strikes at one target on the higher of two attack rolls: one Strike rolled twice keeping the higher, the second's damage rolled on a hit", async () => {
    const { strikeRules, strikeLines } = await import("../src/live/strike-card.js");
    const pistols = planOf("Coldstar Pistols", 1);
    assert.deepEqual([Boolean(pistols.partial), pistols.strike.uses, pistols.strike.volley.twin, pistols.strike.notes], [false, 1, true, []]);
    assert.deepEqual(strikeRules(pistols, { weaponId: "gun1", label: "Coldstar Pistols" }).map((rule) => [rule.key, rule.selector, rule.keep]), [["RollTwice", "gun1-attack", "higher"]]);
    assert.ok(strikeLines(pistols).some((line) => /rises two steps after them/.test(line)));
    const { secondStrikeDamage } = await import("../scripts/strikes.js");
    const saved = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
    globalThis.game = { user: { settings: { showDamageDialogs: false } } };
    globalThis.ChatMessage = { create: async () => null, getSpeaker: () => ({}) };
    try {
        const rolled = [];
        const actor = { name: "Onki", system: { actions: [{ type: "strike", item: { id: "other" }, damage: async () => rolled.push("other") }, { type: "strike", item: { id: "gun1" }, damage: async () => rolled.push("damage"), critical: async () => rolled.push("critical") }] } };
        await secondStrikeDamage(actor, {}, "success", { weaponId: "gun1", item: { name: "Coldstar Pistols" } });
        await secondStrikeDamage(actor, {}, "criticalSuccess", { weaponId: "gun1", item: { name: "Coldstar Pistols" } });
        assert.deepEqual(rolled, ["damage", "critical"]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Blackfinger Blight and Astringent Venom: a flat check at each afflicted turn's start, a random held item dropped on a failure", async () => {
    const consumable = (name) => compileItem(item(name), { spellEffects });
    for (const name of ["Blackfinger Blight", "Astringent Venom"]) {
        const plan = consumable(name);
        assert.deepEqual([Boolean(plan.partial), plan.notes ?? [], plan.afflictedTurns.flatDC, plan.afflictedTurns.lasts.value, plan.afflictedTurns.name], [false, [], 5, 6, name]);
    }
    const blight = consumable("Blackfinger Blight");
    const { markAfflicted, afflictedTurnStart } = await import("../scripts/afflicted-turns.js");
    const saved = { game: globalThis.game, fromUuid: globalThis.fromUuid, ChatMessage: globalThis.ChatMessage, Roll: globalThis.Roll };
    const effects = [];
    const updates = [];
    const sword = { name: "Longsword", system: { equipped: { carryType: "held" } }, update: async (changes) => updates.push(["Longsword", changes]) };
    const afflicted = { name: "Blackfinger Blight (Stage 1)", flags: { "pseudo-afflictions": {} } };
    const actor = { uuid: "Actor.victim", name: "Victim", inventory: { contents: [sword] }, itemTypes: { get effect() { return [afflicted, ...effects]; } }, createEmbeddedDocuments: async (type, sources) => sources.map((source) => { const made = { ...source, delete: async () => effects.splice(effects.indexOf(made), 1) }; effects.push(made); return made; }) };
    let next = 3;
    globalThis.Roll = class { constructor() {} async evaluate() { this.total = next; return this; } async toMessage() { return null; } };
    globalThis.game = { modules: new Map([["pseudo-afflictions", { active: true }]]), combat: null, time: { worldTime: 0 }, user: { isGM: true } };
    globalThis.fromUuid = async (uuid) => (uuid === actor.uuid ? actor : null);
    const messages = [];
    globalThis.ChatMessage = { create: async (data) => messages.push(data.content), getSpeaker: () => ({}) };
    try {
        // (A success isn't afflicted: no mark.)
        await markAfflicted({ state: { plan: blight, source: {} }, targets: [{ actorUuid: actor.uuid, degree: "success" }] });
        assert.equal(effects.length, 0);
        await markAfflicted({ state: { plan: blight, source: {} }, targets: [{ actorUuid: actor.uuid, degree: "failure" }] });
        assert.equal(effects.length, 1);
        // (A 3: the sword dropped. A 15: kept.)
        await afflictedTurnStart(actor);
        assert.deepEqual(updates, [["Longsword", { "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 }]]);
        next = 15;
        await afflictedTurnStart(actor);
        assert.equal(updates.length, 1);
        // (The affliction gone from Pseudo Afflictions: the mark goes too.)
        afflicted.flags = {};
        await afflictedTurnStart(actor);
        assert.equal(effects.length, 0);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Liquid Gold: its attached weapon drawn (one of its user's weapons not in hand, picked); the Greater one's loaded too", async () => {
    const { objectChoices } = await import("../scripts/objects.js");
    const lesser = compileItem(item("Liquid Gold"), { spellEffects });
    const greater = compileItem(item("Liquid Gold (Greater)"), { spellEffects });
    assert.deepEqual([lesser.builtin, lesser.objects, Boolean(lesser.partial), greater.objects], ["objects", { op: "hand", weapon: true }, false, { op: "hand", weapon: true, load: true }]);
    const things = [
        { id: "gun", name: "Dueling Pistol", type: "weapon", system: { equipped: { carryType: "worn" }, bulk: { value: 0.1 } } },
        { id: "rope", name: "Rope", type: "equipment", system: { equipped: { carryType: "worn" }, bulk: { value: 0.1 } } },
        { id: "sword", name: "Longsword", type: "weapon", system: { equipped: { carryType: "held" }, bulk: { value: 1 } } }
    ];
    assert.deepEqual(objectChoices({ items: things }, lesser.objects, "vial").map((choice) => choice.name), ["Dueling Pistol"]);
});

test("Costume Change (Sihedron Ring, Raiment, Skirmisher's Coat): a note Effect for the illusion on its user's clothes, its disbelief the GM's control for creatures with truesight", () => {
    const costume = (name) => compileActivations(item(name), { spellEffects }).find((entry) => entry.activation.name === "Costume Change").plan;
    for (const [name, dc] of [["Sihedron Ring", 20], ["Raiment", 25], ["Skirmisher's Coat", 28]]) {
        const plan = costume(name);
        assert.deepEqual([Boolean(plan.partial), plan.notes ?? [], plan.disbelief.dc, plan.resolution.outcomes.success.noteEffects.map((note) => note.label)], [false, [], dc, ["Costume"]], name);
        assert.match(plan.disbelief.when, /truesight/);
    }
});

test("Break Bonds and Cayden's Tankard: the Speed penalties ended with the conditions (the Tankard's circumstance ones, its targets' too); Break Bonds spares a magical Effect of level 12 or higher", async () => {
    const bonds = planOf("Spleen Bloodstone of Arazni", 1);
    const tankard = planOf("Cayden's Tankard", 1);
    assert.deepEqual([Boolean(bonds.partial), bonds.notes ?? [], bonds.item.speedPenaltiesEnd, bonds.item.reduce.every((entry) => entry.unlessMagical === 12)], [false, [], { unlessMagical: 12 }, true]);
    assert.deepEqual([Boolean(tankard.partial), tankard.notes ?? [], tankard.item.speedPenaltiesEnd], [false, [], { type: "circumstance", targets: true }]);
    const { endSpeedPenalties, sparedBy } = await import("../scripts/speed-penalties.js");
    const made = (name, rules, extra = {}) => { const effect = { name, system: { rules, ...extra }, updated: null, deleted: false, update: async (changes) => { effect.updated = changes; }, delete: async () => { effect.deleted = true; } }; return effect; };
    const mud = made("Mud", [{ key: "FlatModifier", selector: "land-speed", value: -10, type: "circumstance" }]);
    const curse = made("Curse", [{ key: "FlatModifier", selector: "all-speeds", value: -5, type: "status" }, { key: "FlatModifier", selector: "attack", value: -1, type: "status" }]);
    const haste = made("Haste", [{ key: "FlatModifier", selector: "land-speed", value: 10, type: "status" }]);
    const wish = made("Spell Effect: Binding", [{ key: "FlatModifier", selector: "all-speeds", value: -20, type: "status" }], { level: { value: 14 }, traits: { value: ["arcane"] } });
    const actor = { itemTypes: { effect: [mud, curse, haste, wish] } };
    const tankardLines = await endSpeedPenalties(actor, "Kyra", tankard.item.speedPenaltiesEnd);
    assert.deepEqual([mud.deleted, curse.updated, haste.deleted, tankardLines.length], [true, null, false, 1]);
    const bondsLines = await endSpeedPenalties(actor, "Kyra", bonds.item.speedPenaltiesEnd);
    assert.deepEqual([curse.updated, wish.deleted, bondsLines.some((line) => /Binding's Speed penalty stays/.test(line))], [{ "system.rules": [{ key: "FlatModifier", selector: "attack", value: -1, type: "status" }] }, false, true]);
    assert.deepEqual([sparedBy(wish, 12), sparedBy(mud, 12)], [true, false]);
});
