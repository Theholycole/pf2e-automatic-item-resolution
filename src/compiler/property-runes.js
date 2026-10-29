// PF2e's common weapon property runes, each with its English name as PF2e shows it, its key (PF2e's WeaponPropertyRune, kebab-case: the
// rune loan's AdjustStrike, src/live/card.js runeEffectSource) and its level (2026-10-28, from PF2e's equipment pack: the runes etched onto
// a weapon, fundamental runes left out). For an item whose user picks one "of your level or lower" on its card: Instinct Crown (Rune)'s
// (src/compiler/creatures-group.js). Pure.

export const PROPERTY_RUNES = Object.freeze([
    ["Authorized", "authorized", 3], ["Returning", "returning", 3], ["Underwater", "underwater", 3],
    ["Energy Vulnerability", "energy-vulnerability", 4], ["Ghost Touch", "ghost-touch", 4], ["Merciful", "merciful", 4],
    ["Earthbinding", "earthbinding", 5], ["Fearsome", "fearsome", 5], ["Pacifying", "pacifying", 5], ["Vitalizing", "disrupting", 5],
    ["Deflecting", "deflecting", 6], ["Shifting", "shifting", 6],
    ["Called", "called", 7], ["Conducting", "conducting", 7], ["Flurrying", "flurrying", 7], ["Rooting", "rooting", 7], ["Wounding", "wounding", 7],
    ["Astral", "astral", 8], ["Corrosive", "corrosive", 8], ["Decaying", "decaying", 8], ["Flaming", "flaming", 8], ["Frost", "frost", 8], ["Shock", "shock", 8], ["Thundering", "thundering", 8],
    ["Coating", "coating", 9], ["Extending", "extending", 9], ["Grievous", "grievous", 9], ["Swarming", "swarming", 9],
    ["Impactful", "impactful", 10],
    ["Holy", "holy", 11], ["Greater Rooting", "greater-rooting", 11], ["Unholy", "unholy", 11],
    ["Brilliant", "brilliant", 12], ["Greater Fearsome", "greater-fearsome", 12],
    ["Greater Extending", "greater-extending", 13],
    ["Greater Vitalizing", "greater-disrupting", 14],
    ["Greater Astral", "greater-astral", 15], ["Greater Corrosive", "greater-corrosive", 15], ["Greater Decaying", "greater-decaying", 15], ["Greater Flaming", "greater-flaming", 15], ["Greater Frost", "greater-frost", 15], ["Major Rooting", "major-rooting", 15], ["Greater Shock", "greater-shock", 15], ["Greater Thundering", "greater-thundering", 15],
    ["Greater Energy Vulnerability", "greater-energy-vulnerability", 16],
    ["Greater Impactful", "greater-impactful", 17],
    ["Greater Brilliant", "greater-brilliant", 18],
    ["True Rooting", "true-rooting", 19],
    ["Impossible", "impossible", 20]
].map(([name, key, level]) => Object.freeze({ name, key, level })));

// The runes of that level or lower, lowest first: [{ name, key }].
export const runesUpTo = (level) => PROPERTY_RUNES.filter((rune) => rune.level <= (Number(level) || 0)).map(({ name, key }) => ({ name, key }));
