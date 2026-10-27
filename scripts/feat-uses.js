// Live play for one more use of a feat its user just used (src/live/feat-use-card.js: Ancestral Embrace): the card lists its user's feats of
// that kind with spent uses a day; Give, on the active GM's client, has PF2e's frequency count of the one picked go one up.

import { createFeatUseCard, featUseCardHTML, oneMoreUse, spentFeats } from "../src/live/feat-use-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

export async function postFeatUseCard({ message, plan, used, actor, token }) {
    const feats = spentFeats(plan.featUse, actor?.itemTypes?.feat ?? []);
    const state = createFeatUseCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), feats });
    return ChatMessage.create({ content: featUseCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// pick: the feat's index on the card.
export async function applyFeatUseCard(message, { pick = 0 } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "feat-use" || state.status !== "open") return null;
    const user = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!user) throw new Error(`${state.user.name} isn't there any more.`);
    const listed = state.feats[Number.isInteger(pick) ? pick : 0];
    // (As the feat is now, not as the card listed it.)
    const now = listed ? spentFeats(state.plan.featUse, user.itemTypes?.feat ?? []).find((feat) => feat.id === listed.id) : null;
    const more = oneMoreUse(now, user.name);
    if (!more) throw new Error(listed ? `${user.name}'s ${listed.name} has all its uses today.` : `${user.name} has no such feat to pick.`);
    await user.items.get(now.id)?.update({ "system.frequency.value": more.value });
    const next = { ...state, pick, status: "applied", results: [more.line] };
    return message.update({ content: featUseCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
