// Live play for the objects card (src/compiler/objects.js, src/live/objects-card.js): its user's items it can take, listed when it's posted;
// on the active GM's client, the picked item (or the item itself) updated as PF2e keeps items — into the container (its containerId, stowed),
// out of it into a hand, to a hand (held, its hands as its usage says), worn (Crushing Coils), repaired to its full Hit Points; or a weapon
// made in its user's hand (Boots of the Secret Blade's dagger): PF2e's own, with the text's runes, flagged as the item's — the next one made
// replaces it, or (Necklace of Knives') it goes once it's out of the hand.

import { createObjectsCard, objectsCardHTML } from "../src/live/objects-card.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";

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
    } else if (objects.op === "repair" && objects.amount) {
        // (By an amount, Rust Scrub's 2d4: rolled, up to its maximum.)
        const max = Number(chosen.system?.hp?.max) || 0;
        const before = Number(chosen.system?.hp?.value) || 0;
        const roll = await new Roll(objects.amount).evaluate();
        const after = Math.min(max, before + Math.max(0, roll.total));
        await chosen.update({ "system.hp.value": after });
        line = `${chosen.name} regains ${after - before} Hit Points (rolled ${objects.amount} = ${roll.total}): ${after}/${max}`;
    } else if (objects.op === "repair") {
        const max = Number(chosen.system?.hp?.max) || 0;
        await chosen.update({ "system.hp.value": max });
        line = `${chosen.name} is repaired (${max} Hit Points), no longer broken`;
    } else if (objects.op === "create") {
        // (The last one this item made, gone first when a new one replaces it.)
        const madeBy = (item) => item.flags?.[MODULE_ID]?.made?.by === holder.id;
        const old = objects.replaces ? actor.items.filter(madeBy).map((item) => item.id) : [];
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
        const source = await weaponSource(objects.weapon);
        source.name = `${source.name} (${holder.name})`;
        source.system.runes = { ...(source.system.runes ?? {}), potency: Number(objects.potency) || 0, striking: Number(objects.striking) || 0 };
        source.system.equipped = { ...(source.system.equipped ?? {}), carryType: "held", handsHeld: 1 };
        source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { made: { by: holder.id, from: holder.name, ...(objects.whileHeld ? { whileHeld: true } : {}) } } };
        const [made] = await actor.createEmbeddedDocuments("Item", [source]);
        line = `${made.name} is in ${state.user.name}'s hand${old.length ? ", the last one gone" : ""}: Strike with it`;
    } else throw new Error(`${state.item.name}: nothing to do (${objects.op}).`);
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [line] };
    return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// PF2e's own weapon of that name ("dagger"), as a new item's source.
async function weaponSource(weapon) {
    const pack = game.packs.get("pf2e.equipment-srd");
    const name = String(weapon ?? "").replace(/^./, (letter) => letter.toUpperCase());
    const entry = pack ? (await pack.getIndex()).find((row) => row.name === name && row.type === "weapon") : null;
    if (!entry) throw new Error(`PF2e's ${name} wasn't found.`);
    const source = (await pack.getDocument(entry._id)).toObject();
    delete source._id;
    source._stats = { ...(source._stats ?? {}), compendiumSource: `Compendium.pf2e.equipment-srd.Item.${entry._id}` };
    return source;
}

// (A weapon made to last while it's held, Necklace of Knives': gone once it's out of the hand — dropped, stowed or worn.)
export function setUpMadeWeapons() {
    Hooks.on("updateItem", (item, changes) => {
        if (!isActiveGM() || !item.flags?.[MODULE_ID]?.made?.whileHeld) return;
        const carry = changes?.system?.equipped?.carryType;
        if (carry && carry !== "held") item.delete().catch((error) => console.error(`${MODULE_ID} | a made weapon out of the hand`, error));
    });
}
