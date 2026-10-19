// Live play for an item that moves an ally's condition onto its user (src/compiler/take-condition.js, src/live/take-card.js): Take, on the
// active GM's client, finds the targeted ally's PF2e persistent damage of that type, gives its user the same condition (its formula and DC
// as they were) and removes the ally's.

import { createTakeCard, takeCardHTML } from "../src/live/take-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

export async function postTakeCard({ message, plan, used, actor, token }) {
    const state = createTakeCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: takeCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// targets: the token uuids the presser had targeted (the ally).
export async function applyTakeCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "take" || state.status !== "open") return null;
    const take = state.plan.take;
    const user = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!user) throw new Error(`${state.user.name} isn't there any more.`);
    const ally = (await fromUuid(Array.isArray(targets) ? targets[0] ?? "" : "").catch(() => null))?.actor ?? null;
    if (!ally) throw new Error("Target the ally first.");
    if (ally.uuid === user.uuid) throw new Error(`Target an ally, not ${user.name}.`);
    const condition = (ally.itemTypes?.condition ?? []).find((entry) => entry.system?.slug === take.slug && entry.system?.persistent?.damageType === take.damageType);
    if (!condition) throw new Error(`${ally.name} has no persistent ${take.damageType} damage.`);
    const source = condition.toObject();
    delete source._id;
    await user.createEmbeddedDocuments("Item", [source]);
    await ally.deleteEmbeddedDocuments("Item", [condition.id]);
    const formula = condition.system.persistent.formula;
    const next = { ...state, status: "applied", results: [`${ally.name}'s ${formula} persistent ${take.damageType} damage ends; ${user.name} takes it on.`] };
    return message.update({ content: takeCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
