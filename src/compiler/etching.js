// Etching a rune from its runestone (the user's request, 2026-10-16): a rune item in an inventory (PF2e's rune items, a
// runestone holding the rune: Vorpal, Striking (Greater), Reinforcing Rune (Minor)) put onto one of its owner's weapons, armor
// or shields, after which the runestone is gone (scripts/etching.js). A character etching it themselves can attempt a
// Crafting check at the rune's level-based DC first. Here: which items a rune fits (its usage, "etched onto a melee
// weapon"), the item's update (a fundamental rune upgraded, a property rune in a free slot, its lesser grade replaced) or why
// it can't, and the DC. Pure.

import { etchedKeys, runeKeyOfSlug } from "./runes.js";

// The fundamental runes, by slug: the item type, the runes field and its value.
const FUNDAMENTAL = Object.freeze({
    "weapon-potency-1": ["weapon", "potency", 1], "weapon-potency-2": ["weapon", "potency", 2], "weapon-potency-3": ["weapon", "potency", 3], "mythic-weapon-potency": ["weapon", "potency", 4],
    striking: ["weapon", "striking", 1], "striking-greater": ["weapon", "striking", 2], "striking-major": ["weapon", "striking", 3], "mythic-striking": ["weapon", "striking", 4],
    "armor-potency-1": ["armor", "potency", 1], "armor-potency-2": ["armor", "potency", 2], "armor-potency-3": ["armor", "potency", 3], "mythic-armor-potency": ["armor", "potency", 4],
    resilient: ["armor", "resilient", 1], "resilient-greater": ["armor", "resilient", 2], "resilient-major": ["armor", "resilient", 3], "mythic-resilient": ["armor", "resilient", 4],
    "reinforcing-rune-minor": ["shield", "reinforcing", 1], "reinforcing-rune-lesser": ["shield", "reinforcing", 2], "reinforcing-rune-moderate": ["shield", "reinforcing", 3],
    "reinforcing-rune-greater": ["shield", "reinforcing", 4], "reinforcing-rune-major": ["shield", "reinforcing", 5], "reinforcing-rune-supreme": ["shield", "reinforcing", 6]
});
const FIELD_WORDS = { potency: "potency rune", striking: "striking rune", resilient: "resilient rune", reinforcing: "reinforcing rune" };
// (Energy-Resistant runes: the energy chosen when etching, PF2e's "fireResistant", "greaterFireResistant".)
export const ENERGIES = Object.freeze(["acid", "cold", "electricity", "fire", "sonic"]);
const ENERGY_RESISTANT = /^energy-resistant(-greater)?$/;
export const needsEnergy = (rune) => ENERGY_RESISTANT.test(rune?.system?.slug ?? "");

const traitsOf = (item) => item?.system?.traits?.value ?? [];
const damageTypes = (weapon) => [weapon?.system?.damage?.damageType, ...traitsOf(weapon).filter((trait) => /^versatile-/.test(trait)).map((trait) => ({ b: "bludgeoning", p: "piercing", s: "slashing" })[trait.slice(-1)])].filter(Boolean);
const isMelee = (weapon) => !(Number(weapon?.system?.range) > 0) || traitsOf(weapon).some((trait) => /^thrown/.test(trait));

// Whether the rune can go onto the item (its usage, "etched-onto-…"): null when it can, else why not.
export function fitProblem(rune, item) {
    const usage = String(rune?.system?.usage?.value ?? "").replace(/^etched-onto-/, "");
    const name = item?.name ?? "That item";
    const weapon = item?.type === "weapon";
    const armor = item?.type === "armor";
    const category = item?.system?.category;
    const checks = [
        [/^(?:a-weapon|weapon-wo-(?:un)?holy-rune)$/, weapon, "a weapon"],
        [/^melee-weapon(?:-monk)?$/, weapon && isMelee(item), "a melee weapon"],
        [/^thrown-weapon$/, weapon && traitsOf(item).some((trait) => /^thrown/.test(trait)), "a thrown weapon"],
        [/^slashing-melee-weapon$/, weapon && isMelee(item) && damageTypes(item).includes("slashing"), "a slashing melee weapon"],
        [/^piercing-or-slashing-melee-weapon$/, weapon && isMelee(item) && damageTypes(item).some((type) => ["piercing", "slashing"].includes(type)), "a piercing or slashing melee weapon"],
        [/^piercing-or-slashing-weapon$/, weapon && damageTypes(item).some((type) => ["piercing", "slashing"].includes(type)), "a piercing or slashing weapon"],
        [/^bludgeoning-weapon$/, weapon && damageTypes(item).includes("bludgeoning"), "a bludgeoning weapon"],
        [/^clan-dagger$/, weapon && item?.system?.baseItem === "clan-dagger", "a clan dagger"],
        [/^a-shield$/, item?.type === "shield", "a shield"],
        [/^armor$/, armor, "armor"],
        [/^light-armor$/, armor && category === "light", "light armor"],
        [/^heavy-armor$/, armor && category === "heavy", "heavy armor"],
        [/^(?:med-heavy-armor|medium-heavy-metal-armor)$/, armor && ["medium", "heavy"].includes(category), "medium or heavy armor"],
        [/^lm-nonmetal-armor$/, armor && ["light", "medium"].includes(category), "light or medium armor"],
        [/^metal-armor$/, armor, "metal armor"]
    ];
    const check = checks.find(([pattern]) => pattern.test(usage));
    if (!check) return `${rune?.name ?? "That rune"} isn't a rune PF2e etches onto weapons, armor or shields.`;
    if (!check[1]) return `${rune.name} goes onto ${check[2]}, and ${name} isn't.`;
    if (item?.system?.specific) return `${name} is a specific magic item: its runes can't change.`;
    return null;
}

// A property rune's family and grade: "greaterFlaming" → ["flaming", 1]; "majorSwallowSpike" → ["swallowSpike", 2].
const GRADES = { lesser: -1, moderate: 0, greater: 1, major: 2, true: 3, supreme: 3 };
function familyOf(key) {
    const match = /^(lesser|moderate|greater|major|true|supreme)([A-Z].*)$/.exec(key);
    return match ? [match[2][0].toLowerCase() + match[2].slice(1), GRADES[match[1]]] : [key, 0];
}

// The item's update for the rune, or why it can't take it: { update, words, replaced } | { problem }.
// options: keys (PF2e's property rune keys for the item's type, a Set; null skips the check), abp (Automatic Bonus
// Progression: PF2e's own slots by level), energy (an Energy-Resistant rune's).
export function etchUpdate(rune, item, { keys = null, abp = false, energy = null } = {}) {
    const fit = fitProblem(rune, item);
    if (fit) return { problem: fit };
    const slug = rune.system?.slug ?? "";
    const runes = item.system?.runes ?? {};
    const fundamental = FUNDAMENTAL[slug];
    if (fundamental) {
        const [, field, value] = fundamental;
        if ((Number(runes[field]) || 0) >= value) return { problem: `${item.name} already has a ${FIELD_WORDS[field]} as good as ${rune.name}.` };
        return { update: { [`system.runes.${field}`]: value }, words: `${rune.name} on ${item.name}`, replaced: [] };
    }
    let key = runeKeyOfSlug(slug);
    if (needsEnergy(rune)) {
        if (!ENERGIES.includes(energy)) return { problem: `Pick the energy ${rune.name} resists.` };
        key = `${ENERGY_RESISTANT.exec(slug)[1] ? "greater" + energy[0].toUpperCase() + energy.slice(1) : energy}Resistant`;
    }
    if (keys && !keys.has(key)) return { problem: `PF2e has no ${rune.name} rune for ${item.type === "armor" ? "armor" : "weapons"} (${key}).` };
    const existing = etchedKeys(item);
    if (existing.includes(key)) return { problem: `${item.name} already has ${rune.name}.` };
    // (Holy and unholy don't go together: "a weapon without a holy rune".)
    for (const [one, other] of [["holy", "unholy"], ["unholy", "holy"]]) if (key === one && existing.includes(other)) return { problem: `${rune.name} can't go onto ${item.name}, which has the ${other} rune.` };
    const [family, grade] = familyOf(key);
    const sameFamily = existing.filter((other) => familyOf(other)[0] === family);
    if (sameFamily.some((other) => familyOf(other)[1] > grade)) return { problem: `${item.name} already has a stronger ${rune.name.replace(/\s*\([^)]*\)$/, "")} rune.` };
    const kept = existing.filter((other) => !sameFamily.includes(other));
    const width = slotsTaken(rune);
    if (!abp) {
        const slots = (Number(runes.potency) || 0) + (item.system?.material?.type === "orichalcum" ? 1 : 0);
        if (width > 1 && slots < width) return { problem: `${rune.name} goes only onto armor that can bear ${width} or more property runes, and ${item.name} can bear ${slots}.` };
        if (kept.length + width > slots) return { problem: !slots ? `${item.name} has no potency rune, so it has no slot for a property rune.` : width > 1 ? `${rune.name} takes the place of ${width} property runes, and ${item.name} has ${Math.max(0, slots - kept.length)} free (its potency rune gives ${slots}).` : `${item.name} has no free property rune slot (its potency rune gives ${slots}).` };
    }
    return { update: { "system.runes.property": [...kept, ...Array(width).fill(key)] }, words: `${rune.name}${needsEnergy(rune) ? ` (${energy})` : ""} on ${item.name}`, replaced: sameFamily };
}

// (A rune that takes the place of more than one property rune, Forgefather's Seal's "can be etched only onto armor that can bear two or more
// property runes, and it is so powerful that it takes the place of two property runes" (2026-10-29): its key that many times on the item, so
// PF2e's armor counts its slots so — src/compiler/runes.js reads it once.)
const WIDTH = { two: 2, three: 3, four: 4 };
export function slotsTaken(rune) {
    const said = /\btakes\s+the\s+place\s+of\s+(two|three|four)\s+property\s+runes\b/i.exec(String(rune?.system?.description?.value ?? ""));
    return said ? WIDTH[said[1].toLowerCase()] : 1;
}

// PF2e's DC for a level (GM Core's table), adjusted for rarity.
const LEVEL_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const RARITY = { common: 0, uncommon: 2, rare: 5, unique: 10 };
export const craftDC = (level, rarity = "common") => LEVEL_DC[Math.max(0, Math.min(25, Number(level) || 0))] + (RARITY[rarity] ?? 0);
export const runeDC = (rune) => craftDC(rune?.system?.level?.value, rune?.system?.traits?.rarity);
