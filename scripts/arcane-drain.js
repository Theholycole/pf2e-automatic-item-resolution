// Live play for a creature's spell or slot lost (2026-10-27, src/live/arcane-drain.js: Belimarius's Invidious Halberd's Absorb Arcana): once
// the ability module's save card is applied ("applied" hook, sent on to the active GM's client), each creature whose degree loses one gives up a
// prepared spell of the tradition (expended) or a slot left (one fewer), picked at random from the highest rank it has up to the rank given.

import { drainCandidates, pickDrain } from "../src/live/arcane-drain.js";
import { ABILITY_ID, MODULE_ID, SOCKET, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const entriesOf = (actor) => (actor?.itemTypes?.spellcastingEntry ?? []).map((entry) => ({ id: entry.id, tradition: entry.system?.tradition?.value ?? entry.tradition ?? null, prepared: entry.system?.prepared?.value ?? null, flexible: Boolean(entry.system?.prepared?.flexible), slots: entry.system?.slots ?? {} }));

export async function drainSlot(actor, drain) {
    const pick = pickDrain(drainCandidates(entriesOf(actor), drain), Math.random());
    if (!pick) return `${actor.name} has no ${drain.tradition} spell or slot to lose.`;
    const entry = actor.items.get(pick.entryId);
    const path = `system.slots.slot${pick.rank}`;
    const slot = entry.system.slots[`slot${pick.rank}`];
    if (pick.at === null) {
        await entry.update({ [`${path}.value`]: Math.max(0, Number(slot.value) - 1) });
        return `${actor.name} loses a rank ${pick.rank} ${drain.tradition} spell slot (${entry.name}).`;
    }
    const prepared = structuredClone(slot.prepared);
    prepared[pick.at] = { ...prepared[pick.at], expended: true };
    await entry.update({ [`${path}.prepared`]: prepared });
    const spell = actor.items.get(slot.prepared[pick.at]?.id);
    return `${actor.name} loses ${spell?.name ?? "a prepared spell"} (rank ${pick.rank}, ${entry.name}), as if it had cast it.`;
}

export async function drainAfterApplied({ state, targets }) {
    const drain = state?.plan?.drainSlot;
    if (!drain) return null;
    const lines = [];
    for (const target of (targets ?? []).filter((one) => drain.degrees.includes(one.degree))) {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : target.tokenUuid ? (await fromUuid(target.tokenUuid).catch(() => null))?.actor : null;
        if (actor) lines.push(await drainSlot(actor, drain));
    }
    return lines.length ? ChatMessage.create({ content: `<p><strong>${escape(state.ability?.name ?? "It")}</strong>: ${lines.map(escape).join(" ")}</p>` }) : null;
}

export function setUpArcaneDrain() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!payload?.state?.plan?.drainSlot) return;
        if (isActiveGM()) drainAfterApplied(payload).catch((error) => console.error(`${MODULE_ID} | spell lost`, error));
        else game.socket.emit(SOCKET, { action: "arcane-drain", state: { plan: { drainSlot: payload.state.plan.drainSlot }, ability: { name: payload.state.ability?.name ?? null } }, targets: (payload.targets ?? []).map((target) => ({ tokenUuid: target.tokenUuid, actorUuid: target.actorUuid, name: target.name, degree: target.degree })), userId: game.user.id });
    });
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "arcane-drain" || !isActiveGM()) return;
        drainAfterApplied({ state: data.state, targets: data.targets }).catch((error) => console.error(`${MODULE_ID} | spell lost`, error));
    });
}
