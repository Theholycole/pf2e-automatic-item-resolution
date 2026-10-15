// Live play for an item that has its user roll their next roll of a kind twice (src/compiler/fortune.js,
// src/live/fortune-card.js): Apply gives the user an Effect with PF2e's RollTwice rule (one at a time per item); PF2e rolls
// that roll twice and removes the Effect after it. On the active GM's client, a check message whose domains hold the
// Effect's roll removes it too, should PF2e's "remove expired effects" setting be off.

import { MODULE_KEY, createFortuneCard, fortuneCardHTML, fortuneEffectSource, rollWords } from "../src/live/fortune-card.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, startInitiative, stateOf } from "./foundry.js";

export async function postFortuneCard({ message, plan, used, actor, token }) {
    const state = createFortuneCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: fortuneCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyFortuneCard(message) {
    const state = stateOf(message);
    if (!state || state.kind !== "fortune" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    // (The same item's earlier one, unused: replaced.)
    const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.item?.name === state.item.name);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
    await actor.createEmbeddedDocuments("Item", [fortuneEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID })]);
    const next = { ...state, status: "applied", results: [`${state.user.name}'s next ${rollWords(state.plan.rollTwice)} is rolled twice, the better kept.`] };
    return message.update({ content: fortuneCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A check by a creature with such an Effect, rolled for its roll: the Effect gone (PF2e's own removal may have done it).
export async function fortuneRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (!context?.type || context.type === "damage-roll") return;
    const actor = message.actor;
    const domains = context.domains ?? [];
    const spent = (actor?.itemTypes?.effect ?? []).filter((effect) => {
        const flag = effect.flags?.[MODULE_ID]?.[MODULE_KEY];
        return flag && domains.includes(flag.selector);
    });
    if (spent.length) await actor.deleteEmbeddedDocuments("Item", spent.map((effect) => effect.id)).catch(() => null);
}
