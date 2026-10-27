// Spells a creature can't cast for a while (2026-10-27, docs/needs.md): Moritype's "If used on a living creature, that creature must attempt a
// … Will save. Success If the creature has any innate, prepared, or spontaneous spells, they're unable to Cast a Spell of their highest-ranked
// slot for 1 round. Cantrips and focus spells are unaffected. Failure As success, except they can't cast the 2 highest ranks they have
// available. Critical Failure As success, except they can't cast any spells other than cantrips and focus spells." PF2e has no rule that stops
// a cast: each row a note Effect for that time saying which ranks; its target "1 living creature". Pure.

const SUCCESS = /^\{target\} \(success\): If the creature has any innate, prepared, or spontaneous spells, they're unable to Cast a Spell of their highest-ranked slot for (\d+) (rounds?|minutes?)\. Cantrips and focus spells are unaffected\.$/i;
const TWO = /^\{target\} \(failure\): As success, except they can't cast the (\d+) highest ranks they have available\.(?: \(success: [^)]*\))?$/i;
const ANY = /^\{target\} \(critical failure\): As success, except they can't cast any spells other than cantrips and focus spells\.(?: \(success: [^)]*\))?$/i;
const LIVING = /\bIf used on a living creature, that creature must attempt\b/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan and its item's text (plain) → the plan with those rows, or the same plan.
export function withCastBlock(plan, text) {
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    const first = outcomes ? (outcomes.success?.manualInstructions ?? []).map((entry) => [entry, SUCCESS.exec(said(entry))]).find(([, match]) => match) : null;
    if (!first) return plan;
    const duration = { mode: "fixed", value: Number(first[1][1]), unit: /^min/i.test(first[1][2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const words = { success: "It can't Cast a Spell of its highest rank of innate, prepared or spontaneous spells (cantrips and focus spells aside).", failure: null, criticalFailure: "It can't Cast any spells but cantrips and focus spells." };
    const two = (outcomes.failure?.manualInstructions ?? []).map((entry) => [entry, TWO.exec(said(entry))]).find(([, match]) => match);
    if (two) words.failure = `It can't Cast a Spell of its ${two[1][1]} highest ranks of innate, prepared or spontaneous spells (cantrips and focus spells aside).`;
    const any = (outcomes.criticalFailure?.manualInstructions ?? []).map((entry) => [entry, ANY.exec(said(entry))]).find(([, match]) => match);
    const lines = { success: first[0], failure: two?.[0], criticalFailure: any?.[0] };
    const next = { ...outcomes };
    for (const degree of ["success", "failure", "criticalFailure"]) {
        if (!lines[degree] || !words[degree]) continue;
        const { manualInstructions, ...rest } = outcomes[degree];
        const kept = manualInstructions.filter((entry) => entry !== lines[degree]);
        next[degree] = { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(rest.noteEffects ?? []), { label: "No spells", text: words[degree], duration }] };
    }
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(next).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        ...(LIVING.test(String(text ?? "")) ? { targeting: { ...(plan.targeting ?? {}), target: "1 living creature" } } : {}),
        resolution: { ...plan.resolution, outcomes: next },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
