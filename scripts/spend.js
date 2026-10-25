// What an item's use costs its user (src/compiler/spend.js, plan.spend): a Mythic Point, or a Hero Point instead under the world setting
// (the user's answer of 2026-10-19). Checked before the card applies — none, and the card refuses — and spent once it has, with a line in
// the chat for it.

import { poolAfter } from "../src/live/focus-card.js";
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

// A spell slot it costs (src/compiler/slot-cost.js): { min } the lowest its user has left at that rank or above, { rank } that rank's —
// a prepared entry's first prepared spell not yet expended, or a spontaneous (or flexible) entry's slot left. → { entry, rank, at } or null.
export function slotOf(actor, spellSlot) {
    if (!actor || !spellSlot) return null;
    const entries = (actor.itemTypes?.spellcastingEntry ?? []).filter((entry) => ["prepared", "spontaneous"].includes(entry.system?.prepared?.value));
    const ranks = Number.isInteger(spellSlot.rank) ? [spellSlot.rank] : Array.from({ length: 11 - (Number(spellSlot.min) || 1) }, (unused, index) => (Number(spellSlot.min) || 1) + index);
    for (const rank of ranks) {
        for (const entry of entries) {
            const slot = entry.system?.slots?.[`slot${rank}`];
            if (!slot || !(Number(slot.max) > 0)) continue;
            const prepared = entry.system.prepared.value === "prepared" && !entry.system.prepared.flexible;
            if (prepared) {
                const at = (slot.prepared ?? []).findIndex((entryOf) => entryOf?.id && !entryOf.expended);
                if (at >= 0) return { entry, rank, at };
            } else if (Number(slot.value) > 0) return { entry, rank, at: null };
        }
    }
    return null;
}
const slotWords = (spellSlot) => (Number.isInteger(spellSlot.rank) ? `a rank ${spellSlot.rank} spell slot` : `a spell slot of rank ${spellSlot.min} or higher`);

// Before the card applies: the user can pay, or an Error saying they can't.
export function checkSpend(actor, spend, itemName) {
    if (spend?.spellSlot) {
        if (!actor) throw new Error(`${itemName}: its user isn't there to spend a spell slot.`);
        if (!slotOf(actor, spend.spellSlot)) throw new Error(`${itemName}: ${actor.name} has no ${slotWords(spend.spellSlot).replace(/^a /, "")} left.`);
    }
    const amount = amountOf(spend);
    if (!amount) return;
    const { key, word } = costResource();
    if (!actor) throw new Error(`${itemName}: its user isn't there to spend a ${word}.`);
    if (pointsOf(actor, key) < amount) throw new Error(`${itemName}: ${actor.name} has no ${word} to spend.`);
}

// Once it has: the point spent, said in the chat.
export async function paySpend(actor, spend, itemName) {
    // (A spell slot: the prepared spell expended, or one fewer slot left.)
    if (spend?.spellSlot && actor) {
        const found = slotOf(actor, spend.spellSlot);
        if (found) {
            const path = `system.slots.slot${found.rank}`;
            const slot = found.entry.system.slots[`slot${found.rank}`];
            if (found.at === null) await found.entry.update({ [`${path}.value`]: Math.max(0, Number(slot.value) - 1) });
            else {
                const prepared = structuredClone(slot.prepared);
                prepared[found.at] = { ...prepared[found.at], expended: true };
                await found.entry.update({ [`${path}.prepared`]: prepared });
            }
            await ChatMessage.create({ content: `<p><strong>${escape(itemName)}</strong>: ${escape(actor.name)} spends a rank ${found.rank} spell slot (${escape(found.entry.name)}).</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
        }
    }
    const amount = amountOf(spend);
    if (!amount || !actor) return null;
    const { key, word } = costResource();
    const left = Math.max(0, pointsOf(actor, key) - amount);
    await actor.update({ [`system.resources.${key}.value`]: left });
    return ChatMessage.create({ content: `<p><strong>${escape(itemName)}</strong>: ${escape(actor.name)} spends ${amount} ${word}${amount > 1 ? "s" : ""} (${left} left).</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
}

// A Mythic Point it gives back once its card applies (src/compiler/reduce.js readRegain, plan.item.regain: Preordained Spear's), up to its user's
// maximum — a Hero Point under the world setting, as its costs are paid. Said in the chat.
export async function payRegain(actor, regain, itemName) {
    const amount = Number(regain?.mythicPoints) || 0;
    if (!amount || !actor) return null;
    const { key, word } = costResource();
    const after = poolAfter(actor.system?.resources?.[key], amount);
    const said = after.reason === "no-pool" ? `${actor.name} can't have ${word}s: none regained.` : after.reason === "full" ? `${actor.name}'s ${word}s are full (${after.value} of ${after.max}): none regained.` : `${actor.name} regains ${after.gained} ${word}${after.gained === 1 ? "" : "s"} (${after.value} of ${after.max}).`;
    if (!after.reason) await actor.update({ [`system.resources.${key}.value`]: after.value });
    return ChatMessage.create({ content: `<p><strong>${escape(itemName)}</strong>: ${escape(said)}</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
}
