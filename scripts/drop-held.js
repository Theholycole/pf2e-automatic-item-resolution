// Live play for plan.dropHeld (src/compiler/drop-held.js: Deadweight Snare's critical failure drops the metal items its creature holds): once the
// ability module's card for the item has applied (its "applied" hook, on the GM's client), a drop card lists each creature of those degrees and
// what it holds (src/live/drop-card.js). Pressed, the ticked items are dropped as PF2e has it (carried "dropped", no hands).

import { createDropCard, dropCardHTML, looksMetal } from "../src/live/drop-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, stateOf } from "./foundry.js";

export function setUpDropHeld() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        postDropHeld(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | drop held`, error));
    });
}

const heldBy = (actor) => (actor?.items?.contents ?? []).filter((item) => item.system?.equipped?.carryType === "held");

export async function postDropHeld({ state, targets }) {
    const dropHeld = state?.plan?.dropHeld;
    if (!dropHeld) return null;
    const itemName = state.ability?.name ?? state.plan.source?.name ?? "The item";
    const creatures = [];
    for (const target of targets ?? []) {
        if (!dropHeld.degrees.includes(target.degree)) continue;
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor) continue;
        creatures.push({ actorUuid: actor.uuid, tokenUuid: target.tokenUuid ?? null, name: target.name ?? actor.name, held: heldBy(actor).map((item) => ({ id: item.id, name: item.name, metal: looksMetal(item) })) });
    }
    if (!creatures.length) return null;
    const card = createDropCard({ dropHeld, item: { name: itemName, uuid: state.ability?.uuid ?? null }, user: { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? itemName }, creatures });
    return ChatMessage.create({ content: dropCardHTML(card, { canApply: true }), flags: { [MODULE_ID]: { [FLAG]: card } } });
}

// choices: { ticked: ["entry:index", …] } — the boxes ticked on the card (its own ticks when none are sent).
export async function applyDropCard(message, { ticked = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "drop" || state.status !== "open") return null;
    const picked = Array.isArray(ticked) ? new Set(ticked.map(String)) : null;
    const lines = [];
    const entries = [];
    for (const [at, entry] of state.entries.entries()) {
        const actor = await fromUuid(entry.actorUuid).catch(() => null);
        const held = entry.held.map((one, index) => ({ ...one, ticked: picked ? picked.has(`${at}:${index}`) : one.ticked }));
        const dropped = [];
        for (const one of held.filter((candidate) => candidate.ticked)) {
            const item = actor?.items?.get(one.id);
            if (!item || item.system?.equipped?.carryType !== "held") continue;
            await item.update({ "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 });
            dropped.push(one.name);
        }
        lines.push(`${entry.name}: ${dropped.length ? `drops ${dropped.join(", ")}` : "drops nothing"}.`);
        entries.push({ ...entry, held });
    }
    const next = { ...state, entries, status: "applied", results: [...state.results, ...lines].slice(-8) };
    return message.update({ content: dropCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
