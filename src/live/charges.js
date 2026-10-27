// An item's charges kept on it (src/compiler/triggered.js withStoredCharges: Conflagration Club's Absorb Arcana): its flag "charges" { count, type },
// stored by the objects card's op "charge"; the card of its activation whose damage is a die per charge stored (src/compiler/scaled.js — its
// Explosive Cone) takes them, the charges then gone (scripts/live.js). Pure.

// The flag's charges: { count, type } with at least one, or null.
export const chargesOf = (flag) => (Number(flag?.count) > 0 ? { count: Math.floor(Number(flag.count)), type: flag.type ?? null } : null);

// Whether the plan's damage is a die per charge its item stores: its typed amount's words.
export const spendsCharges = (plan) => /\bper charge stored\b|^charges? stored in\b/i.test(String(plan?.scaled?.of ?? ""));

// The plan with those charges' damage: that many of its die, of their type — no amount to type, no type to pick. Null without charges.
export function withCharges(plan, flag) {
    const charges = chargesOf(flag);
    const component = plan?.resolution?.sharedDamage?.components?.[0];
    if (!charges || !component || !plan.scaled) return null;
    const die = plan.scaled.die ?? /^\d+(d\d+)/.exec(String(component.formula))?.[1] ?? null;
    if (!die) return null;
    const formula = `${charges.count}${die}[${charges.type ?? "untyped"}]`;
    const { scaled, damageChoices, ...rest } = plan;
    return { ...rest, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: [{ ...component, formula }] } }, chargesUsed: charges };
}
