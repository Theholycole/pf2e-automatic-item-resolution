// A change of ancestry over a night's rest (2026-10-27, docs/needs.md): Rebirth Potion's "After you drink the potion, you transform into that
// ancestry over 8 hours during your next period of rest … Throughout this time, you are Clumsy 2, Enfeebled 2, and Stupefied 2. Once the
// transformation is complete, the potion's magic ends and can't be counteracted. Replace your ancestry Hit Points, size, Speeds, attribute
// boosts, attribute flaws, traits, and special abilities with those of your new ancestry …" → its drinker's note Effect for the 8 hours with
// those conditions granted by it (PF2e's GrantItem, gone with it), used as the rest begins; the new ancestry its player's to put on the sheet —
// a character's build, out of the fight, a line of the card. Pure.

import { conditionUuid } from "./row-readings.js";
import { plainText } from "./rows.js";

const REBIRTH = /\bAfter you drink the potion, you transform into that ancestry over (\d+) hours during your next period of rest, finishing the transformation after the \1 hours are up\. Throughout this time, you are ((?:[A-Z][a-z]+ \d+(?:,? (?:and )?)?)+)\. Once the transformation is complete, the potion's magic ends and can't be counteracted\. Replace your ancestry Hit Points, size, Speeds, attribute boosts, attribute flaws, traits, and special abilities with those of your new ancestry\. You lose your ancestry feats, selecting replacements valid for your new ancestry\./i;

// The item and its plan's base → its plan, or null.
export function rebirthPlan(item, base) {
    const rebirth = item?.type === "consumable" ? REBIRTH.exec(plainText(item.system?.description?.value)) : null;
    if (!rebirth) return null;
    const conditions = [...rebirth[2].matchAll(/([A-Z][a-z]+) (\d+)/g)].map(([, slug, value]) => ({ slug: slug.toLowerCase(), value: Number(value) }));
    if (!conditions.length || conditions.some((condition) => !conditionUuid(condition.slug))) return null;
    const hours = Number(rebirth[1]);
    const words = conditions.map((condition) => `${condition.slug.charAt(0).toUpperCase()}${condition.slug.slice(1)} ${condition.value}`).join(", ");
    const note = {
        label: "Rebirth",
        text: `Changing into the potion's ancestry over a rest of ${hours} hours: ${words} throughout. Then the magic ends (it can't be counteracted): the new ancestry's Hit Points, size, Speeds, attribute boosts and flaws, traits and special abilities replace the old, and its ancestry feats are chosen again.`,
        duration: { mode: "fixed", value: hours, unit: "hours", expiry: "turn-start", anchor: "effect-start" },
        rules: conditions.map((condition) => ({ key: "GrantItem", uuid: conditionUuid(condition.slug), inMemoryOnly: true, alterations: [{ mode: "override", property: "badge-value", value: condition.value }] }))
    };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [note] } } },
        notes: ["Use it as its drinker settles to rest: the change takes that rest. Its player then makes the new ancestry on the character sheet (a bit from a humanoid steeped in it chose which; a few quirks of the old body stay)."]
    };
}
