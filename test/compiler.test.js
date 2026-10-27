import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry, validateChanges } from "../../pf2e-resolution-core/src/index.js";
import { actionTypeOf, compileItem as compileWith, handlesItem, itemDuration, readActivations, recipientOf, spellEffectIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
const compileItem = (data, options = {}) => compileWith(data, { spellEffects, ...options });
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, `${name} is in PF2e's equipment pack`);
    return found;
};

const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);
// The user drinks (or feeds) it: the drinker is the target, the user the caster.
const context = (drinker = { id: "drinker", side: "party" }) => ({ caster: { id: "user", side: "party" }, targets: [drinker], statistic: () => ({ modifier: 10, dc: 20 }), allied: (a, b) => a?.side === b?.side });
const io = (degree = "success", rolled = 5) => ({ roll: () => ({ degree, natural: 10, total: 20 }), damage: () => rolled });

test("the spell module's consumables and other item types are left out", () => {
    assert.equal(handlesItem(item("Healing Potion (Minor)")), true);
    assert.equal(handlesItem(item("Scroll of 6th-rank Spell")), false);
    assert.equal(handlesItem({ type: "consumable", system: { category: "wand" } }), false);
    assert.equal(handlesItem({ type: "consumable", system: { category: "catalyst" } }), false);
    assert.equal(handlesItem(item("Alchemist's Fire (Lesser)")), false, "bombs are weapons (batch 2)");
    assert.equal(compileItem(item("Scroll of 6th-rank Spell")), null);
    // A catalyst filed as "other" is still the spell module's.
    assert.equal(handlesItem(item("Irritating Seedpod")), false);
    assert.equal(handlesItem(item("Void Salts")), false);
});

test("activations: actions, traits, names and times", () => {
    assert.deepEqual(readActivations('<p><strong>Activate</strong> <span class="action-glyph">A</span> (manipulate)</p>'), [{ name: null, time: "1", traits: ["manipulate"], raw: "Activate [a] (manipulate)" }]);
    assert.equal(readActivations('<p><strong>Activate</strong> <span class="action-glyph">2</span> (manipulate)</p>')[0].time, "2");
    assert.equal(readActivations('<p><strong>Activate</strong> <span class="action-glyph">R</span> Interact</p>')[0].time, "reaction");
    assert.equal(readActivations('<p><strong>Activate</strong> <span class="action-glyph">f</span> envision</p>')[0].time, "free");
    const tea = readActivations(item("Covenant Tea").system.description.value);
    assert.equal(tea.length, 2);
    assert.deepEqual([tea[1].name, tea[1].time, tea[1].traits], ["Tea Ceremony", "10 minutes", ["concentrate", "manipulate"]]);
    assert.deepEqual(actionTypeOf("2"), { actionType: "action", actions: 2 });
    assert.deepEqual(actionTypeOf("10 minutes"), { actionType: "passive", actions: null });
});

test("a healing potion heals its drinker with PF2e's own healing", () => {
    const potion = item("Healing Potion (Minor)");
    const plan = compileItem(potion);
    assert.equal(plan.resolution.kind, "healing");
    assert.deepEqual(plan.resolution.native.healing, { components: [{ id: "healing", formula: "1d8", kinds: ["healing"] }], recipients: "living" });
    assert.deepEqual(plan.item.pf2eRoll, { formula: "1d8", kind: "healing", type: "vitality" }, "live play uses PF2e's roll");
    assert.equal(plan.item.recipient, "drinker");
    assert.equal(plan.source.type, "consumable");
    const result = registry.resolveSync(plan, context(), io("success", 6));
    assert.deepEqual(result.changes, [{ op: "heal", target: "drinker", amount: 6 }]);
    assert.deepEqual(result.gaps, []);
    // An ally fed the potion is the one healed.
    assert.deepEqual(registry.resolveSync(plan, context({ id: "ally", side: "party" }), io("success", 3)).changes, [{ op: "heal", target: "ally", amount: 3 }]);
});

test("PF2e's healing field heals only when the text does (a potion of annulment keeps its counteract roll there)", () => {
    const annulment = compileItem(item("Potion of Annulment (Lesser)"));
    assert.notEqual(annulment?.resolution?.kind, "healing");
    assert.equal(annulment?.resolution?.native?.healing, undefined);
});

test("an elixir of life heals and gives its PF2e Effect to the drinker", () => {
    const plan = compileItem(item("Elixir of Life (Minor)"));
    assert.equal(plan.resolution.kind, "effect");
    assert.deepEqual(plan.resolution.applications, [{ kind: "native-spell-effect", uuid: "Compendium.pf2e.equipment-effects.Item.lPRuIRbu0rHBkoKY", label: "Effect: Elixir of Life", recipients: "target" }]);
    assert.equal(plan.resolution.native.healing.components[0].formula, "1d6");
    const result = registry.resolveSync(plan, context(), io("success", 4));
    assert.deepEqual(result.changes, [
        { op: "heal", target: "drinker", amount: 4 },
        { op: "effect", target: "drinker", effect: { kind: "native", uuid: "Compendium.pf2e.equipment-effects.Item.lPRuIRbu0rHBkoKY", label: "Effect: Elixir of Life" } }
    ]);
    assert.deepEqual(result.gaps, []);
});

test("a mutagen's Effect goes to the drinker, not always to its user", () => {
    const plan = compileItem(item("Juggernaut Mutagen (Lesser)"));
    assert.equal(plan.resolution.applications[0].recipients, "target");
    const result = registry.resolveSync(plan, context({ id: "ally", side: "party" }), io());
    assert.deepEqual(result.changes.map((change) => [change.op, change.target]), [["effect", "ally"]]);
});

test("an item whose one linked Effect the ability compiler didn't read gets it", () => {
    for (const name of ["Darkvision Elixir (Lesser)", "Potion of Swimming", "Stone Fist Elixir", "Cognitive Mutagen (Major)"]) {
        const plan = compileItem(item(name));
        assert.equal(plan?.resolution?.kind, "effect", name);
        assert.equal(plan.resolution.applications.length, 1, name);
        assert.equal(plan.resolution.applications[0].recipients, "target", name);
        assert.deepEqual(registry.resolveSync(plan, context(), io()).gaps, [], name);
    }
});

test("an item linking an Effect for each stage or degree isn't given them all", () => {
    for (const name of ["Crackling Bubble Gum (Lesser)", "Grit"]) {
        const plan = compileItem(item(name));
        assert.ok(!plan || plan.resolution?.kind !== "effect" || plan.resolution.applications.length <= 1, name);
    }
});

test("who gets an item's benefit", () => {
    assert.equal(recipientOf(item("Healing Potion (Minor)")), "drinker");
    assert.equal(recipientOf(item("Juggernaut Mutagen (Lesser)")), "drinker");
    assert.equal(recipientOf(item("Black Adder Venom")), "user", "a poison is applied to the user's weapon");
});

test("an injury poison stays a rider on the user's next Strike", () => {
    const plan = compileItem(item("Black Adder Venom"));
    assert.equal(plan.resolution.kind, "save");
    assert.equal(plan.trigger.event, "strike");
    assert.equal(plan.resolution.afflictionHandoff.stages.length, 3);
});

test("an item granting a spell's effects gets PF2e's Spell Effect at its rank and for its time", () => {
    const oak = compileItem(item("Oak Potion"));
    assert.equal(oak.resolution.kind, "effect", "the ability compiler's cast becomes the spell's Effect");
    assert.deepEqual(oak.resolution.applications.map((entry) => [entry.label, entry.level, entry.duration, entry.recipients]), [["Spell Effect: Oaken Resilience", 2, { value: 10, unit: "minutes" }, "target"]]);
    const quickness = compileItem(item("Potion of Quickness"));
    assert.deepEqual(quickness.resolution.applications.map((entry) => [entry.label, entry.level, entry.duration]), [["Spell Effect: Haste", null, { value: 1, unit: "minutes" }]]);
    assert.deepEqual(registry.resolveSync(quickness, context(), io()).changes.map((change) => [change.op, change.target, change.effect.label]), [["effect", "drinker", "Spell Effect: Haste"]]);
    // No PF2e Effect for Invisibility: still a cast, the spell module's.
    assert.equal(compileItem(item("Invisibility Potion")).builtin, "cast-spell");
    // The same for a talisman's "casts a 2nd-rank Invisibility spell on you", and a counteract modifier the text states.
    const fade = compileItem(item("Fade Band"));
    assert.deepEqual([fade.builtin, fade.spell.name, fade.rank, fade.self], ["cast-spell", "Invisibility", 2, true]);
    const truesight = compileItem(item("Truesight Potion"));
    assert.deepEqual([truesight.builtin, truesight.spell.name, truesight.rank, truesight.attack], ["cast-spell", "Truesight", 7, 25]);
    // At someone else: a cast at the presser's targets, with its DC or counteract modifier.
    const charm = compileItem(item("Amnemonic Charm"));
    assert.deepEqual([charm.builtin, charm.spell.name, charm.self, charm.dc], ["cast-spell", "Rewrite Memory", false, 26]);
    const sliver = compileItem(item("Dispelling Sliver"));
    assert.deepEqual([sliver.spell.name, sliver.rank, sliver.self, sliver.attack], ["Dispel Magic", 8, false, 29]);
    assert.deepEqual([compileItem(item("Elemental Gem")).spell.name, compileItem(item("Elemental Gem")).rank], ["Summon Elemental", 5]);
    const enigma = compileItem(item("Enigma-Sight Potion"));
    assert.equal(enigma.builtin, "cast-spell");
    // (2026-10-27: its "except that you use your Perception modifier" is its note Effect beside the cast now, src/compiler/cast-note.js.)
    assert.match(enigma.castNote.text, /use its Perception modifier/);
    // A talisman that casts a spell on its user: the same, at its rank (Snarling Badger's Heroism) or for its time (Stormfeather's Fly).
    assert.deepEqual(compileItem(item("Snarling Badger (Moderate)")).resolution.applications.map((entry) => [entry.label, entry.level, entry.recipients]), [["Spell Effect: Heroism", 6, "self"]]);
    assert.deepEqual(compileItem(item("Stormfeather")).resolution.applications.map((entry) => [entry.label, entry.duration]), [["Spell Effect: Fly", { value: 1, unit: "minutes" }]]);
    // Without the index (no spell-effects pack): the ability compiler's reading.
    assert.equal(compileWith(item("Oak Potion")).builtin, "cast-spell");
});

test("a condition the text puts on the drinker, for its own time, as an automatic row", () => {
    const mist = compileItem(item("Mistform Elixir (Greater)"));
    assert.deepEqual(mist.resolution.check, { roll: "automatic" });
    assert.deepEqual(mist.resolution.outcomes.success.effects, [{ kind: "condition", slug: "concealed", value: null, duration: { mode: "fixed", value: 5, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]);
    const result = registry.resolveSync(mist, context({ id: "ally", side: "party" }), io());
    assert.deepEqual(result.changes.map((change) => [change.op, change.target, change.slug]), [["condition", "ally", "concealed"]]);
    assert.equal(mist.partial, undefined, "its other sentence only restates the usual rule");
    // (What no PF2e rule sets, "the DC to move you … is 40": words on its Effect since 2026-10-27, a note with its text before.)
    const immovable = compileItem(item("Immovable Potion"));
    assert.equal(immovable.resolution.outcomes.success.effects[0].slug, "immobilized");
    assert.equal(immovable.partial, undefined);
    assert.match(immovable.item.ruleEffects[0].words, /DC to move it/);
    // Megaphone Mutagen: its benefit on skill checks of auditory actions but Deception and Diplomacy (PF2e's item:trait and
    // check:statistic options), its drawback (a −2 to Fortitude, Deception, Diplomacy and Stealth); its longer range words on its Effect
    // (no PF2e rule plays it; 2026-10-27, a note before).
    const megaphone = compileItem(item("Megaphone Mutagen (Lesser)"));
    assert.deepEqual(megaphone.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value]), [["skill-check", 1], ["fortitude", -2], ["deception", -2], ["diplomacy", -2], ["stealth", -2]]);
    assert.deepEqual(megaphone.resolution.outcomes.success.modifiers[0].predicate, ["item:trait:auditory", { nor: ["check:statistic:deception", "check:statistic:diplomacy"] }]);
    assert.equal(megaphone.partial, undefined);
    assert.deepEqual(megaphone.item.ruleEffects.map((entry) => [entry.name, entry.words]), [["louder", "Its actions and spells with the auditory trait have 10 feet more range"]]);
});

test("an item's time in other words: \"The duration is\", \"with a duration of\", rolled", () => {
    assert.deepEqual(itemDuration("Benefit … The duration is 1 hour. Drawback …"), { mode: "fixed", value: 1, unit: "hours", expiry: "turn-start", anchor: "effect-start" });
    assert.equal(itemDuration("You gain blood sight as a precise sense with a duration of 1 hour.").value, 1);
    assert.deepEqual(itemDuration("you are frozen in time for 2d4 rounds."), { mode: "fixed", value: 5, valueRoll: "2d4", unit: "rounds", expiry: "turn-start", anchor: "effect-start" });
    assert.equal(itemDuration("It does nothing for long."), null);
    assert.equal(itemDuration("The next time you would die from damage within 8 hours after you drink the ambrosia, … immune to the ambrosia for 24 hours.").value, 8);
});

test("a valued condition read with no value isn't applied: a note for the GM on that degree", async () => {
    const { guardValues } = await import("../src/compiler/guards.js");
    // (As the ability compiler once read Gearbinder Oil's "increases its slowed condition".)
    const oil = guardValues({ resolution: { kind: "save", outcomes: { failure: { effects: [{ kind: "condition", slug: "slowed", value: 1 }] }, criticalFailure: { effects: [{ kind: "condition", slug: "slowed", value: null }] } } } });
    assert.equal(oil.partial, true);
    assert.deepEqual(oil.resolution.outcomes.failure.effects, [{ kind: "condition", slug: "slowed", value: 1 }]);
    assert.deepEqual(oil.resolution.outcomes.criticalFailure.effects, []);
    assert.match(oil.resolution.outcomes.criticalFailure.noteEffects.at(-1).text, /Slowed: the item doesn't say how much/);
    // Stunned for a time has no value by right; a plan with none is the same plan.
    const timed = { resolution: { kind: "save", outcomes: { failure: { effects: [{ kind: "condition", slug: "stunned", value: null, duration: { mode: "fixed", value: 1, unit: "rounds" } }] } } } };
    assert.equal(guardValues(timed), timed);
});

test("inline damage as words, with its types: a note says what PF2e's text says", async () => {
    const { plainText } = await import("../src/compiler/rows.js");
    assert.equal(plainText("takes @Damage[1d6[persistent,bleed]] damage"), "takes 1d6 persistent bleed damage");
    assert.equal(plainText("@Damage[(3[splash])[cold]] damage"), "3 cold splash damage");
    assert.equal(plainText("@Damage[(2[splash])[slashing]]{2 slashing splash damage}"), "2 slashing splash damage");
    assert.equal(plainText("you regain @Damage[3d10[healing,vitality]|shortLabel] Hit Points"), "you regain 3d10 Hit Points");
});

test("healing that comes later isn't given on drinking (\"The next time you would die …, you regain 20 Hit Points\")", () => {
    const plan = compileItem(item("Ambrosia of Undying Hope"));
    assert.equal(plan.noteOnly, true);
    assert.equal(plan.resolution.outcomes.success.noteEffects[0].duration.value, 8);
});

test("healing for an ally the user picks, in its own words (\"Your ally regains 2d8 Hit Points\")", () => {
    const heart = { name: "Test Heart", type: "consumable", system: { slug: null, level: { value: 3 }, traits: { value: ["consumable", "magical"] }, category: "other", usage: { value: "held-in-one-hand" }, actions: {}, description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><p>You crush the heart toward an ally within 30 feet of you. Your ally regains 2d8 Hit Points.</p>" } } };
    const plan = compileItem(heart);
    assert.deepEqual([plan.targeting.target, plan.targeting.range, plan.automation.level], ["1 ally", "30 feet", "automatic"]);
    assert.deepEqual(plan.resolution.outcomes.success.effects, [{ kind: "heal", formula: "2d8" }]);
});

test("no condition from a trigger, a later event, a failed check, stages or a time that isn't its own", () => {
    for (const name of ["Emergency Eye", "Breath of Freedom", "Frenzied Quintessence", "Enigma-Sight Potion", "Rebirth Potion", "Elder Seed", "Scholar's Drop"]) {
        const plan = compileItem(item(name));
        const conditions = plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes.success.effects.filter((effect) => effect.kind === "condition") : [];
        assert.deepEqual(conditions, [], name);
    }
});

test("a talisman's Trigger says when it's used: what follows is read (Guardian Rose's enfeebled 1, its time its own)", () => {
    const rose = compileItem(item("Guardian Rose"));
    assert.deepEqual(rose.resolution.outcomes.success.effects.filter((effect) => effect.kind === "condition"), [{ kind: "condition", slug: "enfeebled", value: 1, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } }]);
});

test("bonuses scoped as PF2e can: against traits, checks to an action, a Speed", () => {
    const mods = (name) => compileItem(item(name))?.resolution?.outcomes?.success?.modifiers ?? [];
    assert.deepEqual(mods("Dragonfly Fulu").map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate]), [["athletics", 2, "status", [{ or: ["action:high-jump", "action:long-jump"] }]]]);
    // A choice of settings (Magnetic Suit's attract or repel): not read.
    assert.deepEqual(mods("Magnetic Suit"), []);
    // "saves against afflictions": a curse, a disease or a poison.
    assert.deepEqual(mods("Affliction Suppressant (Lesser)").map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["saving-throw", 1, [{ or: ["item:trait:curse", "item:trait:disease", "item:trait:poison"] }]]]);
    assert.deepEqual(mods("Oil of Skating").map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["land-speed", 10, "status"]]);
});

test("bonuses against what a creature makes, what an effect gives, or ranged attacks: PF2e's origin, inflicts and attack options", () => {
    const mods = (name) => compileItem(item(name))?.resolution?.outcomes?.success?.modifiers ?? [];
    // Night Sky Elixir's "against effects created by devils and divine spells cast by devils".
    const night = compileItem(item("Night Sky Elixir (Lesser)"));
    assert.deepEqual(night.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate, modifier.duration.value]), [["saving-throw", 1, "item", ["origin:trait:devil"], 10]]);
    assert.equal(night.partial, undefined, "nothing else to read");
    // Scholar's Drop's "against effects that could render you Fatigued".
    assert.deepEqual(mods("Scholar's Drop").map((modifier) => modifier.predicate), [["inflicts:fatigued"]]);
    // One Day's Breath's "While the effect lasts, you gain a +1 status bonus to saves against inhaled threats" (its time is the
    // effect's), the introduction's bonus without a number not a note; its Mythic Point is, and not needing to breathe.
    // (Its Mythic Point for 7 days, the ways card's second button: src/compiler/mythic-upgrade.js.)
    const breaths = compileItem(item("One Day's Breath"));
    const breath = breaths.ways[0].plan;
    assert.deepEqual(breath.resolution.outcomes.success.modifiers.map((modifier) => [modifier.value, modifier.predicate, modifier.duration.value, modifier.duration.unit]), [[1, ["item:trait:inhaled"], 24, "hours"]]);
    assert.deepEqual(breaths.ways[1].plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.duration.value, modifier.duration.unit]), [[7, "days"]]);
    assert.deepEqual(breath.unread, ["When you inhale the bottle's contents, the air fills your lungs so completely that you no longer need to breathe, at least for a time.", "If you spend 1 Mythic Point when you activate the day's breath, you inhale so deeply that you increase the effect's duration.", "You don't need to breathe for 24 hours.", "If you spend 1 Mythic Point, you don't need to breathe for 7 days."]);
    // Trusty Helmet's Hunker Down: "+1 circumstance bonus to your AC against ranged attacks".
    const [, hunker] = compileActivations(item("Trusty Helmet"));
    assert.deepEqual(hunker.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate]), [["ac", 1, "circumstance", ["item:ranged"]]]);
});

test("an item with a time and nothing else the module reads: a note of its text on the drinker, counted apart", () => {
    // (2026-10-27: Potion of Passing Fancy for Hovering Potion, whose climb Speed is read now — src/compiler/aloft.js.)
    const plan = compileItem(item("Potion of Passing Fancy"));
    assert.equal(plan.noteOnly, true);
    const [note] = plan.resolution.outcomes.success.noteEffects;
    assert.equal(note.label, undefined, "the ability module calls it \"Potion of Passing Fancy: note\"");
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "hours"]);
    assert.doesNotMatch(note.text, /^Activate/);
    const result = registry.resolveSync(plan, context(), io());
    assert.deepEqual(result.changes.map((change) => [change.op, change.target, change.effect?.kind]), [["effect", "drinker", "note"]]);
    // With no time, nothing (the GM's). (2026-10-27: Swamp Lily Quilt for Ration Tonic, whose nourishment is now its card's line —
    // src/compiler/needs.js no longer reads its "fruity scent" as a sense. Later that day Beckoning Cat Amulet for Swamp Lily Quilt, whose
    // mud is now the ability module's zone — src/compiler/area-readings.js.)
    assert.equal(compileItem(item("Beckoning Cat Amulet")), null);
});

test("a snare: the ability module's zone, a 5-foot square set off once by the first creature to enter it", () => {
    const spike = compileItem(item("Spike Snare"));
    assert.equal(spike.builtin, "zone");
    assert.deepEqual([spike.zone.area, spike.zone.centre, spike.zone.range, spike.zone.once], [{ type: "square", value: 5 }, "placed", 5, true]);
    const [save] = spike.zone.saves;
    assert.deepEqual(save.when, ["enter"]);
    assert.deepEqual(save.plan.resolution.check, { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: 17 } });
    assert.equal(save.plan.resolution.sharedDamage.components[0].formula, "2d8[piercing]");
    // Through the core, the creature entering takes the snare's damage on a failure.
    const result = registry.resolveSync(save.plan, { caster: { id: "setter" }, targets: [{ id: "victim" }], statistic: () => ({ modifier: 0 }) }, { roll: () => ({ degree: "failure" }), damage: () => 9 });
    assert.deepEqual(result.changes.map((change) => [change.op, change.target]), [["damage", "victim"]]);
});

// The census's count, as a ratchet: a later batch may only raise it.
test("consumables whose plan the core resolves with no gaps (ratchet)", () => {
    let resolves = 0;
    for (const doc of equipment.filter((entry) => entry.type === "consumable" && handlesItem(entry))) {
        let plan;
        try {
            plan = compileItem(doc);
        } catch {
            continue;
        }
        // (A snare is the ability module's zone now: its save plan is what the core resolves.)
        const resolved = plan?.builtin === "zone" && plan.zone?.once ? plan.zone.saves?.[0]?.plan : plan;
        if (!resolved?.resolution || plan.noteOnly || plan.partial || !registry.familyFor(resolved.resolution.kind)) continue;
        let clean = true;
        for (const degree of ["criticalFailure", "failure", "success", "criticalSuccess"]) {
            const result = registry.resolveSync(resolved, { ...context(), targets: [{ id: "target", side: "foes" }] }, { ...io(degree, 1), choose: (decision) => decision.default ?? decision.options?.[0]?.value });
            assert.deepEqual(validateChanges(result.changes), [], doc.name);
            if (result.gaps?.length) clean = false;
        }
        if (clean) resolves++;
    }
    assert.ok(resolves >= 732, `${resolves} resolve with no gaps`);
});

test("a third-party module's own Effect: linked in its short form, checked against the item's text rule by rule", async () => {
    const { verifyEffectRules } = await import("../src/compiler/verify-effect.js");
    const { effectLinks } = await import("../src/compiler/consumables.js");
    const html = "<p>After eating it, you gain a +2 item bonus to Athletics checks and 4 fire resistance for 1 minute. @UUID[Compendium.some-module.some-pack.ABCDEFGHIJKLMNOP]{Effect: Test Snack}</p>";
    assert.deepEqual(effectLinks({ system: { description: { value: html } } }).map((link) => [link.uuid, Boolean(link.verify)]), [["Compendium.some-module.some-pack.Item.ABCDEFGHIJKLMNOP", true]]);
    assert.equal(verifyEffectRules([{ key: "FlatModifier", selector: "athletics", value: 2, type: "item" }, { key: "Resistance", type: "fire", value: 4 }, { key: "RollOption", option: "x" }], html).ok, true);
    // A status bonus the text calls item, a value from a formula, a rule it can't read: not applied.
    assert.deepEqual(verifyEffectRules([{ key: "FlatModifier", selector: "athletics", value: 2, type: "status" }], html).failures.map((failure) => failure.why), ["+2 status not stated"]);
    assert.equal(verifyEffectRules([{ key: "Weakness", type: "fire", value: "@actor.level" }], html).ok, false);
    assert.equal(verifyEffectRules([{ key: "AdjustModifier", selector: "athletics" }], html).ok, false);
    assert.equal(verifyEffectRules([], html).ok, false, "nothing to apply");
    // Resistance to damage from some creatures by the rule's own predicate: PF2e tests it on the creature itself, so it never applies.
    const from = "<p>You gain resistance 5 to damage from fiends and undead for 1 hour.</p>";
    const all = (traits) => [{ key: "Resistance", type: "all", value: 5, predicate: [{ or: traits.map((trait) => `origin:trait:${trait}`) }] }];
    assert.match(verifyEffectRules(all(["fiend", "undead"]), from).failures[0].why, /never applies/);
    // A type its own ChoiceSet picks, every choice stated.
    const brewed = "<p>You gain resistance 3 to acid or cold (picked when it's brewed).</p>";
    const picked = (values) => [{ key: "ChoiceSet", flag: "testBrew", choices: values.map((value) => ({ value })) }, { key: "Resistance", type: "{item|flags.system.rulesSelections.testBrew}", value: 3 }];
    assert.equal(verifyEffectRules(picked(["acid", "cold"]), brewed).ok, true);
    assert.equal(verifyEffectRules(picked(["acid", "fire"]), brewed).ok, false);
    // (The Effects applied whatever the check says, the user's answer of 2026-10-19: by their Effect's id, kept in the item when compiled.)
    const { appliedAnyway } = await import("../src/compiler/verify-effect.js");
    const { withoutUnverifiedLinks } = await import("../src/compiler/unverified-links.js");
    assert.equal(appliedAnyway("Compendium.some-module.misc.Item.cjD7GRKEz6jAj8Cy"), true, "by its id");
    assert.equal(appliedAnyway("Compendium.some-module.misc.Item.yW1V8GYB29XXhV0K"), false, "one whose text is played instead");
    assert.equal(appliedAnyway("Compendium.some-module.some-pack.Item.ABCDEFGHIJKLMNOP"), false);
    const statusSnack = (id) => ({ system: { description: { value: `<p>You gain a +1 item bonus to Stealth checks for 1 hour. @UUID[Compendium.some-module.some-pack.Item.${id}]{Effect: Test Snack}</p>` } } });
    const effect = () => ({ name: "Effect: Test Snack", rules: [{ key: "FlatModifier", selector: "stealth", value: 1, type: "status" }] });
    assert.ok(withoutUnverifiedLinks(statusSnack("ABCDEFGHIJKLMNOP"), { moduleEffect: effect, conditionNames: {} }), "a mismatch dropped");
    assert.equal(withoutUnverifiedLinks(statusSnack("cjD7GRKEz6jAj8Cy"), { moduleEffect: effect, conditionNames: {} }), null, "one applied anyway kept");
});

test("a module's own Effect its text doesn't bear out, known when compiled: its text read instead, when that's more than a note", () => {
    const link = "@UUID[Compendium.some-module.some-pack.ABCDEFGHIJKLMNOP]{Effect: Test Pod}";
    const pod = (text, activate = `<span class="action-glyph">1</span> @UUID[Compendium.pf2e.actionspf2e.VMozDqMMuK5kpoX4]{Sneak}`) => ({ _id: "testPod000000001", type: "consumable", name: "Test Pod", system: { category: "other", traits: { value: ["consumable"] }, level: { value: 1 }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: `<p><strong>Activate</strong> ${activate}</p><hr /><p>${text}</p><p>${link}</p>` } } });
    const sneak = pod("A pod of grey dust. Squeeze it while you Sneak to gain a +4 item bonus to your Sneak checks; the dust stays behind you.");
    const rules = (type) => ({ moduleEffect: (uuid) => (uuid === "Compendium.some-module.some-pack.Item.ABCDEFGHIJKLMNOP" ? { name: "Effect: Test Pod", rules: [{ key: "FlatModifier", selector: "skill-check", value: 4, type }] } : null) });
    // Unknown (the sim, a module not loaded): the linked Effect, checked when it's applied.
    assert.equal(compileItem(sneak).resolution.applications[0].label, "Effect: Test Pod");
    // Its rules as stated: the Effect; a status bonus the text calls item: the action, with the text's bonus.
    assert.equal(compileItem(sneak, rules("item")).resolution.applications[0].label, "Effect: Test Pod");
    const instead = compileItem(sneak, rules("status"));
    assert.deepEqual([instead.builtin, instead.action.slug, instead.action.bonus], ["item-action", "sneak", { value: 4, type: "item" }]);
    assert.match(instead.notes.at(-1), /^Effect: Test Pod \(its module's\) isn't applied: .*\+4 status not stated/);
    // A text that reads to a note only, or an item made in one of several kinds: the Effect stays (live play's note).
    assert.equal(compileItem(pod("A lovely smell lingers around you.", "1 minute (manipulate)"), rules("status")).resolution.applications[0].label, "Effect: Test Pod");
    assert.equal(compileItem(pod("Squeeze it while you Sneak to gain a +4 item bonus to your Sneak checks, its dust the colour chosen when the pod is made."), rules("status")).resolution.applications[0].label, "Effect: Test Pod");
});

test("resistance to damage some creatures deal: PF2e's custom resistance, its definition the damage's types and the source's traits", async () => {
    const { resistanceEffectSource, resistanceText } = await import("../src/live/card.js");
    const food = (text) => compileItem({ _id: "testFood00000001", type: "consumable", name: "Test Tart", system: { category: "other", traits: { value: ["consumable"] }, level: { value: 5 }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: `<p><strong>Activate</strong> 10 minutes (manipulate)</p><hr /><p>${text}</p>` } } });
    // (In this module's words.)
    const tart = food("Once eaten, you gain resistance 4 to fire and cold damage dealt by fiends or undead creatures for 1 hour.");
    assert.deepEqual(tart.item.resist.map(({ type, value, from, damage }) => [type, value, from, damage]), [["custom", 4, ["fiend", "undead"], ["fire", "cold"]]]);
    assert.equal(resistanceText(tart.item.resist), "Resistance 4 to fire and cold damage from fiends or undead creatures for 1 hour");
    assert.deepEqual(resistanceEffectSource(tart.item.resist, { item: { name: "Test Tart" } }).system.rules, [{ key: "Resistance", type: "custom", definition: [{ or: ["damage:type:fire", "damage:type:cold"] }, { or: ["origin:trait:fiend", "origin:trait:undead"] }], label: "Fire and cold damage from fiends or undead creatures", value: 4 }]);
    // Beside a tradition's spells: that type too, and all damage from the creatures named.
    const stew = food("Once eaten, you gain 6 resistance to divine spells and to damage from celestials or monitors for 1 hour.");
    assert.deepEqual(stew.item.resist.map(({ type, from = null }) => [type, from]), [["divine", null], ["custom", ["celestial", "monitor"]]]);
});

test("once within a time, a bonus to one roll its user picks: the readied bonus, for the roll the card's Apply readies", () => {
    // (In this module's words.)
    const bun = compileItem({ _id: "testBun000000001", type: "consumable", name: "Test Bun", system: { category: "other", traits: { value: ["consumable"] }, level: { value: 3 }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: "<p><strong>Activate</strong> 10 minutes (manipulate)</p><hr /><p>Once within the next 10 minutes, you may gain a +2 circumstance bonus to a single saving throw or Perception check of your choice. You're then immune to buns for a day.</p>" } } });
    assert.deepEqual([bun.builtin, bun.bonus.modifiers.map((modifier) => [modifier.selector, modifier.type, modifier.value]), bun.bonus.spend], ["readied-bonus", [["saving-throw", "circumstance", 2], ["perception", "circumstance", 2]], ["saving-throw", "perception"]]);
    assert.match(bun.notes[0], /^Press Apply just before the roll you pick/);
    assert.match(bun.notes[1], /immune/);
});

test("temporary Hit Points an item grants you (Moss Cover's oil), for its stated time", () => {
    const salve = { _id: "testSalve0000001", type: "consumable", name: "Test Salve", system: { category: "oil", traits: { value: ["consumable", "oil"] }, level: { value: 1 }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><hr /><p>Rubbing the salve on yourself grants you 12 temporary Hit Points for 1 hour.</p>" } } };
    const [gain] = compileItem(salve).resolution.outcomes.success.effects;
    assert.deepEqual([gain.kind, gain.amount, gain.duration.value, gain.duration.unit], ["temp-hp", 12, 1, "hours"]);
});

test("action scopes in lower case, the last item's only; X-based checks; a sentence's tail the Strikes' extra damage, read (Martial Mayhem Mutagen)", () => {
    const plan = compileItem(item("Martial Mayhem Mutagen (Lesser)"));
    assert.deepEqual(plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate ?? null]), [
        ["skill-check", 1, [{ or: ["action:disarm", "action:grapple", "action:reposition", "action:shove", "action:trip"] }]],
        ["will", -2, null], ["int-based", -2, null], ["perception", -2, ["action:sense-motive"]]
    ]);
    assert.deepEqual(plan.item.strikeDamage.map((entry) => [entry.value, entry.category, entry.predicate]), [[1, "precision", ["item:melee", "target:condition:off-guard"]]]);
    assert.ok(!(plan.unread ?? []).some((sentence) => /1 additional precision damage to Off-Guard creatures/.test(sentence)), "the Strikes' extra damage read, not on the note");
});

test("of several linked Effects, the item's own (its name, or the wearer's); the others a note; not per degree, for allies, or unnamed", () => {
    const wine = compileItem(item("Iron Wine"));
    assert.deepEqual(wine.resolution.applications.map((entry) => entry.label), ["Effect: Iron Wine"]);
    // (Its Weakness Effect, for a second cup in a day: plan.dose, the card's to give — not a note.)
    assert.deepEqual([wine.dose, wine.notes, wine.partial], [{ uuid: "Compendium.pf2e.equipment-effects.Item.nQ1LawgHvC7NZmiN", label: "Iron Wine Weakness", key: "iron-wine" }, undefined, undefined]);
    assert.equal(compileItem(item("Rainbow Vinegar (Greater)")).dose.key, "rainbow-vinegar", "one key for every grade");
    const [belt] = compileActivations(item("Belt of the Five Kings"));
    assert.deepEqual(belt.plan.resolution.applications.map((entry) => entry.label), ["Effect: Belt of the Five Kings (Wearer)"]);
    // Per degree (Electromuscular Stimulator), an unnamed activation's (Weapon Siphon's bomb fitting): not read this way.
    assert.equal(compileItem(item("Electromuscular Stimulator"))?.resolution?.applications?.length ?? 0, 0);
    assert.equal(compileActivations(item("Weapon Siphon"))[0].plan?.resolution?.applications?.length ?? 0, 0);
});

test("an Effect behind the check its text opens with: only on a success, its Recall Knowledge the card's gate since 2026-10-26 (Diplomat's Badge); not a later save's (Antiplague)", () => {
    const badge = compileActivations(item("Diplomat's Badge"), { spellEffects }).find((entry) => entry.activation.name === "Diplomat's Bearing").plan;
    assert.deepEqual([badge.partial, badge.checkGate], [undefined, { action: "recall-knowledge", dc: 20 }]);
    assert.equal(compileItem(item("Antiplague (Major)")).notes?.some((note) => /^Only on a success/.test(note)) ?? false, false);
});

test("an activation's Trigger kept on the plan, and what it's read as, for the plan's other readers (the simulator)", async () => {
    const { triggerOn } = await import("../src/compiler/activation.js");
    const fang = compileItem({ ...item("Wolf Fang"), ownerAbilities: { str: 3 } });
    assert.deepEqual([fang.item.activations[0].trigger, fang.item.activations[0].triggerOn], ["You successfully Trip a foe", { event: "after-action", action: "trip", degrees: ["success", "criticalSuccess"], target: { foe: true } }]);
    // (Only the Activate's own lines: Prey Mutagen's Trigger is the Timely Dodge reaction's it grants.)
    assert.equal(readActivations(item("Prey Mutagen (Lesser)").system.description.value)[0].trigger, undefined);
    assert.equal(readActivations(item("Memory Ribbon").system.description.value)[0].trigger, "You attempt a skill check to Recall Knowledge but haven't rolled yet");
    assert.equal(readActivations(item("Healing Potion (Minor)").system.description.value)[0].trigger, undefined, "none without a Trigger");
    const cases = [
        ["You critically hit with a Strike", { event: "after-strike", degrees: ["criticalSuccess"] }],
        ["Your Strike with the affixed weapon damages a creature", { event: "after-strike", degrees: ["success", "criticalSuccess"], weapon: "affixed" }],
        ["You fail or critically fail a Will save", { event: "after-save", statistic: "will", degrees: ["failure", "criticalFailure"] }],
        ["You make an attack with the affixed weapon, but you haven't rolled yet", { event: "before-roll", what: "attack", weapon: "affixed" }],
        ["You would take physical damage", { event: "damaged", types: ["physical"], before: true }],
        ["You would be reduced to 0 Hit Points but not immediately killed", { event: "reduced-to-0" }],
        ["You lose the Dying condition", { event: "condition", slug: "dying", change: "lose" }],
        ["You Stride or Step", { event: "action", actions: ["stride", "step"] }],
        ["An enemy hits you with a melee Strike", { event: "attacked", target: { foe: true } }],
        ["You Strike with the affixed weapon", { event: "strike", weapon: "affixed" }],
        ["You roll for initiative", { event: "initiative" }],
        ["Something else happens", { event: "other" }],
        // (Its qualifiers: the creature's condition or trait, a foe, the affixed weapon.)
        ["You hit an Off-Guard creature with the affixed weapon", { event: "after-strike", degrees: ["success", "criticalSuccess"], target: { condition: "off-guard" }, weapon: "affixed" }],
        ["You deal damage using the affixed weapon to a creature that has the unholy trait", { event: "after-strike", degrees: ["success", "criticalSuccess"], target: { trait: "unholy" }, weapon: "affixed" }],
        ["You use the affixed shield to Shield Block a melee attack", { event: "action", actions: ["shield-block"], shield: "affixed" }]
    ];
    for (const [words, read] of cases) assert.deepEqual(triggerOn(words), read, words);
    // A permanent item's activation keeps it too.
    const [, breath] = compileActivations(item("Life's Last Breath"), { spellEffects });
    assert.deepEqual(breath.plan.item.activation.triggerOn, { event: "after-strike", degrees: ["success", "criticalSuccess"] });
});

test("a Speed granted when the item is activated: Dragonscale Cameo's fly Speed of 50 feet for 5 minutes", () => {
    const cameo = compileItem(item("Dragonscale Cameo"));
    assert.deepEqual(cameo.item.speeds, [{ type: "fly", value: 50, duration: { mode: "fixed", value: 5, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]);
    assert.equal(cameo.noteOnly, undefined);
});

test("Guardian Rose: \"you avoid being knocked out and regain 2d8+5 Hit Points\" — the healing and Enfeebled 1, the knockout avoided as the healing's end of Dying with no Wounded", () => {
    const rose = compileItem(item("Guardian Rose"));
    const row = rose.resolution.outcomes.success;
    assert.deepEqual(row.effects.map((effect) => effect.kind === "heal" ? `heal ${effect.formula}` : `${effect.slug} ${effect.value}`), ["heal 2d8+5", "enfeebled 1"]);
    assert.deepEqual([rose.partial, rose.item.keepWounded], [undefined, true]);
});

test("Lockpicker's Oil: its user's status bonus to Thievery checks to Pick a Lock for 1 minute, and the minute's first critical failure on them a failure; anyone else's a note", async () => {
    const { firstDegreeEffectSource, firstDegreeText } = await import("../src/live/card.js");
    const oil = compileItem(item("Lockpicker's Oil (Greater)"));
    const [bonus] = oil.resolution.outcomes.success.modifiers;
    assert.deepEqual([bonus.selector, bonus.value, bonus.type, bonus.predicate, bonus.duration.value, bonus.duration.unit], ["thievery", 2, "status", ["action:pick-a-lock"], 1, "minutes"]);
    assert.deepEqual(oil.item.firstDegree, { selector: "thievery", adjustment: { criticalFailure: "one-degree-better" }, predicate: ["action:pick-a-lock"], duration: bonus.duration });
    // (Anyone else's bonus at that lock: since 2026-10-27 a line of its card, counted done — an object's, the user's answer — src/compiler/decided.js.)
    assert.deepEqual([oil.unread, oil.notes, oil.partial, oil.decided], [undefined, ["Anyone else attempting to Pick that Lock within the minute gains the bonus too."], undefined, "card-line"]);
    assert.equal(firstDegreeText(oil.item.firstDegree), "The first critical failure on Thievery checks to Pick a Lock becomes a failure, within 1 minute");
    const effect = firstDegreeEffectSource(oil.item.firstDegree, { item: { name: "Lockpicker's Oil (Greater)" } });
    assert.deepEqual(effect.system.rules, [{ key: "AdjustDegreeOfSuccess", selector: "thievery", adjustment: { criticalFailure: "one-degree-better" }, predicate: ["action:pick-a-lock"], label: "Lockpicker's Oil (Greater)" }]);
    assert.deepEqual([effect.flags["pf2e-automatic-item-resolution"].firstDegree.selector, effect.system.duration.value, effect.system.duration.unit], ["thievery", 1, "minutes"]);
});

test("Lance of Sun's Radiance: a line's basic Reflex damage, Blinded on a critical failure; a dragon's other damage its own (plan.ifTarget)", () => {
    const lance = compileActivations(item("Lance of Sun's Radiance"), { spellEffects }).find((entry) => entry.activation.name === "Sun Cutting Scales").plan;
    assert.deepEqual([lance.resolution.kind, lance.resolution.check.statistic, lance.resolution.check.basic, lance.targeting.area], ["save", "reflex", true, { type: "line", value: 120 }]);
    assert.ok(lance.resolution.outcomes.criticalFailure.effects.some((effect) => effect.slug === "blinded"));
    // (2026-10-25: the dragons' card has their 6d12 spirit, src/live/if-target.js — no longer a note.)
    assert.deepEqual([lance.notes, lance.ifTarget], [undefined, [{ traits: ["dragon"], formula: "6d12[spirit]" }]]);
});

test("Octopus Potion: its arms' Grapple at the potion's own Athletics modifier, given in a later sentence (+12 for the lesser), PF2e's Grapple rows; the random target and the added-effect table notes", async () => {
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const potion = compileItem(item("Octopus Potion (Lesser)"), { basicActions });
    assert.deepEqual([potion.resolution.check.statistic, potion.resolution.check.modifier, potion.resolution.check.against.statistic, potion.ownCheck.modifier], ["athletics", 12, "fortitude", 12]);
    assert.ok(potion.resolution.outcomes.success.effects.some((effect) => effect.slug === "grabbed"));
    assert.equal(potion.partial, true);
});

test("Vaccine: +2 item bonus to saves against diseases for its time (a week read as 7 days, a year 365, permanent unlimited), the strain's immunity a note", () => {
    const times = ["Vaccine (Minor)", "Vaccine (Lesser)", "Vaccine (Moderate)", "Vaccine (Greater)", "Vaccine (Major)"].map((name) => {
        const vaccine = compileItem(item(name));
        const [bonus] = vaccine.resolution.outcomes.success.modifiers;
        assert.deepEqual([bonus.selector, bonus.value, bonus.type, bonus.predicate], ["saving-throw", 2, "item", ["item:trait:disease"]], name);
        // (Since 2026-10-27 the strain's immunity is a note Effect beside the bonus, done — src/compiler/vaccine.js,
        // test/afflictions-2026-10-27.test.js.)
        assert.equal(vaccine.partial, undefined);
        assert.match(vaccine.resolution.outcomes.success.noteEffects.at(-1).text, /^Immune to the one strain of disease it was made for/);
        return bonus.duration ? `${bonus.duration.value} ${bonus.duration.unit}` : null;
    });
    assert.deepEqual(times, ["1 hours", "24 hours", "7 days", "365 days", null]);
});

test("bonuses narrower than PF2e's rolls, on the whole roll for their time: Phantom Roll's Stealth, Infiltrator's Elixir's Deception DC, Armor Polishing Kit's Diplomacy to Make an Impression; the narrower words notes", () => {
    const summary = (name) => {
        const plan = compileItem(item(name));
        const [bonus] = plan.resolution.outcomes.success.modifiers;
        return [bonus.selector, bonus.value, bonus.type, bonus.predicate ?? null, `${bonus.duration.value} ${bonus.duration.unit}`, plan.partial, plan.unread[0]];
    };
    // (2026-10-27: Phantom Roll's bonus is now on its note Effect, PF2e's own action:avoid-notice or its toggle — src/compiler/visibility.js.)
    const roll = compileItem(item("Phantom Roll"));
    assert.deepEqual([roll.resolution.outcomes.success.modifiers, roll.resolution.outcomes.success.noteEffects[0].rules[1].predicate, roll.partial], [[], [{ or: ["action:avoid-notice", "phantom-roll-avoid-notice"] }], undefined]);
    // (2026-10-27: Infiltrator's Elixir's narrower words are now words on its note Effect for the 10 minutes, its disguise with them — the user's
    // note-Effect rule, src/compiler/rule-words.js; its bonus still on the whole Deception DC.)
    const elixir = compileItem(item("Infiltrator's Elixir"));
    const [disguise] = elixir.resolution.outcomes.success.modifiers;
    assert.deepEqual([disguise.selector, disguise.value, disguise.type, disguise.predicate ?? null, `${disguise.duration.value} ${disguise.duration.unit}`, elixir.partial, elixir.unread], ["deception-dc", 4, "status", null, "10 minutes", undefined, undefined]);
    assert.match(elixir.resolution.outcomes.success.noteEffects[0].text, /only against others seeing through that disguise, and its level counts toward that DC even if it's untrained/);
    assert.deepEqual(summary("Armor Polishing Kit"), ["diplomacy", 1, "circumstance", ["action:make-an-impression"], "24 hours", true, "The bonus is only on soldiers, guards, Gorumites, and other martially minded characters, for whoever wears the armor maintained by this kit."]);
});

test("a condition's penalty ignored for a while: Chilled Fire Noodles' Fatigued penalty to AC and saves for 1 hour, Ring of the Weary Traveler's for 10 minutes — PF2e's AdjustModifier suppressing the fatigued modifier", async () => {
    const { suppressEffectSource, suppressText } = await import("../src/live/card.js");
    const noodles = compileItem(item("Chilled Fire Noodles"));
    assert.deepEqual(noodles.item.suppress.map((entry) => [entry.slug, entry.selectors, entry.duration.value, entry.duration.unit]), [["fatigued", ["ac", "saving-throw"], 1, "hours"]]);
    assert.equal(noodles.noteOnly, undefined);
    assert.equal(suppressText(noodles.item.suppress[0]), "Ignores Fatigued's penalty to AC and saving throws for 1 hour (the condition stays)");
    assert.deepEqual(suppressEffectSource(noodles.item.suppress[0], { item: { name: "Chilled Fire Noodles" } }).system.rules, [{ key: "AdjustModifier", selectors: ["ac", "saving-throw"], slug: "fatigued", suppress: true }]);
    const [ring] = compileActivations(item("Ring of the Weary Traveler"));
    assert.deepEqual(ring.plan.item.suppress.map((entry) => [entry.slug, entry.duration.value, entry.duration.unit]), [["fatigued", 10, "minutes"]]);
});

// (Stand-ins in this module's own words for third-party alchemical items: their texts stay out of the repository.)
const standIn = (name, body, level = 4) => ({ name, type: "consumable", system: { category: "other", level: { value: level }, traits: { value: ["alchemical", "consumable"] }, description: { value: body } } });

test("third-party wordings: a balm's flat check for the creature touched during Assisted Recovery, a charging creature's Shove at its own +N down a line, a candy's bonus while chewed with its second use a note", async () => {
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const balm = compileItem(standIn("Stand-in Salve", "<p><strong>Activate</strong> Assisted Recovery (manipulate)</p><p>This salve stings. You can Activate the salve as part of your Assisted Recovery against cold or sonic damage. The creature touched attempts a @Check[flat|dc:5] to end the persistent damage, and on a failure it carries on.</p>"));
    assert.deepEqual([balm.item.recipient, balm.item.recovery], ["targets", { types: ["cold", "sonic"], dc: 5, who: "targets" }]);
    const beast = compileItem(standIn("Stand-in Beast Jar", "<p><strong>Activate</strong> Interact</p><p>A beast springs from the jar and runs down a @Template[type:line|distance:30]. It has to attempt to Shove any creature along its way with a [[/r 1d20+12]]{+12} Athletics modifier to its check, flinging them aside. Creatures whom it critically beats with its roll to Shove additionally take 1d8 bludgeoning damage.</p>"), { basicActions });
    assert.deepEqual([beast.ownCheck.kind, beast.ownCheck.modifier, beast.resolution.check.statistic, beast.targeting.area], ["maneuver", 12, "athletics", { type: "line", value: 30 }]);
    assert.deepEqual([beast.resolution.sharedDamage.components[0].formula, beast.resolution.outcomes.criticalSuccess.damage.sourceComponentIds, beast.resolution.outcomes.success.damage.mode], ["1d8", ["critical"], "none"]);
    const candy = compileItem(standIn("Stand-in Jerky", "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><p>While you're chewing this jerky, for up to 5 minutes, you have a +2 item bonus to your damage rolls with melee weapons.</p><p><strong>Secondary Effect</strong> Swallow it to feel full.</p>"));
    // (Its second use, one that reads nothing a card plays: since the user's answer to question 1 (2026-10-26) a use with no rules to play, its
    // own button on the ways card — src/compiler/secondary.js, src/compiler/decided.js.)
    const [use, second] = candy.ways.map((way) => way.plan);
    assert.deepEqual(use.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate, modifier.duration.value, modifier.duration.unit]), [["strike-damage", 2, "item", ["item:melee"], 5, "minutes"]]);
    assert.deepEqual([candy.builtin, Boolean(candy.partial), second.noRules], ["ways", false, true]);
});

test("third-party wordings: a released creature's Strikes along its Strides at different creatures, ammunition's gas on a hit, a grass that ends its user's Prone", async () => {
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    // (In this module's words.)
    const hound = compileItem(standIn("Stand-in Hound Flask", "<p><strong>Activate</strong> <span class=\"action-glyph\">2</span> Interact</p><hr /><p>A bony hound leaps out. It Strides up to 25 feet two times. Once per Stride, it may attempt a [[/r 1d20+9]]{+9} Strike with its jaws against a creature within reach, dealing @Damage[2d6+3[slashing]] damage, against a different creature each time. If any of its Strikes is a critical failure, it crumbles at once.</p>"), { basicActions });
    assert.deepEqual([hound.ownCheck, hound.targeting.target, hound.resolution.sharedDamage.components[0].formula, hound.resolution.sharedDamage.components[0].type], [{ kind: "attack", modifier: 9 }, "up to 2 enemies", "2d6+3", "slashing"]);
    assert.match(hound.notes[1], /critical failure/);
    // A bold heading with its space inside and a bold glyph: the activation still read.
    const smoke = { _id: "testSmokeAmmo001", type: "ammo", name: "Stand-in Smoke Shot", system: { level: { value: 5 }, traits: { value: ["alchemical", "consumable"] }, uses: { value: 1, max: 1, autoDestroy: true }, description: { value: "<p><strong>Ammunition</strong> any</p><p><strong>Activate </strong><span class=\"action-glyph\"><strong>1</strong></span> Interact</p><hr /><p>This ammunition releases a puff of smoke around the target. That creature takes @Damage[(2d4)[fire,persistent]] damage. As long as it keeps taking this fire damage, it is @UUID[Compendium.pf2e.conditionitems.TkIyaNPgTZFBCCuh]{Dazzled}, coughing.</p>" } } };
    const [shot] = compileActivations(smoke);
    assert.deepEqual([shot.plan.strike.ammo, shot.plan.strike.damage, shot.plan.resolution.outcomes.success.effects.map((effect) => effect.slug)], [true, [{ diceNumber: 2, dieSize: "d4", category: "persistent", damageType: "fire" }], ["dazzled"]]);
    assert.match(shot.plan.strike.notes[0], /^It stays Dazzled while it takes the persistent damage/);
    const grass = compileItem(standIn("Stand-in Moss", "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> @UUID[Compendium.pf2e.actionspf2e.Tj055UcNm6UEgtCg]{Crawl}</p><hr /><p>Moss grows under you as you Crawl. You Crawl an extra distance of 5 feet. Afterwards you can let the moss lift you up, ending the Prone condition.</p>"));
    assert.deepEqual(grass.item.reduce, [{ slug: "prone", by: "all" }]);
    assert.ok(grass.notes.some((note) => /extra distance of 5 feet/.test(note)), "the Crawl's distance a note");
});

test("a weapon's own activation shedding a trait and adding damage for a round (a third-party whip, in this module's words): PF2e's AdjustStrike and DamageDice on that weapon alone, by its id", async () => {
    const { weaponEffectSource, strikeDamageEffectSource, weaponText, strikeDamageText } = await import("../src/live/card.js");
    const whip = { name: "Stand-in Thorn Whip", type: "weapon", system: { level: { value: 5 }, traits: { value: ["magical"] }, description: { value: "<p><strong>Activate</strong> (manipulate)</p><p><strong>Frequency</strong> once per hour</p><p><strong>Effect</strong> For 1 round, sharp spines sprout along the lash—it drops the nonlethal trait and Strikes additionally deal @Damage[1d6[bleed]] damage.</p>" } } };
    const [entry] = compileActivations(whip);
    const { weapon, strikeDamage } = entry.plan.item;
    assert.deepEqual([weapon[0].property, weapon[0].value, weapon[0].mode, weapon[0].own, weapon[0].duration.value], ["weapon-traits", "nonlethal", "remove", true, 1]);
    assert.deepEqual([strikeDamage[0].diceNumber, strikeDamage[0].dieSize, strikeDamage[0].category, strikeDamage[0].damageType, strikeDamage[0].own], [1, "d6", "persistent", "bleed", true]);
    assert.equal(entry.plan.partial, undefined, "both sentences read");
    const item = { name: "Stand-in Thorn Whip", uuid: "Actor.hero.Item.whip0000000001" };
    assert.deepEqual(weaponEffectSource(weapon[0], { item }).system.rules, [{ key: "AdjustStrike", mode: "remove", property: "weapon-traits", value: "nonlethal", definition: ["item:id:whip0000000001"] }]);
    assert.equal(strikeDamageEffectSource(strikeDamage[0], { item }).system.rules[0].selector, "whip0000000001-damage");
    assert.deepEqual([weaponText(weapon[0]), strikeDamageText(strikeDamage[0])], ["The weapon loses nonlethal for 1 round", "+1d6 persistent bleed damage on the weapon's Strikes for 1 round"]);
});

test("a fulu affixed to a creature: its basic save against the fulu's damage, at the one creature touched; what a failure primes later a note on the target", () => {
    const fulu = compileItem(item("Thousand-Pains Fulu (Void)"));
    assert.deepEqual([fulu.resolution.kind, fulu.resolution.check.statistic, fulu.resolution.check.basic, fulu.resolution.check.against.value, fulu.resolution.sharedDamage.components[0].formula], ["save", "fortitude", true, 38, "12d10[void]"]);
    assert.deepEqual(fulu.targeting, { target: "1 creature", range: "touch", area: null });
    const [note] = fulu.resolution.outcomes.failure.noteEffects;
    assert.match(note.text, /^On a failure or critical failure, if the target takes any other damage within 1 minute/);
    assert.deepEqual([note.duration.value, note.duration.unit], [1, "minutes"]);
    assert.deepEqual(fulu.resolution.outcomes.criticalFailure.noteEffects, [note]);
    assert.equal(fulu.resolution.outcomes.success.noteEffects, undefined);
});

test("activations: a choice of jumps (Blast Boots), temporary Hit Points from the targeted creature's level (Bloodthirsty), a save at its owner's better DC with its at-0-HP line a note (Meloth's Lifedrinker), a swarm's damage at the triggering enemy (Wasp Guard)", async () => {
    const { levelTempText } = await import("../src/live/card.js");
    const boots = compileItem(item("Blast Boots (Moderate)"));
    assert.deepEqual([boots.builtin, boots.action.slugs], ["item-action", ["high-jump", "long-jump"]]);
    const [thirst] = compileActivations(item("Bloodthirsty"));
    assert.deepEqual(thirst.plan.item.levelTemp.map((entry) => [entry.multiplier, entry.duration.value, entry.duration.unit]), [[2, 1, "minutes"]]);
    assert.equal(levelTempText(thirst.plan.item.levelTemp[0]), "Temporary Hit Points equal to twice the level of the creature targeted, for 1 minute");
    // (Not the weapon's own reach by a rule: PF2e's reach-15 is an NPC attack's trait only, which AdjustStrike won't add to a character's weapon —
    // an Effect of its words for its time instead, no rules, 2026-10-27.)
    assert.deepEqual(compileActivations(item("Soulpiercer"))[0].plan?.item?.weapon?.map((entry) => [entry.property, entry.value]), [["reach", 15]]);
    const vision = compileActivations(item("Meloth's Lifedrinker (Level 7)"))[1].plan;
    assert.deepEqual([vision.resolution.check.statistic, vision.resolution.check.basic, vision.resolution.check.against], ["will", true, { dc: "owner", statistic: "class-spell" }]);
    assert.ok(vision.notes.some((note) => /^If the target is reduced to 0 HP by this effect/.test(note)), vision.notes.join(" / "));
    // (Its rows' Frightened, beside a "basic" save: on the success row once the ability compiler reads it there, else a note — never dropped,
    // src/compiler/honest.js.)
    const frightened = (vision.resolution.outcomes.success.effects ?? []).some((effect) => effect.slug === "frightened");
    assert.ok(frightened || (vision.notes.some((note) => /^Success The target takes half damage and is Frightened 1\.$/.test(note)) && vision.partial === true));
    const [holy] = compileActivations(item("Holy"));
    assert.deepEqual(holy.plan.item.levelTemp, [{ multiplier: 2, heal: true, duration: null }]);
    assert.equal(levelTempText(holy.plan.item.levelTemp[0]), "Hit Points regained equal to twice the level of the creature targeted");
    const [wasps] = compileActivations(item("Wasp Guard"));
    assert.deepEqual(wasps.plan.resolution.sharedDamage.components.map(({ formula, type, category }) => [formula, type, category]), [["1d8", "poison", "persistent"]]);
});

test("temporary Hit Points or healing from an amount its trigger gave, typed on the card: Bloodknuckles' bleed damage (at most 10), Reaper's Toll's and Vampiric Scythe's half the damage dealt, Azure Briolette's twice the spell's rank until its next turn, Assassin's Skin's healing", async () => {
    const { levelTempText } = await import("../src/live/card.js");
    const entry = (name, index = 0) => compileActivations(item(name))[index].plan.item.levelTemp[0];
    const knuckles = entry("Bloodknuckles");
    assert.deepEqual([knuckles.from, knuckles.of, knuckles.multiplier, knuckles.max, knuckles.duration.value, knuckles.duration.unit], ["amount", "the triggering bleed damage", 1, 10, 1, "minutes"]);
    assert.equal(levelTempText(knuckles), "Temporary Hit Points equal to the triggering bleed damage (typed on the card), at most 10, for 1 minute");
    // (2026-10-27: Reaper's Toll's half the damage dealt is its Strike's hit's now, strike.drain — test/triggers-2026-10-27.test.js —, not typed.)
    assert.deepEqual([compileActivations(item("Reaper's Toll"))[0].plan.item.levelTemp, compileActivations(item("Reaper's Toll"))[0].plan.strike.drain.fraction], [undefined, 0.5]);
    assert.deepEqual([entry("Vampiric Scythe", 1).multiplier, compileActivations(item("Vampiric Scythe"))[1].plan.notes ?? []], [0.5, []]);
    const briolette = entry("Aeon Stone (Azure Briolette)");
    assert.deepEqual([briolette.of, briolette.multiplier, briolette.duration.unit, briolette.duration.expiry], ["the spell's rank", 2, "rounds", "turn-start"]);
    const skin = entry("Assassin's Skin");
    assert.deepEqual([skin.heal, skin.of], [true, "the bleed damage"]);
    assert.equal(levelTempText(skin), "Hit Points regained equal to the bleed damage (typed on the card)");
    // (Blood-Drinker Blade (Greater)'s Exsanguinate's half the bleed the creature takes: not typed, src/compiler/drain.js, test/drain.test.js.)
    assert.deepEqual([compileActivations(item("Blood-Drinker Blade (Greater)"))[1].plan.item.levelTemp, compileActivations(item("Blood-Drinker Blade (Greater)"))[1].plan.drain.fraction], [undefined, 0.5]);
    // (Three and four times too: Reaper's Grasp's soul's level, Shadowpiercer's counteract rank.)
    assert.deepEqual([entry("Reaper's Grasp", 1).multiplier, entry("Reaper's Grasp", 1).of], [3, "the level of the creature whose soul you chose"]);
    assert.deepEqual([entry("Shadowpiercer").multiplier, entry("Shadowpiercer").of, entry("Shadowpiercer").duration.unit], [4, "the effect's counteract rank", "hours"]);
});

test("healing its text gives its user beside a linked Effect (Kindler Cameo, Wine of the Blood), its bearer's own void healing no bar (Emerald Fulcrum Lens); not under a condition (Platter of Putrid Dreams)", () => {
    const [cameo] = compileActivations(item("Kindler Cameo"));
    assert.deepEqual([cameo.plan.resolution.kind, cameo.plan.resolution.native.healing.components[0].formula, cameo.plan.resolution.native.healing.recipients], ["effect", "3d10+12", "living"]);
    assert.equal(compileItem(item("Wine of the Blood")).resolution.native.healing.components[0].formula, "2d10");
    assert.equal(compileActivations(item("Emerald Fulcrum Lens"))[0].plan.resolution.native.healing.recipients, "any");
    assert.equal(compileActivations(item("Platter of Putrid Dreams"))[0].plan.resolution.native?.healing, undefined);
});

test("Purloining Cloak's reaction: the attacker's Perception check against DC 38 (its check link's other parameters too), Off-Guard on a failure", () => {
    const [dodge] = compileActivations(item("Purloining Cloak"));
    assert.deepEqual([dodge.plan.resolution.check.statistic, dodge.plan.resolution.check.against.value], ["perception", 38]);
    assert.deepEqual(dodge.plan.resolution.outcomes.failure.effects.map((effect) => effect.slug), ["off-guard"]);
});

test("what a hit does that isn't a condition: its save's note on a failure (Blister Ammunition, with its critical hit's Dazzled), or the hit's own note with its time (Magekiller Bullet, Kortos Diamond); not a save before the attack, the user's own gain, nor over another reading", () => {
    const [blister] = compileActivations(item("Blister Ammunition (Lesser)"));
    const save = blister.plan.strike.save.resolution;
    assert.deepEqual([save.check.statistic, save.check.against.value], ["fortitude", 19]);
    const [note] = save.outcomes.failure.noteEffects;
    assert.match(note.text, /^Failed save: begin to itch uncontrollably for 3 rounds\./);
    assert.deepEqual([note.duration.value, note.duration.unit], [3, "rounds"]);
    assert.deepEqual(blister.plan.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), ["dazzled"]);
    // (The critical hit's DC now read: strike.criticalDC.)
    assert.deepEqual([blister.plan.strike.criticalDC, blister.plan.strike.notes.some((line) => /^On a critical hit, increase the Fortitude DC by 2/.test(line))], [21, false]);
    const [magekiller] = compileActivations(item("Magekiller Bullet"));
    const [curse] = magekiller.plan.resolution.outcomes.success.noteEffects;
    assert.deepEqual([curse.duration.value, curse.duration.unit, /Casts a Spell/.test(curse.text)], [7, "days", true]);
    assert.equal(compileActivations(item("Kortos Diamond"))[0].plan.resolution.outcomes.success.noteEffects[0].duration.value, 1);
    // A save before the attack (Reactive Flash), the user's own temporary Hit Points (Reaper's Toll), a save plan read already (Freeze Ammunition).
    assert.equal(compileItem(item("Reactive Flash"))?.strike?.fromNotes, undefined);
    assert.equal(compileActivations(item("Reaper's Toll"))[0].plan?.strike?.fromNotes, undefined);
    assert.equal(compileActivations(item("Freeze Ammunition"))[0].plan?.strike?.fromNotes, undefined);
});

test("extra Strike damage of dice set by the armor's save bonus (a Battlezoo hide's): 1 + its resilient rune, at most 4", () => {
    // (In this module's words.)
    const hide = (resilient) => compileActivations({ _id: "testHide00000001", type: "armor", name: "Stand-in Hide", system: { level: { value: 8 }, traits: { value: ["magical"] }, runes: { potency: 1, resilient, property: [] }, description: { value: "<p>A hide that hums.</p><p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><hr /><p><strong>Effect</strong> Your melee Strikes deal additional cold damage for 2 rounds. The amount of cold damage dealt is equal to 1d8 × the item's item bonus to saves against cold effects.</p>" } } })[0].plan.item.strikeDamage[0];
    assert.deepEqual([hide(0).diceNumber, hide(1).diceNumber, hide(3).diceNumber, hide(1).dieSize, hide(1).damageType, hide(1).predicate], [1, 2, 4, "d8", "cold", ["item:melee"]]);
});

test("damage of its user's choice of two types, each row giving both (Bloodburn Censer): a way for each type, each type's own rows with its condition until that persistent damage ends", async () => {
    const censer = compileActivations(item("Bloodburn Censer"))[0].plan;
    assert.deepEqual(censer.ways.map((way) => way.name), ["Fire", "Poison"]);
    const rows = (index) => censer.ways[index].plan.zone.saves[0].plan.resolution.outcomes;
    assert.deepEqual([rows(1).failure.damage.formulas.map((entry) => entry.formula), rows(1).failure.effects[0].duration], [["4d6[persistent,poison]"], { mode: "while", persistent: "poison" }]);
    assert.deepEqual(rows(0).success.damage.formulas.map((entry) => entry.formula), ["2d6[persistent,fire]"]);
});

test("live routes: a fulu affixed is used (not a trigger its primed damage names); the word aura in flavor isn't an aura activation, its trait is", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const route = (name) => routeOf(compileItem(item(name)), plainText(item(name).system.description.value));
    assert.deepEqual([route("Thousand-Pains Fulu (Void)"), route("Thousand-Pains Fulu (Burl)"), route("Moritype")], ["save", "save", "save"]);
    const [censer] = compileActivations(item("Bloodburn Censer"));
    assert.equal(routeOf(censer.plan, plainText(censer.activation.html)), "ways", "Light Incense's (aura, manipulate): the ways card of its zones, not a save card");
});

test("a consumable thrown as a Strike: Sack of Rotten Fruit's 1d4 bludgeoning, then its DC 15 Fortitude save at the creature hit; Life Salt's 1 persistent vitality and its Will save's note Effect; Oil's 1d6 fire with its flat check a note", async () => {
    const sack = compileItem(item("Sack of Rotten Fruit"));
    assert.deepEqual([sack.ownCheck.choose, sack.resolution.sharedDamage.components[0].formula, sack.thenSave.resolution.check.statistic, sack.thenSave.resolution.check.against.value, sack.thenSave.resolution.outcomes.failure.effects.map((effect) => `${effect.slug}${effect.value}`), sack.thenSave.targeting.target], [["thrown"], "1d4", "fortitude", 15, ["sickened1"], "the creature hit"]);
    const salt = compileItem(item("Life Salt"));
    assert.deepEqual([salt.resolution.sharedDamage.components[0], salt.thenSave.resolution.check.statistic, salt.thenSave.resolution.check.against.value], [{ id: "0", formula: "1", type: "vitality", category: "persistent" }, "will", 20]);
    // (Its note Effect ending once its user is hostile to any undead; only undead its targets, the card refusing others — 2026-10-26.)
    assert.match(salt.thenSave.resolution.outcomes.failure.noteEffects[0].text, /^Failed save: it's unable to attack its user as long as .*; it ends once its user uses a hostile action against any undead\.$/);
    assert.deepEqual([salt.onlyAgainst, salt.notes, salt.partial], [{ traits: ["undead"] }, undefined, undefined]);
    const oil = compileItem(item("Oil (1 pint)"));
    assert.deepEqual([oil.resolution.sharedDamage.components[0].formula, oil.resolution.sharedDamage.components[0].type], ["1d6", "fire"]);
    // (2026-10-26: its ignition the card's flat check as it's thrown, ownCheck.ignite — a failure, its hit deals none — and where it lands a card
    // line: whole.)
    assert.deepEqual([oil.ownCheck.ignite, Boolean(oil.partial), oil.notes], [10, false, ["If you hit, it splatters on the creature or in a single 5-foot square you target."]]);
    const { withoutHitDamage } = await import("../src/live/scaled.js");
    const unlit = withoutHitDamage(oil);
    assert.deepEqual([unlit.resolution.outcomes.success.damage.mode, unlit.resolution.outcomes.criticalSuccess.damage.mode, oil.resolution.outcomes.success.damage.mode], ["none", "none", "shared"]);
});

test("a creature whose numbers the item gives (the shape of a third-party bottled ooze and canister zombie, in this module's words): the conjured token with that AC and Hit Points, its size and time, the rest the GM's", async () => {
    const { statedCreaturePlan } = await import("../src/compiler/conjured.js");
    const bottle = { name: "Test Bottle", type: "consumable", system: { level: { value: 7 }, description: { value: "<p>Throw it and it expands into a large sized jelly and holds its position for 2 rounds. Those in its area must attempt a @Check[reflex|dc:23] save. Its save modifier equal to its item level applies. The ooze has AC 15; HP 58; Immunities acid; Resistances slashing 7; Weaknesses area 7</p>" } } };
    const ooze = statedCreaturePlan(bottle.system.description.value, { source: { name: "Test Bottle" } }, bottle);
    assert.deepEqual([ooze.builtin, ooze.creatures[0].name, ooze.creatures[0].size, ooze.creatures[0].stats.ac, ooze.creatures[0].stats.hp, ooze.creatures[0].stats.saves.will, ooze.lasts.value, ooze.lasts.unit], ["conjure", "Jelly", "large", 15, 58, 7, 2, "rounds"]);
    assert.ok(ooze.notes.some((note) => /DC 23 Reflex save or Grabbed/.test(note)));
    const jar = { name: "Test Jar", type: "consumable", system: { level: { value: 1 }, description: { value: "<p>Once smashed releases a zombie. Its numbers: AC 12; HP 20. It moves up to 15 feet, then rolls its attack roll of [[/r 1d20+6]]{plus six} and deals @Damage[1d6[bludgeoning]] damage. This one lasts for 2 rounds.</p>" } } };
    const zombie = statedCreaturePlan(jar.system.description.value, { source: { name: "Test Jar" } }, jar);
    assert.deepEqual([zombie.creatures[0].name, zombie.creatures[0].stats.ac, zombie.creatures[0].stats.hp, zombie.creatures[0].stats.speeds.land, zombie.lasts.value, zombie.lasts.unit], ["Zombie", 12, 20, 15, 2, "rounds"]);
    assert.ok(zombie.notes.some((note) => /\+6, 1d6 bludgeoning/.test(note)));
});

test("a beam's own ranged attack with fire and persistent fire on a hit, and a bestiary creature linked in a module's short form (both in this module's words)", async () => {
    const { ownCheckPlan } = await import("../src/compiler/own-checks.js");
    const beam = ownCheckPlan("Effect You aim at a creature within 30 feet. Attempt a ranged attack roll to deal 2d8 fire plus 2 persistent fire damage on hit. It cools afterwards.", { source: { name: "Test Lens" } });
    assert.deepEqual([beam.ownCheck.choose, beam.targeting.range, beam.resolution.sharedDamage.components.map((component) => [component.formula, component.type, component.category]), beam.resolution.outcomes.criticalSuccess.damage.sourceComponentIds], [["ranged"], "30 feet", [["2d8", "fire", null], ["2", "fire", "persistent"]], ["0", "1"]]);
    const { conjuredPlan } = await import("../src/compiler/conjured.js");
    const vial = { name: "Test Vial", type: "consumable", system: { description: { value: "<p>Throwing it lures a swarm, causing an @UUID[Compendium.pf2e.pathfinder-monster-core.drcSWbCIWc7P4lKO]{Army Ant Swarm} to appear there. It stays for 3 rounds.</p>" } } };
    const swarm = conjuredPlan(vial.system.description.value, { source: { name: "Test Vial" } }, vial);
    assert.deepEqual([swarm.creatures[0].from.uuid, swarm.creatures[0].initiative], ["Compendium.pf2e.pathfinder-monster-core.Actor.drcSWbCIWc7P4lKO", "roll"]);
});

test("a missive's benefit for its recipient: Heartening Missive (Bull)'s +1 item bonus to Fortitude saves for 24 hours on the creature targeted (Rabbit's Reflex, Turtle's Will)", () => {
    const bull = compileItem(item("Heartening Missive (Bull)"));
    assert.deepEqual([bull.item.recipient, bull.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration.value, modifier.duration.unit])], ["targets", [["fortitude", 1, "item", 24, "hours"]]]);
    assert.equal(compileItem(item("Heartening Missive (Rabbit)")).resolution.outcomes.success.modifiers[0].selector, "reflex");
    assert.equal(compileItem(item("Heartening Missive (Turtle)")).resolution.outcomes.success.modifiers[0].selector, "will");
});

test("a snare that attacks: Flying Blade Wheel Snare's +35 against the AC of the creature entering its square, 8d8 slashing on a hit (doubled on a critical hit), once", () => {
    const wheel = compileItem(item("Flying Blade Wheel Snare"));
    const [entry] = wheel.zone.saves;
    assert.deepEqual([wheel.builtin, wheel.zone.once, entry.when, entry.plan.resolution.check.modifier, entry.plan.resolution.check.against.statistic, entry.plan.resolution.sharedDamage.components[0].formula, entry.plan.resolution.outcomes.criticalSuccess.damage.multiplier], ["zone", true, ["enter"], 35, "ac", "8d8[slashing]", 2]);
});

test("an elixir made for one element (Warding Element Draught): the ways card's pick of the element, its drinker's +1 item bonus to AC and saves against effects with that trait for 10 minutes", () => {
    const draught = compileItem(item("Warding Element Draught"));
    assert.deepEqual([draught.builtin, draught.ways.map((way) => way.name)], ["ways", ["Air", "Earth", "Fire", "Metal", "Water", "Wood"]]);
    const fire = draught.ways[2].plan.resolution.outcomes.success.modifiers;
    assert.deepEqual(fire.map((modifier) => [modifier.selector, modifier.type, modifier.value, modifier.predicate, modifier.duration.value]), [["ac", "item", 1, ["item:trait:fire"], 10], ["saving-throw", "item", 1, ["item:trait:fire"], 10]]);
});

test("a drifting cloud of sticky bubbles (Clinging Bubbles): the zone placed for its minute, the Speed penalty on a creature entering it (Lesser's square and –5, Greater's 10-foot burst and –15)", () => {
    const moderate = compileItem(item("Clinging Bubbles (Moderate)"));
    const entry = moderate.zone.saves[0];
    assert.deepEqual([moderate.builtin, moderate.zone.area, moderate.zone.lasts.value, entry.when, entry.plan.resolution.outcomes.success.modifiers], ["zone", { type: "burst", value: 5 }, 1, ["enter"], [{ selector: "land-speed", type: "circumstance", value: -10 }]]);
    const lesser = compileItem(item("Clinging Bubbles (Lesser)")).zone;
    assert.deepEqual([lesser.area, lesser.saves[0].plan.resolution.outcomes.success.modifiers[0].value], [{ type: "square", value: 5 }, -5]);
    assert.equal(compileItem(item("Clinging Bubbles (Greater)")).zone.area.value, 10);
});

test("effects its user picks one of, each its own named paragraph (a third-party jar's burble): the ways card's Confusion (a Will save or Confused for 1d4 rounds) or Sonic Beam (a basic Will save's sonic damage), its creature's flight a note", async () => {
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    const jar = read(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-alchemists/packs/pf2e-items`).find((doc) => doc.collection === "items" && doc.name === "Jabberwock Jar");
    if (!jar) return;
    const plan = compileItem(jar);
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name)], ["ways", ["Confusion", "Sonic Beam"]]);
    const [confusion, beam] = plan.ways.map((way) => way.plan.resolution);
    assert.deepEqual([confusion.check.statistic, confusion.check.against.value, confusion.outcomes.failure.effects[0].slug, confusion.outcomes.failure.effects[0].duration.valueRoll], ["will", 40, "confused", "1d4"]);
    assert.deepEqual([beam.check.basic, beam.sharedDamage.components[0].formula], [true, "20d6[sonic]"]);
    assert.match(plan.notes[0], /Its area is there: target the creatures in it\.$/);
});

test("third-party bonuses read from their own packs (their words not kept here): a lodestone's saves and Fortitude DC against forced movement, a pearl's saves against curses, a steak's Intimidation and a lozenge's Performance, the narrower words notes", async () => {
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    const modules = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;
    const find = (module, pack, name) => { try { return read(`${modules}/${module}/packs/${pack}`).find((doc) => doc.collection === "items" && doc.name === name); } catch { return null; } };
    const mods = (doc) => {
        const plan = doc.type === "consumable" ? compileItem({ ...doc, ownerLevel: 5 }) : compileActivations({ ...doc, ownerLevel: 5 })[0].plan;
        return [plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, `${modifier.duration.value} ${modifier.duration.unit}`, JSON.stringify(modifier.predicate ?? null)]), [...(plan.notes ?? []), ...(plan.unread ?? [])].length];
    };
    const support = find("pf2e-team-plus-magic", "items", "Steady Support");
    if (support) assert.deepEqual(mods(support)[0], [["saving-throw", 2, "item", "1 rounds", JSON.stringify(["forced-movement"])], ["fortitude-dc", 2, "item", "1 rounds", JSON.stringify(["forced-movement"])]]);
    const pearl = find("pf2e-team-plus-tian-xia", "player-options", "Black Pearl of Mewru");
    if (pearl) assert.deepEqual(mods(pearl), [[["saving-throw", 2, "status", "1 minutes", JSON.stringify(["item:trait:curse"])]], 1]);
    const steak = find("pf2e-team-plus-alchemists", "pf2e-items", "Draconic Steak");
    if (steak) assert.deepEqual(mods(steak)[0], [["intimidation", 2, "circumstance", "24 hours", "null"]]);
    const voice = find("pf2e-team-plus-alchemists", "pf2e-items", "Honeyed Voice");
    if (voice) assert.deepEqual(mods(voice)[0], [["performance", 2, "item", "1 hours", "null"]]);
});

test("a bonus with three scopes (Hagbane Biscuit): the +1 status bonus to saves against hags read by PF2e's origin trait for 10 minutes, its Perception and Recall Knowledge parts and the cold iron by hand", () => {
    const plan = compileItem(item("Hagbane Biscuit"));
    assert.deepEqual(plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate, modifier.duration.value]), [["saving-throw", 1, "status", ["origin:trait:hag"], 10]]);
    assert.ok(plan.unread.some((line) => /\(by hand\)\.$/.test(line)) && plan.unread.some((line) => /cold iron/.test(line)));
});

test("a bonus to its user's AC against an attack already rolled (Animal-Turning Fulu): the reroll card's latest attack roll at its user, its degree again against that much higher an AC, its miss's Concealed a note", async () => {
    const { raisedResult, rerollText } = await import("../src/live/reroll-card.js");
    const plan = compileItem(item("Animal-Turning Fulu"));
    assert.deepEqual([plan.builtin, plan.reroll.who, plan.reroll.raise], ["reroll", "attacker", { ac: { value: 2, type: "item" } }]);
    assert.equal(rerollText(plan.reroll), "The latest attack roll at you: +2 item bonus to your AC against it, its degree again");
    assert.deepEqual(raisedResult({ oldTotal: 21, oldNatural: 12, dc: 20, oldDegree: 2, raise: plan.reroll.raise }), { degree: 1, total: 21, before: 2, dc: 22 });
    assert.match(plan.reroll.after, /^If this causes the Strike to miss, you become Concealed/);
});

test("rerolls behind a coin flip and dice set (Lucky Silver's reroll, Fortune's Coin's 12 on the die) and a save that automatically succeeds (Robe of the Archmagi, its user's or the ally targeted)", async () => {
    const { raisedResult, rerollText } = await import("../src/live/reroll-card.js");
    const [silver] = compileActivations(item("Lucky Silver"));
    assert.deepEqual([silver.plan.reroll.what, silver.plan.reroll.coin], ["roll", { win: "smiling face" }]);
    assert.equal(rerollText(silver.plan.reroll), "Flip the coin; on the smiling face: your latest roll, rerolled: the new result");
    const [coin] = compileActivations(item("Fortune's Coin"));
    assert.deepEqual([coin.plan.reroll.raise, coin.plan.reroll.coin], [{ die: 12 }, { win: "seraph side" }]);
    assert.deepEqual(raisedResult({ oldTotal: 9, oldNatural: 3, dc: 15, oldDegree: 1, raise: coin.plan.reroll.raise }), { degree: 2, total: 18, before: 1, die: 12 });
    assert.equal(compileActivations(item("Fortune's Coin (Platinum)"))[0].plan.reroll.raise.die, 14);
    const [robe] = compileActivations(item("Robe of the Archmagi (Greater)"));
    assert.deepEqual([robe.plan.reroll.who, robe.plan.reroll.raise.change], ["either", { failure: "success", criticalFailure: "success" }]);
});

test("its user's save against the attack that hit (The Demon's Lantern's Reflex save; a miss dazzles the attacker until the end of its user's next turn)", async () => {
    const { rerollText } = await import("../src/live/reroll-card.js");
    const { routeOf } = await import("../src/live/route.js");
    const [lantern] = compileActivations(item("The Demon's Lantern"));
    assert.equal(routeOf(lantern.plan), "reroll");
    assert.deepEqual([lantern.plan.reroll.who, lantern.plan.reroll.contest, lantern.plan.reroll.onMiss.slug, lantern.plan.reroll.onMiss.duration.expiry], ["attacker", { statistic: "reflex" }, "dazzled", "turn-end"]);
    assert.match(rerollText(lantern.plan.reroll), /^The latest attack roll at you: your Reflex save against its total; higher, it misses, and the attacker is dazzled till your next turn ends$/);
});

test("attack and save rolls played without the word reroll: Keep Stone Amulet's spell attack rolled twice (rerolled, the worse kept), Scapular of Shields' critical hit a hit, Extra Lung's new save, Phantom Fang's Concealed (a DC 5 flat check)", async () => {
    const { rerollText, triggeringRoll } = await import("../src/live/reroll-card.js");
    const reroll = (name) => compileActivations(item(name))[0].plan.reroll;
    assert.deepEqual(reroll("Keep Stone Amulet"), { what: "spellAttack", who: "attacker", keep: "lower" });
    assert.equal(rerollText(reroll("Keep Stone Amulet")), "The latest spell attack roll at you, rerolled: the lower result");
    // (A spell attack: PF2e's attack roll with "spell-attack-roll" among its domains, not a Strike's.)
    const messages = [{ id: "spell", type: "attack-roll", domains: ["spell-attack-roll"], targetActorUuid: "Actor.me" }, { id: "strike", type: "attack-roll", domains: ["strike-attack-roll"], targetActorUuid: "Actor.me" }];
    assert.equal(triggeringRoll(messages, reroll("Keep Stone Amulet"), { actorUuid: "Actor.me" }), "spell");
    assert.equal(triggeringRoll(messages, { what: "attack", who: "attacker" }, { actorUuid: "Actor.me" }), "strike");
    assert.deepEqual(reroll("Scapular of Shields").raise, { change: { criticalSuccess: "success" } });
    assert.equal(rerollText(reroll("Scapular of Shields")), "The latest attack roll at you: a critical success becomes a success");
    assert.deepEqual(reroll("Extra Lung"), { what: "save", who: "self", keep: "new" });
    assert.deepEqual(reroll("Phantom Fang").contest, { flat: 5 });
    // (Eye of Fortune: its user's own flat check against the target, rolled twice — DC 5 or 11 by the target's condition, live.)
    assert.deepEqual(reroll("Eye of Fortune"), { what: "attack", who: "self", keep: "higher", contest: { flat: "target", twice: true } });
    assert.match(rerollText(reroll("Eye of Fortune")), /^Your latest attack roll: the flat check for its target's Concealed \(DC 5\) or Hidden \(DC 11\), rolled twice/);
});

test("an item the spell module shares: its spellshapes and casts there left to it, the item's other activations read here (Dragon's Eye Charm's fire resistance; Ignition the spell module's)", async () => {
    const { spellModuleShare, playedBySpellModule } = await import("../src/compiler/index.js");
    const charm = item("Dragon's Eye Charm");
    const ignition = compileActivations(charm)[0].plan.spell?.uuid ?? "Compendium.pf2e.spells-srd.Item.6DfLZBl8wKIV03Iq";
    const shared = { claims: () => true, claimsWhy: () => ["item-casts"], spellModuleReads: () => ({ shapes: [], casts: [ignition] }) };
    const kept = compileActivations(charm, shared).filter((entry) => entry.plan).map((entry) => entry.index);
    assert.ok(!kept.includes(0) && kept.includes(2), `Ignition left, the resistance kept (${kept})`);
    // (Claimed for anything else, or without its readers: the whole item the spell module's.)
    assert.equal(spellModuleShare(charm, { claims: () => true, claimsWhy: () => ["energy-rune"], spellModuleReads: shared.spellModuleReads }), "all");
    assert.equal(spellModuleShare(charm, { claims: () => true }), "all");
    assert.deepEqual(compileActivations(charm, { claims: () => true }), []);
    assert.equal(spellModuleShare(charm, {}), null);
    // (A spellshape by its activation's name, an unnamed one by the item's.)
    const share = { labels: new Set(["Quickened Casting", "Shadow Signet"]), casts: new Set() };
    assert.equal(playedBySpellModule({ activation: { name: "Quickened Casting" }, plan: {} }, share, { name: "Scepter" }), true);
    assert.equal(playedBySpellModule({ activation: { name: "Hasten to Fight" }, plan: {} }, share, { name: "Scepter" }), false);
    assert.equal(playedBySpellModule({ activation: { name: null }, plan: {} }, share, { name: "Shadow Signet" }), true);
});

test("Mythic Point costs (the user's answer of 2026-10-19): a use whose effect spends one, each way of the Mythic runes' two buttons, a cast of a mythic spell; not a choice to spend one, nor another's", async () => {
    const { withSpend, readSpend } = await import("../src/compiler/spend.js");
    const { rerollText } = await import("../src/live/reroll-card.js");
    assert.deepEqual(compileActivations(item("Chromatic Robe"))[0].plan.spend, { mythicPoints: 1 });
    assert.equal(compileActivations(item("Aerekostes"))[1].plan?.spend, undefined, "the intelligent item's own Mythic Point");
    assert.equal(compileItem(item("Three Day's Breath"))?.spend, undefined, "a choice to spend one");
    assert.equal(readSpend("Effect If you spend 1 Mythic Point when you activate it, it lasts longer."), null);
    // (Mythic Resilient and Mythic Armor Potency: a button for a mythic source and one for any other, each spending the point.)
    const resilient = compileActivations(item("Mythic Resilient"))[0].plan;
    assert.deepEqual(resilient.ways.map((way) => [way.name, way.plan.reroll.raise.change, way.plan.spend]), [["Against a mythic effect", { criticalFailure: "failure" }, { mythicPoints: 1 }], ["Against any other effect", { criticalFailure: "success" }, { mythicPoints: 1 }]]);
    const armor = compileActivations(item("Mythic Armor Potency"))[0].plan;
    assert.deepEqual(armor.ways.map((way) => [way.plan.reroll.who, way.plan.reroll.raise.change]), [["attacker", { criticalSuccess: "success" }], ["attacker", { criticalSuccess: "failure" }]]);
    // (Mythic Striking's damage reroll and Mythic Weapon Potency's at mythic proficiency, the higher kept.)
    const striking = compileActivations(item("Mythic Striking"))[0].plan;
    assert.deepEqual([striking.reroll.what, striking.reroll.keep, striking.spend], ["damage", "higher", { mythicPoints: 1 }]);
    assert.equal(rerollText(striking.reroll), "Your latest damage roll, rerolled: the higher result");
    const potency = compileActivations(item("Mythic Weapon Potency"))[0].plan;
    assert.deepEqual(potency.reroll.bonus, { mythic: true, type: "proficiency" });
    assert.equal(rerollText(potency.reroll), "Your latest attack roll, rerolled at mythic proficiency (your level + 10): the higher result");
    // (A cast of a mythic spell: one for the spell; a choice of spells, the mythic ones' own.)
    const spells = { freedom: { uuid: "Compendium.pf2e.spells-srd.Item.freedom", name: "Freedom", mythic: true }, haste: { uuid: "Compendium.pf2e.spells-srd.Item.haste", name: "Haste", mythic: false } };
    assert.deepEqual(withSpend({ builtin: "cast-spell", spell: { uuid: spells.freedom.uuid, name: "Freedom" } }, "The item casts Freedom.", { spells }).spend, { mythicPoints: 1 });
    const choices = withSpend({ builtin: "cast-spell", spell: { uuid: spells.haste.uuid }, choices: [{ spell: spells.haste }, { spell: spells.freedom }] }, "", { spells });
    assert.deepEqual([choices.spend, choices.choices.map((choice) => choice.spend ?? null)], [undefined, [null, { mythicPoints: 1 }]]);
    // (Freedom's Flame's Holy Retribution: 15 spirit damage at the creature targeted, its holy weakness the GM's, for a Mythic Point.)
    const flame = compileActivations(item("Freedom's Flame"))[1].plan;
    assert.deepEqual([flame.resolution.sharedDamage.components[0].formula, flame.spend], ["15[spirit]", { mythicPoints: 1 }]);
});

test("a Mythic Point spent for more (the user's answer of 2026-10-19): the ways card's two buttons, the second upgraded where the text says how and costing one", async () => {
    const { withMythicUpgrade } = await import("../src/compiler/mythic-upgrade.js");
    // (Ten Day's Breath's own Effect for a year: its application's time.)
    const ten = compileItem(item("Ten Day's Breath"));
    assert.deepEqual([ten.builtin, ten.ways.map((way) => way.name), ten.ways[1].plan.spend], ["ways", ["As it is", "Spending a Mythic Point"], { mythicPoints: 1 }]);
    assert.deepEqual(ten.ways[1].plan.resolution.applications.map((application) => [application.duration?.value, application.duration?.unit]), [[365, "days"]]);
    assert.equal(ten.ways[0].plan.spend, undefined);
    // (Vortex Pouch's bigger effect: a note on the second button.)
    const [vortex] = compileActivations(item("Vortex Pouch"));
    assert.match(vortex.plan.ways[1].plan.notes[0], /^If you spend a Mythic Point when Catching Wind/);
    // (Not a note alone, nor a plan that costs one already.)
    assert.notEqual(withMythicUpgrade({ noteOnly: true, resolution: {} }, "If you spend 1 Mythic Point, it lasts longer.").builtin, "ways");
    assert.equal(withMythicUpgrade({ builtin: "reroll", spend: { mythicPoints: 1 } }, "If you spend 1 Mythic Point, more.").builtin, "reroll");
});

test("more mythic and healing items: Hollow Robes' persistent damage ended outright, Whispering Veil's Mythic Point gained (Preordained Spear keeps its doomed card), Mask of Mercy's healing rolled again, Skeletal Claw's temporary Hit Points for the undead", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { rerollText } = await import("../src/live/reroll-card.js");
    const { focusText } = await import("../src/live/focus-card.js");
    const hollow = compileActivations(item("Hollow Robes"))[1].plan;
    assert.deepEqual([hollow.item.recovery.ends, hollow.item.recovery.types.length > 10, hollow.spend], [true, true, { mythicPoints: 1 }]);
    assert.ok(!(hollow.notes ?? []).some((note) => /persistent damage you're currently taking ends/.test(note)), "its ending not a note too");
    // (One type ended outright beside the healing typed on the card: Assassin's Skin's bleed.)
    const skin = compileActivations(item("Assassin's Skin"))[0].plan;
    assert.deepEqual([skin.item.recovery, skin.item.levelTemp.map((entry) => [entry.from, entry.heal]), skin.partial, skin.unread], [{ types: ["bleed"], dc: null, ends: true }, [["amount", true]], undefined, undefined]);
    // (Not a clause's: Heedless Spurs' "… also ends when the persistent bleed damage ends", Horned Lion Amulet's "… until the persistent fire
    // damage ends".)
    assert.equal(compileActivations(item("Heedless Spurs"))[0].plan.item.recovery, undefined);
    assert.equal(compileItem(item("Horned Lion Amulet")).item.recovery, undefined);
    // (A consumable's opening "This …" sentence is flavor: Blood Sight Elixir's.)
    assert.ok(!(compileItem(item("Blood Sight Elixir (Lesser)")).notes ?? []).some((note) => /^This thick, blood-red elixir/.test(note)));
    const veil = compileActivations(item("Whispering Veil"))[0].plan;
    assert.deepEqual([routeOf(veil), veil.focus], ["focus", { amount: 1, only: null, lost: "turn-end", resource: "mythic" }]);
    assert.equal(focusText(veil.focus, "Hero Point"), "1 Hero Point; lost at the end of the turn if not spent");
    assert.notEqual(routeOf(compileActivations(item("Preordained Spear"))[0].plan), "focus");
    const mask = compileActivations(item("Mask of Mercy"))[0].plan;
    assert.equal(rerollText(mask.reroll), "Your latest healing roll, rolled again: the higher result");
    const claw = compileActivations(item("Skeletal Claw"))[0].plan;
    assert.deepEqual([routeOf(claw), claw.resolution.outcomes.success.effects[0].kind, claw.resolution.outcomes.success.effects[0].amount], ["save", "temp-hp", 10]);
});

test("narrow bonuses on PF2e's roll options, the narrower words a note (the user's answer 14 of 2026-10-17): Elixir of the Peaks, Oozepick, Conspirator's Cookie, Mender's Soup, Aroma Concealer, Potion of Disguise, Fungal Walk Musk, Healing Vapor for the creatures targeted", () => {
    const bonus = (name) => compileItem({ ...item(name), ownerLevel: 10 }).resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, `${modifier.duration.value} ${modifier.duration.unit}`, JSON.stringify(modifier.predicate ?? null)]);
    assert.deepEqual(bonus("Elixir of the Peaks (Moderate)"), [["athletics", 2, "item", "1 days", JSON.stringify([{ or: ["action:climb", "action:high-jump", "action:long-jump"] }])]]);
    assert.deepEqual(bonus("Oozepick"), [["thievery", 2, "item", "1 hours", JSON.stringify([{ or: ["action:pick-a-lock", "action:disable-a-device"] }])]]);
    assert.deepEqual(bonus("Conspirator's Cookie")[0].slice(0, 4), ["diplomacy", 1, "item", "1 hours"]);
    assert.deepEqual(bonus("Mender's Soup"), [["crafting", 1, "item", "24 hours", JSON.stringify(["action:repair"])]]);
    // (2026-10-27: Aroma Concealer's bonus against smell is now on its note Effect with its toggle — src/compiler/visibility.js.)
    assert.deepEqual(compileItem(item("Aroma Concealer")).resolution.outcomes.success.noteEffects[0].rules[1].value, 2);
    assert.deepEqual(bonus("Potion of Disguise (Lesser)"), [["deception-dc", 4, "status", "24 hours", "null"]]);
    assert.deepEqual(bonus("Fungal Walk Musk"), [["ac", 1, "item", "1 days", JSON.stringify(["origin:trait:fungus"])]]);
    // (2026-10-27: Healing Vapor's bonus is its burst's, the ability module's zone for the creatures inside — src/compiler/area-readings.js.)
    const vapor = compileItem({ ...item("Healing Vapor (Major)"), ownerLevel: 10 });
    assert.deepEqual([vapor.builtin, vapor.zone.modifiers[0].value, vapor.zone.modifiers[0].predicate], ["zone", 3, [{ or: ["item:trait:disease", "item:trait:poison"] }]]);
});

test("area buffs for the creatures targeted (Inspiring Spotlight's a zone) and other narrow bonuses: Inspiring Spotlight, Paradise Light, Undead Compendium (attacks against undead by the target's trait), Rhyton of the Radiant Ifrit, Mask of Shifting Monstrosity", () => {
    const plan = (name) => compileActivations({ ...item(name), ownerLevel: 10 })[0].plan;
    const mods = (name) => plan(name).resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, JSON.stringify(modifier.predicate ?? null)]);
    // (Inspiring Spotlight's burst: the ability module's zone, placed within 240 feet, its bonus for each creature inside.)
    const spot = plan("Inspiring Spotlight (Mounted)");
    assert.deepEqual([spot.builtin, spot.zone.area, spot.zone.centre, spot.zone.range, spot.zone.modifiers], ["zone", { type: "burst", value: 5 }, "placed", 240, [{ selector: "saving-throw", value: 2, type: "item" }, { selector: "cha-based", value: 2, type: "item" }]]);
    // (Paradise Light's meadow: the zone on its user, its bonus for each creature inside; its fast healing and the hostile-action save, notes.)
    const meadow = plan("Paradise Light");
    assert.deepEqual([meadow.builtin, meadow.zone.area, meadow.zone.centre, meadow.zone.modifiers], ["zone", { type: "emanation", value: 30 }, "self", [{ selector: "will", value: 1, type: "item" }, { selector: "wis-based", value: 1, type: "item" }]]);
    assert.match(meadow.zone.notes[0], /fast healing 2/);
    assert.deepEqual([plan("Undead Compendium").item.recipient, mods("Undead Compendium")], ["targets", [["attack-roll", 2, JSON.stringify(["target:trait:undead"])], ["saving-throw", 2, JSON.stringify(["origin:trait:undead"])]]]);
    assert.deepEqual(mods("Rhyton of the Radiant Ifrit").map(([selector]) => selector), ["deception", "diplomacy", "intimidation"]);
    const mask = plan("Mask of Shifting Monstrosity").resolution.outcomes.success.modifiers[0];
    assert.deepEqual([mask.selector, mask.value, mask.type, mask.duration.value, mask.duration.unit], ["deception-dc", 4, "item", 8, "hours"]);
});

test("an ally's persistent damage taken onto its user: Bloodstained Waistcoat's bleed, the take card at the ally targeted", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { takeText } = await import("../src/live/take-card.js");
    const [waistcoat] = compileActivations(item("Bloodstained Waistcoat"));
    assert.deepEqual([routeOf(waistcoat.plan), waistcoat.plan.take, waistcoat.plan.targeting.range], ["take", { slug: "persistent-damage", damageType: "bleed", range: 30 }, "30 feet"]);
    assert.equal(takeText(waistcoat.plan.take), "The targeted ally's persistent bleed damage, moved onto you as it is (within 30 feet)");
});

test("degrees changed on another creature's roll: Crimson Bluff's Strike one degree worse, Golden Greaves' failed Shove a critical failure (a check at its user), Tome of Dripping Shadows' target's critical failure a failure", async () => {
    const { rerollText, triggeringRoll } = await import("../src/live/reroll-card.js");
    const bluff = compileActivations(item("Crimson Bluff"))[1].plan.reroll;
    assert.deepEqual([bluff.who, bluff.raise.change], ["attacker", { criticalSuccess: "success", success: "failure", failure: "criticalFailure" }]);
    const greaves = compileActivations(item("Golden Greaves"))[0].plan.reroll;
    assert.deepEqual([greaves.what, greaves.who, greaves.raise.change], ["check", "attacker", { failure: "criticalFailure" }]);
    const messages = [{ id: "shove", type: "skill-check", targetActorUuid: "Actor.me" }, { id: "strike", type: "attack-roll", targetActorUuid: "Actor.me" }];
    assert.equal(triggeringRoll(messages, greaves, { actorUuid: "Actor.me" }), "shove");
    assert.equal(rerollText(greaves), "The latest check at you: a failure becomes a critical failure");
    const tome = compileActivations(item("Tome of Dripping Shadows"))[0].plan;
    assert.deepEqual([tome.builtin, tome.reroll.who, tome.reroll.raise.change, tome.targeting.target], ["reroll", "target", { criticalFailure: "failure" }, "the creature targeted"]);
    assert.match(tome.reroll.after, /^For the next minute, you become Concealed to all creatures/);
    assert.deepEqual(compileActivations(item("The Lost"))[0].plan.reroll.raise.change, { criticalFailure: "failure", failure: "success" });
});

test("rewords for the save and thrown cards: Spiral Labyrinth's blocked damage typed on the card (a basic DC 32 Reflex save), Spring-Loaded Net Launcher's Net at 60 feet, Azarim's Enfeebled 2 at its carrier (DC 23 Fortitude), Resolute Shield's twice its Hardness as resistance, Rusting Carapace, Last Hope and Briar's saves, Key to the Stomach's counteract", () => {
    const spiral = compileItem({ ...item("Spiral Labyrinth"), ownerLevel: 14 });
    assert.deepEqual([spiral.resolution.check.statistic, spiral.resolution.check.basic, spiral.resolution.check.against.value, spiral.scaled.of], ["reflex", true, 32, "the damage your shield blocked, its Hardness 10 higher for that Shield Block"]);
    const net = compileItem({ ...item("Spring-Loaded Net Launcher"), ownerLevel: 2 });
    assert.deepEqual([net.targeting.range, net.ownCheck.choose, net.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), net.resolution.outcomes.success.modifiers[0]], ["60 feet", ["thrown"], ["off-guard", "immobilized"], { selector: "all-speeds", value: -10, type: "circumstance", duration: null, escape: { dc: 16 } }]);
    // (Its Escape DC on all a hit gives, which a successful Escape ends: src/compiler/escape-ends.js, 2026-10-25.)
    assert.deepEqual([net.partial, net.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.duration)], [undefined, [{ mode: "until-escape", escape: { dc: 16 } }, { mode: "until-escape", escape: { dc: 16 } }]]);
    // (Ouroboros Flail's Chained Grasp, 2026-10-26: its grab until the end of the next turn also ends on an Escape at its link's DC 31, its
    // grabber's moving or attacking with the flail words on the grab — whole.)
    const grasp = compileActivations(item("Ouroboros Flail"))[0].plan;
    assert.deepEqual([grasp.resolution.outcomes.failure.effects[0].duration.escape, grasp.resolution.outcomes.criticalFailure.noteEffects[0].label, Boolean(grasp.partial), grasp.notes], [{ dc: 31 }, "Grabbed by the flail", false, undefined]);
    const [azarim] = compileActivations(item("Azarim"));
    assert.deepEqual([azarim.plan.resolution.check.statistic, azarim.plan.resolution.check.against.value, azarim.plan.resolution.outcomes.failure.effects[0].slug, azarim.plan.resolution.outcomes.failure.effects[0].value], ["fortitude", 23, "enfeebled", 2]);
    // (Resolute Shield's "up to twice the shield's Hardness": its Hardness 12 doubled, resistance to the triggering physical damage.)
    const [resolute] = compileActivations(item("Resolute Shield"));
    assert.deepEqual([resolute.plan.builtin, resolute.plan.bonus.resistance], ["readied-bonus", { type: "physical", value: 24 }]);
    // (And "You and the shield each take any remaining damage": the shield's share, scripts/shield-share.js — whole.)
    assert.deepEqual([resolute.plan.bonus.shieldShare, resolute.plan.partial], [true, undefined]);
    // (Rusting Carapace's rust at a creature, Last Hope's dice typed for the undead, Briar's Stunned save.)
    const [rust] = compileActivations(item("Rusting Carapace"));
    assert.deepEqual([rust.plan.resolution.sharedDamage.components[0].formula, rust.plan.resolution.check.basic, rust.plan.resolution.outcomes.failure.damage.formulas[0].formula], ["8d6[untyped]", true, "2d6[persistent,untyped]"]);
    const [hope] = compileActivations(item("Last Hope"));
    assert.deepEqual([hope.plan.scaled.die, hope.plan.resolution.sharedDamage.components[0].formula, hope.plan.resolution.check.against.value], ["d10", "1d10[vitality]", 37]);
    const briar = compileActivations(item("Briar"))[9];
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => briar.plan.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`)), [["stunned 1"], ["stunned 3"]]);
    // (Key to the Stomach's Cleanse Affliction "to remove a poison": the counteract card for one poison on its user, +15 at rank 5.)
    const [key] = compileActivations(item("Key to the Stomach"));
    assert.deepEqual([key.plan.builtin, key.plan.item.counteract.modifier, key.plan.item.counteract.rank, key.plan.item.counteract.afflictions], ["counteract", 15, 5, ["poison"]]);
});

test("a third-party blade's judgment after a critical hit (read from its own pack, its words not kept here): the target's own damage and Slowed on the targeted card, then a basic Reflex save card for that creature's allies within 20 feet, Slowed 1 on a critical failure", async () => {
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    const { routeOf } = await import("../src/live/route.js");
    let docs = [];
    try { docs = read(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-tian-xia/packs/player-options`).filter((doc) => doc.collection === "items"); } catch { return; }
    for (const [name, dice, dc] of [["Shei Long's Blade", "1d8", 19], ["Shei Long's Blade (True)", "4d8", 43]]) {
        const blade = docs.find((doc) => doc.name === name);
        if (!blade) continue;
        const plan = compileActivations({ ...blade, ownerLevel: 10 })[0].plan;
        const [around] = plan.around;
        assert.deepEqual([routeOf(plan), plan.resolution.outcomes.success.effects.map((effect) => effect.slug), around.radius, around.allies, around.includeTarget], ["save", ["slowed"], 20, true, false], name);
        assert.deepEqual([around.plan.resolution.check.statistic, around.plan.resolution.check.basic, around.plan.resolution.check.against.value, around.plan.resolution.sharedDamage.components[0].formula.startsWith(dice)], ["reflex", true, dc, true], name);
        assert.deepEqual(around.plan.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value]), [["slowed", 1]], name);
        assert.equal(JSON.stringify(plan.resolution.outcomes.success.manualInstructions ?? []).includes("allies"), false, "its sentences not a note too");
    }
});

test("what each melee attack roll sets off while Martial Mayhem Mutagen lasts: a hit makes the target off-guard to the next attack, a miss Clumsy 1 on its user, the Major's critical hit Clumsy 1 on the target — plan.item.attackRiders for the mutagen's time, no longer notes", async () => {
    const { attackRidersText } = await import("../src/compiler/attack-riders.js");
    const lesser = compileItem(item("Martial Mayhem Mutagen (Lesser)"));
    const { riders, duration } = lesser.item.attackRiders;
    assert.deepEqual([riders.map((rider) => [rider.on.join("/"), rider.offGuard ? "offGuard" : rider.target ? `target ${rider.target.slug}` : `self ${rider.self.slug} ${rider.self.value}`]), `${duration.value} ${duration.unit}`], [[["success/criticalSuccess", "offGuard"], ["failure/criticalFailure", "self clumsy 1"]], "1 minutes"]);
    assert.ok(!(lesser.unread ?? []).some((sentence) => /melee attack roll/.test(sentence)), "not notes too");
    // (Its opening paragraph, before its Benefit, is flavor: nothing left, not partial.)
    assert.deepEqual([lesser.unread, lesser.partial], [undefined, undefined]);
    assert.equal(attackRidersText(riders), "On a melee hit: the target off-guard to your next attack before your next turn; On a melee miss: you are clumsy 1, till your next turn ends");
    const major = compileItem(item("Martial Mayhem Mutagen (Major)")).item.attackRiders.riders;
    assert.deepEqual(major.filter((rider) => rider.target).map((rider) => [rider.on, rider.target.slug, rider.target.value]), [[["criticalSuccess"], "clumsy", 1]]);
});

test("a released creature's own attack with a condition on its critical hit (a third-party jar's pteranodon, read from its pack): that condition on the critical success row, for its round", async () => {
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    let docs = [];
    try { docs = read(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-alchemists/packs/pf2e-items`).filter((doc) => doc.collection === "items"); } catch { return; }
    const jar = docs.find((doc) => doc.name === "Preserved Pteranodon");
    if (!jar) return;
    const plan = compileItem({ ...jar, ownerLevel: jar.system.level.value });
    const [dazzled] = plan.resolution.outcomes.criticalSuccess.effects;
    assert.deepEqual([plan.ownCheck, dazzled.slug, dazzled.duration?.value, dazzled.duration?.unit, plan.resolution.outcomes.success.effects.length], [{ kind: "attack", modifier: 8 }, "dazzled", 1, "rounds", 0]);
});

test("a bonus for the creatures in the light its user sheds (Sprite Apple): plan.item.lightAura beside the light, an ability-module zone of that radius with its modifiers; a narrower second half, or a DC against one skill, with PF2e's predicate", async () => {
    const { lightAuraZone } = await import("../src/compiler/light-aura.js");
    const pink = compileItem(item("Sprite Apple (Pink)"));
    assert.deepEqual([pink.item.light[0].bright, pink.item.lightAura.radius, pink.item.lightAura.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type])], [20, 20, [["performance", 1, "item"]]]);
    const zone = lightAuraZone(pink.item.lightAura);
    assert.deepEqual([zone.area, zone.centre, zone.lasts.value, zone.lasts.unit, zone.modifiers[0].duration], [{ type: "emanation", value: 20 }, "self", 10, "minutes", null]);
    assert.deepEqual(compileItem(item("Sprite Apple (Teal)")).item.lightAura.modifiers.map((modifier) => [modifier.selector, modifier.predicate]), [["saving-throw", ["item:trait:fear"]]]);
    // (2026-10-26: its narrower half, Diplomacy at an animal or a plant; Golden's Will DC against Diplomacy, as PF2e's Stone Face; and its user's
    // "can't be Concealed" words on the light's Effect — each apple whole.)
    const chartreuse = compileItem(item("Sprite Apple (Chartreuse)"));
    assert.deepEqual(chartreuse.item.lightAura.modifiers.map((modifier) => [modifier.selector, modifier.predicate ?? null]), [["nature", null], ["diplomacy", [{ or: ["target:trait:animal", "target:trait:plant"] }]]]);
    const golden = compileItem(item("Sprite Apple (Golden)"));
    assert.deepEqual(golden.item.lightAura.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate]), [["will-dc", -1, "item", ["check:statistic:diplomacy"]]]);
    for (const apple of [pink, chartreuse, golden]) {
        assert.deepEqual([Boolean(apple.partial), apple.unread ?? []], [false, []]);
        assert.match(apple.item.light[0].note, /can't be concealed if it's visible, and invisible it's concealed rather than undetected/);
    }
});

test("a bonus to the next save against one trait's effects, whenever it comes (Psychic Warding Bracelet): the readied-bonus card over the monster builtin, kept until that save, its trait the predicate", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { readiedWords, fortuneEffectSource } = await import("../src/live/fortune-card.js");
    const bracelet = compileItem(item("Psychic Warding Bracelet"));
    assert.deepEqual([routeOf(bracelet), bracelet.bonus.modifiers, bracelet.bonus.spend, bracelet.bonus.lasting], ["fortune", [{ selector: "saving-throw", type: "item", value: 2, predicate: ["item:trait:mental"] }], ["saving-throw"], true]);
    assert.equal(readiedWords(bracelet), "+2 item bonus to saving throw against mental effects, for the next such roll, whenever it comes");
    const source = fortuneEffectSource({ state: { plan: bracelet, item: { name: "Psychic Warding Bracelet" }, user: {} }, moduleId: "pf2e-automatic-item-resolution" });
    assert.deepEqual([source.system.duration.unit, source.system.rules[0].predicate], ["unlimited", ["item:trait:mental"]]);
});

test("Savior Spike: a readied +1 item to the Grab an Edge its trigger names — any check, by PF2e's action:grab-an-edge (a Reflex save or Acrobatics) — and its success a critical success, its critical failure a failure; read degree sentences aren't notes too", async () => {
    const { readiedWords, readiedRules } = await import("../src/live/fortune-card.js");
    const spike = compileItem(item("Savior Spike"));
    assert.deepEqual([spike.builtin, spike.bonus.spend, spike.notes ?? [], spike.partial ?? null], ["readied-bonus", ["check"], [], null]);
    assert.deepEqual(readiedRules(spike).map((rule) => [rule.key, rule.selector, JSON.stringify(rule.predicate)]), [["FlatModifier", "check", JSON.stringify([{ or: ["action:grab-an-edge"] }])], ["AdjustDegreeOfSuccess", "check", JSON.stringify([{ or: ["action:grab-an-edge"] }])]]);
    assert.match(readiedWords(spike), /^\+1 item bonus to check \(grab an edge\)/);
    assert.deepEqual(compileItem(item("Matchmaker Fulu")).notes ?? [], [], "its read degree sentence not a note");
});

test("Admonishing Band's Warning Shot: PF2e's Demoralize with the item, its range and language words a note", () => {
    const plan = compileItem(item("Admonishing Band"));
    assert.deepEqual([plan.builtin, plan.action.slug, plan.action.targeted], ["item-action", "demoralize", true]);
    assert.match(plan.action.after, /^The foe can be as far as the firearm's maximum range, and the check takes no penalty for a foe that doesn't share a language with you\. If you already have the Warning Shot feat\b/);
});

test("Devil's Breath Incense isn't one save at the drinker: the ability module's zone placed beside its user for its 10 minutes of burning, its Fortitude save at a creature in it as it's lit, coming in or starting a turn there, the hour's immunity held to; its other use (inhaling it) a note", () => {
    const incense = compileItem(item("Devil's Breath Incense"));
    assert.deepEqual([incense.builtin, incense.zone.area, incense.zone.centre, incense.zone.lasts.value, incense.zone.lasts.unit], ["zone", { type: "burst", value: 10 }, "placed", 10, "minutes"]);
    const [save] = incense.zone.saves;
    assert.deepEqual([save.when, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value, save.plan.trigger.immunity.slug, save.plan.trigger.immunity.duration, save.plan.trigger.immunity.degrees.length], [["initial", "enter", "start"], "fortitude", 23, "devils-breath-incense", { value: 1, unit: "hours" }, 4]);
    assert.ok(incense.zone.notes.some((note) => /lean over the stick/.test(note)) && !incense.zone.notes.some((note) => /temporarily immune/.test(note)), incense.zone.notes.join(" / "));
    // (A lit candle's zone with no time of its own: its burning time, Thawing Candle's 10 minutes.)
    assert.deepEqual(compileItem(item("Thawing Candle")).zone.lasts, { mode: "fixed", value: 10, unit: "minutes", expiry: "turn-start", anchor: "effect-start" });
});

test("a lit candle's or incense's area while it burns (src/compiler/lit-area.js, the ability module's zone): its penalties inside with PF2e's predicates, fast healing for undead inside, a save its maker attempts too", () => {
    const passions = compileItem(item("Candle of Inflamed Passions"));
    assert.deepEqual([passions.builtin, passions.zone.area, passions.zone.centre, passions.zone.lasts.value, passions.zone.modifiers], ["zone", { type: "emanation", value: 10 }, "self", 10, [{ selector: "saving-throw", value: -1, type: "status", predicate: ["item:trait:emotion"] }]]);
    const death = compileItem(item("Incense of Distilled Death"));
    assert.deepEqual([death.zone.centre, death.zone.lasts.value, death.zone.lasts.unit, death.zone.inside, death.zone.notes], ["placed", 1, "minutes", [{ rules: [{ key: "FastHealing", value: 4 }], only: { traits: ["undead"] } }], []]);
    const truth = compileItem(item("Candle of Truth"));
    const [save] = truth.zone.saves;
    assert.deepEqual([truth.zone.modifiers[0].predicate, save.when, save.own, save.plan.resolution.check.statistic, save.plan.resolution.check.against.value], [["action:lie"], ["initial", "enter"], true, "will", 26]);
    // (2026-10-27: its first entry only is the save's immunity for the candle's 10 minutes, the lies a note Effect — src/compiler/zone-readings.js.)
    assert.match(save.plan.resolution.outcomes.failure.noteEffects[0].text, /unable to tell any deliberate lies/i);
    assert.deepEqual([truth.zone.notes.length, save.plan.trigger.immunity.duration.value], [0, 10]);
});

test("resolved only when the card does all of it (src/compiler/honest.js): a GM line left to the GM makes the plan partial; a behaviour rule with its own time becomes a note Effect for that time; a line that does nothing doesn't count", async () => {
    const { leftToTheGM } = await import("../src/compiler/honest.js");
    // (Floppy Rag Doll's success: "can't use reactions until the end your turn" — a note Effect until the end of its user's turn, the plan resolved.)
    const [doll] = compileActivations(item("Floppy Rag Doll"));
    assert.deepEqual([doll.plan.partial, doll.plan.resolution.outcomes.success.manualInstructions, doll.plan.resolution.outcomes.success.noteEffects?.[0]?.duration], [undefined, undefined, { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }]);
    // (Timeflaying Blade's creature hurled into the future: the GM's, partial.)
    assert.equal(compileActivations(item("Timeflaying Blade"))[0].plan.partial, true);
    assert.deepEqual(leftToTheGM({ manualInstructions: ["{target} (critical success): The creature is unaffected."] }), []);
    assert.deepEqual(leftToTheGM({ effects: [{ kind: "condition", slug: "clumsy", value: 1 }], manualInstructions: ["{target} (failure, the rest by hand): The target is Clumsy 1 and can't use reactions until the beginning of your next turn."] }), []);
});

test("a rule sentence the plan has no trace of (src/compiler/honest.js withUntracedRules): Stampede Medallion's \"On a critical failure, the foe is also knocked Prone\" a note, the plan partial; not a sentence of flavor, nor one whose numbers are in the plan, nor one of PF2e's own linked Effect", async () => {
    const { withUntracedRules } = await import("../src/compiler/honest.js");
    const [tide] = compileActivations(item("Stampede Medallion"));
    // (Its Prone on the critical failure row once the ability compiler reads it there; else a note, the plan partial — never dropped.)
    const prone = (tide.plan.resolution.outcomes.criticalFailure.effects ?? []).some((effect) => effect.slug === "prone");
    assert.ok(prone || (tide.plan.partial === true && (tide.plan.notes ?? []).includes("On a critical failure, the foe is also knocked Prone.")));
    const plan = { resolution: { kind: "save", outcomes: { failure: { damage: { mode: "shared", multiplier: 1 }, effects: [{ kind: "condition", slug: "frightened", value: 2 }] } }, sharedDamage: { components: [{ formula: "2d6[fire]" }] } } };
    assert.equal(withUntracedRules(plan, "Effect The target takes 2d6 fire damage and is Frightened 2. Malevolent energy leaks out, barely restrained."), plan);
    assert.equal(withUntracedRules({ ...plan, resolution: { ...plan.resolution, kind: "effect", applications: [{ kind: "native-spell-effect", uuid: "Compendium.pf2e.equipment-effects.Item.x" }] } }, "Effect You become Slowed 1.").partial, undefined);
});

test("a condition for a time and a save again at its turns are each traced on their own (honest.js): Spirit-Sealing Fulu (Greater)'s critical failure for 4 rounds its row's time; a new save each turn with no saveEnds in the plan a note; Tusk and Fang Chain's next action a note Effect, its critical failure's lost flat check another", async () => {
    const { withUntracedRules } = await import("../src/compiler/honest.js");
    const fulu = compileItem(item("Spirit-Sealing Fulu (Greater)"));
    assert.deepEqual([fulu.resolution.outcomes.failure.effects[0].duration.value, fulu.resolution.outcomes.criticalFailure.effects[0].duration.value], [1, 4]);
    assert.ok(!(fulu.notes ?? []).some((note) => /\bparalyzed for 4 rounds\b/.test(note)));
    const chain = compileItem(item("Tusk and Fang Chain"));
    assert.deepEqual([chain.resolution.outcomes.success.effects, chain.resolution.outcomes.success.noteEffects[0].label, chain.resolution.outcomes.success.noteEffects[0].duration.anchor], [[], "Confused on its next action", "target-turn"]);
    assert.deepEqual(chain.resolution.outcomes.criticalFailure.noteEffects.map((note) => note.label), ["No flat check"]);
    // (Both a condition's time in the plan and the sentence on a note: traced.)
    const plan = { resolution: { kind: "save", outcomes: { failure: { effects: [{ kind: "condition", slug: "slowed", value: 1, duration: { mode: "fixed", value: 1, unit: "minutes" } }] } } } };
    assert.equal(withUntracedRules(plan, "Effect The target must attempt a save or be slowed 1 for 10 rounds."), plan);
    assert.equal(withUntracedRules(plan, "Effect The target must attempt a save or be slowed 1 for 2 minutes.").partial, true);
    const noted = { ...plan, notes: ["It can attempt a new Will save at the end of each of its turns."] };
    assert.equal(withUntracedRules(noted, "Effect It can attempt a new Will save at the end of each of its turns."), noted);
    const again = "Effect The target must attempt a save or be slowed 1 for 1 minute. At the end of any round during which it took an action, it must attempt a new save.";
    assert.equal(withUntracedRules(plan, again).partial, true);
    const played = { resolution: { kind: "save", outcomes: { failure: { effects: [{ kind: "condition", slug: "slowed", value: 1, duration: { mode: "fixed", value: 1, unit: "minutes", saveEnds: { save: "will", dc: null } } }] } } } };
    assert.equal(withUntracedRules(played, again), played);
    // (A typed bonus and a Speed of a kind: traced only by that modifier or Speed — Golden Liberator's Feather's fly Speed and AC bonus, which its
    // save plan doesn't hold; not a wayfinder's resonant power.)
    const bonus = "Effect Its wearer gains a +3 status bonus to Stealth checks while it glows.";
    assert.equal(withUntracedRules(plan, bonus).partial, true);
    const boosted = { resolution: { kind: "check", outcomes: { success: { effects: [], modifiers: [{ selector: "stealth", value: 3, type: "status" }] } } } };
    assert.equal(withUntracedRules(boosted, bonus), boosted);
    assert.equal(withUntracedRules(boosted, "Effect The resonant power grants you a +1 circumstance bonus to initiative rolls."), boosted);
    // (Golden Liberator's Feather itself is a ways card now, its wings and buffet each read — 2026-10-26, src/compiler/action-ways.js.)
    assert.equal(compileItem(item("Golden Liberator's Feather")).builtin, "ways");
    // (A resistance of a number and kind, and temporary Hit Points of a number the plan doesn't hold: a stand-in's 5 — Death Tusk Helm's are its
    // user's now, plan.userEffects, 2026-10-26.)
    assert.equal(withUntracedRules(boosted, "Effect You gain 5 temporary Hit Points for 1 minute.").partial, true);
    assert.deepEqual(compileActivations(item("Death Tusk Helm"))[0].plan.userEffects.map((entry) => entry.amount), [5]);
    const resisted = { resolution: { kind: "check", outcomes: { success: { effects: [], modifiers: [{ selector: "ac", type: "status", value: 1 }], resist: [{ type: "fire", value: 3 }] } } } };
    assert.equal(withUntracedRules(resisted, "Effect You gain resistance 7 to sonic for a while.").partial, true);
});

test("a new save at its turns (src/compiler/save-ends.js, the ability's duration.saveEnds and note.saveEnds): Tusk and Fang Chain's ends its critical failure's confusion, Spirit-Sealing Fulu (Greater)'s takes a round off, Golden Silencer (Greater)'s note Effect, Gearbinder Oil's escalating slowed for 6 rounds behind a GM gate, Dreaming Round's from its failing rows with its fatigued; Jawbreaker Shield's broken jaw a note Effect a save ends", async () => {
    const saveEnds = (row, slug) => row.effects.find((effect) => effect.slug === slug)?.duration?.saveEnds;
    const chain = compileItem(item("Tusk and Fang Chain"));
    assert.deepEqual([saveEnds(chain.resolution.outcomes.criticalFailure, "confused"), saveEnds(chain.resolution.outcomes.failure, "confused"), chain.partial], [{ save: "will", dc: null, mode: "end" }, undefined, undefined]);
    const fulu = compileItem(item("Spirit-Sealing Fulu (Greater)"));
    assert.deepEqual([saveEnds(fulu.resolution.outcomes.failure, "paralyzed"), saveEnds(fulu.resolution.outcomes.criticalFailure, "paralyzed")?.mode, fulu.partial, fulu.notes], [{ save: "will", dc: null, mode: "reduce" }, "reduce", undefined, undefined]);
    const silencer = compileItem(item("Golden Silencer (Greater)"));
    assert.deepEqual(silencer.strike.save.resolution.outcomes.failure.noteEffects[0].saveEnds, { save: "fortitude", dc: null, mode: "end" });
    const oil = compileItem(item("Gearbinder Oil (Lesser)"));
    const slowed = oil.resolution.outcomes.failure.effects[0];
    assert.deepEqual([slowed.stack, slowed.duration], [{ by: 1, max: 3 }, { mode: "unlimited", saveEnds: { save: "fortitude", dc: null, mode: "escalate", escalate: { criticalSuccess: "end", success: -1, failure: 1, criticalFailure: 2 }, max: 3, rounds: 6, gate: "it took an action with the attack, manipulate, or move trait this round" } }]);
    assert.deepEqual([oil.partial, oil.notes], [undefined, undefined]);
    assert.match(oil.resolution.outcomes.criticalFailure.manualInstructions[0], /the rest by hand\): While Slowed 2 or more by it, it also can't use reactions\.$/);
    const [round] = compileActivations(item("Dreaming Round"));
    const outcomes = round.plan.resolution.outcomes;
    assert.deepEqual([saveEnds(outcomes.failure, "slowed")?.escalate, saveEnds(outcomes.criticalFailure, "slowed")?.alsoEnds, saveEnds(outcomes.success, "slowed")], [{ criticalFailure: 1, failure: 1, success: -1, criticalSuccess: -1 }, ["fatigued"], undefined]);
    // (Its sleep at 0 actions, and waking: since 2026-10-27 a note Effect on its failing rows, done — src/compiler/sleep-notes.js.)
    assert.deepEqual([round.plan.partial, round.plan.notes, /\bUnconscious\b/.test(outcomes.failure.noteEffects[0].text)], [undefined, undefined, true]);
    // (A row's own save at its turns, with its DC, whatever the plan's check: Bewildering Spellgun's success.)
    const spellgun = compileItem(item("Bewildering Spellgun"));
    assert.deepEqual([saveEnds(spellgun.resolution.outcomes.success, "confused"), saveEnds(spellgun.resolution.outcomes.criticalSuccess, "confused"), spellgun.partial], [{ save: "will", dc: 25, mode: "end" }, undefined, undefined]);
    // (A Speed penalty for whoever fails its save, its early end for the GM: Crackling Bubble Gum's pop.)
    const pop = compileItem(item("Crackling Bubble Gum (Lesser)")).ways.find((way) => /secondary/i.test(way.name)).plan;
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => pop.resolution.outcomes[degree].modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, /3 Interact actions/.test(modifier.until)])), [[["all-speeds", -10, "item", true]], [["all-speeds", -10, "item", true]]]);
    const [jaw] = compileActivations(item("Jawbreaker Shield"));
    const broken = jaw.plan.strike.save.resolution.outcomes.criticalFailure;
    assert.deepEqual([broken.noteEffects[0].label, broken.noteEffects[0].saveEnds, broken.manualInstructions], ["Can't Strike with its mouth", { save: "fortitude", dc: null, mode: "end" }, ["{target} (critical failure): You break the target's jaw. As failure."]]);
});

test("rows read from plain words (guards.js), a snare's too: Fang Snare's 1 piercing and 2d8 poison damage, Thunder Snare's \"As success, and the target also takes 1 sonic damage\" with the success's deafened, on the creature's own turns; a time only for the conditions before it (Stunning Snare's and Pyronite's Stunned 1 untimed) unless it opens its sentence (Liar's Bangle); Eternal Eruption's coming back by itself a card line, not partial", () => {
    const save = (name) => compileItem(item(name)).zone.saves[0].plan.resolution.outcomes;
    const fang = save("Fang Snare");
    assert.deepEqual([fang.failure.damage.formulas, fang.criticalFailure.damage.formulas, fang.failure.manualInstructions], [[{ formula: "1[piercing]" }, { formula: "2d8[poison]" }], [{ formula: "2[piercing]" }, { formula: "4d8[poison]" }], undefined]);
    const thunder = save("Thunder Snare");
    assert.deepEqual([thunder.failure.damage.formulas, thunder.failure.effects.map((effect) => [effect.slug, effect.duration.anchor]), thunder.success.effects[0].duration.anchor], [[{ formula: "1[sonic]" }], [["deafened", "target-turn"]], "target-turn"]);
    // ("As success, but the penalty is -20 feet": the success's Speed penalty at that value, Hobbling Snare's critical failure.)
    const hobbling = save("Hobbling Snare");
    assert.deepEqual([hobbling.criticalFailure.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.escape?.dc]), hobbling.criticalFailure.manualInstructions], [[["land-speed", -20, 18]], undefined]);
    const stunning = save("Stunning Snare");
    assert.deepEqual(["success", "failure"].map((degree) => stunning[degree].effects.find((effect) => effect.slug === "stunned").duration), [null, null]);
    assert.equal(stunning.success.effects.find((effect) => effect.slug === "off-guard").duration.value, 1);
    assert.equal(compileItem(item("Pyronite")).resolution.outcomes.criticalFailure.effects.find((effect) => effect.slug === "stunned").duration, null);
    const [bangle] = compileActivations(item("Liar's Bangle"));
    assert.deepEqual(bangle.plan.resolution.outcomes.failure.effects[0].duration?.unit, "minutes");
    const [eruption] = compileActivations(item("Eternal Eruption"));
    assert.deepEqual([eruption.plan.partial, (eruption.plan.notes ?? []).some((note) => /\breforms itself\b/.test(note))], [undefined, true]);
});

test("its holder's resistance and a weakness for everyone else around it (src/compiler/weakened-around.js): Maelstromic Destabilizer's zone for a minute, its rules by who's inside (zone.inside[i].who, ability f25a67d)", () => {
    const zone = compileItem(item("Maelstromic Destabilizer (Moderate)")).zone;
    assert.deepEqual([zone.area, zone.centre, zone.lasts.value, zone.lasts.unit], [{ type: "emanation", value: 10 }, "self", 1, "minutes"]);
    assert.deepEqual(zone.inside, [{ rules: [{ key: "Resistance", type: "spirit", value: 5 }], who: "own" }, { rules: [{ key: "Weakness", type: "spirit", value: 5 }], who: "others" }]);
});

test("what its Quickened's extra action is only for, a note Effect beside its Quickened (honest.js withActionLimit): Zealous Banner, Energizing Treat, Quickened Standard; Frenzied Quintessence's rider has it already; Boots of the Blight's Quickened on a save its readied card gives (2026-10-27)", () => {
    const [banner] = compileActivations(item("Zealous Banner"));
    const row = banner.plan.resolution.outcomes.success;
    assert.deepEqual([banner.plan.partial, row.noteEffects.find((note) => note.label === "Quickened's extra action")?.duration?.value, /only to Strike/.test(row.noteEffects.find((note) => note.label === "Quickened's extra action")?.text)], [undefined, 1, true]);
    assert.equal(compileItem(item("Energizing Treat")).partial, undefined);
    assert.equal(compileItem(item("Frenzied Quintessence")).partial, undefined);
    assert.equal(compileActivations(item("Boots of the Blight"))[0].plan.partial, undefined);
});

test("a Craft Requirements paragraph right after result rows is no part of the last row (item-data.js): Whirlwind Vial's critical failure pushed 20 feet and Prone, nothing by hand; Vaccine's Duration after it still read", () => {
    const vial = compileItem(item("Whirlwind Vial"));
    const row = vial.resolution.outcomes.criticalFailure;
    assert.deepEqual([row.forcedMovement?.distance, row.effects.map((effect) => effect.slug), row.manualInstructions, vial.partial], [20, ["prone"], undefined, undefined]);
    const vaccine = compileItem(item("Vaccine (Lesser)"));
    assert.equal(vaccine.resolution.outcomes.success.modifiers[0].duration.value, 24);
});

test("a proficiency its Requirements need (src/compiler/requirement.js): Lion Badge's expert in Will saves, a skill or one of two, Perception; not the affixed weapon's; a character below it warned, an NPC not judged", async () => {
    const { readProficiencyRequirement, requirementWarning } = await import("../src/compiler/requirement.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const req = (name) => readProficiencyRequirement(plainText(item(name).system.description.value));
    assert.deepEqual(req("Lion Badge"), { kind: "save", slugs: ["will"], rank: 2, words: "expert in Will saves" });
    assert.deepEqual(req("Jade Cat"), { kind: "skill", slugs: ["acrobatics"], rank: 1, words: "trained in Acrobatics" });
    assert.equal(req("Dupe's Gold Nugget"), null);
    assert.deepEqual(readProficiencyRequirement("Requirements You're a master in Deception or Diplomacy. Effect You charm them.").slugs, ["deception", "diplomacy"]);
    const stealthy = { type: "character", name: "Ari", skills: { stealth: { rank: 1 } } };
    const stealth = { kind: "skill", slugs: ["stealth"], rank: 2, words: "expert in Stealth" };
    assert.match(requirementWarning(stealthy, stealth, "Ghostshot Wrapping"), /^Ghostshot Wrapping: its Requirements need its user to be expert in Stealth; Ari is trained\. The GM's call\.$/);
    assert.equal(requirementWarning({ ...stealthy, skills: { stealth: { rank: 3 } } }, stealth, "Ghostshot Wrapping"), null);
    assert.equal(requirementWarning({ type: "npc", name: "Orc", skills: { stealth: { rank: 0 } } }, stealth, "Ghostshot Wrapping"), null);
    // (A class: Accompaniment Cloak's bard; a fighter warned, a bard and a classless character not.)
    const bard = req("Accompaniment Cloak");
    assert.deepEqual([bard.kind, bard.slugs], ["class", ["bard"]]);
    assert.match(requirementWarning({ type: "character", name: "Ari", class: { slug: "fighter" } }, bard, "Accompaniment Cloak"), /need its user to be a bard; Ari is a fighter\./);
    assert.equal(requirementWarning({ type: "character", name: "Ari", class: { slug: "bard" } }, bard, "Accompaniment Cloak"), null);
    assert.equal(requirementWarning({ type: "character", name: "Ari", class: null }, bard, "Accompaniment Cloak"), null);
});

test("an activation only after a hit with the weapon (src/compiler/strike-gate.js): Alghollthu Whip's Strike, Grapple or Trip, Obsidian Edge's ranged Strike, Rending Gauntlets' two unarmed hits on one creature; not Scizore of the Crab's \"or you have a creature Grabbed\"", async () => {
    const { gateMet } = await import("../src/compiler/strike-gate.js");
    const gate = (name) => compileActivations(item(name))[0].plan.gate;
    assert.deepEqual([gate("Alghollthu Whip"), gate("Obsidian Edge"), gate("Rending Gauntlets (Lesser)"), gate("Scizore of the Crab")], [{ strike: { maneuvers: ["grapple", "trip"] } }, { strike: { range: "ranged", maneuvers: [] } }, { twoUnarmed: true }, undefined]);
    const whip = { actorUuid: "Actor.a", itemUuid: "Item.whip" };
    const roll = (more) => ({ actorUuid: "Actor.a", type: "attack-roll", outcome: "success", itemUuid: "Item.whip", targetUuid: "Token.t", ...more });
    assert.deepEqual(gateMet(gate("Alghollthu Whip"), [roll({})], whip), { ok: true, struck: "Token.t" });
    assert.equal(gateMet(gate("Alghollthu Whip"), [roll({ outcome: "failure" })], whip).ok, false);
    assert.equal(gateMet(gate("Alghollthu Whip"), [roll({}), roll({ itemUuid: "Item.other" })], whip).ok, false, "not its last roll");
    assert.equal(gateMet(gate("Alghollthu Whip"), [roll({ type: "skill-check", slug: "trip", itemUuid: null })], whip).ok, true, "a Trip");
    assert.equal(gateMet(gate("Obsidian Edge"), [roll({ ranged: false })], whip).ok, false, "not a ranged Strike");
    const fist = (target) => roll({ unarmed: true, itemUuid: "Item.fist", targetUuid: target });
    assert.deepEqual(gateMet({ twoUnarmed: true }, [fist("Token.x"), fist("Token.y"), fist("Token.x")], whip), { ok: true, struck: "Token.x" });
    assert.equal(gateMet({ twoUnarmed: true }, [fist("Token.x"), fist("Token.y")], whip).ok, false);
});

test("its user's own condition removed: Invigorating Soap's \"restores 10 Hit Points and removes the Fatigued condition\" (all of it, beside the healing); not \"dazzled until it removes the sickened condition\"", async () => {
    const { readReductions } = await import("../src/compiler/reduce.js");
    assert.deepEqual(compileItem(item("Invigorating Soap")).item.reduce, [{ slug: "fatigued", by: "all" }]);
    assert.deepEqual(readReductions("On a critical failure, the creature is blinded for 1 round, sickened 1, and dazzled until it removes the sickened condition."), []);
});

test("Coronet of Stars' Breath of Life at its own 7d8: the triggering creature's healing on the card, the creature its presser targets", () => {
    const [lifeline] = compileActivations(item("Coronet of Stars"));
    assert.equal(lifeline.plan.builtin, undefined);
    assert.deepEqual([lifeline.plan.item.recipient, lifeline.plan.targeting.target, lifeline.plan.resolution.outcomes.success.effects[0], lifeline.plan.partial], ["targets", "the triggering creature", { kind: "heal", formula: "7d8" }, undefined]);
});
