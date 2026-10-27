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

// A RollTable it links (Rod of Wonder's): Foundry's draw, its chat message the table's own; the row drawn → { text, plan? }, its words
// compiled as the item's use (compileRow: scripts/live.js's compiler, passed in).
// (Exported for the Deck of Many Things' draws, scripts/deck.js — 2026-10-27.)
export async function drawLinked(state, compileRow) {
    const table = await fromUuid(state.plan.table.uuid).catch(() => null);
    if (!table?.draw) throw new Error(`${state.item.name}'s ${state.plan.table.name} table isn't there: roll it by hand.`);
    const { results = [] } = await table.draw({ displayChat: true });
    const result = results[0];
    // (A row that's a document — a spell the table links: its cast at the target; else the row's words.)
    const linked = result?.documentUuid ?? (result?.documentCollection && result?.documentId ? `Compendium.${result.documentCollection}.Item.${result.documentId}` : null);
    // (Foundry's deprecated text getter gives a document row's name: its description is what says whether it has words of its own.)
    const html = linked && /\.Item\./.test(linked) && !result?.description ? `The item casts @UUID[${linked}]{${result.name}} at the target.` : String(result?.description || result?.text || result?.name || "");
    const read = html ? compileRow?.(html) : null;
    const playable = read && !read.noteOnly && read.builtin !== "no-effect" ? read : null;
    // (A spell drawn: at the item's own DC and spell attack, the table's.)
    const plan = playable?.builtin === "cast-spell" && state.plan.table.dc ? { ...playable, dc: playable.dc ?? state.plan.table.dc, attack: playable.attack ?? state.plan.table.attack ?? null } : playable;
    const text = html.replace(/\[\[\/\w+ ([^\]]*?)(?: #[^\]]*)?\]\](?:\{([^}]*)\})?/g, (all, formula, label) => label ?? formula).replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { text: text || "(an empty row)", ...(plan ? { plan } : {}) };
}

// postCardFor: scripts/live.js's, passed in. total: a given roll (a harness's), else the die is rolled. compileRow: for a RollTable's row.
export async function applyTableCard(message, { total = null } = {}, postCardFor, compileRow = null) {
    const state = stateOf(message);
    if (!state || state.kind !== "table" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const token = state.user.tokenUuid ? (await fromUuid(state.user.tokenUuid).catch(() => null))?.object ?? null : actor.getActiveTokens?.(true)?.[0] ?? null;
    if (state.plan.table.uuid) {
        const drawn = await drawLinked(state, compileRow);
        const lines = [`Drawn: ${drawn.text}`];
        if (drawn.plan) {
            const data = state.item.data ?? { name: state.item.name, system: {} };
            await postCardFor({ message: null, plan: drawn.plan, used: { data: { ...data, name: `${state.item.name} (${state.plan.table.name})`, system: { ...(data.system ?? {}), description: { value: `<p>${drawn.text}</p>` } } }, actor }, actor, token });
            lines.push("Its card follows.");
        } else lines.push("The GM resolves it.");
        const next = { ...state, status: "applied", results: lines };
        return message.update({ content: tableCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
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
