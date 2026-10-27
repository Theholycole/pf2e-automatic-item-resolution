// Live play for a bond its user forms with a willing creature (src/live/bond-card.js: The Marriage). Bond, on the active GM's client, with the
// creature targeted next to its user: the item's earlier bond gone from whoever had it, and an Effect for this one on both. Then, when PF2e gives
// the bonded creature one of the bond's conditions (createItem, on the active GM's client), its user gets the counteract card for it
// (scripts/counteract.js): a failure gives its user that condition too (counteract.failCopies), and the bond ends either way (counteract.endsBond).

import { bondCardHTML, bondCounteract, bondEffectSource, bondOf, counteredBy, createBondCard } from "../src/live/bond-card.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { postCounteractAt } from "./counteract.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, spaceOf, stateOf } from "./foundry.js";

export async function postBondCard({ message, plan, used, actor, token }) {
    const state = createBondCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: bondCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// Every actor that may hold a bond: the world's, and the unlinked tokens' on its scenes.
const everyActor = () => [...(game.actors ?? [])].concat([...(game.scenes ?? [])].flatMap((scene) => [...(scene.tokens ?? [])].filter((token) => !token.actorLink && token.actor).map((token) => token.actor)));

// The item's bond Effects wherever they are, gone. → how many.
export async function endBond(itemKey) {
    let ended = 0;
    for (const actor of everyActor()) {
        const ids = (actor.itemTypes?.effect ?? []).filter((effect) => bondOf(effect, MODULE_ID)?.item === itemKey).map((effect) => effect.id);
        if (!ids.length) continue;
        await actor.deleteEmbeddedDocuments("Item", ids);
        ended += ids.length;
    }
    return ended;
}

// targets: the token uuids the presser targeted (the creature to bond).
export async function applyBondCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "bond" || state.status !== "open") return null;
    const bond = state.plan.bond;
    const user = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!user) throw new Error(`${state.user.name} isn't there any more.`);
    const token = await fromUuid(Array.isArray(targets) ? targets[0] ?? "" : "").catch(() => null);
    const other = token?.actor ?? null;
    if (!other) throw new Error("Target the willing creature first.");
    if (other.uuid === user.uuid) throw new Error(`Target another creature, not ${user.name}.`);
    const own = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (own?.object && token.object && canvas?.ready && distanceFeet(spaceOf(own.object), spaceOf(token.object), { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 }) > bond.reach) throw new Error(`${token.name} isn't next to ${state.user.name}.`);
    const key = state.item.uuid ?? state.item.name;
    const ended = await endBond(key);
    const context = { item: state.item, user: state.user, worldTime: game.time.worldTime, moduleId: MODULE_ID };
    await user.createEmbeddedDocuments("Item", [bondEffectSource(bond, { ...context, self: state.user.name, other: token.name, partner: other.uuid, role: "user" })]);
    await other.createEmbeddedDocuments("Item", [bondEffectSource(bond, { ...context, self: token.name, other: state.user.name, partner: user.uuid, role: "partner" })]);
    const results = [`${state.user.name} and ${token.name} are bonded: telepathy within ${bond.telepathy} feet, each aware of the other's direction, distance and conditions.`, ...(ended ? ["The earlier bond ends."] : [])];
    const next = { ...state, status: "applied", results };
    return message.update({ content: bondCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its user's class DC less 10: its best class DC's modifier, as the counteract card reads one.
const classModifierOf = (actor) => {
    const mods = [actor?.classDC?.mod, ...Object.values(actor?.classDCs ?? {}).map((entry) => entry?.mod), Number(actor?.system?.attributes?.classDC?.value) - 10].map(Number).filter(Number.isFinite);
    return mods.length ? Math.max(...mods) : null;
};

export function setUpBonds() {
    Hooks.on("createItem", (item) => {
        if (item?.type !== "condition" || !isActiveGM()) return;
        offerCounter(item).catch((error) => console.error(`${MODULE_ID} | bond counter`, error));
    });
}

async function offerCounter(condition) {
    const actor = condition.actor ?? condition.parent;
    const bond = (actor?.itemTypes?.effect ?? []).map((effect) => bondOf(effect, MODULE_ID)).find((entry) => counteredBy(entry, condition.slug ?? condition.system?.slug));
    if (!bond) return;
    const user = await fromUuid(bond.partner).catch(() => null);
    if (!user) return;
    const holder = (user.itemTypes?.effect ?? []).map((effect) => bondOf(effect, MODULE_ID)).find((entry) => entry?.role === "user" && entry.item === bond.item);
    if (!holder) return;
    const userEntry = holder.user ?? { actorUuid: user.uuid, tokenUuid: null, name: user.name };
    const token = actor.getActiveTokens?.(true)?.[0] ?? null;
    const drinker = token ? entryOf(token, actor) : { actorUuid: actor.uuid, tokenUuid: null, name: actor.name };
    return postCounteractAt({ counteract: bondCounteract(bond, condition.slug ?? condition.system?.slug, classModifierOf(user)), item: { name: bond.name ?? "The bond", uuid: bond.item }, user: userEntry, drinkers: [drinker] });
}
