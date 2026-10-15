import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry, validateChanges } from "../../pf2e-resolution-core/src/index.js";
import { actionTypeOf, compileItem as compileWith, handlesItem, itemDuration, readActivations, recipientOf, spellEffectIndex } from "../src/compiler/index.js";

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
});

test("no condition from a trigger, a later event, a failed check, stages or a time that isn't its own", () => {
    for (const name of ["Emergency Eye", "Breath of Freedom", "Frenzied Quintessence", "Enigma-Sight Potion", "Rebirth Potion", "Elder Seed", "Scholar's Drop", "Guardian Rose"]) {
        const plan = compileItem(item(name));
        const conditions = plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes.success.effects.filter((effect) => effect.kind === "condition") : [];
        assert.deepEqual(conditions, [], name);
    }
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
        if (!plan?.resolution || plan.noteOnly || plan.partial || !registry.familyFor(plan.resolution.kind)) continue;
        let clean = true;
        for (const degree of ["criticalFailure", "failure", "success", "criticalSuccess"]) {
            const result = registry.resolveSync(plan, { ...context(), targets: [{ id: "target", side: "foes" }] }, { ...io(degree, 1), choose: (decision) => decision.default ?? decision.options?.[0]?.value });
            assert.deepEqual(validateChanges(result.changes), [], doc.name);
            if (result.gaps?.length) clean = false;
        }
        if (clean) resolves++;
    }
    assert.ok(resolves >= 732, `${resolves} resolve with no gaps`);
});
