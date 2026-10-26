// A shield that guards its user by itself for a while: Floating Shield's "The shield magically releases itself and floats off your arm into
// the air next to you, granting you its bonus automatically, as if you had Raised the Shield. … After 1 minute, the shield drops to the
// ground, ending its floating effect." Its own AC bonus (PF2e's data) as a circumstance bonus to its user's AC for that time — the
// item card's row. What it can't do while floating and how it ends early ("you can't use reactions such as Shield Block with the shield",
// "you can Interact to grasp it, ending its floating effect early") are its user's to keep: a note Effect for that time (2026-10-26). Pure.

const FLOATS = /\bgranting you its bonus automatically, as if you had Raised the Shield\b/i;
const LASTS = /\bAfter (\d+) (minutes?|rounds?), the shield drops to the ground, ending its floating effect\b/i;

// The activation's text (plain), the shield → the plan, or null.
export function floatingPlan(text, base, shield) {
    const plain = String(text ?? "");
    const bonus = Number(shield?.system?.acBonus);
    if (!FLOATS.test(plain) || !(bonus > 0)) return null;
    const lasts = LASTS.exec(plain);
    const duration = lasts ? { mode: "fixed", value: Number(lasts[1]), unit: /^min/i.test(lasts[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" } : null;
    const sentences = plain.replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    // (What it can't do, and its early end, the user's: a note Effect for its time.)
    const limits = sentences.filter((sentence) => !FLOATS.test(sentence) && !LASTS.test(sentence) && /\b(?:reactions?|Shield Block|Interact|ending)\b/i.test(sentence));
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    const noteEffects = limits.length ? [{ label: "Floating shield", text: limits.join(" "), ...(duration ? { duration } : {}) }] : [];
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers: [{ selector: "ac", type: "circumstance", value: bonus, ...(duration ? { duration } : {}) }], ...(noteEffects.length ? { noteEffects } : {}) } } }
    };
}
