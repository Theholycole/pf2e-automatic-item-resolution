// A share of the damage a marked creature takes, as its user's temporary Hit Points (src/compiler/drain.js, scripts/drain.js:
// Exsanguinate's half its bleed). Pure.

// The share of the damage PF2e deals now that's of the type, by its instances' totals: not a persistent one it only sets (PF2e's condition)
// but one rolled now (its tick, evaluatePersistent); null when none of it is of that type (any type when null).
export function shareOfType(damage, type) {
    const now = (damage?.instances ?? []).filter((instance) => !instance?.persistent || instance?.options?.evaluatePersistent);
    const ofType = now.filter((instance) => !type || instance?.type === type);
    if (!ofType.length) return null;
    const sum = (list) => list.reduce((total, instance) => total + Math.max(0, Number(instance?.total) || 0), 0);
    const all = sum(now);
    return all > 0 ? sum(ofType) / all : 1;
}

// What its user gains: the Hit Points and temporary Hit Points the creature lost (after its resistances), that share, the fraction, rounded down.
export function drained(before, after, share, fraction) {
    const total = (hp) => (Number(hp?.value) || 0) + (Number(hp?.temp) || 0);
    const lost = Math.max(0, total(before) - total(after));
    return Math.floor(lost * (Number(share) || 0) * (Number(fraction) || 0));
}
