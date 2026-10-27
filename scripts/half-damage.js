// Live play for bonus.halfDamage (src/compiler/readied-bonus.js: Laurel of the Empath's "You take half damage from the triggering attack"), and
// bonus.shieldBlock (src/compiler/triggered.js: Arrow-Catching Shield's Shield Block on the Strike it takes).
// The core's applyDamage listener (its patches.damage.onApply) sees the damage before PF2e applies it: on a creature with that readied
// Effect (src/live/fortune-card.js, flagged halfDamage), the damage roll is halved by PF2e's own alter(0.5) — a number, rounded down. The
// Effect is then spent by the damage, as one with resistance is (scripts/fortune.js). And bonus.reduceCrit (Indomitable Keepsake's critical
// hit reduced by 10, no lower than a normal hit's): the hit's damage less that much, at most half of it — the doubling's part — by
// alter(1, -N) on its first instance; nothing off a damage PF2e says wasn't a critical hit. And bonus.noDamage (Hollow Robes' Hollow Target,
// 2026-10-27: "The damage from a critical hit Strike is reduced to 0", or the persistent damage that triggered it; Redeemer's Pistol's "You're
// unharmed by the triggering damage"): the damage 0.

import { MODULE_KEY } from "../src/live/fortune-card.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const cutting = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.reduceCrit) ?? null;
const halving = (actor) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.halfDamage);
const zeroing = (actor) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.noDamage);
const blocking = (actor) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.shieldBlock);

export function setUpHalfDamage() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Laurel of the Empath won't halve.`);
    damage.onApply({ module: MODULE_ID, name: "half-damage", before });
    damage.onApply({ module: MODULE_ID, name: "no-damage", before: beforeNoDamage });
    damage.onApply({ module: MODULE_ID, name: "reduce-critical", before: beforeCritical });
    damage.onApply({ module: MODULE_ID, name: "shield-block", before: beforeShieldBlock });
}

// (bonus.shieldBlock, Arrow-Catching Shield's and Lodestone Shield's "If it hits, you gain the effects of the Shield Block reaction": the damage of the
// Strike it took applied as PF2e's Shield Block — applyDamage's shieldBlockRequest, its raised shield's Hardness off and the shield damaged, as
// PF2e's own damage card's Shield Block button does. The damage spends the Effect, scripts/fortune.js.)
export function beforeShieldBlock(actor, params) {
    if (!blocking(actor) || !params?.damage || params.shieldBlockRequest) return null;
    return { params: { ...params, shieldBlockRequest: true } };
}

// How much comes off a critical hit's total: the value, at most half of it.
export const criticalCut = (total, value) => Math.max(0, Math.min(Number(value) || 0, Math.floor((Number(total) || 0) / 2)));

export function beforeCritical(actor, params) {
    const effect = cutting(actor);
    if (!effect || !params?.damage) return null;
    const { value } = effect.flags[MODULE_ID][MODULE_KEY].reduceCrit;
    if (typeof params.damage === "number") {
        const cut = criticalCut(params.damage, value);
        return cut ? { params: { ...params, damage: params.damage - cut } } : null;
    }
    const degree = params.damage.options?.degreeOfSuccess;
    if ((degree !== undefined && degree !== 3) || typeof params.damage.alter !== "function") return null;
    const cut = criticalCut(params.damage.total, value);
    return cut ? { params: { ...params, damage: params.damage.alter(1, -cut) } } : null;
}

// (None of the damage the readied Effect is against: 0, as a number.)
export function beforeNoDamage(actor, params) {
    if (!zeroing(actor) || params?.damage === undefined || params?.damage === null || params.damage === 0) return null;
    return { params: { ...params, damage: 0 } };
}

export function before(actor, params) {
    if (!halving(actor) || !params?.damage) return null;
    if (typeof params.damage === "number") return params.damage > 0 ? { params: { ...params, damage: Math.floor(params.damage / 2) } } : null;
    if (typeof params.damage.alter !== "function") return null;
    return { params: { ...params, damage: params.damage.alter(0.5, 0) } };
}
