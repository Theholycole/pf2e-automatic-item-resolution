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

// The variant of a PF2e action that has several (Administer First Aid's "stabilize" and "stop-bleeding"): by the target's
// state — dying, stabilize; taking persistent bleed damage, stop it — else the first.
function variantFor(pf2eAction, target) {
    const variants = [...(pf2eAction.variants?.keys?.() ?? [])];
    if (variants.length < 2) return null;
    const bleeding = (target?.itemTypes?.condition ?? []).some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "bleed");
    if (variants.includes("stabilize") && target?.hasCondition?.("dying")) return "stabilize";
    if (variants.includes("stop-bleeding") && bleeding) return "stop-bleeding";
    return variants[0];
}

// Stabilize's DC (Administer First Aid): 5 + the dying creature's recovery DC + its dying value, as PF2e's own macro has it.
function stabilizeDC(target) {
    const dying = target?.system?.attributes?.dying;
    if (!Number(dying?.value)) return null;
    return { value: 5 + (Number(dying.recoveryDC) || 10) + Number(dying.value) };
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
    // (The item's modifier when it's higher than the user's: the difference, on top of the user's own.)
    if (action.minimum && Modifier) {
        const own = Number(actor.getStatistic?.(action.minimum.skill)?.mod ?? actor.skills?.[action.minimum.skill]?.mod);
        if (Number.isFinite(own) && action.minimum.value > own) modifiers.push(new Modifier({ label: `${state.item.name} (+${action.minimum.value})`, slug: sluggify(state.item.name), modifier: action.minimum.value - own, type: "untyped" }));
    }
    // (No roll dialog on the GM's client: the GM is rolling the user's check.)
    const event = typeof KeyboardEvent === "function" ? new KeyboardEvent("keydown", { shiftKey: game.user.settings?.showCheckDialogs !== false }) : undefined;
    const variant = variantFor(pf2eAction, targetToken?.actor ?? null);
    // (PF2e's action-system First Aid has no stabilize DC of its own: the rule's, 5 + the target's recovery DC + its dying value.)
    const difficultyClass = action.slug === "administer-first-aid" && variant === "stabilize" ? stabilizeDC(targetToken?.actor) : null;
    const results = await pf2eAction.use({ actors: [actor], ...(targetToken ? { target: targetToken.object ?? targetToken.actor } : {}), modifiers, ...(variant ? { variant } : {}), ...(difficultyClass ? { difficultyClass } : {}), ...(event ? { event } : {}) });
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
