// Live play for an activation that sets one of the item's own PF2e toggles (src/live/toggle-card.js): the card picks the
// way, and Set has PF2e switch the item's RollOption to it (actor.toggleRollOption), on the active GM's client.

import { createToggleCard, toggleCardHTML, toggleRequest } from "../src/live/toggle-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

// The ways' names as PF2e shows them: its localized suboption labels, else the plan's.
function wayNames(plan, item) {
    const rules = item?.system?.rules ?? [];
    return plan.modes.map((mode) => {
        const rule = rules.find((entry) => entry?.key === "RollOption" && entry.option === mode.plan.option);
        const label = rule?.suboptions?.find?.((entry) => entry?.value === mode.plan.suboption)?.label;
        return label ? game.i18n?.localize?.(label) ?? label : mode.name;
    });
}

export async function postToggleCard({ message, plan, used, actor, token }) {
    const state = createToggleCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor), names: wayNames(plan, used.data) });
    return ChatMessage.create({ content: toggleCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// choice: the way picked.
export async function applyToggleCard(message, { choice = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "toggle" || state.status !== "open") return null;
    if (Number.isInteger(choice) && state.ways[choice]) state = { ...state, choice };
    const item = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    const actor = item?.actor ?? null;
    if (!actor) throw new Error(`${state.item.name} isn't on a creature any more.`);
    const request = toggleRequest(state, { rules: item.system?.rules ?? [], itemId: item.id });
    // (PF2e finds the toggle among the actor's active rules: a weapon not wielded, an item not invested, has none — null.)
    const done = await actor.toggleRollOption(request.domain, request.option, request.itemId, request.value, request.suboption);
    if (done === null || done === undefined) throw new Error(`PF2e has no active toggle for ${item.name}: wield, wear or invest it first.`);
    const next = { ...state, status: "applied", results: [`${actor.name}: ${item.name} set to ${request.name}.`] };
    return message.update({ content: toggleCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
