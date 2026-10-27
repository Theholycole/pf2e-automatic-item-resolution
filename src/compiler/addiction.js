// An addiction held off for a day (2026-10-27, docs/needs.md "afflictions"): Addiction Suppressant's "When you use a dose of addiction
// suppressant, it suppresses the effects of that addiction for 1 day, as if you had taken an actual dose of the drug but without any of the
// drug's effects, and it doesn't increase the addiction DC. You also gain a +1 item bonus against the ongoing save against the drug's
// addiction …" — the item card's +1 (its grade's) item bonus to saves for the day, only with PF2e's toggle "Against its addiction" on its
// note Effect (PF2e has no addiction trait to aim it by: its user ticks it for that save), the note holding the suppression. Its crafting
// (one drug's own suppressant, made from a dose of it, of a higher level than that drug) a line of the card. Pure.

import { plainText } from "./rows.js";

const SUPPRESSES = /\bWhen you use a dose of addiction suppressant, it suppresses the effects of that addiction for (\d+|one|a) (days?|hours?), as if you had taken an actual dose of the drug but without any of the drug's effects, and it doesn't increase the addiction DC\. You also gain an? \+(\d+) item bonus against the ongoing save against the drug's addiction depending on the type of addiction suppressant\./i;
const CRAFTED = [/\bFor every drug, a specific suppressant must be crafted\s*[-–—]\s*no generalized addiction suppressant yet exists\./i, /\bIn order to create an addiction suppressant, you must begin with a dose of the drug to be suppressed, then use alchemical reagents to generate an elixir that can be used to fight that drug's addiction\./i, /\bAn addiction suppressant must be a higher level than the drug it is meant to suppress in order to work\./i];
const count = (word) => ({ one: 1, a: 1 }[String(word).toLowerCase()] ?? Number(word));
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// The plan (its note-only reading) and the item's html → the item card's bonus and note Effect, or the same plan.
export function withAddictionSuppressed(plan, html) {
    const text = plainText(html);
    const found = SUPPRESSES.exec(text);
    if (!found || !plan || plan.builtin || !CRAFTED.every((pattern) => pattern.test(text))) return plan;
    // (Nothing else in it: its Activate line, these sentences.)
    const rest = CRAFTED.reduce((left, pattern) => left.replace(pattern, " "), text.replace(SUPPRESSES, " ")).replace(/^\s*Activate\s*(?:\[[^\]]*\]\s*)?(?:Interact|\d)?\s*(?:\([^)]*\))?/i, "").trim();
    if (rest) return plan;
    const days = /^day/i.test(found[2]);
    const duration = { mode: "fixed", value: count(found[1]), unit: days ? "days" : "hours", expiry: "turn-start", anchor: "effect-start" };
    const toggle = `${plan.source?.slug ?? "addiction-suppressant"}:addiction`;
    const bonus = Number(found[3]);
    const note = {
        label: "Addiction suppressed",
        text: `The addiction to the drug it was made for is held off for ${duration.value} ${days ? (duration.value === 1 ? "day" : "days") : duration.value === 1 ? "hour" : "hours"}, as though a dose had been taken, with none of the drug's effects; the addiction DC doesn't rise. For the ongoing save against that addiction, tick "Against its addiction" (this Effect's toggle): +${bonus} item bonus. PF2e has no addiction trait to aim it by.`,
        duration,
        rules: [{ key: "RollOption", option: toggle, toggleable: true, label: "Against its addiction" }]
    };
    const { noteOnly: _noteOnly, partial: _partial, unread: _unread, ...kept } = plan;
    return {
        ...kept,
        automation: { level: "automatic" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers: [{ selector: "saving-throw", value: bonus, type: "item", duration, predicate: [toggle] }], noteEffects: [note] } } },
        notes: ["Each suppressant is made from a dose of one drug and works only against that drug, and only if the drug is of a lower level than the suppressant."]
    };
}
