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
    assert.match(enigma.notes[0], /except that you use your Perception modifier/);
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
    // What it can't apply ("the DC to move you … is 40") goes on a note with its text, and the plan is partial.
    const immovable = compileItem(item("Immovable Potion"));
    assert.equal(immovable.resolution.outcomes.success.effects[0].slug, "immobilized");
    assert.equal(immovable.partial, true);
    assert.match(immovable.unread[0], /DC to move you/);
    assert.equal(immovable.resolution.outcomes.success.noteEffects.length, 1);
    // Megaphone Mutagen: its drawback read (a −2 to Fortitude, Deception, Diplomacy and Stealth), its auditory benefit on the note.
    const megaphone = compileItem(item("Megaphone Mutagen (Lesser)"));
    assert.deepEqual(megaphone.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value]), [["fortitude", -2], ["deception", -2], ["diplomacy", -2], ["stealth", -2]]);
    assert.equal(megaphone.partial, true);
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
    const breath = compileItem(item("One Day's Breath"));
    assert.deepEqual(breath.resolution.outcomes.success.modifiers.map((modifier) => [modifier.value, modifier.predicate, modifier.duration.value, modifier.duration.unit]), [[1, ["item:trait:inhaled"], 24, "hours"]]);
    assert.deepEqual(breath.unread, ["When you inhale the bottle's contents, the air fills your lungs so completely that you no longer need to breathe, at least for a time.", "If you spend 1 Mythic Point when you activate the day's breath, you inhale so deeply that you increase the effect's duration.", "You don't need to breathe for 24 hours.", "If you spend 1 Mythic Point, you don't need to breathe for 7 days."]);
    // Trusty Helmet's Hunker Down: "+1 circumstance bonus to your AC against ranged attacks".
    const [, hunker] = compileActivations(item("Trusty Helmet"));
    assert.deepEqual(hunker.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate]), [["ac", 1, "circumstance", ["item:ranged"]]]);
});

test("an item with a time and nothing else the module reads: a note of its text on the drinker, counted apart", () => {
    const plan = compileItem(item("Hovering Potion"));
    assert.equal(plan.noteOnly, true);
    const [note] = plan.resolution.outcomes.success.noteEffects;
    assert.equal(note.label, undefined, "the ability module calls it \"Hovering Potion: note\"");
    assert.deepEqual([note.duration.value, note.duration.unit], [5, "minutes"]);
    assert.doesNotMatch(note.text, /^Activate/);
    const result = registry.resolveSync(plan, context(), io());
    assert.deepEqual(result.changes.map((change) => [change.op, change.target, change.effect?.kind]), [["effect", "drinker", "note"]]);
    // With no time, nothing (the GM's).
    assert.equal(compileItem(item("Ration Tonic")), null);
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
});

test("action scopes in lower case, the last item's only; X-based checks; a sentence's tail a note (Martial Mayhem Mutagen)", () => {
    const plan = compileItem(item("Martial Mayhem Mutagen (Lesser)"));
    assert.deepEqual(plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate ?? null]), [
        ["skill-check", 1, [{ or: ["action:disarm", "action:grapple", "action:reposition", "action:shove", "action:trip"] }]],
        ["will", -2, null], ["int-based", -2, null], ["perception", -2, ["action:sense-motive"]]
    ]);
    assert.ok(plan.unread.some((sentence) => /1 additional precision damage to Off-Guard creatures/.test(sentence)), "the Strikes' extra damage on the note");
});

test("of several linked Effects, the item's own (its name, or the wearer's); the others a note; not per degree, for allies, or unnamed", () => {
    const wine = compileItem(item("Iron Wine"));
    assert.deepEqual(wine.resolution.applications.map((entry) => entry.label), ["Effect: Iron Wine"]);
    assert.match(wine.notes[0], /^Effect: Iron Wine Weakness is linked too/);
    const [belt] = compileActivations(item("Belt of the Five Kings"));
    assert.deepEqual(belt.plan.resolution.applications.map((entry) => entry.label), ["Effect: Belt of the Five Kings (Wearer)"]);
    // Per degree (Electromuscular Stimulator), an unnamed activation's (Weapon Siphon's bomb fitting): not read this way.
    assert.equal(compileItem(item("Electromuscular Stimulator"))?.resolution?.applications?.length ?? 0, 0);
    assert.equal(compileActivations(item("Weapon Siphon"))[0].plan?.resolution?.applications?.length ?? 0, 0);
});

test("an Effect behind the check its text opens with: only on a success, a note (Diplomat's Badge); not a later save's (Antiplague)", () => {
    const badge = compileActivations(item("Diplomat's Badge"), { spellEffects }).find((entry) => entry.activation.name === "Diplomat's Bearing").plan;
    assert.equal(badge.partial, true);
    assert.match(badge.notes.at(-1), /^Only on a success: Attempt a DC 20 check to Recall Knowledge/);
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

test("Guardian Rose: \"you avoid being knocked out and regain 2d8+5 Hit Points\" — the healing and Enfeebled 1, the rest on the note", () => {
    const rose = compileItem(item("Guardian Rose"));
    const row = rose.resolution.outcomes.success;
    assert.deepEqual(row.effects.map((effect) => effect.kind === "heal" ? `heal ${effect.formula}` : `${effect.slug} ${effect.value}`), ["heal 2d8+5", "enfeebled 1"]);
    assert.equal(rose.partial, true);
});

test("Lockpicker's Oil: its user's status bonus to Thievery checks to Pick a Lock for 1 minute; anyone else's and the critical failure a note", () => {
    const oil = compileItem(item("Lockpicker's Oil (Greater)"));
    const [bonus] = oil.resolution.outcomes.success.modifiers;
    assert.deepEqual([bonus.selector, bonus.value, bonus.type, bonus.predicate, bonus.duration.value, bonus.duration.unit], ["thievery", 2, "status", ["action:pick-a-lock"], 1, "minutes"]);
    assert.equal(oil.partial, true);
});
