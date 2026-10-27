// What of the weather an item lets its user ignore, through PF2e Automatic Environment Resolution (src/compiler/weather.js, scripts/weather.js,
// 2026-10-26): Ixamè's Eye's Effect, and api.weatherIgnores for Cape of the Open Sky worn and Wintershot held.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { weatherEffectSource, weatherLine } from "../src/live/card.js";
import { weatherIgnores } from "../scripts/weather.js";
import { fallEases } from "../scripts/falls.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};

test("Ixamè's Eye: fog and mist ignored for a minute, its Effect flagged weatherIgnores (not the environment module's own weather mark); a hider's fate the GM's", () => {
    const eye = compileItem(item("Ixamè's Eye"));
    assert.deepEqual(eye.weatherIgnores, { ignores: ["fog-mist"], duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" } });
    // (2026-10-27, batch 3: a hider's fate the GM's in words on its note Effect in place of the reminder, no longer a note — src/compiler/visibility.js.)
    assert.deepEqual([eye.partial, eye.notes, eye.resolution.outcomes.success.noteEffects.length], [undefined, undefined, 1]);
    assert.match(eye.resolution.outcomes.success.noteEffects[0].text, /Hiding or Sneaking in that fog no longer is/);
    const source = weatherEffectSource(eye.weatherIgnores, { item: { name: "Ixamè's Eye" } });
    assert.deepEqual([source.flags["pf2e-automatic-environment-resolution"].weatherIgnores, source.flags["pf2e-automatic-environment-resolution"].weather], [{ ignores: ["fog-mist"], source: "Ixamè's Eye" }, undefined]);
    assert.equal(weatherLine(eye.weatherIgnores), "Ignores the weather's fog and mist for 1 minute");
});

test("api.weatherIgnores: Cape of the Open Sky worn (sight, concealment, wind on movement); Wintershot held, for its own Strikes (wind up to –2), and not stowed", () => {
    const of = (name, equipped, extra = {}) => ({ ...item(name), id: `id-${name}`, uuid: `Item.${name}`, system: { ...item(name).system, equipped }, ...extra });
    const actor = { items: [of("Cape of the Open Sky", { carryType: "worn", invested: true }, { isEquipped: true, isInvested: true }), of("Wintershot", { carryType: "held", handsHeld: 2 }), of("Wintershot (Heroic)", { carryType: "worn" })] };
    assert.deepEqual(weatherIgnores(actor), [{ ignores: ["sight", "concealment", "wind-movement"], source: "Cape of the Open Sky" }, { ignores: ["precipitation", "fog-mist", "wind-ranged"], windUpTo: 2, source: "Wintershot", weapon: "id-Wintershot" }]);
    // (The cape's Gentle Landing as it falls: no falling damage, api.fallEases.)
    assert.deepEqual(fallEases({ items: [actor.items[0]], itemTypes: { feat: [] } }), [{ noDamage: true, source: "Cape of the Open Sky" }]);
});
