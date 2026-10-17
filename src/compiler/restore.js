// Restored outright: Elixir of Rejuvenation's "When you drink this elixir, you're restored to your maximum Hit Points, and all
// afflictions of 20th level or lower affecting you are removed" — plan.item.restore { hp: "max", afflictions: { level } }: live
// play heals its drinker up to its maximum Hit Points (PF2e's healing, then the core's end of Dying) and deletes its PF2e
// afflictions of that level or lower. What else it says (a creature dead for a week brought back) stays a note. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const FULL = /\byou're restored to your maximum Hit Points\b/i;
const AFFLICTIONS = /\ball afflictions of (\d+)(?:st|nd|rd|th) level or lower affecting you are removed\b/i;

// The item's text (plain) → { hp?: "max", afflictions?: { level } } or null.
export function readRestore(text) {
    const plain = String(text ?? "");
    const full = FULL.test(plain);
    const afflictions = AFFLICTIONS.exec(plain);
    if (!full && !afflictions) return null;
    return { ...(full ? { hp: "max" } : {}), ...(afflictions ? { afflictions: { level: Number(afflictions[1]) } } : {}) };
}

// Its afflictions removed, in words.
export function restoreText(restore) {
    return [restore.hp === "max" ? "Heals up to its maximum Hit Points" : null, restore.afflictions ? `removes its afflictions of level ${restore.afflictions.level} or lower` : null].filter(Boolean).join(", and ");
}

// What else its text says: its other rule sentences (a creature dead for a week brought back), not its opening restatement.
export function restoreNotes(text) {
    return String(text ?? "").replace(/^.*?\bActivate\b[^.]*?\)\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim())
        .filter((sentence) => sentence && !FULL.test(sentence) && !AFFLICTIONS.test(sentence) && /\b(?:Hit Points?|dead|life|spell slots|Focus Points|conditions?|damage)\b/.test(sentence));
}

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A plan for an item whose only reading is this: the item card's (an automatic row with nothing in it, the rest on plan.item).
export function restorePlan(base, notes = []) {
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        ...(notes.length ? { notes, partial: true } : {})
    };
}
