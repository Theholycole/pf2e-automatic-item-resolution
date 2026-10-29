// Forgefather's Seal in both of its forms (2026-10-29, a case writer's finding): etched onto the worn armor (a key in its system.runes.property)
// or worn in its owner's inventory, each plays every rule — its shields' repair, its passive's PF2e Effect, its three activations and the blow
// Retributive Rebuff absorbs (src/compiler/worn-rune.js, src/compiler/runes.js, src/compiler/etching.js; scripts/shield-repair.js,
// scripts/worn-rune.js, scripts/activations.js, scripts/etching.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { etchedRuneActivations, runeIndex } from "../src/compiler/runes.js";
import { etchUpdate, fitProblem, slotsTaken } from "../src/compiler/etching.js";
import { shieldRepairs } from "../src/compiler/shield-repair.js";
import { playsFromInventory, readWornRune, wornEffectChanges, wornRunes } from "../src/compiler/worn-rune.js";
import { routeOf } from "../src/live/route.js";

const SYSTEM = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e`;
const documents = (pack) => readDocuments(path.join(SYSTEM, "packs", pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const options = { spells: spellIndex(documents("spells")) };
const named = (name) => structuredClone(equipment.find((doc) => doc.name === name));
const runes = runeIndex(equipment);
const EFFECT = "Compendium.pf2e.equipment-effects.Item.0TZLR0PO5TJm9F4l";
const SEAL = "forgefathersSeal";
const armorWith = (name, runes, extra = {}) => {
    const source = named(name);
    return { ...source, _id: "armor1", uuid: "Actor.a.Item.armor1", ...extra, system: { ...source.system, runes: { ...source.system.runes, ...runes } } };
};
const seal = (carryType = "worn") => ({ ...named("Forgefather's Seal"), _id: "seal1", uuid: "Actor.a.Item.seal1", system: { ...named("Forgefather's Seal").system, equipped: { carryType } } });

test("how PF2e 8.6.1 has the seal: equipment etched onto armor with no rules, its passive on a linked Effect, and no rune key in its tables", () => {
    const item = named("Forgefather's Seal");
    assert.deepEqual([item.type, item.system.usage.value, item.system.slug, item.system.rules.length], ["equipment", "etched-onto-armor", "forgefathers-seal", 0]);
    assert.ok(item.system.traits.value.includes("artifact"));
    const effect = documents("equipment-effects").find((doc) => doc.name === "Effect: Forgefather's Seal");
    assert.equal(`Compendium.pf2e.equipment-effects.Item.${effect._id}`, EFFECT);
    assert.deepEqual(effect.system.rules.map((rule) => rule.key), ["Resistance", "RollOption", "RollOption", "ItemAlteration"]);
    // (PF2e's armor property runes, its system's own table: no forgefathersSeal — its armor keeps an unknown key, cut only to its slots, and
    // its armor sheet has no option for it. Should PF2e give the seal rune data, this fails: look again then.)
    const code = fs.readFileSync(path.join(SYSTEM, "pf2e.mjs"), "utf8");
    assert.equal(/forgefather/i.test(code), false);
    // (Matched to PF2e's rune item by its slug, as any etched key is.)
    assert.equal(runes.get(SEAL)?.name, "Forgefather's Seal");
});

test("the seal's text read for its time worn: its passive's linked Effect and its shields' repair; no other rune's", () => {
    assert.deepEqual(readWornRune(named("Forgefather's Seal").system.description.value), { effect: EFFECT, repair: { hp: 10 } });
    assert.equal(readWornRune(named("Vorpal").system.description.value), null);
    assert.equal(readWornRune(named("Fortification").system.description.value), null);
    assert.equal(readWornRune(named("Ancestral Embrace").system.description.value), null);
});

test("etched onto the worn armor: its activations the armor's (each once, its key twice), the same plans as the inventory seal's — the blow absorbed beside Earthquake", () => {
    const armor = { ...armorWith("Full Plate", { potency: 2, property: [SEAL, SEAL] }), ownerLevel: 24 };
    const etched = etchedRuneActivations(armor, runes, options);
    assert.deepEqual(etched.map((entry) => [entry.index, entry.activation.name, entry.rune.name]), [
        [`rune:${SEAL}:0`, "Retributive Rebuff", "Forgefather's Seal"],
        [`rune:${SEAL}:1`, "Seal of Mending", "Forgefather's Seal"],
        [`rune:${SEAL}:2`, "Stalwart Sacrifice", "Forgefather's Seal"]
    ]);
    const own = compileActivations({ ...named("Forgefather's Seal"), ownerLevel: 24 }, options);
    for (const [index, entry] of etched.entries()) {
        assert.deepEqual({ ...entry.plan, source: null }, { ...own[index].plan, source: null }, entry.activation.name);
        assert.equal(routeOf(entry.plan), routeOf(own[index].plan));
    }
    const [rebuff, mending] = etched.map((entry) => entry.plan);
    assert.deepEqual([rebuff.builtin, rebuff.spell.name, rebuff.dc, rebuff.alsoReadied.bonus.resistance, rebuff.alsoReadied.bonus.against], ["cast-spell", "Earthquake", 40, { type: "all-damage", value: 100 }, true]);
    assert.deepEqual(mending.objects.pauses, { what: "shield-repair", untilRest: true });
});

test("the runes worn on its armor: etched, or worn in the inventory — once each, the etched one first; none without armor, nor stowed", () => {
    const bare = armorWith("Chain Mail", { potency: 2, property: [] });
    const etched = armorWith("Chain Mail", { potency: 2, property: [SEAL, SEAL] });
    const [onArmor] = wornRunes({ armor: etched, items: [] }, runes);
    assert.deepEqual([onArmor.key, onArmor.name, onArmor.etched, onArmor.holder.uuid, onArmor.worn.effect, onArmor.worn.repair], [SEAL, "Chain Mail (Forgefather's Seal)", true, "Actor.a.Item.armor1", EFFECT, { hp: 10 }]);
    const [inInventory] = wornRunes({ armor: bare, items: [seal()] }, runes);
    assert.deepEqual([inInventory.key, inInventory.name, inInventory.etched, inInventory.holder.uuid, inInventory.worn.repair], [SEAL, "Forgefather's Seal", false, "Actor.a.Item.seal1", { hp: 10 }]);
    assert.deepEqual(wornRunes({ armor: etched, items: [seal()] }, runes).map((entry) => [entry.key, entry.etched]), [[SEAL, true]]);
    assert.deepEqual(wornRunes({ armor: null, items: [seal()] }, runes), []);
    assert.deepEqual(wornRunes({ armor: bare, items: [seal("stowed")] }, runes), []);
    // (A runestone of another rune in the inventory, or its key on the armor: not one.)
    assert.deepEqual(wornRunes({ armor: armorWith("Chain Mail", { potency: 1, property: ["fortification"] }), items: [named("Vorpal")] }, runes), []);
    // (Its shields repaired by its number in either form.)
    const shields = [{ id: "s", name: "Steel Shield", hp: { value: 5, max: 20 } }];
    assert.deepEqual(shieldRepairs(shields, onArmor.worn.repair).map((entry) => entry.to), [15]);
    assert.deepEqual(shieldRepairs(shields, inInventory.worn.repair).map((entry) => entry.to), [15]);
});

test("the inventory seal's own row has its buttons while it's worn and not etched onto the worn armor; a runestone's never", () => {
    assert.equal(playsFromInventory(seal(), null), true);
    assert.equal(playsFromInventory(seal(), armorWith("Chain Mail", { potency: 2, property: [] })), true);
    assert.equal(playsFromInventory(seal(), armorWith("Chain Mail", { potency: 2, property: [SEAL, SEAL] })), false);
    assert.equal(playsFromInventory(seal("stowed"), null), false);
    assert.equal(playsFromInventory(named("Vorpal"), null), false);
    assert.equal(playsFromInventory(named("Full Plate"), null), false);
});

test("its passive's PF2e Effect: given while it's worn, once, not beside one put on by hand, and the one given ended once it isn't", () => {
    const worn = wornRunes({ armor: armorWith("Chain Mail", { potency: 2, property: [SEAL, SEAL] }), items: [] }, runes);
    assert.deepEqual(wornEffectChanges(worn, []).add.map((entry) => [entry.uuid, entry.rune.name]), [[EFFECT, "Chain Mail (Forgefather's Seal)"]]);
    assert.deepEqual(wornEffectChanges(worn, [{ id: "e1", given: EFFECT, source: EFFECT }]), { add: [], remove: [] });
    assert.deepEqual(wornEffectChanges(worn, [{ id: "e2", given: null, source: EFFECT }]), { add: [], remove: [] });
    assert.deepEqual(wornEffectChanges(worn, [{ id: "e1", given: EFFECT, source: EFFECT }, { id: "e3", given: EFFECT, source: EFFECT }]), { add: [], remove: ["e3"] });
    assert.deepEqual(wornEffectChanges([], [{ id: "e1", given: EFFECT, source: EFFECT }, { id: "e2", given: null, source: EFFECT }, { id: "x", given: null, source: null }]), { add: [], remove: ["e1"] });
});

test("etching the seal: only onto armor that can bear two property runes, and it takes the place of two (its key twice)", () => {
    const rune = named("Forgefather's Seal");
    assert.equal(slotsTaken(rune), 2);
    assert.equal(slotsTaken(named("Vorpal")), 1);
    assert.equal(fitProblem(rune, named("Full Plate")), null);
    assert.match(fitProblem(rune, named("Longsword")), /goes onto armor/);
    assert.match(etchUpdate(rune, armorWith("Full Plate", { potency: 1 })).problem, /goes only onto armor that can bear 2 or more property runes, and Full Plate can bear 1/);
    assert.deepEqual(etchUpdate(rune, armorWith("Full Plate", { potency: 2 })).update, { "system.runes.property": [SEAL, SEAL] });
    assert.deepEqual(etchUpdate(rune, armorWith("Full Plate", { potency: 3, property: ["fortification"] })).update, { "system.runes.property": ["fortification", SEAL, SEAL] });
    assert.match(etchUpdate(rune, armorWith("Full Plate", { potency: 3, property: ["fortification", "glamered"] })).problem, /takes the place of 2 property runes, and Full Plate has 1 free/);
    assert.match(etchUpdate(rune, armorWith("Full Plate", { potency: 2, property: [SEAL, SEAL] })).problem, /already has Forgefather's Seal/);
    // (A rune taking one slot as before.)
    assert.match(etchUpdate(named("Fortification"), armorWith("Full Plate", { potency: 2, property: [SEAL, SEAL] })).problem, /no free property rune slot \(its potency rune gives 2\)/);
});
