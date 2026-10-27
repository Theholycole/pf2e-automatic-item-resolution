// Live play for bonus.healAfter (src/compiler/readied-bonus.js: Crown of the Fire Eater's "Just after taking any remaining fire damage, you regain a
// number of Hit Points equal to 15 or the fire damage dealt by the triggering attack before damage resistance, whichever is less"). The core's
// applyDamage listener (its patches.damage.onApply) sees the damage before PF2e applies it: on a creature with that readied Effect
// (src/live/fortune-card.js, flagged healAfter), the damage's own instances of that type, before resistance, are counted; once PF2e has applied
// it, the creature is healed through PF2e by the lower of that and the most. The Effect is spent by the damage, as one with resistance is
// (scripts/fortune.js).

import { MODULE_KEY } from "../src/live/fortune-card.js";
import { CORE_ID, MODULE_ID, healCreature } from "./foundry.js";

const healing = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.healAfter) ?? null;

// The damage of a type in a damage PF2e applies, before resistance: its roll's instances of that type (a number has none).
export const damageOfType = (damage, type) => (damage?.instances ?? []).filter((instance) => String(instance.type ?? "").toLowerCase() === type).reduce((sum, instance) => sum + (Number(instance.total) || 0), 0);

export function setUpHealAfter() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Crown of the Fire Eater won't heal.`);
    damage.onApply({ module: MODULE_ID, name: "heal-after", before });
}

export function before(actor, params) {
    const effect = healing(actor);
    if (!effect || !params?.damage) return null;
    const { type, max } = effect.flags[MODULE_ID][MODULE_KEY].healAfter;
    const amount = Math.min(max, damageOfType(params.damage, type));
    if (!(amount > 0)) return null;
    const name = effect.flags[MODULE_ID][MODULE_KEY].item?.name ?? effect.name;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        const token = live.token ?? live.getActiveTokens?.(true, true)?.[0]?.document ?? null;
        const line = await healCreature({ token, actor: live }, live.token?.name ?? live.name, amount);
        if (line) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), content: `<p><strong>${name}</strong>: ${line} (from its ${type} damage).</p>` });
    };
}
