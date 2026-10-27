// A penalty to what a creature is doing as the reaction meets it (2026-10-27, docs/needs.md): Stifling Shield's Silence Falls, "Success The
// creature takes a –1 status penalty to any check or DC related to the triggering action. Failure As success, but the penalty is –2. Critical
// Failure The action is disrupted." The rows' modifiers on the creature: that penalty to its checks and its spell and class DCs until the end of
// its turn (which of them belong to the action PF2e can't tell: words on the Effect, the triggering action's only); the disruption a note
// Effect (no rule PF2e has: its result ignored). Pure.

const PENALTY = /^\{target\} \(success\): The creature takes an? [–-](\d+) (status|circumstance|item) penalty to any check or DC related to the triggering action\.$/i;
const AS_SUCCESS = /^\{target\} \(failure\): As success, but the penalty is [–-](\d+)\.(?: \(success: [^)]*\))?$/i;
const DISRUPTED = /^\{target\} \(critical failure\): The action is disrupted\.$/i;
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const SELECTORS = ["check", "spell-dc", "class-dc"];
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const lineOf = (row, pattern) => (row?.manualInstructions ?? []).map((entry) => [entry, pattern.exec(said(entry))]).find(([, match]) => match) ?? null;
const ONLY = { text: "Only on the checks and DCs of the action that triggered it.", duration: THIS_TURN };

// The plan → the plan with those rows, or the same plan.
export function withActionPenalty(plan) {
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    const success = outcomes ? lineOf(outcomes.success, PENALTY) : null;
    if (!success) return plan;
    const type = success[1][2].toLowerCase();
    const penalized = (row, line, value) => {
        const { manualInstructions, ...rest } = row;
        const kept = (manualInstructions ?? []).filter((entry) => entry !== line);
        const modifiers = SELECTORS.map((selector) => ({ selector, type, value: -value, duration: THIS_TURN }));
        return { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), modifiers: [...(row.modifiers ?? []), ...modifiers], noteEffects: [...(row.noteEffects ?? []), ONLY] };
    };
    const next = { ...outcomes, success: penalized(outcomes.success, success[0], Number(success[1][1])) };
    const failure = lineOf(outcomes.failure, AS_SUCCESS);
    if (failure) next.failure = penalized(outcomes.failure, failure[0], Number(failure[1][1]));
    const disrupted = lineOf(outcomes.criticalFailure, DISRUPTED);
    if (disrupted) {
        const { manualInstructions, ...rest } = outcomes.criticalFailure;
        const kept = manualInstructions.filter((entry) => entry !== disrupted[0]);
        next.criticalFailure = { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(rest.noteEffects ?? []), { text: "Its triggering action is disrupted: ignore its result (its actions are still spent).", duration: THIS_TURN }] };
    }
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(next).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        resolution: { ...plan.resolution, outcomes: next },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
