// Live play for a consumable used in one of several ways (src/compiler/ways.js, src/live/ways-card.js): the card after its Use;
// "Use it" posts the picked way's own card through postCardFor (scripts/live.js), named for that way, its text that way's block.

import { createWaysCard, waysCardHTML } from "../src/live/ways-card.js";
import { FLAG, MODULE_ID, encounterOf, entryOf, stateOf } from "./foundry.js";
import { frequencyText, overLimit, perWord, usesNow, withUse } from "../src/live/activations-card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
// (scripts/activations.js's flag of each activation's uses: not imported, as that module reaches this one.)
const USES = "activationUses";

async function countWay(itemUuid, key, frequency, name) {
    const holder = await fromUuid(itemUuid).catch(() => null);
    if (!holder?.actor) return;
    const record = holder.getFlag(MODULE_ID, USES) ?? {};
    const at = { worldTime: Number(game.time?.worldTime) || 0, combatId: encounterOf(holder.actor)?.combat?.id ?? null };
    if (overLimit(record, key, frequency, at)) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: holder.actor }), whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(name)}</strong>: used again, though it's ${frequencyText(frequency)} (used ${usesNow(record, key, frequency, at)} this ${perWord(frequency)}). The GM's call.</p>` });
    await holder.setFlag(MODULE_ID, USES, withUse(record, key, frequency, at));
}

export async function postWaysCard({ message, plan, used, actor, token }) {
    const state = createWaysCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, data: used.data }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: waysCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// choices: { choice } (the way). postCardFor: scripts/live.js's, passed in.
export async function applyWaysCard(message, { choice = null } = {}, postCardFor) {
    const state = stateOf(message);
    if (!state || state.kind !== "ways" || state.status !== "open") return null;
    const index = Number.isInteger(choice) && state.plan.ways[choice] ? choice : state.choice ?? 0;
    const way = state.plan.ways[index];
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const token = state.user.tokenUuid ? (await fromUuid(state.user.tokenUuid).catch(() => null))?.object ?? null : actor.getActiveTokens?.(true)?.[0] ?? null;
    const data = state.item.data ?? { name: state.item.name, system: {} };
    const used = { data: { ...data, name: `${state.item.name} (${way.name})`, system: { ...(data.system ?? {}), description: { value: way.html } } }, actor };
    // (A way used so often, Hunter's Dawn's Locate once a day: its own uses on the item, as an activation's are — the GM warned past them.)
    if (way.frequency?.max && state.item.uuid) await countWay(state.item.uuid, `${way.plan?.item?.activation?.index ?? 0}:${index}`, way.frequency, `${state.item.name} (${way.name})`);
    await postCardFor({ message: null, plan: way.plan, used, actor, token });
    // (Used once, a snare's crafted choice: closed.)
    const next = { ...state, choice: index, ...(state.plan.once ? { status: "applied" } : {}), results: [...state.results, `${way.name}: ${way.plan.builtin === "zone" ? "placed" : "its card"}.`] };
    return message.update({ content: waysCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
