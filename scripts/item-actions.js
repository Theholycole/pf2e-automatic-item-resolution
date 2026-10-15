// Live play for an item used by taking a skill action with it (src/compiler/item-actions.js, src/live/action-card.js):
// Apply, on the active GM's client, rolls PF2e's own action for the item's user (game.pf2e.actions.get(slug).use, as the
// spell module rolls its maneuvers), the item's bonus a PF2e Modifier on it, at the creature the presser targeted; then
// the ability module's row for that action and degree goes on the target (scripts/foundry.js applyRiders).

import { actionCardHTML, actionText, createActionCard, outcomeText } from "../src/live/action-card.js";
import { FLAG, MODULE_ID, applyRiders, entryOf, stateOf } from "./foundry.js";

const sluggify = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function postActionCard({ message, plan, used, actor, token }) {
    const state = createActionCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: actionCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// targets: the token uuids the presser had targeted.
export async function applyActionCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "item-action" || state.status !== "open") return null;
    const action = state.plan.action;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const targetToken = action.targeted && Array.isArray(targets) && targets[0] ? await fromUuid(targets[0]).catch(() => null) : null;
    if (action.targeted && !targetToken?.actor) throw new Error("Target the creature first.");
    const pf2eAction = game.pf2e?.actions?.get?.(action.slug);
    if (!pf2eAction?.use) throw new Error(`PF2e has no ${action.name} action here; roll it by hand.`);
    const Modifier = game.pf2e?.Modifier;
    const modifiers = action.bonus && Modifier ? [new Modifier({ label: state.item.name, slug: sluggify(state.item.name), modifier: action.bonus.value, type: action.bonus.type })] : [];
    // (No roll dialog on the GM's client: the GM is rolling the user's check.)
    const event = typeof KeyboardEvent === "function" ? new KeyboardEvent("keydown", { shiftKey: game.user.settings?.showCheckDialogs !== false }) : undefined;
    const results = await pf2eAction.use({ actors: [actor], ...(targetToken ? { target: targetToken.object ?? targetToken.actor } : {}), modifiers, ...(event ? { event } : {}) });
    const outcome = results?.[0]?.outcome ?? null;
    const lines = [];
    if (!outcome) lines.push(`${actionText(action)}: no result (cancelled).`);
    else {
        lines.push(`${state.user.name}'s ${action.name}${targetToken ? ` against ${targetToken.name ?? targetToken.actor.name}` : ""}: ${outcomeText(outcome)}.`);
        if (action.basic && targetToken) lines.push(...(await applyRiders({ plan: action.basic, degree: outcome, user: state.user, target: entryOf(targetToken.object ?? targetToken, targetToken.actor), item: state.item })));
    }
    const next = { ...state, status: outcome ? "applied" : "open", results: [...state.results, ...lines].slice(-6) };
    return message.update({ content: actionCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
