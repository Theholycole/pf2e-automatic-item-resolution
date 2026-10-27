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
// (An armor rune's attack with the armor's own bonus: Swallow-Spike's "This attack gets an item bonus to the attack roll equal to the
// armor's item bonus to your AC and an item bonus to damage equal to double that amount" — the armor's item bonus to AC, its AC Bonus and
// its potency rune's (as PF2e's Armor Potency and Plated Duster say "the armor's item bonus to AC"), on the modifier, twice on the damage;
// none for armor with none. 2026-10-26: its AC Bonus as well, not its potency alone.)
export function withArmorPotency(html, armor) {
    const text = String(html ?? "");
    const bonus = (Number(armor?.system?.acBonus) || 0) + (Number(armor?.system?.runes?.potency) || 0);
    const said = /\s*\bThis attack gets an item bonus to the attack roll equal to the armor's item bonus to your AC and an item bonus to damage equal to double that amount\.?/i;
    if (!armor || !said.test(text)) return text;
    return text
        .replace(/\battack modifier of (?:\[\[[^\]]*\]\]\{)?\+(\d+)\}? that deals (?:@Damage\[(\d+d\d+)\[(\w+)\]\]|(\d+d\d+) (\w+)) damage\b/gi, (whole, modifier, linkedDice, linkedType, dice, type) => `attack modifier of +${Number(modifier) + bonus} that deals ${linkedDice ?? dice}${bonus ? `+${bonus * 2}` : ""} ${linkedType ?? type} damage`)
        .replace(said, "");
}

// (A weapon rune's bonus as its weapon's potency, Cunning's "Attempt to Recall Knowledge about the target of the required attack, gaining
// an item bonus to the Recall Knowledge skill check equal to the weapon's item bonus to attack rolls from its potency rune": that check
// with the weapon's +N, as the skill-action reader takes it; the critical hit's +2 circumstance a note.)
export function withWeaponPotency(html, weapon) {
    const text = String(html ?? "");
    const potency = Number(weapon?.system?.runes?.potency) || 0;
    const said = /\bAttempt to (?:@UUID\[[^\]]*\]\{)?Recall Knowledge\}? about the target of the required attack, gaining an item bonus to the Recall Knowledge skill check equal to the weapon's item bonus to attack rolls from its potency rune\./i;
    if (!potency || !said.test(text)) return text;
    return text.replace(said, `Attempt a Recall Knowledge check with a +${potency} item bonus about the target of the required attack.`);
}

export function etchedRuneActivations(item, index, options = {}) {
    if (!ETCHED_ONTO.includes(item?.type) || !index?.size) return [];
    const found = [];
    for (const key of etchedKeys(item)) {
        const source = index.get(key);
        if (!source) continue;
        // (Its text with the weapon's own numbers: "1d8 per weapon damage die of the etched weapon".)
        const text = item.type === "weapon" ? withWeaponPotency(perWeaponDie(source.system?.description?.value, weaponDice(item), item.system?.damage?.damageType ?? null), item) : item.type === "armor" ? withArmorPotency(source.system?.description?.value, item) : source.system?.description?.value;
        const rune = text === source.system?.description?.value ? source : { ...source, system: { ...source.system, description: { ...(source.system?.description ?? {}), value: text } } };
        // (Its index the etched one's, inside its plan too: Animated's Set Free's Strike card writes its 10-minute wait under the index the sheet
        // reads — the live check's reading, 2026-10-27.)
        for (const entry of compileActivations(rune, options)) {
            const renamed = `rune:${key}:${entry.index}`;
            const fighting = entry.plan?.again?.plan?.selfFighting;
            const plan = fighting ? { ...entry.plan, again: { ...entry.plan.again, plan: { ...entry.plan.again.plan, selfFighting: { ...fighting, index: renamed } } } } : entry.plan;
            found.push({ ...entry, plan, index: renamed, rune: { key, name: source.name, uuid: source.uuid ?? null } });
        }
    }
    return found;
}
