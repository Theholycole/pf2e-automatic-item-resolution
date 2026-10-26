// Live play for the objects card (src/compiler/objects.js, src/live/objects-card.js): its user's items it can take, listed when it's posted;
// on the active GM's client, the picked item (or the item itself) updated as PF2e keeps items — into the container (its containerId, stowed),
// out of it into a hand, to a hand (held, its hands as its usage says), worn (Crushing Coils), repaired to its full Hit Points.

import { createObjectsCard, objectsCardHTML } from "../src/live/objects-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "consumable", "treasure", "ammo", "book"]);
const bulkOf = (item) => Number(item?.system?.bulk?.value ?? 0) || 0;
const fits = (item, objects) => !Number.isFinite(objects.maxBulk) || bulkOf(item) <= objects.maxBulk;
const itemsOf = (actor) => [...(actor?.items ?? [])].filter((item) => PHYSICAL.has(item.type));

// Its user's items the op can take: { id, name }.
export function objectChoices(actor, objects, holderId) {
    if (objects.self) return [];
    const items = itemsOf(actor).filter((item) => item.id !== holderId);
    const held = (item) => item.system?.equipped?.carryType === "held";
    const list = objects.op === "store" ? items.filter((item) => held(item) && fits(item, objects))
        : objects.op === "retrieve" ? items.filter((item) => item.system?.containerId === holderId)
            : objects.op === "hand" ? items.filter((item) => !held(item) && fits(item, objects))
                : objects.op === "repair" ? items.filter((item) => Number(item.system?.hp?.max) > 0 && Number(item.system?.hp?.value) < Number(item.system?.hp?.max) && fits(item, objects))
                    : [];
    return list.map((item) => ({ id: item.id, name: item.name }));
}

export async function postObjectsCard({ message, plan, used, actor, token }) {
    const holderId = String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? used.data._id ?? null;
    const state = createObjectsCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, id: holderId }, user: entryOf(token, actor), choices: objectChoices(actor, plan.objects, holderId) });
    return ChatMessage.create({ content: objectsCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

const handsFor = (item) => (/two-hands/.test(String(item.system?.usage?.value ?? "")) ? 2 : 1);

// On the active GM's client: { pick } → the item updated, the card applied.
export async function applyObjectsCard(message, { pick = 0 } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "objects" || state.status !== "open") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const objects = state.plan.objects;
    const holder = state.item.id ? actor.items.get(state.item.id) : null;
    const chosen = objects.self ? holder : state.choices[Number(pick) || 0] ? actor.items.get(state.choices[Number(pick) || 0].id) : null;
    if (!chosen) throw new Error(objects.self ? `${state.item.name} isn't on ${state.user.name} any more.` : `Pick one of ${state.user.name}'s items first.`);
    // (Still fit for it: the item may have moved since the card was posted.)
    if (!objects.self && !objectChoices(actor, objects, state.item.id).some((choice) => choice.id === chosen.id)) throw new Error(`${chosen.name} can't be taken now.`);
    let line;
    if (objects.op === "store") {
        if (!holder) throw new Error(`${state.item.name} isn't on ${state.user.name} any more.`);
        await chosen.update({ "system.containerId": holder.id, "system.equipped.carryType": "stowed", "system.equipped.handsHeld": 0 });
        line = `${chosen.name} vanishes into ${holder.name}`;
    } else if (objects.op === "retrieve" || objects.op === "hand") {
        await chosen.update({ "system.containerId": null, "system.equipped.carryType": "held", "system.equipped.handsHeld": handsFor(chosen) });
        line = `${chosen.name} is in ${state.user.name}'s ${handsFor(chosen) === 2 ? "hands" : "hand"}`;
    } else if (objects.op === "don") {
        await chosen.update({ "system.containerId": null, "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.handsHeld": 0 });
        line = `${state.user.name} wears ${chosen.name}`;
    } else if (objects.op === "repair") {
        const max = Number(chosen.system?.hp?.max) || 0;
        await chosen.update({ "system.hp.value": max });
        line = `${chosen.name} is repaired (${max} Hit Points), no longer broken`;
    } else throw new Error(`${state.item.name}: nothing to do (${objects.op}).`);
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [line] };
    return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
