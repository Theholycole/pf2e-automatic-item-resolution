// Live play for bonus.halfDamage (src/compiler/readied-bonus.js: Laurel of the Empath's "You take half damage from the triggering attack").
// The core's applyDamage listener (its patches.damage.onApply) sees the damage before PF2e applies it: on a creature with that readied
// Effect (src/live/fortune-card.js, flagged halfDamage), the damage roll is halved by PF2e's own alter(0.5) — a number, rounded down. The
// Effect is then spent by the damage, as one with resistance is (scripts/fortune.js).

import { MODULE_KEY } from "../src/live/fortune-card.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const halving = (actor) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.halfDamage);

export function setUpHalfDamage() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Laurel of the Empath won't halve.`);
    damage.onApply({ module: MODULE_ID, name: "half-damage", before });
}

export function before(actor, params) {
    if (!halving(actor) || !params?.damage) return null;
    if (typeof params.damage === "number") return params.damage > 0 ? { params: { ...params, damage: Math.floor(params.damage / 2) } } : null;
    if (typeof params.damage.alter !== "function") return null;
    return { params: { ...params, damage: params.damage.alter(0.5, 0) } };
}
