// Hiding with nothing to hide behind, until its creature gives itself away (2026-10-27, docs/needs.md): Camouflage Dye's "The target can Hide or
// Sneak without cover or concealment for 10 minutes. If the target uses a hostile action or moves at more than half its Speed, after that action
// is completed, the effects of camouflage powder end and the creature ceases to be Hidden or undetected." No PF2e rule lets a creature Hide in
// the open: words on its Effect for that time, in place of the reminder of the whole text. Its end PF2e's roll options on that Effect —
// "air-ends-on:hostile" and "air-ends-on:long-move" — that scripts/ends-on-hostile.js ends it by (its Hidden and Undetected with it). Pure.

const CAMO = /\bThe target can Hide or Sneak without cover or concealment for (\d+) (minutes?|hours?)\./i;
const ENDS = /\bIf the target uses a hostile action or moves at more than half its Speed, after that action is completed, the effects of [\w ]+? end and the creature ceases to be Hidden or undetected\./i;

// A row's note Effects with the reminder swapped for the camouflage's own.
function camouflaged(row, note) {
    if (!(row?.noteEffects ?? []).some((entry) => entry.reminder)) return row;
    return { ...row, noteEffects: [...row.noteEffects.filter((entry) => !entry.reminder), note] };
}

// The plan and its item's text (plain) → the plan with that Effect, or the same plan.
export function withCamouflage(plan, text) {
    const plain = String(text ?? "");
    const camo = CAMO.exec(plain);
    const outcomes = plan?.resolution?.outcomes;
    if (!camo || !outcomes) return plan;
    const ends = ENDS.test(plain);
    const duration = { mode: "fixed", value: Number(camo[1]), unit: /^hour/i.test(camo[2]) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const note = {
        label: "Camouflaged",
        text: `It can Hide or Sneak without cover or concealment.${ends ? " It ends once it has used a hostile action or moved more than half its Speed, and it's then no longer Hidden or Undetected." : ""}`,
        duration,
        rules: ends ? [{ key: "RollOption", option: "air-ends-on:hostile" }, { key: "RollOption", option: "air-ends-on:long-move" }] : []
    };
    const next = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, camouflaged(row, note)]));
    if (Object.keys(next).every((degree) => next[degree] === outcomes[degree])) return plan;
    // (No longer a reminder alone: its Effect's words and rules are the card's.)
    return { ...plan, noteOnly: undefined, resolution: { ...plan.resolution, outcomes: next } };
}
