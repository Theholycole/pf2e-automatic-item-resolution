// Live play for plan.pauseItem (src/compiler/creature-readings.js, Horns of Naraga's "You don't receive any of the helm's other benefits while
// it is transformed"): as the ability module makes the creature the item becomes, the item is uninvested — PF2e's rules on it (its senses,
// immunity, resistance) off —, the made actors kept on it; once the last of them is gone (dismissed, its time up, slain: the ability module
// deletes its actor), on the active GM's client, it's invested again as it was (src/live/conjured.js pausedAfter).

import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";
import { pausedAfter } from "../src/live/conjured.js";

export const PAUSED = "pausedFor";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const owners = (actor) => (game.users?.filter?.((user) => user.isGM || actor?.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);

// The item (its uuid) and the made creatures ([{ actor }], the ability module's startConjure).
export async function pauseItem(itemUuid, made) {
    const holder = itemUuid ? await fromUuid(itemUuid).catch(() => null) : null;
    const ids = (made ?? []).map((entry) => entry?.actor?.id).filter(Boolean);
    if (!holder?.actor || !ids.length) return;
    const before = holder.getFlag(MODULE_ID, PAUSED);
    await holder.update({ "system.equipped.invested": false, [`flags.${MODULE_ID}.${PAUSED}`]: { actorIds: [...(before?.actorIds ?? []), ...ids], invested: before ? before.invested !== false : holder.system?.equipped?.invested === true } });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: holder.actor }), whisper: owners(holder.actor), content: `<p><strong>${escape(holder.name)}</strong>: transformed, it gives none of its other benefits until it's back (uninvested meanwhile).</p>` });
}

export function setUpPausedItem() {
    Hooks.on("deleteActor", (actor) => {
        const conjured = actor?.flags?.[ABILITY_ID]?.conjured;
        if (!conjured?.itemUuid || !isActiveGM()) return;
        resume(conjured.itemUuid, actor.id).catch((error) => console.error(`${MODULE_ID} | paused item`, error));
    });
}

async function resume(itemUuid, goneId) {
    const holder = await fromUuid(itemUuid).catch(() => null);
    const paused = holder?.getFlag?.(MODULE_ID, PAUSED);
    if (!paused?.actorIds?.includes(goneId)) return;
    const next = pausedAfter(paused, goneId, (id) => Boolean(game.actors?.get(id)));
    if (next.keep) return holder.setFlag(MODULE_ID, PAUSED, next.keep);
    await holder.update({ "system.equipped.invested": next.restore, [`flags.${MODULE_ID}.-=${PAUSED}`]: null });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: holder.actor }), whisper: owners(holder.actor), content: `<p><strong>${escape(holder.name)}</strong>: back as it was${next.restore ? ", invested again" : ""}.</p>` });
}
