// Live play for an Effect that adds to its creature's healing a few times only (src/live/healing-uses.js: Medicinal Hotpot's 1d6+1 more,
// three times — PF2e's own healing-received dice and modifier on the Effect add it). The core's applyDamage listener (its patches.damage.onApply)
// sees each healing PF2e applies to a creature with such an Effect; once it's applied, the Effect's uses left go down by one, and at none
// left the Effect is deleted, said in the chat.

import { afterHealing, isHealing } from "../src/live/healing-uses.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const countedOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => Number(effect.flags?.[MODULE_ID]?.healingUses) > 0);

function before(actor, params) {
    if (!isHealing(params) || !countedOf(actor).length) return null;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        for (const effect of countedOf(live)) {
            const { left, gone } = afterHealing(effect.flags[MODULE_ID].healingUses);
            const name = escape(live.token?.name ?? live.name);
            if (gone) await effect.delete();
            else await effect.setFlag(MODULE_ID, "healingUses", left);
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), content: `<p>${escape(effect.name)}: <strong>${name}</strong>'s extra healing ${gone ? "is used up" : `has ${left} use${left === 1 ? "" : "s"} left`}.</p>` });
        }
    };
}

export function setUpHealingUses() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Medicinal Hotpot's extra healing won't be counted down.`);
    damage.onApply({ module: MODULE_ID, name: "healing-uses", before });
}
