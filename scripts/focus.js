// Live play for an activation that gives its user a Focus Point (src/compiler/focus.js, src/live/focus-card.js).
// - Apply (the active GM's client): the point is added, up to the pool's maximum. A note Effect says what it's only for,
//   through the ability module's api.live.applyChange.
// - "If not used by the end of your turn, this Focus Point is lost": in a started encounter, the gain is kept on the actor
//   (flag focusGrant), and at the end of that creature's next turn (PF2e's pf2e.endTurn, on the active GM's client) the
//   points still above the pool's old value are taken back. Out of an encounter there's no turn to end: the note says it.

import { createFocusCard, focusCardHTML, focusText, poolAfter, unspent } from "../src/live/focus-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, creatureOf, encounterOf, entryOf, isActiveGM, stateOf } from "./foundry.js";

const GRANT = "focusGrant";
const USER_ID = "source";

export async function postFocusCard({ message, plan, used, actor, token }) {
    const state = createFocusCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: focusCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyFocusCard(message) {
    const state = stateOf(message);
    if (!state || state.kind !== "focus" || state.status !== "open") return null;
    const { actor } = await creatureOf(state.user);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const focus = state.plan.focus;
    const pool = actor.system?.resources?.focus ?? null;
    const after = poolAfter(pool, focus.amount);
    const lines = [];
    if (after.reason === "no-pool") lines.push(`${state.user.name} has no focus pool: nothing gained.`);
    else if (after.reason === "full") lines.push(`${state.user.name}'s focus pool is full (${after.value} of ${after.max}): no Focus Point gained.`);
    else {
        const before = Number(pool.value) || 0;
        await actor.update({ "system.resources.focus.value": after.value });
        lines.push(`${state.user.name} gains ${after.gained} Focus Point${after.gained === 1 ? "" : "s"} (${after.value} of ${after.max})${focus.only ? `, only to ${focus.only}` : ""}.`);
        // (The started encounter the creature is in, whichever one the GM is viewing.)
        const found = focus.lost === "turn-end" ? encounterOf(actor) : null;
        if (found) {
            await actor.setFlag(MODULE_ID, GRANT, { before, gained: after.gained, combatId: found.combat.id, combatantId: found.combatant.id, item: state.item.name });
            lines.push("Unspent at the end of the turn, it's taken back.");
        } else if (focus.lost === "turn-end") lines.push("Not in an encounter: take it back by hand if it isn't spent this turn.");
        // (Its reminder, until the end of the turn when it's lost then, else for the round.)
        const applyChange = game.modules.get(ABILITY_ID)?.api?.live?.applyChange;
        if (applyChange && focus.only) {
            const duration = focus.lost === "turn-end" ? { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } : null;
            const abilityState = { plan: state.plan, ability: { name: state.item.name, uuid: state.item.uuid ?? null }, source: { actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }, targets: [{ id: USER_ID, actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }] };
            await applyChange({ op: "effect", target: USER_ID, effect: { kind: "note", note: { label: "Focus Point", text: focusText(focus), duration } } }, abilityState).catch((error) => lines.push(`Couldn't add its note: ${error.message}`));
        }
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: focusCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// PF2e's pf2e.endTurn (combatant, encounter): that creature's unspent point is lost.
export async function loseUnspentFocus(combatant, encounter) {
    if (!isActiveGM()) return null;
    const actor = combatant?.actor;
    const grant = actor?.getFlag?.(MODULE_ID, GRANT);
    if (!grant) return null;
    await actor.unsetFlag(MODULE_ID, GRANT);
    // (Another encounter's: its turn is gone, nothing to take back now.)
    if (grant.combatId !== encounter?.id) return null;
    const pool = actor.system?.resources?.focus ?? null;
    const lost = unspent(grant, pool);
    if (!lost) return null;
    await actor.update({ "system.resources.focus.value": (Number(pool.value) || 0) - lost });
    const owners = (game.users?.filter?.((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: owners, content: `<p><strong>${grant.item}</strong>: ${actor.name}'s unspent Focus Point is lost at the end of the turn.</p>` });
}
