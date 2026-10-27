// Damage as the item's own Strike would deal it, of another type (2026-10-27, docs/needs.md): Sinew-Song's Cutting Cadenza, "Success The creature
// takes damage as if you successfully hit it with a Strike using a sinew-song, but all of the damage is sonic damage. Failure As success, but the
// creature also takes … persistent bleed damage. Critical Failure As success, but double the damage and …". → plan.strikeDamage { as, rows:
// { degree: multiplier } }: its user's Strike with the item, its damage formula as PF2e has it (scripts/live.js fills it in as the card is made,
// src/live/strike-as.js), all of that type, shared by the rows at those multipliers beside their own damage. The success row's line gone. Pure.

const AS_STRIKE = /^\{target\} \(success\): The creature takes damage as if you successfully hit it with a Strike using an? [\w' -]+?\s*, but all of the damage is (\w+) damage\.?$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withStrikeDamage(plan, text) {
    const outcomes = plan?.resolution?.outcomes;
    const line = outcomes?.success ? (outcomes.success.manualInstructions ?? []).map((entry) => [entry, AS_STRIKE.exec(said(entry))]).find(([, match]) => match) : null;
    if (!line) return plan;
    const plain = String(text ?? "");
    // (The other rows "As success, but …", the critical failure's damage doubled when it says so.)
    const rows = { success: 1 };
    if (/\bFailure As success\b/i.test(plain)) rows.failure = 1;
    if (/\bCritical Failure As success, but double the damage\b/i.test(plain)) rows.criticalFailure = 2;
    else if (/\bCritical Failure As success\b/i.test(plain)) rows.criticalFailure = 1;
    const next = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (degree !== "success") return [degree, row];
        const kept = (row.manualInstructions ?? []).filter((entry) => entry !== line[0]);
        const { manualInstructions, ...rest } = row;
        return [degree, { ...rest, ...(kept.length ? { manualInstructions: kept } : {}) }];
    }));
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(next).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        resolution: { ...plan.resolution, outcomes: next },
        strikeDamage: { as: line[1][1].toLowerCase(), rows },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
