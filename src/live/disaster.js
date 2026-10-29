// An Effect's turn auras filled from its user's own instinct (src/compiler/disaster-herald.js, Instinct Crown (Disaster)'s herald): the
// Disaster instinct's choice on its user (Barbarians+'s ChoiceSet, flags.pf2e.disasterInstinct { damageType, damage }) gives each aura's
// card its persistent damage — the emanation's amount, at least 1, of its type — and its radius the instinct's PF2e Aura on its user (5
// feet, 10 from 15th level), else by its level. Pure.

const INSTINCTS = { disaster: { flag: "disasterInstinct", aura: "disaster-instinct" } };

// The Effect's entry and its user's actor → { entry } filled, or { error } when its user has no such instinct.
export function instinctAuras(entry, actor) {
    const kind = INSTINCTS[entry?.fromInstinct];
    if (!kind) return { entry };
    const chosen = actor?.flags?.pf2e?.[kind.flag] ?? null;
    const type = String(chosen?.damageType ?? "").toLowerCase();
    if (!/^[a-z]+$/.test(type)) return { error: `has no ${entry.fromInstinct.charAt(0).toUpperCase()}${entry.fromInstinct.slice(1)} instinct (its crown's needs it)` };
    const amount = Math.max(1, Math.floor(Number(chosen.damage) || 1));
    const own = typeof actor?.auras?.get === "function" ? Number(actor.auras.get(kind.aura)?.radius) : NaN;
    const radius = Number.isFinite(own) && own > 0 ? own : (Number(actor?.level) || 0) >= 15 ? 10 : 5;
    const formula = `${amount}[persistent,${type}]`;
    const turnAuras = (entry.turnAuras ?? []).map((aura) => ({
        ...aura,
        radius,
        plan: { ...aura.plan, resolution: { ...aura.plan.resolution, sharedDamage: { ...aura.plan.resolution.sharedDamage, components: aura.plan.resolution.sharedDamage.components.map((component) => ({ ...component, formula })) } } }
    }));
    const { fromInstinct, ...rest } = entry;
    return { entry: { ...rest, words: `${entry.words} (${amount} persistent ${type} within ${radius} feet)`, turnAuras } };
}
