// A rune that works while its wearer wears armor etched with it, in either of its two forms (2026-10-29, a case writer's finding): Forgefather's
// Seal's "While wearing armor etched with a Forgefather's seal, you gain fire resistance 40. You ignore the armor's check penalty and Speed
// penalty (if any); if the armor is light or medium, increase its item bonus to AC by 1. In addition, any shield you wield automatically
// recovers 10 Hit Points at the start of your turn each round." and its three activations.
// How PF2e 8.6.1 has it: an equipment item (usage "etched-onto-armor", rare, artifact, no rules of its own), its passive's rules on a linked
// Effect (Effect: Forgefather's Seal — Resistance, two RollOptions, an ItemAlteration) that nothing gives, and no key in its rune tables (its
// armor property runes have no forgefathersSeal). Etched onto armor (this module's Etch, scripts/etching.js) it's a key in the armor's
// system.runes.property: PF2e's armor keeps it (its data only cuts the list to the armor's slots), but PF2e's armor sheet has no option for it
// and rebuilds the list from its selects on any edit, so scripts/etching.js gives those selects its option. So the seal is either
// - etched: a key on the worn armor, its activations the armor's buttons (src/compiler/runes.js etchedRuneActivations); or
// - left in its owner's inventory, worn (not stowed or dropped): it stands for the seal on its armor, and its own row has its buttons
//   (scripts/activations.js, playsFromInventory).
// Here: what such a rune gives while it's worn (readWornRune: the passive's linked Effect, its shields' repair — src/compiler/shield-repair.js),
// the runes a creature has on its worn armor in either form (wornRunes), and the Effects to give or end for them (wornEffectChanges).
// scripts/shield-repair.js repairs by them and scripts/worn-rune.js keeps the Effect on the wearer while it's worn. Pure.

import { plainText } from "./rows.js";
import { WORN, readShieldRepair } from "./shield-repair.js";
import { etchedKeys, isRuneItem, runeKeyOfSlug } from "./runes.js";

// (The passive's own Effect: an equipment Effect linked before the item's first activation.)
const LINKED = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]/;
const descriptionOf = (item) => String(item?.system?.description?.value ?? "");
const keyOf = (item) => runeKeyOfSlug(item?.system?.slug ?? "") || String(item?.name ?? "");
// (On its owner as PF2e has a worn item: not stowed in a container, not dropped.)
const wornOn = (item) => (item?.system?.equipped?.carryType ?? "worn") === "worn";

// A rune's text (html) → { effect (its passive's linked Effect's uuid, or null), repair ({ hp } or null) }, or null when it isn't a rune that
// works while armor etched with it is worn.
export function readWornRune(html) {
    const text = String(html ?? "");
    if (!WORN.test(plainText(text))) return null;
    const passive = text.split(/<hr\b|<strong>\s*Activat/i)[0];
    return { effect: LINKED.exec(passive)?.[1] ?? null, repair: readShieldRepair(text) };
}

// Whether a rune item in an inventory plays its activations from its own row: such a rune, worn, and not etched onto its owner's worn armor
// already (whose row has them then). armor: the worn armor, or null (an NPC's armor may be none of its items).
export function playsFromInventory(item, armor = null) {
    if (!isRuneItem(item) || !wornOn(item) || !readWornRune(descriptionOf(item))) return false;
    return !(armor && etchedKeys(armor).includes(keyOf(item)));
}

// The creature's worn armor and its equipment, and PF2e's rune items by key (src/compiler/runes.js runeIndex) → the runes worn on its armor:
// [{ key, name, source (the rune's data), holder (the armor it's etched onto, or the inventory item), etched, worn (readWornRune's) }],
// each rune once, the etched one first. None without armor: they work only while it's worn.
export function wornRunes({ armor = null, items = [] } = {}, index = new Map()) {
    if (!armor) return [];
    const found = [];
    const seen = new Set();
    const add = (key, source, holder, etched) => {
        const worn = source && !seen.has(key) ? readWornRune(descriptionOf(source)) : null;
        if (!worn) return;
        seen.add(key);
        found.push({ key, name: etched ? `${holder.name} (${source.name})` : holder.name, source, holder, etched, worn });
    };
    for (const key of etchedKeys(armor)) add(key, index?.get?.(key) ?? null, armor, true);
    for (const item of items ?? []) if (isRuneItem(item) && wornOn(item)) add(keyOf(item), item, item, false);
    return found;
}

// The runes worn (wornRunes') and the creature's Effects ([{ id, given (the uuid this module gave it for, its flag), source (its compendium
// source) }]) → { add: [{ uuid, rune }], remove: [id] }: each worn rune's passive Effect given once — not beside the same Effect put on by
// hand —, and each one given for a rune no longer worn ended.
export function wornEffectChanges(runes, effects) {
    const wanted = new Map();
    for (const rune of runes ?? []) if (rune.worn?.effect && !wanted.has(rune.worn.effect)) wanted.set(rune.worn.effect, rune);
    // (And a second one given for the same rune, two updates at once.)
    const kept = new Set();
    const remove = [];
    for (const effect of effects ?? []) {
        if (!effect.given) continue;
        if (wanted.has(effect.given) && !kept.has(effect.given)) kept.add(effect.given);
        else remove.push(effect.id);
    }
    const add = [...wanted].filter(([uuid]) => !(effects ?? []).some((effect) => effect.given === uuid || effect.source === uuid)).map(([uuid, rune]) => ({ uuid, rune }));
    return { add, remove };
}
