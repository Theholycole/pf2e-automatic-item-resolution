// Live play for plan.possess (src/compiler/possession.js: the fulcrum lenses' — Crimson's, Emerald's, Ochre's — "On a hit, you force the splinter
// of Nhimbaloth's essence from the lens to possess the target. You're no longer invested in the lens … The lens doesn't have any magical
// abilities until the possession effect ends"). Once the ability module's card at the creature is applied with a hit (its "applied" hook; on a
// player's client, sent on to the active GM's), the item is uninvested and flagged as possessing, and its user loses the lens's own Effect
// (possess.effect), which the creature hit has now; its activations are refused meanwhile (scripts/activations.js). Once the possessed
// creature's Effect with that RollOption is deleted, the flag goes and the creature's Effect of the lens with it: the essence is back, its
// user may invest the lens again. (2026-10-28: one mechanism for the three lenses — scripts/lens-possession.js and scripts/uninvest.js were
// Crimson's and Ochre's.)

import { ABILITY_ID, MODULE_ID, SOCKET, isActiveGM } from "./foundry.js";

export const POSSESSING = "possessing";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const sourceOf = (effect) => effect?._stats?.compendiumSource ?? effect?.flags?.core?.sourceId ?? null;

// The creature its card hit, of the degrees it's for: { degrees } and [{ degree }] → that target, or null. Pure.
export const possessedBy = (possess, targets) => (possess ? (targets ?? []).find((target) => (possess.degrees ?? ["success", "criticalSuccess"]).includes(target.degree)) ?? null : null);

// The card applied: { state, targets } → the line posted, or null.
export async function possessOnHit({ state, targets }) {
    const possess = state?.plan?.possess;
    const hit = possessedBy(possess, targets);
    if (!hit || !state.ability?.uuid) return null;
    const item = await fromUuid(state.ability.uuid).catch(() => null);
    const user = item?.actor ?? (state.source?.actorUuid ? await fromUuid(state.source.actorUuid).catch(() => null) : null);
    if (!item || !user) return null;
    await item.update({ "system.equipped.invested": false, [`flags.${MODULE_ID}.${POSSESSING}`]: { actorUuid: hit.actorUuid ?? null, option: possess.option, effect: possess.effect ?? null } });
    // (Its own Effect, from the compendium: gone from its user — the creature hit has it now.)
    const own = possess.effect ? (user.itemTypes?.effect ?? []).filter((effect) => sourceOf(effect) === possess.effect).map((effect) => effect.id) : [];
    if (own.length) await user.deleteEmbeddedDocuments("Item", own);
    const line = `its essence possesses ${hit.name ?? "another creature"}: ${user.name} is no longer invested in it${own.length ? ", its benefits gone," : ""} and it has no magic until that ends.`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user }), content: `<p><strong>${escape(item.name)}</strong>: ${escape(line)}</p>` });
    return line;
}

// A possessed creature's Effect deleted: the lens possessing it, back — and the creature's Effect of the lens gone.
export async function possessionEnded(effect) {
    const option = (effect?.system?.rules ?? []).find((rule) => rule?.key === "RollOption" && String(rule.option ?? "").startsWith("air-possessed-by:"))?.option;
    if (!option) return [];
    const back = [];
    for (const actor of game.actors ?? []) for (const item of actor.items ?? []) {
        const flag = item.getFlag?.(MODULE_ID, POSSESSING);
        if (flag?.option !== option || flag.actorUuid !== effect.parent?.uuid) continue;
        await item.unsetFlag(MODULE_ID, POSSESSING);
        const lent = flag.effect ? (effect.parent?.itemTypes?.effect ?? []).filter((entry) => sourceOf(entry) === flag.effect).map((entry) => entry.id) : [];
        if (lent.length) await effect.parent.deleteEmbeddedDocuments("Item", lent).catch(() => null);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(item.name)}</strong>: the possession has ended, and its essence is back (${escape(actor.name)} may invest it again).</p>` });
        back.push(item);
    }
    return back;
}

export function setUpPossession() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!payload?.state?.plan?.possess) return;
        if (game.user.isGM) possessOnHit(payload).catch((error) => console.error(`${MODULE_ID} | possession`, error));
        else game.socket.emit(SOCKET, { action: "possession", state: { plan: { possess: payload.state.plan.possess }, ability: payload.state.ability, source: payload.state.source }, targets: (payload.targets ?? []).map((target) => ({ actorUuid: target.actorUuid, name: target.name, degree: target.degree })), userId: game.user.id });
    });
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "possession" || !isActiveGM()) return;
        possessOnHit({ state: data.state, targets: data.targets }).catch((error) => console.error(`${MODULE_ID} | possession`, error));
    });
    Hooks.on("deleteItem", (effect) => {
        if (!isActiveGM() || effect?.type !== "effect") return;
        possessionEnded(effect).catch((error) => console.error(`${MODULE_ID} | possession`, error));
    });
}
