// Live play for an item whose effect is a roll on its own table (src/compiler/random-table.js, src/live/table-card.js): Roll, on the
// active GM's client, rolls the die (a chat message of its own) and finds the row; that row's own card follows through postCardFor
// (scripts/live.js), named for the row, or — a row nothing reads — its words for the GM on the card.

import { rowFor } from "../src/compiler/random-table.js";
import { createTableCard, tableCardHTML } from "../src/live/table-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

export async function postTableCard({ message, plan, used, actor, token }) {
    const state = createTableCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, data: used.data }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: tableCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// postCardFor: scripts/live.js's, passed in. total: a given roll (a harness's), else the die is rolled.
export async function applyTableCard(message, { total = null } = {}, postCardFor) {
    const state = stateOf(message);
    if (!state || state.kind !== "table" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const token = state.user.tokenUuid ? (await fromUuid(state.user.tokenUuid).catch(() => null))?.object ?? null : actor.getActiveTokens?.(true)?.[0] ?? null;
    let rolled = total === null || total === undefined || total === "" ? NaN : Number(total);
    if (!Number.isFinite(rolled)) {
        const roll = await new Roll(state.plan.table.die).evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: its table` });
        rolled = roll.total;
    }
    const row = rowFor(state.plan.table, rolled);
    if (!row) throw new Error(`No row of ${state.item.name}'s table for ${rolled}.`);
    const span = row.low === row.high ? `${row.low}` : `${row.low}–${row.high}`;
    const lines = [`${rolled}: ${row.text}`];
    if (row.plan) {
        const data = state.item.data ?? { name: state.item.name, system: {} };
        const used = { data: { ...data, name: `${state.item.name} (${span})`, system: { ...(data.system ?? {}), description: { value: `<p>${row.text}</p>` } } }, actor };
        await postCardFor({ message: null, plan: row.plan, used, actor, token });
        lines.push("Its card follows.");
    } else lines.push("The GM resolves it.");
    const next = { ...state, status: "applied", rolled, results: lines };
    return message.update({ content: tableCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
