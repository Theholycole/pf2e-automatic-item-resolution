// An item a staff for a while (2026-10-29, Sorshen's Sinuous Guisarme's Arcane Shift: src/compiler/staff-form.js, src/live/staff-form.js,
// scripts/staff-form.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { chargesFor, createStaffCard, mythicDC, revertUpdate, staffCardHTML, staffFormEffectSource, staffSpellsOf, staffWeaponUpdate } from "../src/live/staff-form.js";
import { castNumbersOf, staffFormRefusal } from "../scripts/staff-form.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const named = (name) => equipment.find((entry) => entry.name === name);
const shift = () => compileActivations({ ...named("Sorshen's Sinuous Guisarme"), ownerLevel: 20 })[0].plan;

test("Sorshen's Sinuous Guisarme: Arcane Shift the staff-form card — the staff, 10 charges, rank 10 for 10 and a Mythic Point, runes off, no Impose Will", () => {
    const plan = shift();
    assert.equal(routeOf(plan), "staff-form");
    assert.deepEqual(plan.staffForm, {
        staff: { uuid: "Compendium.pf2e.equipment-srd.Item.ndF4yxyM5ci1DcrO", name: "Staff of Control (Major)" },
        charges: 10,
        mythic: { charges: 10, rank: 10 },
        runesOff: true,
        refuses: ["Impose Will"],
        revertsEmpty: true
    });
    assert.deepEqual([plan.trigger.frequency.max, plan.trigger.frequency.per, plan.partial, plan.noteOnly], [1, "day", undefined, undefined]);
    assert.ok(plan.notes.some((note) => /its own actions/.test(note)));
});

test("the staff's spells by rank from its description, its weapon on the item and back", () => {
    const staff = named("Staff of Control (Major)");
    const spells = staffSpellsOf(staff.system.description.value);
    assert.deepEqual(spells.map((spell) => `${spell.rank}:${spell.name}`), ["0:Daze", "1:Charm", "1:Command", "2:Laughing Fit", "2:Stupefy", "3:Enthrall", "4:Charm", "4:Confusion", "4:Suggestion", "5:Command", "5:Subconscious Suggestion", "6:Dominate", "6:Never Mind"]);
    assert.equal(spells[0].uuid, "Compendium.pf2e.spells-srd.Item.4gBIw4IDrSfFHik4");
    const guisarme = named("Sorshen's Sinuous Guisarme");
    const { update, kept } = staffWeaponUpdate(guisarme, staff);
    assert.deepEqual([update["system.damage"], update["system.group"], update["system.baseItem"], update["system.category"], update["system.usage"]], [{ damageType: "bludgeoning", dice: 1, die: "d4" }, "club", "staff", "simple", { value: "held-in-one-hand" }]);
    assert.deepEqual(update["system.traits.value"], ["artifact", "intelligent", "magical", "mythic", "staff", "two-hand-d8"]);
    assert.deepEqual(update["system.runes"], { potency: 0, striking: 0, property: [] });
    assert.deepEqual(kept.runes, { potency: 4, property: ["keen", "speed", "shifting", "spellStoring"], striking: 4 });
    const back = revertUpdate(kept);
    assert.deepEqual([back["system.damage"], back["system.group"], back["system.baseItem"], back["system.traits.value"], back["system.runes"].striking], [{ damageType: "slashing", dice: 1, die: "d10" }, "polearm", "guisarme", ["artifact", "intelligent", "magical", "mythic", "reach", "trip"], 4]);
    assert.equal(staffWeaponUpdate(guisarme, staff, { runesOff: false }).update["system.runes"], undefined);
});

test("the form's Effect, the charges a cast takes, mythic DCs and the card", () => {
    const plan = shift();
    const spells = staffSpellsOf(named("Staff of Control (Major)").system.description.value);
    const effect = staffFormEffectSource(plan.staffForm, { item: { name: "Sorshen's Sinuous Guisarme", uuid: "Actor.a.Item.g1" }, user: { actorUuid: "Actor.a" }, staff: { name: "Staff of Control (Major)" }, spells, rules: [{ key: "FlatModifier", selector: "diplomacy", type: "status", value: 1, predicate: ["action:request"] }] });
    assert.deepEqual([effect.name, effect.system.badge, effect.flags["pf2e-automatic-item-resolution"].staffForm.itemId, effect.system.rules[0].selector], ["Sorshen's Sinuous Guisarme: Staff of Control (Major)", { type: "counter", value: 10, min: 1, max: 10 }, "g1", "diplomacy"]);
    const form = { mythic: { charges: 10, rank: 10 } };
    assert.deepEqual([chargesFor(spells[0], {}, form), chargesFor(spells[5], {}, form), chargesFor(spells[5], { slot: true }, form), chargesFor(spells[1], { mythic: true }, form), chargesFor(spells[0], { mythic: true }, form)], [0, 3, 1, 10, 10]);
    assert.deepEqual([mythicDC({ dc: 41, proficiency: 26, level: 20 }), mythicDC({ dc: 50, proficiency: 30, level: 15 })], [45, 50]);
    const html = staffCardHTML(createStaffCard({ plan, item: { name: "Sorshen's Sinuous Guisarme" }, user: { name: "Sorshen" }, form: { staff: plan.staffForm.staff, spells, mythic: form.mythic, charges: 7 } }), { canApply: true });
    assert.ok(html.includes("7 charges left") && html.includes("rank 3: Enthrall (3 charges)") && html.includes("cantrip: Daze (free)") && html.includes("Rank 10 at mythic proficiency") && html.includes('value="-1"'));
});

test("its user's numbers: the best entry of the spell's tradition, its DC at mythic proficiency; Impose Will refused in the form", () => {
    const entry = (name, tradition, kind, dc, proficiency) => ({ name, system: { tradition: { value: tradition }, prepared: { value: kind } }, flags: {}, statistic: { dc: { value: dc }, check: { modifiers: proficiency == null ? [] : [{ slug: "proficiency", modifier: proficiency }] } } });
    const actor = { type: "character", level: 20, abilities: {}, itemTypes: { spellcastingEntry: [entry("Arcane", "arcane", "prepared", 40, 26), entry("Occult", "occult", "spontaneous", 42, 28), entry("Item", "occult", "innate", 50, 0), { ...entry("Spell module's", "occult", "prepared", 60, 30), flags: { "pf2e-automatic-resolution": { itemCastEntry: { itemUuid: "x" } } } }] } };
    const best = castNumbersOf(actor, ["arcane", "occult"]);
    assert.deepEqual([best.entry.name, best.dc, best.mythic], ["Occult", 42, 44]);
    assert.equal(castNumbersOf(actor, ["divine"]), null);
    const npc = { type: "npc", level: 23, abilities: { cha: { mod: 8 } }, itemTypes: { spellcastingEntry: [{ ...entry("Innate", "arcane", "innate", 45, null), system: { tradition: { value: "arcane" }, prepared: { value: "innate" }, ability: { value: "cha" } } }] } };
    assert.deepEqual([castNumbersOf(npc, ["arcane"]).dc, castNumbersOf(npc, ["arcane"]).mythic], [45, 51]);
    const data = { name: "Sorshen's Sinuous Guisarme", flags: { "pf2e-automatic-item-resolution": { staffForm: { staff: { name: "Staff of Control (Major)" }, refuses: ["Impose Will"] } } } };
    assert.match(staffFormRefusal(data, "Impose Will"), /no Impose Will until/);
    assert.equal(staffFormRefusal(data, "Arcane Shift"), null);
    assert.equal(staffFormRefusal({ name: "x", flags: {} }, "Impose Will"), null);
});
