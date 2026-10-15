import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry, validateChanges } from "../../pf2e-resolution-core/src/index.js";
import { actionTypeOf, compileItem as compileWith, handlesItem, readActivations, recipientOf, spellEffectIndex } from "../src/compiler/index.js";

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
    // Without the index (no spell-effects pack): the ability compiler's reading.
    assert.equal(compileWith(item("Oak Potion")).builtin, "cast-spell");
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
        if (!plan?.resolution || !registry.familyFor(plan.resolution.kind)) continue;
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
