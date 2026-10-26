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

// A save's DC its user's conditions higher (plan.dcBy, src/compiler/user-conditions.js: Death Tusk Helm's "Increase this DC by the sum of your
// Doomed and Wounded values (maximum DC 20)"): the plan with that DC, no higher than its maximum; the plan as it was without dcBy.
export function withConditionDC(plan, valueOf) {
    const by = plan?.dcBy;
    const against = plan?.resolution?.check?.against;
    if (!by || !Number.isFinite(Number(against?.value))) return plan;
    const raised = Number(against.value) + by.slugs.reduce((sum, slug) => sum + (Number(valueOf(slug)) || 0), 0);
    const value = Math.min(by.max ?? raised, Math.max(Number(against.value), raised));
    return { ...plan, resolution: { ...plan.resolution, check: { ...plan.resolution.check, against: { ...against, value } } } };
}

// Its hit's damage gone, an ignition failed (Oil's flat check, plan.ownCheck.ignite): the plan with its success rows dealing none.
export function withoutHitDamage(plan) {
    const none = { mode: "none", multiplier: 0, sourceComponentIds: [] };
    const outcomes = Object.fromEntries(Object.entries(plan?.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, ["success", "criticalSuccess"].includes(degree) && row ? { ...row, damage: none } : row]));
    return { ...plan, resolution: { ...plan.resolution, outcomes } };
}
