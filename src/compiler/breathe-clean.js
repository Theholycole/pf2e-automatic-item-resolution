// Clean air for a round (2026-10-27, docs/needs.md "afflictions"): Gas Mask of Clean Air's Breathe Clean, "For 1 round, you are immune to
// inhaled poisons, inhaled diseases, and olfactory effects. If you have ongoing effects due to such an effect from before activating the mask,
// those effects continue as normal. If the air around you is unbreathable, you are underwater, or you are in a vacuum, you can breathe
// normally." → a note Effect on its user for the round with PF2e's Immunity to inhaled and olfactory effects (inhaled poisons and diseases are
// PF2e's inhaled ones), what goes on as before and its breathing in its words. Pure.

import { plainText } from "./rows.js";

const CLEAN = /^Effect Your mask springs to life, pumping clean air into your nose and mouth\. For (\d+|one) (rounds?|minutes?), you are immune to inhaled poisons, inhaled diseases, and olfactory effects\. If you have ongoing effects due to such an effect from before activating the mask, those effects continue as normal\. If the air around you is unbreathable, you are underwater, or you are in a vacuum, you can breathe normally\.$/i;

// An activation's plan (its note-only reading) and its entry → its note Effect, or the same plan.
export function withCleanAir(plan, entry) {
    const found = CLEAN.exec(plainText(entry?.activation?.html).replace(/^.*?(?=\bEffect\b)/s, "").trim());
    const row = plan?.resolution?.outcomes?.success;
    if (!found || !plan?.noteOnly || !row) return plan;
    const value = found[1].toLowerCase() === "one" ? 1 : Number(found[1]);
    const duration = { mode: "fixed", value, unit: /^min/i.test(found[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const note = { label: "Breathing clean air", text: "Immune to inhaled poisons and diseases and to olfactory effects; it breathes normally even in unbreathable air, underwater or in a vacuum. What such an effect did to it before goes on as normal.", duration, rules: [{ key: "Immunity", type: "inhaled" }, { key: "Immunity", type: "olfactory" }] };
    const { noteOnly: _noteOnly, ...rest } = plan;
    return { ...rest, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { success: { ...row, noteEffects: [note] } } } };
}
