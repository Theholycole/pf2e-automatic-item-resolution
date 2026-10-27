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

// A save's DC higher for each item of a name near its user (plan.dcNear { name, within, each }, src/compiler/hostile-ends.js: Flawed Orb of Gold
// Dragonkind's Orb Shards, each within 60 feet +1): count, how many there are → the plan with that DC; the plan as it was without dcNear.
export function withNearbyDC(plan, count) {
    const near = plan?.dcNear;
    const against = plan?.resolution?.check?.against;
    if (!near || !Number.isFinite(Number(against?.value)) || !(Number(count) > 0)) return plan;
    return { ...plan, resolution: { ...plan.resolution, check: { ...plan.resolution.check, against: { ...against, value: Number(against.value) + Number(count) * (Number(near.each) || 1) } } } };
}

// Its user's own check at the highest DC of the creature targeted, with its best statistic of several (plan.dcFromTarget { statistics },
// plan.bestOf, src/compiler/special-sentences.js: Spear of the Destroyer's Flame's "Will save, Diplomacy check, Intimidation check, or Warfare
// Lore check … equal to the current Commander's Will DC, … whichever is highest"): dcs, the creature's DCs by statistic; mods, its user's
// modifiers → the plan with that DC and statistic; the plan as it was without them.
export function withTargetDC(plan, dcs, mods = {}) {
    const from = plan?.dcFromTarget;
    if (!from || plan.resolution?.check?.against?.dc !== "fixed") return plan;
    const values = (from.statistics ?? []).map((slug) => Number(dcs?.[slug])).filter(Number.isFinite);
    if (!values.length) return null;
    const best = (plan.bestOf ?? []).filter((slug) => Number.isFinite(Number(mods?.[slug]))).sort((a, b) => Number(mods[b]) - Number(mods[a]))[0] ?? plan.resolution.check.statistic;
    return { ...plan, resolution: { ...plan.resolution, check: { ...plan.resolution.check, statistic: best, against: { ...plan.resolution.check.against, value: Math.max(...values) } } } };
}

// A check at its user's own attack modifier, filled in as it's used (check.attackFrom "unarmed", src/compiler/special-sentences.js: The
// Uprising's mob, its user's unarmed Strike against each creature's Fortitude DC), wherever in the plan — its zone's entries too: the plan with
// that modifier; the plan as it was without one.
export function withAttackModifiers(plan, modifiers = {}) {
    const walk = (value) => {
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== "object") return value;
        const walked = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
        if (value.attackFrom && Number.isFinite(Number(modifiers[value.attackFrom]))) return { ...walked, modifier: Number(modifiers[value.attackFrom]) };
        return walked;
    };
    return plan && JSON.stringify(plan).includes('"attackFrom"') ? walk(plan) : plan;
}

// Its hit's damage gone, an ignition failed (Oil's flat check, plan.ownCheck.ignite): the plan with its success rows dealing none.
export function withoutHitDamage(plan) {
    const none = { mode: "none", multiplier: 0, sourceComponentIds: [] };
    const outcomes = Object.fromEntries(Object.entries(plan?.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, ["success", "criticalSuccess"].includes(degree) && row ? { ...row, damage: none } : row]));
    return { ...plan, resolution: { ...plan.resolution, outcomes } };
}
