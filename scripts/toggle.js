// Live play for an activation that sets one of the item's own PF2e toggles (src/live/toggle-card.js): the card picks the
// way, and Set has PF2e switch the item's RollOption to it (actor.toggleRollOption), on the active GM's client. One switched
// on for a while (src/compiler/option-on.js: Glacier Hammer's Grow Icicles until the end of the turn, Screaming Pinion's
// Transcendent Shot for its next attack) is kept on the actor (flag optionUntil.<item id>) and switched off then: at PF2e's
// pf2e.endTurn for that creature, or after a damage roll with that item.

import { createToggleCard, toggleCardHTML, toggleRequest } from "../src/live/toggle-card.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";

// The ways' names as PF2e shows them: its localized suboption labels, else the plan's.
function wayNames(plan, item) {
    const rules = item?.system?.rules ?? [];
    return plan.modes.map((mode) => {
        const rule = rules.find((entry) => entry?.key === "RollOption" && entry.option === mode.plan.option);
        const label = rule?.suboptions?.find?.((entry) => entry?.value === mode.plan.suboption)?.label;
        return label ? game.i18n?.localize?.(label) ?? label : mode.name;
    });
}

const UNTIL = "optionUntil";

// The toggles kept on an actor that end now: until "turn-end", or "damage" for that item. Switched off, forgotten.
async function switchOff(actor, ending) {
    const kept = actor?.getFlag?.(MODULE_ID, UNTIL) ?? {};
    for (const [itemId, entry] of Object.entries(kept)) {
        if (!entry || !ending(itemId, entry)) continue;
        await actor.unsetFlag(MODULE_ID, `${UNTIL}.${itemId}`);
        if (actor.items?.get?.(itemId)) await actor.toggleRollOption(entry.domain ?? "all", entry.option, itemId, false).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
    }
}

// PF2e's pf2e.endTurn (combatant): that creature's toggles on until the end of its turn.
export async function togglesAtTurnEnd(combatant) {
    if (!isActiveGM()) return;
    await switchOff(combatant?.actor, (itemId, entry) => entry.until === "turn-end");
}

// A damage roll with an item that keeps its toggle on until then.
export async function togglesAfterDamage(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "damage-roll") return;
    const itemId = String(message.flags.pf2e.origin?.uuid ?? "").split(".").at(-1);
    if (!itemId) return;
    await switchOff(message.actor, (id, entry) => id === itemId && entry.until === "damage");
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
    if (state.plan.until) await actor.setFlag(MODULE_ID, `${UNTIL}.${item.id}`, { option: request.option, domain: request.domain, until: state.plan.until, item: item.name });
    const next = { ...state, status: "applied", results: [`${actor.name}: ${item.name} set to ${request.name}.`] };
    return message.update({ content: toggleCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
