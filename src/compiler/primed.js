// What a failed save primes for later, and a fulu's affixed target. Thousand-Pains Fulu's "On a failure or critical failure, if
// the target then takes an action with the move trait, it takes 2d6 persistent piercing damage": a consequence that waits on
// something the creature does later, a note Effect on it from the failure and critical failure rows for the item's time (what
// follows in the text about it with it). "A creature to which the fulu is affixed": the one creature touched, not an area a later
// sentence names. Pure.

import { itemDuration } from "./rows.js";

const PRIMED = /^On a (?:failure or critical failure|failure|critical failure), (?:if|whenever|each time|the next time)\b/i;

// The save plan and the item's plain text → the plan with those notes, or the plan as it was.
export function withPrimedNotes(plan, text) {
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    if (!outcomes?.failure) return plan;
    const sentences = String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const at = sentences.findIndex((sentence) => PRIMED.test(sentence));
    if (at < 0) return plan;
    const duration = itemDuration(String(text ?? ""));
    const note = { text: sentences.slice(at).join(" "), ...(duration ? { duration } : {}) };
    const rows = { ...outcomes };
    for (const degree of /^On a failure or critical failure\b/i.test(sentences[at]) ? ["failure", "criticalFailure"] : /^On a critical failure\b/i.test(sentences[at]) ? ["criticalFailure"] : ["failure"]) {
        if (rows[degree]) rows[degree] = { ...rows[degree], noteEffects: [...(rows[degree].noteEffects ?? []), note] };
    }
    return { ...plan, resolution: { ...plan.resolution, outcomes: rows }, automation: { ...(plan.automation ?? {}), level: "guided" } };
}

// What happens if its damage drops the creature, Meloth's Lifedrinker's "If the target is reduced to 0 HP by this effect, the vision
// becomes reality and kills the target instantly": the GM's, a note on the save's card.
const AT_ZERO = /^If the (?:target|creature) is reduced to 0 (?:HP|Hit Points) by this\b/i;
export function withZeroHPNote(plan, text) {
    if (plan?.resolution?.kind !== "save") return plan;
    const sentence = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).find((one) => AT_ZERO.test(one));
    return sentence && !(plan.notes ?? []).includes(sentence) ? { ...plan, notes: [...(plan.notes ?? []), sentence], automation: { ...(plan.automation ?? {}), level: "guided" } } : plan;
}

// A fulu affixed to a creature: that creature, touched.
export function affixedTargeting(plan, text) {
    if (!plan?.resolution || !/\bA creature to which the fulu is affixed\b/i.test(String(text ?? ""))) return plan;
    return { ...plan, targeting: { target: "1 creature", range: "touch", area: null } };
}
