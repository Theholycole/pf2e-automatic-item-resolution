// Ammunition lodged in the throat (2026-10-27, docs/needs.md): Stonethroat Ammunition's save rows — "Success The ammunition lodges itself
// loosely into the target's throat. For 1 round, the target takes a -2 status penalty to attack rolls with its jaws or fangs, and to Athletics
// checks. Effect: Stonethroat Ammunition (Success)", "Failure The ammunition embeds itself deep in the target's throat. The target can't use
// its jaws or fangs Strike (if it has one) or the Swallow Whole ability until the end of its next turn.", "Critical Failure As failure, and the
// target is Enfeebled 2 for 1 round." The success its own penalties for that round, PF2e's Effect's selectors (athletics, jaws-attack,
// fangs-attack; the Effect lasts with no end, so not it); the failure's a note Effect until the end of its next turn (no PF2e rule stops a
// Strike), the critical failure's too beside its Enfeebled. The Strike card's notes repeating them gone. Pure.

const PENALTY = /^\{target\} \(success\): The ammunition lodges itself loosely into the target's throat\. For (\d+) rounds?, the target takes a [–-](\d+) (status|circumstance|item) penalty to attack rolls with its jaws or fangs, and to Athletics checks\.(?: Effect: [^.]*)?$/i;
const LODGED = /^\{target\} \(failure\): The ammunition embeds itself deep in the target's throat\. The target can't use its jaws or fangs Strike \(if it has one\) or the Swallow Whole ability until the end of its next turn\.$/i;
const WORSE = /^\{target\} \(critical failure, the rest by hand\): As failure, and the target is Enfeebled \d+ for \d+ rounds?\.(?: \(failure: .*\))?$/i;
const NEXT_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const lineOf = (row, pattern) => (row?.manualInstructions ?? []).map((entry) => [entry, pattern.exec(said(entry))]).find(([, match]) => match) ?? null;
const without = (row, line) => {
    const { manualInstructions, ...rest } = row;
    const kept = (manualInstructions ?? []).filter((entry) => entry !== line);
    return { ...rest, ...(kept.length ? { manualInstructions: kept } : {}) };
};

// The plan → the plan with its Strike's save rows so, or the same plan.
export function withLodgedThroat(plan) {
    const save = plan?.strike?.save;
    const outcomes = save?.resolution?.kind === "save" ? save.resolution.outcomes : null;
    const penalty = outcomes ? lineOf(outcomes.success, PENALTY) : null;
    const lodged = outcomes ? lineOf(outcomes.failure, LODGED) : null;
    if (!penalty || !lodged) return plan;
    const [, rounds, value, type] = penalty[1];
    const duration = { mode: "fixed", value: Number(rounds), unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
    const modifiers = ["athletics", "jaws-attack", "fangs-attack"].map((selector) => ({ selector, type: type.toLowerCase(), value: -Number(value), duration }));
    const note = { label: "Throat blocked", text: "It can't use its jaws or fangs Strikes or Swallow Whole.", duration: NEXT_TURN };
    const next = { ...outcomes, success: { ...without(outcomes.success, penalty[0]), modifiers: [...(outcomes.success.modifiers ?? []), ...modifiers] }, failure: { ...without(outcomes.failure, lodged[0]), noteEffects: [...(outcomes.failure.noteEffects ?? []), note] } };
    const worse = lineOf(outcomes.criticalFailure, WORSE);
    if (worse && (outcomes.criticalFailure.effects ?? []).some((effect) => effect.slug === "enfeebled")) next.criticalFailure = { ...without(outcomes.criticalFailure, worse[0]), noteEffects: [...(outcomes.criticalFailure.noteEffects ?? []), note] };
    // (The Strike card's notes that only say its rows again.)
    const repeats = (note) => /\bjaws or fangs\b|^Effect: Stonethroat Ammunition\b/i.test(String(note));
    const notes = (plan.strike.notes ?? []).filter((entry) => !repeats(entry));
    const strike = { ...plan.strike, save: { ...save, resolution: { ...save.resolution, outcomes: next } }, notes };
    const left = notes.length || (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(next).some((row) => (row?.manualInstructions ?? []).length);
    return { ...plan, strike, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
