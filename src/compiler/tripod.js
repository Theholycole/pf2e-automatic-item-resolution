// A weapon held steady as on a tripod (2026-10-27, docs/needs.md "dying" — its "stabilizes"): Silver Tripod's "When activated, it creates an
// invisible construct of magical force that attaches to the weapon and automatically stabilizes it in any location, even in midair. The
// effect lasts for 1 minute or until you Dismiss it. The effect also ends immediately if you let go of the affixed weapon. The affixed weapon
// cannot be moved while this effect is active." — the facsimile of PF2e's Tripod, whose rule takes away a kickback weapon's −2 attack
// penalty (AdjustModifier on the Strike's "kickback" modifier, suppressed): a note Effect on its user for the minute with that rule, the
// weapon held where it is in its words; its user ends it (Dismiss, or letting go) by removing it. Pure.

import { plainText } from "./rows.js";

const STEADY = /^Activate\s*(?:\[[^\]]*\]\s*)?\(concentrate\) This tiny, silver facsimile of a weapon tripod is usually attached to the underside of the affixed weapon's barrel\. When activated, it creates an invisible construct of magical force that attaches to the weapon and automatically stabilizes it in any location, even in midair\. The effect lasts for (\d+|one|1) (minutes?|rounds?) or until you Dismiss it\. The effect also ends immediately if you let go of the affixed weapon\. The affixed weapon cannot be moved while this effect is active\.$/i;

// The plan (its note-only reading) and the item's html → its note Effect, or the same plan.
export function withTripod(plan, html) {
    const found = STEADY.exec(plainText(html).trim());
    const row = plan?.resolution?.outcomes?.success;
    if (!found || !plan?.noteOnly || !row) return plan;
    const duration = { mode: "fixed", value: Number(found[1]) || 1, unit: /^min/i.test(found[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const note = { label: "Weapon on a force tripod", text: "The affixed weapon is held steady where it is, even in midair, as on a tripod: no kickback penalty to its attack rolls. It can't be moved; letting go of it, or Dismissing it, ends this (remove this Effect).", duration, rules: [{ key: "AdjustModifier", selector: "strike-attack-roll", slug: "kickback", suppress: true }] };
    const { noteOnly: _noteOnly, ...rest } = plan;
    return { ...rest, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { success: { ...row, noteEffects: [note] } } } };
}
