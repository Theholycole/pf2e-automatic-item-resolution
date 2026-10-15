// Live play for injury poisons (src/live/poison-card.js): coat a weapon from the
// poison's card, then the weapon's next Strike that hits posts the poison's save
// card on the target (the ability module's api.live.postCard, the affliction
// handed to Pseudo Afflictions as for monster venom); a critical miss wastes it.

import { MODULE_KEY, createExposureCard, createPoisonCard, exposureCardHTML, poisonCardHTML, poisonEffectSource, poisonStrike, poisonableWeapons, saveText } from "../src/live/poison-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

// The poison card, for an injury poison's Use (scripts/live.js has read the item and its plan).
export async function postPoisonCard({ message, plan, used, actor, token }) {
    const weapons = poisonableWeapons(actor.itemTypes?.weapon ?? []);
    const state = createPoisonCard({
        plan,
        item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null, description: used.data.system?.description?.value ?? "" },
        user: entryOf(token, actor),
        weapons
    });
    return ChatMessage.create({ content: poisonCardHTML(state, { canApply: true }), speaker: message.speaker, flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyPoisonCard(message, { weapon = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "poison" || state.status !== "open") return null;
    if (Number.isInteger(weapon) && state.weapons[weapon]) state = { ...state, weapon };
    const chosen = state.weapons[state.weapon];
    if (!chosen) throw new Error("There's no weapon to coat.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    // One poison on a weapon at a time: a new coat replaces the old.
    const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.weaponId === chosen.id);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
    const plain = String(state.item.description ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1");
    await actor.createEmbeddedDocuments("Item", [poisonEffectSource({ state, weapon: chosen, description: plain, img: state.item.img, worldTime: game.time.worldTime, moduleId: MODULE_ID })]);
    const lines = [`${state.user.name} coats ${chosen.name} with ${state.item.name}${old.length ? " (the poison on it before is gone)" : ""}.`];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: poisonCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A Strike with a coated weapon: on a hit, the target's save card and the poison spent; a critical miss spends it.
export async function strikeWithPoison(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || !context.outcome) return;
    const actor = message.actor;
    const weaponUuid = message.flags.pf2e.origin?.uuid ?? null;
    const weaponId = weaponUuid?.split(".").at(-1) ?? null;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]?.weaponId === weaponId);
    if (!effect) return;
    const poison = effect.flags[MODULE_ID][MODULE_KEY];
    const what = poisonStrike(context.outcome);
    if (what === "keep") return;
    await actor.deleteEmbeddedDocuments("Item", [effect.id]);
    const speaker = ChatMessage.getSpeaker({ actor });
    if (what === "spend") {
        await ChatMessage.create({ speaker, content: `<p><strong>${poison.item.name}</strong>: the critical miss wastes the poison on ${poison.weaponName}.</p>` });
        return;
    }
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const sourceToken = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    if (postCard && targetToken) {
        await postCard({ plan: poison.plan, item: { name: poison.item.name, uuid: poison.item.uuid ?? null }, sourceActor: actor, sourceToken: sourceToken?.document ?? sourceToken, tokens: [targetToken.object ?? targetToken], cause: `${poison.weaponName} hit` });
        return;
    }
    // (Without the ability module's save card: the GM rolls it.)
    await ChatMessage.create({
        speaker,
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${poison.item.name}</strong>: ${targetToken?.name ?? targetToken?.actor?.name ?? "the target"} is exposed (${saveText(poison.plan)}). Roll its save and apply the stage by hand.</p>`
    });
}

// Contact, inhaled and ingested poisons: a card to expose the creatures its presser targets.
export async function postExposureCard({ message, plan, used, actor, token }) {
    const state = createExposureCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: exposureCardHTML(state, { canApply: true }), speaker: message.speaker, flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// targets: the token uuids the presser had targeted.
export async function applyExposureCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "expose" || state.status !== "open") return null;
    const tokens = (await Promise.all((Array.isArray(targets) ? targets : []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
    if (!tokens.length) throw new Error("Target the creatures to expose first.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    const sourceToken = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const names = tokens.map((token) => token.name ?? token.actor?.name).join(", ");
    const lines = [];
    if (postCard && actor) {
        await postCard({ plan: state.plan, item: { name: state.item.name, uuid: state.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens: tokens.map((token) => token.object ?? token), cause: `${state.delivery} poison` });
        lines.push(`${names}: exposed to ${state.item.name} (its save card follows).`);
    } else lines.push(`${names}: exposed to ${state.item.name} (${saveText(state.plan)}; roll it and apply the stage by hand).`);
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: exposureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

