// Healing by its user's condition value (src/compiler/row-readings.js: Oracular Crown's "increases to 5d8 if you're cursebound 2, …"): the heal
// effects' formula picked from that value as the card applies, the highest step at or under it; the plan's own formula below them all. Pure.

// The plan and the value of its user's condition (0 without it) → the plan with each such heal's formula for that value.
export function scaledByCondition(plan, valueOf) {
    const rows = plan?.resolution?.outcomes;
    if (!rows || !Object.values(rows).some((row) => (row?.effects ?? []).some((effect) => effect?.byCondition))) return plan;
    const pick = (effect) => {
        const value = Number(valueOf(effect.byCondition.slug)) || 0;
        const steps = Object.keys(effect.byCondition.formulas).map(Number).filter((step) => step <= value).sort((a, b) => b - a);
        return steps.length ? { ...effect, formula: effect.byCondition.formulas[String(steps[0])] } : effect;
    };
    const outcomes = Object.fromEntries(Object.entries(rows).map(([degree, row]) => [degree, row?.effects ? { ...row, effects: row.effects.map((effect) => (effect?.byCondition ? pick(effect) : effect)) } : row]));
    return { ...plan, resolution: { ...plan.resolution, outcomes } };
}
