// Live play for plan.uninvest (src/compiler/legend-readings.js, 2026-10-27: Ochre Fulcrum Lens' possession, "You're no longer invested in the
// lens"): once the ability module's card at the creature is applied (its "applied" hook, on the GM's client) and a creature's degree is one it's
// for — a hit —, the item's user is no longer invested in it (PF2e's invested flag off) and loses the item's own PF2e Effect, which the creature
// hit now has instead.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Whether the card's results are ones it's for: { degrees } and [{ degree }]. Pure.
export const uninvests = (uninvest, targets) => Boolean(uninvest) && (targets ?? []).some((target) => (uninvest.degrees ?? ["success", "criticalSuccess"]).includes(target.degree));

export function setUpUninvest() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        uninvestOnHit(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | uninvest`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, degree }] } → the line posted, or null.
export async function uninvestOnHit({ state, targets }) {
    const uninvest = state?.plan?.uninvest;
    if (!uninvests(uninvest, targets)) return null;
    const user = state.source?.actorUuid ? await fromUuid(state.source.actorUuid).catch(() => null) : null;
    const item = state.ability?.uuid ? await fromUuid(state.ability.uuid).catch(() => null) : null;
    if (!user) return null;
    if (item?.system?.equipped?.invested) await item.update({ "system.equipped.invested": false });
    // (Its own Effect, from the compendium: gone from its user.)
    const own = (user.itemTypes?.effect ?? []).filter((effect) => (effect._stats?.compendiumSource ?? effect.flags?.core?.sourceId) === uninvest.effect).map((effect) => effect.id);
    if (own.length) await user.deleteEmbeddedDocuments("Item", own);
    const line = `${user.name} is no longer invested in ${item?.name ?? state.ability?.name ?? "the item"}${own.length ? ", its benefits gone" : ""}.`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user }), content: `<p><strong>${escape(state.ability?.name ?? "The item")}</strong>: ${escape(line)}</p>` });
    return line;
}
