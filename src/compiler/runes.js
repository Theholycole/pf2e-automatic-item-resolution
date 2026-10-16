// Etched runes' activations (2026-10-16): a weapon's or armor's property runes are keys in its own data
// (system.runes.property: "vorpal", "greaterExtending"), not items in its owner's inventory, so a rune's Activate (Vorpal's
// Snicker-Snack, Hauling's reaction, Extending's Extend) had no button to press. Each key is matched to PF2e's rune item by
// its slug ("extending-greater" → "greaterExtending"; the runes PF2e renamed keep their old keys), and the rune's activations
// are compiled as any permanent item's, for the item it's etched onto: its inventory row gets their buttons
// (scripts/activations.js). Pure.

import { compileActivations } from "./permanent.js";
import { perWeaponDie, weaponDice } from "./item-data.js";

const QUALIFIERS = new Set(["minor", "lesser", "moderate", "greater", "major", "true", "supreme"]);
// (PF2e's keys that kept the old names: Quickstrike is "speed", Vitalizing "disrupting", Spell Reservoir "spellStoring", Animated "dancing".)
const RENAMED = Object.freeze({ quickstrike: "speed", vitalizing: "disrupting", greaterVitalizing: "greaterDisrupting", spellReservoir: "spellStoring", animated: "dancing" });
const ETCHED_ONTO = ["weapon", "armor", "shield"];

export const isRuneItem = (item) => item?.type === "equipment" && /^etched-onto/.test(item.system?.usage?.value ?? "");

// "extending-greater" → "greaterExtending", "ghost-touch" → "ghostTouch", "quickstrike" → "speed".
export function runeKeyOfSlug(slug) {
    const parts = String(slug ?? "").toLowerCase().split("-").filter(Boolean);
    if (parts.length > 1 && QUALIFIERS.has(parts.at(-1))) parts.unshift(parts.pop());
    const key = parts.map((part, index) => (index ? part[0].toUpperCase() + part.slice(1) : part)).join("");
    return RENAMED[key] ?? key;
}

// PF2e's rune items (their sources) by the key a weapon or armor keeps: Map key → source.
export function runeIndex(sources) {
    const index = new Map();
    for (const source of sources ?? []) if (isRuneItem(source) && source.system?.slug) index.set(runeKeyOfSlug(source.system.slug), source);
    return index;
}

// The property rune keys etched onto an item (a list in its data; PF2e's handwraps keep an object of them).
export function etchedKeys(item) {
    const property = item?.system?.runes?.property;
    return (Array.isArray(property) ? property : Object.values(property ?? {})).filter((key) => typeof key === "string" && key);
}

// The activations of the runes etched onto the item: [{ activation, plan, index: "rune:<key>:<n>", rune: { key, name, uuid } }],
// as compileActivations gives a permanent item's own. index: runeIndex's map; options: compileActivations'.
export function etchedRuneActivations(item, index, options = {}) {
    if (!ETCHED_ONTO.includes(item?.type) || !index?.size) return [];
    const found = [];
    for (const key of etchedKeys(item)) {
        const source = index.get(key);
        if (!source) continue;
        // (Its text with the weapon's own numbers: "1d8 per weapon damage die of the etched weapon".)
        const rune = item.type === "weapon" ? { ...source, system: { ...source.system, description: { ...(source.system?.description ?? {}), value: perWeaponDie(source.system?.description?.value, weaponDice(item)) } } } : source;
        for (const entry of compileActivations(rune, options)) found.push({ ...entry, index: `rune:${key}:${entry.index}`, rune: { key, name: source.name, uuid: source.uuid ?? null } });
    }
    return found;
}
