// Live play for an item's essence possessing the creature it hits (2026-10-27, src/compiler/whole-artifacts.js: Crimson Fulcrum Lens's
// second activation): once the ability module's attack card is applied with a hit ("applied" hook, sent on to the active GM's client), the
// lens is no longer invested and is inert (scripts/activations.js refuses it) while the possession lasts — the creature's note Effect of it,
// beside the lens's own Effect of its invested benefits. When that note Effect is gone (ended by whatever removes a possession effect), the
// essence returns: the lens is no longer inert.

import { ABILITY_ID, MODULE_ID, SOCKET, isActiveGM } from "./foundry.js";

const POSSESSED = "possessed";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function possessAfterApplied({ state, targets }) {
    const possession = state?.plan?.possession;
    if (!possession) return null;
    const hit = (targets ?? []).find((target) => ["success", "criticalSuccess"].includes(target.degree));
    if (!hit) return null;
    const lens = possession.itemUuid ? await fromUuid(possession.itemUuid).catch(() => null) : null;
    if (!lens) return null;
    await lens.update({ "system.equipped.invested": false, [`flags.${MODULE_ID}.inert`]: { by: `possession of ${hit.name}` }, [`flags.${MODULE_ID}.${POSSESSED}`]: { actorUuid: hit.actorUuid ?? null, label: possession.label } });
    return ChatMessage.create({ content: `<p><strong>${escape(lens.name)}</strong>: its essence possesses ${escape(hit.name)}. ${escape(lens.actor?.name ?? "Its user")} is no longer invested in it, and it has no magic until the possession ends.</p>` });
}

// A note Effect deleted: the lens it held inert, back.
async function onDeleted(effect) {
    if (!isActiveGM() || effect?.type !== "effect") return;
    const owner = effect.actor;
    for (const actor of game.actors?.contents ?? []) {
        for (const item of actor.items?.contents ?? []) {
            const held = item.getFlag?.(MODULE_ID, POSSESSED);
            if (!held || held.actorUuid !== owner?.uuid || !String(effect.name ?? "").endsWith(`: ${held.label}`)) continue;
            await item.update({ [`flags.${MODULE_ID}.-=inert`]: null, [`flags.${MODULE_ID}.-=${POSSESSED}`]: null });
            await ChatMessage.create({ content: `<p><strong>${escape(item.name)}</strong>: the possession of ${escape(owner?.name ?? "the creature")} ends, and the essence returns to it.</p>` });
        }
    }
}

export function setUpLensPossession() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!payload?.state?.plan?.possession) return;
        const item = payload.state.ability?.uuid ?? payload.state.item?.uuid ?? null;
        const state = { plan: { possession: { ...payload.state.plan.possession, itemUuid: payload.state.plan.possession.itemUuid ?? item } } };
        if (isActiveGM()) possessAfterApplied({ state, targets: payload.targets }).catch((error) => console.error(`${MODULE_ID} | possession`, error));
        else game.socket.emit(SOCKET, { action: "possession", state, targets: (payload.targets ?? []).map((target) => ({ actorUuid: target.actorUuid, name: target.name, degree: target.degree })), userId: game.user.id });
    });
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "possession" || !isActiveGM()) return;
        possessAfterApplied({ state: data.state, targets: data.targets }).catch((error) => console.error(`${MODULE_ID} | possession`, error));
    });
    Hooks.on("deleteItem", (item) => {
        onDeleted(item).catch((error) => console.error(`${MODULE_ID} | possession`, error));
    });
}
