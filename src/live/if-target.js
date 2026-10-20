// A rider only for some creatures (plan.ifTarget, src/compiler/materials.js withMaterialRider): Moonlit Spellgun's Enfeebled on a critical
// success at a creature weak to silver or whose resistance silver gets past. The attack card posts the plan with the rider for those creatures,
// the plain plan for the rest (scripts/poisons.js). Pure.

// An exception's words: PF2e's are strings ("silver") or { definition, label } objects.
const exceptionWords = (exception) => (typeof exception === "string" ? exception : [exception?.label, ...(exception?.definition ?? [])].filter(Boolean).join(" ")).toLowerCase();

// Whether the material gets past the creature: a weakness to it, or a resistance with it as an exception.
export function materialGetsPast(actor, material) {
    const attributes = actor?.attributes ?? actor?.system?.attributes ?? {};
    const words = String(material ?? "").toLowerCase();
    if (!words) return false;
    if ((attributes.weaknesses ?? []).some((weakness) => String(weakness?.type ?? "").toLowerCase() === words)) return true;
    return (attributes.resistances ?? []).some((resistance) => (resistance?.exceptions ?? []).some((exception) => exceptionWords(exception).split(/[\s,]+/).includes(words) || exceptionWords(exception).includes(words)));
}

// The plan for that creature: its riders added to their degree's effects when it fits.
export function planFor(plan, actor) {
    const riders = (plan?.ifTarget ?? []).filter((entry) => entry.material && materialGetsPast(actor, entry.material));
    if (!riders.length) return plan;
    const outcomes = { ...plan.resolution.outcomes };
    for (const rider of riders) outcomes[rider.degree] = { ...outcomes[rider.degree], effects: [...(outcomes[rider.degree]?.effects ?? []), ...rider.effects] };
    return { ...plan, resolution: { ...plan.resolution, outcomes } };
}

// The tokens by the plan each gets → [{ plan, tokens }] (one group when the plan has no such rider).
export function targetGroups(plan, tokens) {
    if (!(plan?.ifTarget ?? []).length) return [{ plan, tokens }];
    const groups = [];
    for (const token of tokens) {
        const own = planFor(plan, token.actor ?? token.object?.actor);
        const group = groups.find((entry) => entry.plan === own) ?? groups.find((entry) => entry.plan !== plan && own !== plan && JSON.stringify(entry.plan) === JSON.stringify(own));
        if (group) group.tokens.push(token);
        else groups.push({ plan: own, tokens: [token] });
    }
    return groups;
}
