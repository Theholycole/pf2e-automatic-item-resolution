// What an item's use costs its user (src/compiler/spend.js, plan.spend): a Mythic Point, or a Hero Point instead under the world setting
// (the user's answer of 2026-10-19). Checked before the card applies — none, and the card refuses — and spent once it has, with a line in
// the chat for it.

import { MODULE_ID } from "./foundry.js";

export const HERO_FOR_MYTHIC = "heroPointsForMythic";

export function registerSpendSettings() {
    game.settings.register(MODULE_ID, HERO_FOR_MYTHIC, {
        name: "Hero Points instead of Mythic Points",
        hint: "Items (and item casts of mythic spells) that cost a Mythic Point spend one of their user's Hero Points instead.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
}

// The resource the costs are paid in: { key (PF2e's system.resources key), word }.
export function costResource() {
    let hero = false;
    try {
        hero = game.settings.get(MODULE_ID, HERO_FOR_MYTHIC) === true;
    } catch {
        hero = false;
    }
    return hero ? { key: "heroPoints", word: "Hero Point" } : { key: "mythicPoints", word: "Mythic Point" };
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const amountOf = (spend) => Number(spend?.mythicPoints) || 0;
const pointsOf = (actor, key) => Number(actor?.system?.resources?.[key]?.value) || 0;

// Before the card applies: the user can pay, or an Error saying they can't.
export function checkSpend(actor, spend, itemName) {
    const amount = amountOf(spend);
    if (!amount) return;
    const { key, word } = costResource();
    if (!actor) throw new Error(`${itemName}: its user isn't there to spend a ${word}.`);
    if (pointsOf(actor, key) < amount) throw new Error(`${itemName}: ${actor.name} has no ${word} to spend.`);
}

// Once it has: the point spent, said in the chat.
export async function paySpend(actor, spend, itemName) {
    const amount = amountOf(spend);
    if (!amount || !actor) return null;
    const { key, word } = costResource();
    const left = Math.max(0, pointsOf(actor, key) - amount);
    await actor.update({ [`system.resources.${key}.value`]: left });
    return ChatMessage.create({ content: `<p><strong>${escape(itemName)}</strong>: ${escape(actor.name)} spends ${amount} ${word}${amount > 1 ? "s" : ""} (${left} left).</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
}
