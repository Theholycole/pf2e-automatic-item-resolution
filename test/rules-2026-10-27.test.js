// The rules group of 2026-10-27 (src/compiler/item-rules.js): immunities and resistances by situation, bonuses only in some situations, use
// limits of its own, plain results the reader didn't parse, numbers the text doesn't give, results for some creatures only, fortune — each
// read on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { markEffectSource, markText, modifierText } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const notes = (plan) => plan.resolution.outcomes.success.noteEffects;

test("merged with the water: Tideplate's Submerge — Immobilized on its Effect for 10 minutes, what expels it (and the 10d6) its words", () => {
    const submerge = activation("Tideplate", "Submerge");
    assert.ok(done(submerge));
    assert.equal(routeOf(submerge), "item");
    const [note] = notes(submerge);
    assert.equal(notes(submerge).length, 1);
    assert.deepEqual([note.label, note.duration.value, note.duration.unit], ["Merged with the water", 10, "minutes"]);
    assert.deepEqual(note.rules.map((rule) => [rule.key, rule.uuid]), [["GrantItem", "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe"]]);
    assert.match(note.text, /you're expelled from the water and take 10d6 damage: this Effect ends then\. Control water expels you without dealing damage\.$/);
});

test("a bonus for a situation PF2e can't tell: its toggle and the bonus predicated on it, on the item's Effect — Eidetic Potion, Fake Blood Pack, Empath's Cordial, Restful Sleep Fulu", () => {
    const eidetic = compileItem(item("Eidetic Potion"));
    assert.ok(done(eidetic));
    const [memory] = notes(eidetic);
    assert.deepEqual([memory.duration.value, memory.duration.unit], [7, "days"]);
    assert.deepEqual(memory.rules.map((rule) => [rule.key, rule.selector ?? rule.option, rule.value ?? null, rule.removeAfterRoll ?? null]), [["RollOption", "eidetic-potion-memory", null, null], ["FlatModifier", "crafting", 2, "if-enabled"], ["FlatModifier", "society", 2, "if-enabled"]]);
    assert.ok(memory.rules[1].predicate.includes("eidetic-potion-memory"));
    const blood = compileItem(item("Fake Blood Pack"));
    assert.ok(done(blood));
    assert.deepEqual(notes(blood)[0].rules.filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.selector, rule.type, rule.value, rule.predicate]), [["deception", "item", 2, ["fake-blood-pack-faking"]]]);
    assert.match(blood.notes[0], /^Use it once the pack is punctured/);
    const cordial = compileItem(item("Empath's Cordial"));
    assert.deepEqual(notes(cordial)[0].rules.filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.value, rule.predicate]), [[2, ["empaths-cordial-discern"]], [1, ["action:sense-motive"]]]);
    const fulu = compileItem(item("Restful Sleep Fulu"));
    assert.deepEqual(notes(fulu)[0].rules.find((rule) => rule.key === "FlatModifier").predicate, ["restful-sleep-fulu-dreams", "item:trait:mental"]);
    assert.ok([cordial, fulu].every(done));
});

test("the lock its ooze was poured into: a line of the card — Oozepick, both grades", () => {
    for (const name of ["Oozepick", "Oozepick (Greater)"]) {
        const ooze = compileItem(item(name));
        assert.ok(done(ooze), name);
        assert.deepEqual(ooze.notes, ["The bonus is only against the mechanism the ooze was first poured into, where the ooze counts as thieves' tools."]);
        assert.deepEqual(ooze.resolution.outcomes.success.modifiers[0].predicate, [{ or: ["action:pick-a-lock", "action:disable-a-device"] }]);
    }
});

test("the creatures toasted: each one targeted marked, the bonuses against them — Rhyton of the Radiant Ifrit's Toast!", () => {
    const toast = activation("Rhyton of the Radiant Ifrit", "Toast!");
    assert.ok(done(toast));
    assert.deepEqual([toast.item.mark.slug, toast.item.mark.several, toast.item.mark.duration.value], ["rhyton-of-the-radiant-ifrit-toast", true, 1]);
    assert.deepEqual(toast.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.predicate]), ["deception", "diplomacy", "intimidation"].map((selector) => [selector, ["target:mark:rhyton-of-the-radiant-ifrit-toast"]]));
    assert.equal(markText(toast.item.mark), "Marks the creatures targeted (its bonuses against them alone) for 1 hour");
    const source = markEffectSource(toast.item.mark, { tokens: ["Scene.a.Token.b", "Scene.a.Token.c"], name: "Bandit, Captain", item: { name: "Rhyton of the Radiant Ifrit" } });
    assert.deepEqual(source.system.rules, [{ key: "TokenMark", slug: "rhyton-of-the-radiant-ifrit-toast", uuid: "Scene.a.Token.b" }, { key: "TokenMark", slug: "rhyton-of-the-radiant-ifrit-toast", uuid: "Scene.a.Token.c" }]);
    assert.match(modifierText(toast.resolution.outcomes.success.modifiers[0]), /against the marked creature/);
    // (One creature's mark as it was.)
    assert.deepEqual(markEffectSource({ slug: "x-mark", duration: null }, { token: "Scene.a.Token.b" }).system.rules, [{ key: "TokenMark", slug: "x-mark", uuid: "Scene.a.Token.b" }]);
});

test("a time, then a temporary immunity to the item: Spiced Demonade's 24 hours after its hour, Shell of Easy Breathing's to the next daily preparations, Scholar's Drop's secondary effect", () => {
    const demonade = compileItem(item("Spiced Demonade"));
    assert.ok(done(demonade));
    assert.deepEqual([demonade.item.immunity.slug, demonade.item.immunity.duration], ["spiced-demonade", { value: 25, unit: "hours" }]);
    assert.deepEqual([notes(demonade)[0].duration.value, notes(demonade)[0].duration.unit], [1, "hours"]);
    for (const [name, hours] of [["Shell of Easy Breathing", 1], ["Shell of Easy Breathing (Greater)", 8]]) {
        const shell = activation(name, "Fill the Shell");
        assert.ok(done(shell), name);
        assert.deepEqual([shell.item.recipient, shell.item.ruleEffects[0].words, shell.item.ruleEffects[0].duration.value], ["targets", "Can breathe underwater", hours]);
        assert.deepEqual([shell.item.immunity.slug, shell.item.immunity.daily], ["shell-of-easy-breathing", true]);
    }
    const drop = compileItem(item("Scholar's Drop"));
    assert.deepEqual([drop.builtin, drop.partial, drop.ways.length], ["ways", undefined, 2]);
    const secondary = drop.ways[1].plan;
    assert.deepEqual(secondary.item.suppress.map((entry) => [entry.slug, entry.duration.value]), [["fatigued", 10]]);
    assert.deepEqual(secondary.item.immunity.duration, { value: 70, unit: "minutes" });
    assert.equal(drop.ways[0].plan.resolution.outcomes.success.modifiers[0].value, 1);
});

test("rules with nothing a card could play, checked: Cat's Eye Elixir's flat checks, Journeybread's meals; Journeybread (Power)'s week of meals a line", () => {
    for (const name of ["Cat's Eye Elixir", "Journeybread"]) assert.deepEqual([compileItem(item(name)).decided, compileItem(item(name)).noteOnly], ["checked", undefined], name);
    const power = compileItem(item("Journeybread (Power)"));
    assert.ok(done(power));
    assert.match(power.notes[0], /until you eat real food and drink water normally for 24 hours \(the GM's to keep\)\.$/);
});
