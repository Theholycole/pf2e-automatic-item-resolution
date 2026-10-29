// An Effect that adds to its creature's healing a few times only (2026-10-28, src/compiler/creatures-group.js: Medicinal Hotpot's three
// heals): its flag healingUses, the uses left, counted down by each healing PF2e applies to the creature (scripts/healing-uses.js); at none
// left it's gone. Pure.

// Whether what PF2e applies is healing: its damage a negative number (PF2e's healing button), or a roll whose total is.
export function isHealing(params) {
    const damage = params?.damage;
    const total = typeof damage === "number" ? damage : Number(damage?.total);
    return Number.isFinite(total) && total < 0;
}

// The uses left after one more healing: { left, gone } — gone once none are.
export function afterHealing(uses) {
    const left = Math.max(0, (Math.floor(Number(uses)) || 0) - 1);
    return { left, gone: left === 0 };
}
