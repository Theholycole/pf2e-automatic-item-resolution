// Live play for plan.item.shieldTemp (src/compiler/shield-temp.js: Ablative Shield Plating). The card plates a shield of its user's — the one
// held, else its only one — with an Effect whose counter is the shield's own temporary Hit Points. When that shield's Hit Points go down
// (PF2e's Shield Block, or by hand), the loss comes off the counter first: the update is lowered as it's made (preUpdateItem, on the client
// making it) and the counter lowered with it, the Effect gone once it's used up, and the user's owners told.

import { shieldTempSource } from "../src/live/card.js";
import { MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const ABSORBED = `${MODULE_ID}.shieldTempAbsorbed`;

// The plating on a shield: its user's Effect for it, not expired.
export const platingOf = (shield) => (shield?.actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.shieldTemp?.shieldId === shield.id && !(effect.isExpired ?? effect.system?.expired)) ?? null;
const left = (plating) => Number(plating?.system?.badge?.value ?? plating?.flags?.[MODULE_ID]?.shieldTemp?.value) || 0;

// The shield its user plates: the one held, else its only one.
export function shieldToPlate(actor) {
    const shields = (actor?.itemTypes?.shield ?? []).filter((shield) => !shield.isDestroyed);
    return actor?.heldShield ?? (shields.length === 1 ? shields[0] : null);
}

// The card's line for its user, the Effect made.
export async function plateShield(state, actor, name) {
    const shieldTemp = state.plan.item.shieldTemp;
    const shield = shieldToPlate(actor);
    if (!shield) return `${name}: hold the shield to plate (${(actor?.itemTypes?.shield ?? []).length ? "more than one shield, none held" : "no shield"})`;
    if (platingOf(shield)) return `${name}: ${shield.name} is plated already`;
    await actor.createEmbeddedDocuments("Item", [shieldTempSource(shieldTemp, { shield: { id: shield.id, name: shield.name }, item: state.item ?? {}, user: state.user ?? {}, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
    return `${name}: ${shield.name} has ${shieldTemp.value} temporary Hit Points of its own for ${shieldTemp.lasts.value} ${shieldTemp.lasts.value === 1 ? shieldTemp.lasts.unit.replace(/s$/, "") : shieldTemp.lasts.unit}`;
}

// (The shield's update as it's made: its loss lowered by what the plating has left.) → the absorbed amount, or 0.
export function absorb(shield, changes, options) {
    if (shield?.type !== "shield" || !shield.actor) return 0;
    const next = foundry.utils.getProperty(changes, "system.hp.value");
    const before = Number(shield._source?.system?.hp?.value);
    if (typeof next !== "number" || !Number.isFinite(before) || next >= before) return 0;
    const plating = platingOf(shield);
    const temp = left(plating);
    if (!temp) return 0;
    const absorbed = Math.min(before - next, temp);
    foundry.utils.setProperty(changes, "system.hp.value", next + absorbed);
    options[ABSORBED] = { platingId: plating.id, absorbed, left: temp - absorbed };
    return absorbed;
}

// (The counter lowered, or the plating gone.)
export async function afterAbsorbed(shield, options) {
    const done = options?.[ABSORBED];
    if (!done) return;
    const plating = shield.actor?.items?.get(done.platingId);
    if (!plating) return;
    if (done.left > 0) await plating.update({ "system.badge.value": done.left });
    else await plating.delete();
    const whisper = (game.users?.filter?.((one) => one.isGM || shield.actor.testUserPermission?.(one, "OWNER")) ?? []).map((one) => one.id);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: shield.actor }), whisper, content: `<p>${escape(plating.name.replace(/: [^:]*$/, ""))} takes ${done.absorbed} of the Hit Points <strong>${escape(shield.name)}</strong> would lose${done.left > 0 ? `; ${done.left} temporary Hit Points left` : ", and falls apart"}.</p>` });
}

// (The counter lowered from the pre-update itself: a loss all absorbed leaves the update nothing to change, and Foundry then makes none — no
// updateItem hook to wait for.)
export function setUpShieldTemp() {
    Hooks.on("preUpdateItem", (item, changes, options) => {
        try {
            if (absorb(item, changes, options)) afterAbsorbed(item, options).catch((error) => console.error(`${MODULE_ID} | shield plating`, error));
        } catch (error) {
            console.error(`${MODULE_ID} | shield plating`, error);
        }
    });
}
