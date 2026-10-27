// Live play for a consumable found for the need at hand (src/live/found-card.js: The Unicorn). Find, on the active GM's client: the GM's pick
// looked up by uuid or by name in PF2e's equipment, checked against the card's limits, and put in its user's inventory flagged with the world
// time it vanishes at (scripts/expiring.js removes it then; used before, PF2e has spent it). Nothing typed: no item, and the activation's use
// given back on its item's record (scripts/activations.js).

import { createFoundCard, foundCardHTML, foundMisfit, vanishesAt } from "../src/live/found-card.js";
import { withoutUse } from "../src/live/activations-card.js";
import { USES, now } from "./activations.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

export async function postFoundCard({ message, plan, used, actor, token }) {
    const state = createFoundCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), level: actor?.level });
    return ChatMessage.create({ content: foundCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// Its source by uuid, or by name from PF2e's equipment (a consumable of that name).
async function pickedSource(words) {
    const said = String(words ?? "").trim();
    if (/^(?:Compendium|Item|Actor)\./.test(said)) return (await fromUuid(said).catch(() => null))?.toObject?.() ?? null;
    const pack = game.packs.get("pf2e.equipment-srd");
    const index = pack ? await pack.getIndex() : [];
    const row = [...index].find((entry) => entry.type === "consumable" && entry.name.toLowerCase() === said.toLowerCase());
    return row ? (await pack.getDocument(row._id))?.toObject?.() ?? null : null;
}

export async function applyFoundCard(message, { name = "" } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "found" || state.status !== "open") return null;
    const user = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!user) throw new Error(`${state.user.name} isn't there any more.`);
    const found = state.plan.found;
    const results = [];
    if (!String(name ?? "").trim()) {
        // (Nothing fits: no use spent.)
        const item = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
        const index = state.plan.item?.activation?.index;
        const frequency = state.plan.trigger?.frequency ?? state.plan.item?.activation?.frequency ?? null;
        if (found.refundsNone && item && index !== undefined && index !== null && frequency?.max) await item.setFlag(MODULE_ID, USES, withoutUse(item.getFlag(MODULE_ID, USES) ?? {}, index, frequency, now(user)));
        results.push(`Nothing fits ${state.user.name}'s need: nothing is found, and ${state.item.name}'s daily use isn't spent.`);
    } else {
        const source = await pickedSource(name);
        if (!source) throw new Error(`No consumable named "${name}" in PF2e's equipment.`);
        const misfit = foundMisfit(source, found, Number(user.level) || state.level);
        if (misfit) throw new Error(misfit);
        delete source._id;
        source.system = { ...(source.system ?? {}), quantity: 1 };
        source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { ...(source.flags?.[MODULE_ID] ?? {}), expiresAt: vanishesAt(found, game.time.worldTime), foundBy: state.item.name } };
        await user.createEmbeddedDocuments("Item", [source]);
        results.push(`${state.user.name} finds ${source.name} inside; it vanishes unless used within ${found.vanish.value} ${found.vanish.value === 1 ? found.vanish.unit.replace(/s$/, "") : found.vanish.unit}.`);
    }
    const next = { ...state, status: "applied", results };
    return message.update({ content: foundCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
