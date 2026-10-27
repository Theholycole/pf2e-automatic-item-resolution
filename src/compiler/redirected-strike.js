// A Strike its creature turns on another on a failed save (2026-10-27, docs/needs.md "Changes to a Strike"): Cauthooj Bagpipes' Throw Song,
// "The triggering creature must attempt a … Will save. On a failure, the creature redirects the Strike to another creature of your choice
// within reach of the melee Strike. If no other creatures are within range, the affected creature instead takes a –2 penalty to the Strike."
// PF2e can't move a Strike to another target: the failing rows' note Effect on the creature for its turn — whom it Strikes, its user's pick
// on the map; with no one else in reach, its –2 to that Strike. Pure.

const REDIRECT = /^\{target\}: The creature redirects the Strike to another creature of your choice within reach of the melee Strike\. If no other creatures are within range, the affected creature instead takes an? [–-](\d+) penalty to the Strike(?: \(by hand\))?\.$/i;
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → the plan with those rows' note Effects, or the same plan.
export function withRedirectedStrike(plan) {
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    if (!outcomes) return plan;
    let changed = false;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        const line = (row?.manualInstructions ?? []).map((entry) => [entry, REDIRECT.exec(said(entry))]).find(([, match]) => match);
        if (!line) return [degree, row];
        changed = true;
        const { manualInstructions, ...rest } = row;
        const kept = manualInstructions.filter((entry) => entry !== line[0]);
        const note = { label: "Strike redirected", text: `Its triggering melee Strike goes to another creature within its reach, picked by whoever used the item; with no other creature in reach, it takes a –${line[1][1]} penalty to that Strike instead.`, duration: THIS_TURN };
        return [degree, { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(rest.noteEffects ?? []), note] }];
    }));
    if (!changed) return plan;
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(rows).some((row) => (row?.manualInstructions ?? []).length);
    return { ...plan, resolution: { ...plan.resolution, outcomes: rows }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
