// A rider only for some creatures (plan.ifTarget, src/compiler/materials.js withMaterialRider): Moonlit Spellgun's Enfeebled on a critical
// success at a creature weak to silver or whose resistance silver gets past; a save's bonus or immunity by kind (src/compiler/kind-saves.js). The attack card posts the plan with the rider for those creatures,
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

// (2026-10-20, src/compiler/kind-saves.js: a creature's traits and senses — PF2e's actor.traits Set and system.perception.senses.)
const traitsOf = (actor) => new Set([...(actor?.system?.traits?.value ?? []), ...(actor?.traits ?? [])].map((trait) => String(trait).toLowerCase()));
const sensesOf = (actor) => [...(actor?.system?.perception?.senses ?? []), ...(actor?.perception?.senses ?? [])].map((sense) => String(sense?.type ?? sense).toLowerCase());
const fits = (entry, actor) => (entry.material ? materialGetsPast(actor, entry.material) : entry.traits ? entry.traits.some((trait) => traitsOf(actor).has(trait)) : entry.senses ? entry.senses.some((sense) => sensesOf(actor).includes(sense)) : false);

// The plan for that creature: its riders added to their degree's effects when it fits; a save's bonus or penalty for its kind (Lamentation of
// the Faithless's holy creatures' –2); null for a kind immune to it (its unholy ones).
export function planFor(plan, actor) {
    const riders = (plan?.ifTarget ?? []).filter((entry) => fits(entry, actor));
    if (!riders.length) return plan;
    if (riders.some((entry) => entry.immune)) return null;
    const outcomes = { ...plan.resolution.outcomes };
    for (const rider of riders.filter((entry) => entry.degree && entry.effects)) outcomes[rider.degree] = { ...outcomes[rider.degree], effects: [...(outcomes[rider.degree]?.effects ?? []), ...rider.effects] };
    const bonuses = riders.filter((entry) => entry.bonus);
    const check = bonuses.length ? { ...plan.resolution.check, bonus: { value: bonuses.reduce((sum, entry) => sum + Number(entry.bonus.value), Number(plan.resolution.check?.bonus?.value) || 0), type: bonuses[0].bonus.type } } : plan.resolution.check;
    return { ...plan, resolution: { ...plan.resolution, check, outcomes } };
}

// The tokens by the plan each gets → [{ plan, tokens }] (one group when the plan has no such rider; plan null for those immune).
export function targetGroups(plan, tokens) {
    if (!(plan?.ifTarget ?? []).length) return [{ plan, tokens }];
    const groups = [];
    for (const token of tokens) {
        const own = planFor(plan, token.actor ?? token.object?.actor);
        const group = groups.find((entry) => entry.plan === own) ?? groups.find((entry) => own && entry.plan && entry.plan !== plan && own !== plan && JSON.stringify(entry.plan) === JSON.stringify(own));
        if (group) group.tokens.push(token);
        else groups.push({ plan: own, tokens: [token] });
    }
    return groups;
}
