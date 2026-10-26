// Live play for bonus.shieldShare (src/compiler/readied-bonus.js: Resolute Shield's Stand Firm, "You and the shield each take any remaining
// damage"). The core's applyDamage listener (its patches.damage.onApply) sees the damage before PF2e applies it: on a creature with that
// Effect (src/live/fortune-card.js, its shieldShare the shield's uuid), its Hit Points and temporary Hit Points are noted; after it, what they
// went down by is dealt to the shield's Hit Points as well, and its user's owners and the GM are told.

import { MODULE_KEY } from "../src/live/fortune-card.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const shareOf = (actor) => (actor?.itemTypes?.effect ?? []).map((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.shieldShare).find((share) => share?.uuid) ?? null;
const hpOf = (actor) => Number(actor?.system?.attributes?.hp?.value ?? 0) + Number(actor?.system?.attributes?.hp?.temp ?? 0);

export function setUpShieldShare() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Resolute Shield won't take its share.`);
    damage.onApply({ module: MODULE_ID, name: "shield-share", before });
}

function before(actor) {
    const share = shareOf(actor);
    if (!share) return null;
    const hp = hpOf(actor);
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        const lost = hp - hpOf(live);
        if (!(lost > 0)) return;
        const shield = await fromUuid(share.uuid).catch(() => null);
        if (!shield?.system?.hp) return;
        const left = Math.max(0, Number(shield.system.hp.value ?? 0) - lost);
        await shield.update({ "system.hp.value": left });
        const whisper = (game.users?.filter?.((user) => user.isGM || live.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), whisper, content: `<p><strong>${escape(share.name)}</strong> takes the ${lost} damage that got through too (${left} Hit Points left${left <= Number(shield.system.hp.brokenThreshold ?? 0) ? ", broken" : ""}).</p>` });
    };
}
