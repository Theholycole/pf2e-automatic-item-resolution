import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { spellEffectIndex } from "../src/compiler/index.js";
import { compileActivations, handlesPermanent, readFrequency, splitActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, name);
    return found;
};
const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);

test("which permanent items' activations are read: not staves, not bombs, not consumables", () => {
    assert.equal(handlesPermanent(item("Cloak of Elvenkind")), true);
    assert.equal(handlesPermanent(equipment.find((doc) => (doc.system?.traits?.value ?? []).includes("staff") && /Activat/.test(doc.system.description.value))), false);
    assert.equal(handlesPermanent(item("Sulfur Bomb (Greater)")), false);
    assert.equal(handlesPermanent(item("Healing Potion (Minor)")), false);
});

test("an item's activations: name, actions, traits, frequency, trigger", () => {
    const [cloak] = splitActivations(item("Cloak of Elvenkind").system.description.value);
    assert.deepEqual([cloak.name, cloak.time, cloak.frequency], [null, "2", { max: 1, per: "day", raw: "once per day" }]);
    const cannon = splitActivations(item("Tentacle Cannon").system.description.value);
    assert.ok(cannon.some((entry) => entry.name === "Ink Spray" && entry.frequency?.per === "hour"));
    const scythe = splitActivations(item("Vampiric Scythe").system.description.value)[0];
    assert.match(scythe.trigger, /critically succeeds at an attempt to Disarm you/);
    assert.deepEqual(readFrequency("three times per day"), { max: 3, per: "day", raw: "three times per day" });
    assert.deepEqual(readFrequency("once per 10 minutes"), { max: 1, per: "10-minutes", raw: "once per 10 minutes" });
});

test("each activation read as an ability: a cast, an Effect, a save at targets, with its frequency", () => {
    const [cloak] = compileActivations(item("Cloak of Elvenkind"), { spellEffects });
    assert.deepEqual([cloak.plan.builtin, cloak.plan.spell.name, cloak.plan.self], ["cast-spell", "Invisibility", true]);
    assert.deepEqual(cloak.plan.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    const [mask] = compileActivations(item("Taljjae's Mask (The Hero)"), { spellEffects });
    assert.equal(mask.plan.resolution.kind, "effect");
    assert.equal(mask.plan.item.recipient, "user");
    const ink = compileActivations(item("Tentacle Cannon"), { spellEffects }).find((entry) => entry.activation.name === "Ink Spray");
    assert.equal(ink.plan.resolution.kind, "save");
    assert.deepEqual(ink.plan.resolution.check.against, { dc: "fixed", value: 23 });
    assert.deepEqual(registry.resolveSync(ink.plan, { caster: { id: "u" }, targets: [{ id: "t" }], statistic: () => ({ modifier: 0 }) }, { roll: () => ({ degree: "failure" }), damage: () => 3 }).gaps, []);
});

test("an activation that heals: its user (Bolka's Blessing), or a creature next to them (Healer's Gloves)", () => {
    const [bolka] = compileActivations(item("Bolka's Blessing"), { spellEffects });
    assert.deepEqual(bolka.plan.resolution.outcomes.success.effects, [{ kind: "heal", formula: "3d10" }]);
    assert.equal(bolka.plan.item.recipient, "user");
    const gloves = compileActivations(item("Healer's Gloves (Greater)"), { spellEffects }).find((entry) => entry.plan?.resolution?.outcomes?.success?.effects?.some((effect) => effect.kind === "heal"));
    assert.equal(gloves.plan.resolution.outcomes.success.effects[0].formula, "4d6+15");
    assert.equal(gloves.plan.item.recipient, "drinker", "the user picks the creature next to them");
});


test("an activation's row: not a condition only to some, not a random table's, not the target's on its user", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const conditions = (name) => compileActivations(item(name), { spellEffects }).flatMap(({ plan }) => plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes.success.effects.filter((effect) => effect.kind === "condition").map((effect) => effect.slug) : []);
    // "invisible to scrying magic", "Invisible to creatures with the fiend, fey, or undead trait": not invisible.
    assert.ok(!conditions("Mirrorblade").includes("invisible"));
    assert.ok(!conditions("Token of Salt and Earth").includes("invisible"));
    // A roll on a table: no one result.
    assert.deepEqual(conditions("Madcap Top"), []);
    // "The target is Quickened for 1 round": the save card, for the creature targeted — not the item card on its user.
    const watch = compileActivations(item("Pocket Watch of Stethelos"), { spellEffects }).find(({ activation }) => activation.name === "Steal a Second");
    assert.equal(routeOf(watch.plan, plainText(watch.activation.html)), "save");
    // "You drop to 1 Hit Point instead …, and you gain 100 temporary Hit Points": the temporary Hit Points, the rest on a note.
    const [bastion] = compileActivations(item("Immortal Bastion"), { spellEffects });
    assert.equal(bastion.plan.partial, true);
});

test("the spell module's claims, when given: what it acts on is left to it; without them, nothing changes", async (t) => {
    const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
    if (!claims) return t.skip("the spell module's tree isn't next to this one");
    const { handlesItem } = await import("../src/compiler/index.js");
    const blade = item("Searing Blade");
    assert.equal(handlesPermanent(blade), true);
    assert.equal(handlesPermanent(blade, { claims }), false, "its cast is the spell module's");
    assert.deepEqual(compileActivations(blade, { spellEffects, claims }), []);
    assert.equal(handlesItem(item("Djezet Dose"), { claims }), false);
    assert.equal(handlesItem(item("Healing Potion (Minor)"), { claims }), true);
    // (A claims that fails is no claim.)
    assert.equal(handlesItem(item("Healing Potion (Minor)"), { claims: () => { throw new Error("boom"); } }), true);
});
