// Live play for a consumable used in one of several ways (src/compiler/ways.js, src/live/ways-card.js): the card after its Use;
// "Use it" posts the picked way's own card through postCardFor (scripts/live.js), named for that way, its text that way's block.

import { createWaysCard, waysCardHTML } from "../src/live/ways-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

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
    await postCardFor({ message: null, plan: way.plan, used, actor, token });
    const next = { ...state, choice: index, results: [...state.results, `${way.name}: its card.`] };
    return message.update({ content: waysCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
