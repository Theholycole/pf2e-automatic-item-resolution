// Live play for an item that rerolls the roll that triggered it (src/compiler/rerolls.js, src/live/reroll-card.js): Apply,
// on the active GM's client, finds that roll in the recent chat and PF2e rerolls it (game.pf2e.Check.rerollFromMessage,
// which the GM may do for any message) — keeping the new result as PF2e's own "Keep new" does, or the higher or lower.

import { createRerollCard, rerollCardHTML, triggeringRoll } from "../src/live/reroll-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

// How far back in the chat the triggering roll can be.
const RECENT = 40;
const WHAT_WORDS = { save: "saving throw", attack: "attack roll", check: "check", roll: "roll" };

export async function postRerollCard({ message, plan, used, actor, token }) {
    const state = createRerollCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: rerollCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// A PF2e message as the card's search reads it.
const asRoll = (message) => {
    const context = message?.flags?.pf2e?.context;
    return { id: message?.id, type: context?.type ?? null, domains: context?.domains ?? [], isReroll: Boolean(context?.isReroll), actorUuid: message?.actor?.uuid ?? null, actorId: message?.speaker?.actor ?? null, targetActorUuid: context?.target?.actor ?? null };
};

export async function applyRerollCard(message) {
    const state = stateOf(message);
    if (!state || state.kind !== "reroll" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const reroll = state.plan.reroll;
    const recent = (game.messages?.contents ?? []).slice(-RECENT);
    const id = triggeringRoll(recent.map(asRoll), reroll, { actorUuid: actor.uuid, actorId: actor.id });
    if (!id) throw new Error(reroll.who === "attacker" ? `No attack roll at ${state.user.name} to reroll in the recent chat.` : `No ${reroll.statistic ? `${reroll.statistic} ` : ""}${WHAT_WORDS[reroll.what] ?? "roll"} by ${state.user.name} to reroll in the recent chat.`);
    const Check = game.pf2e?.Check;
    if (!Check?.rerollFromMessage) throw new Error("PF2e's reroll isn't there; reroll it from the message's menu.");
    const triggering = game.messages.get(id);
    await Check.rerollFromMessage(triggering, reroll.keep === "new" ? {} : { keep: reroll.keep });
    const whose = reroll.who === "attacker" ? `${triggering.actor?.name ?? "the attacker"}'s attack roll` : `${state.user.name}'s ${WHAT_WORDS[triggering.flags.pf2e.context.type === "attack-roll" ? "attack" : triggering.flags.pf2e.context.type === "saving-throw" ? "save" : "check"]}`;
    const next = { ...state, status: "applied", results: [`Rerolled ${whose}${reroll.keep === "new" ? "" : `, keeping the ${reroll.keep} result`}.`] };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
