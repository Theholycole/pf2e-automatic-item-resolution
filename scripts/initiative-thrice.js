// Live play for an initiative rolled three times, the result of its user's choice kept (src/compiler/legend-readings.js, 2026-10-27: The Dance,
// "roll the check three times and take the result of your choice. This is a fortune effect"): an Effect with PF2e's RollOption
// "air-initiative-thrice" on its creature. Once its initiative is set in the encounter (Foundry's updateCombatant, on the active GM's client),
// its latest initiative roll in the chat gives the d20 and the modifier; two more d20s are rolled with that modifier, and the best of the three
// becomes its initiative — its user may set another of them in the tracker instead —, the Effect used up.

import { MODULE_ID, isActiveGM } from "./foundry.js";

export const THRICE = "air-initiative-thrice";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// A creature's Effect that rolls its initiative three times, or null.
export const thriceOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => (effect.system?.rules ?? []).some((rule) => rule?.key === "RollOption" && rule.option === THRICE)) ?? null;

// The first roll's total and d20 and the two more d20s → { totals, best }. Pure.
export function thriceTotals(total, natural, more) {
    const modifier = Number(total) - Number(natural);
    const totals = [Number(total), ...more.map((die) => Number(die) + modifier)];
    return { totals, best: Math.max(...totals) };
}

export function setUpInitiativeThrice() {
    Hooks.on("updateCombatant", (combatant, changes) => {
        if (!isActiveGM() || !Object.hasOwn(changes ?? {}, "initiative") || changes.initiative === null) return;
        rollThrice(combatant).catch((error) => console.error(`${MODULE_ID} | initiative three times`, error));
    });
}

async function rollThrice(combatant) {
    const actor = combatant?.actor;
    const effect = thriceOf(actor);
    if (!effect) return null;
    // (Used up first, so the initiative set below doesn't come back here.)
    await effect.delete();
    const speaker = ChatMessage.getSpeaker({ actor });
    const name = combatant.name ?? actor.name;
    const from = String(effect.name ?? "").replace(/:.*$/, "") || "The item";
    const message = (game.messages?.contents ?? []).slice(-30).reverse().find((entry) => entry.flags?.pf2e?.context?.type === "initiative" && (entry.actor?.id === actor.id || entry.speaker?.actor === actor.id));
    const roll = message?.rolls?.[0];
    const natural = roll?.dice?.[0]?.total;
    if (!roll || !Number.isFinite(Number(natural))) {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(from)}</strong>: ${escape(name)}'s initiative roll wasn't found; roll it twice more and keep the one it picks (by hand).</p>` });
        return null;
    }
    const more = [(await new Roll("1d20").evaluate()).total, (await new Roll("1d20").evaluate()).total];
    const { totals, best } = thriceTotals(roll.total, natural, more);
    if (best !== Number(combatant.initiative)) await combatant.update({ initiative: best });
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(from)}</strong>: ${escape(name)}'s initiative rolled three times (a fortune effect) — ${totals.join(", ")}. ${best} kept; its user may set another of the three in the tracker instead.</p>` });
    return best;
}
