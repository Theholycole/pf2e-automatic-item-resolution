// A released weapon's Strike as the weapon itself makes it (src/compiler/self-fighting.js: Animated, Vine Whip): its attack the text's modifier
// and the weapon's potency, its damage the weapon's own dice (its striking rune's too) and type with no Strength, and 1d6 for each elemental
// property rune. Pure.

const ELEMENTAL = { flaming: "fire", frost: "cold", shock: "electricity", corrosive: "acid", thundering: "sonic" };
const runeType = (rune) => ELEMENTAL[String(rune ?? "").replace(/^greater/i, "").toLowerCase()] ?? null;

// The weapon's numbers: { potency, dice, die, type, runes }, from a PF2e weapon (its source's dice, without its striking, when PF2e has both).
export function weaponNumbers(weapon) {
    const system = weapon?.system ?? {};
    const base = Number(weapon?._source?.system?.damage?.dice ?? system.damage?.dice ?? 1) || 1;
    return { potency: Number(system.runes?.potency) || 0, dice: base + (Number(system.runes?.striking) || 0), die: system.damage?.die ?? "d4", type: system.damage?.damageType ?? "bludgeoning", runes: [...(system.runes?.property ?? [])] };
}

// The Strike's plan filled in for that weapon.
export function withWeaponStrike(plan, weapon) {
    if (!plan?.selfFighting) return plan;
    const numbers = weaponNumbers(weapon);
    const modifier = plan.selfFighting.base + numbers.potency;
    const extra = numbers.runes.map(runeType).filter(Boolean).map((type, index) => ({ id: `rune${index}`, formula: "1d6", type, category: null }));
    const components = [{ id: "weapon", formula: `${numbers.dice}${numbers.die}`, type: numbers.type, category: null }, ...extra];
    const ids = components.map((component) => component.id);
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, row?.damage?.mode === "shared" ? { ...row, damage: { ...row.damage, sourceComponentIds: ids } } : row]));
    return { ...plan, ownCheck: { ...plan.ownCheck, modifier }, resolution: { ...plan.resolution, check: { ...plan.resolution.check, modifier }, sharedDamage: { rollOnce: true, components }, outcomes } };
}
