// Live play for an item that rerolls the roll that triggered it (src/compiler/rerolls.js, src/live/reroll-card.js): Apply,
// on the active GM's client, finds that roll in the recent chat and PF2e rerolls it (game.pf2e.Check.rerollFromMessage,
// which the GM may do for any message) — keeping the new result as PF2e's own "Keep new" does, or the higher or lower.

import { DEGREE_WORDS, bonusReroll, createRerollCard, raisedResult, rerollCardHTML, triggeringRoll } from "../src/live/reroll-card.js";
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

// targets: the token uuids the presser had targeted (a companion's reroll).
export async function applyRerollCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "reroll" || state.status !== "open") return null;
    const reroll = state.plan.reroll;
    // (Whose roll: the user's, or for a companion's reroll the creature targeted; "either", the creature targeted if any, else the user.)
    const companion = reroll.who === "companion" || reroll.who === "either" ? await fromUuid(Array.isArray(targets) ? targets[0] ?? "" : "").catch(() => null) : null;
    if (reroll.who === "companion" && !companion?.actor) throw new Error("Target the companion first.");
    const actor = companion?.actor ?? (await fromUuid(state.user.actorUuid).catch(() => null));
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const recent = (game.messages?.contents ?? []).slice(-RECENT);
    const id = triggeringRoll(recent.map(asRoll), reroll, { actorUuid: actor.uuid, actorId: actor.id });
    if (!id) throw new Error(reroll.who === "attacker" ? `No attack roll at ${state.user.name} to reroll in the recent chat.` : `No ${reroll.statistic ? `${reroll.statistic} ` : ""}${WHAT_WORDS[reroll.what] ?? "roll"} by ${actor.name} to reroll in the recent chat.`);
    // (Behind a coin flip, Lucky Silver's and Fortune's Coin's: the card flips it; the other side, nothing happens.)
    if (reroll.coin) {
        const flip = await new Roll("1d2").evaluate();
        await flip.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: the coin (1 = the ${reroll.coin.win})` });
        if (flip.total !== 1) {
            const next = { ...state, status: "applied", results: [`The coin doesn't land on the ${reroll.coin.win}: nothing happens.`] };
            return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
        }
    }
    if (reroll.raise) return raiseRoll(message, state, game.messages.get(id), actor);
    if (reroll.bonus) return rerollWithBonus(message, state, game.messages.get(id), actor);
    const Check = game.pf2e?.Check;
    if (!Check?.rerollFromMessage) throw new Error("PF2e's reroll isn't there; reroll it from the message's menu.");
    const triggering = game.messages.get(id);
    await Check.rerollFromMessage(triggering, reroll.keep === "new" ? {} : { keep: reroll.keep });
    const whose = reroll.who === "attacker" ? `${triggering.actor?.name ?? "the attacker"}'s attack roll` : `${state.user.name}'s ${WHAT_WORDS[triggering.flags.pf2e.context.type === "attack-roll" ? "attack" : triggering.flags.pf2e.context.type === "saving-throw" ? "save" : "check"]}`;
    const next = { ...state, status: "applied", results: [`Rerolled ${whose}${reroll.keep === "new" ? "" : `, keeping the ${reroll.keep} result`}.`] };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A reroll with a bonus (the user's answer of 2026-10-15): PF2e's reroll can't add it, so the card rolls a new d20 with the
// old roll's modifier plus the bonus, shows the degree against the same DC and which result stands, and applies nothing —
// the GM uses that result. PF2e's message stays as it was.
async function rerollWithBonus(message, state, triggering, actor) {
    const reroll = state.plan.reroll;
    const old = triggering.rolls?.[0];
    if (!Number.isFinite(Number(old?.total))) throw new Error("That roll has no total to reroll.");
    const oldNatural = Number(old.dice?.[0]?.total ?? old.terms?.[0]?.total) || null;
    const context = triggering.flags?.pf2e?.context ?? {};
    const dc = Number(context.dc?.value) || null;
    const modifier = Number(old.total) - (oldNatural ?? 0);
    const roll = await new Roll(`1d20 + ${modifier + reroll.bonus.value}`).evaluate();
    const newNatural = Number(roll.dice?.[0]?.total ?? roll.total - modifier - reroll.bonus.value);
    await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: reroll with a +${reroll.bonus.value} ${reroll.bonus.type} bonus` });
    const result = bonusReroll({ oldTotal: Number(old.total), oldNatural, newNatural, bonus: reroll.bonus.value, dc, keep: reroll.keep });
    const degree = (value) => (value === null ? "" : ` (${DEGREE_WORDS[value]})`);
    const lines = [
        `${actor.name}'s reroll: ${result.total} (${newNatural} + ${modifier} + ${reroll.bonus.value} ${reroll.bonus.type})${dc ? ` against DC ${dc}` : ""}${degree(result.degree)}; the first roll was ${old.total}${degree(result.oldDegree)}.`,
        `${result.kept === "new" ? "The new result stands" : "The first result stands"}. PF2e's message isn't changed: the GM uses this one.`
    ];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A change to the roll already made (src/compiler/rerolls.js readRaise): its degree changed, or its total raised by the
// bonus (rolled here when it's dice) and its degree against the same DC — shown for the GM, who uses it; PF2e's message
// stays as it was, as for a reroll with a bonus.
const OUTCOMES = ["criticalFailure", "failure", "success", "criticalSuccess"];
async function raiseRoll(message, state, triggering, actor) {
    const raise = state.plan.reroll.raise;
    const old = triggering.rolls?.[0];
    if (!Number.isFinite(Number(old?.total))) throw new Error("That roll has no total.");
    const context = triggering.flags?.pf2e?.context ?? {};
    const dc = Number(context.dc?.value) || null;
    const oldNatural = Number(old.dice?.[0]?.total ?? old.terms?.[0]?.total) || null;
    const oldDegree = OUTCOMES.includes(context.outcome) ? OUTCOMES.indexOf(context.outcome) : null;
    let bonusRolled = null;
    if (raise.bonus?.formula) {
        const roll = await new Roll(raise.bonus.formula).evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: +${raise.bonus.formula} ${raise.bonus.type} bonus` });
        bonusRolled = roll.total;
    }
    const result = raisedResult({ oldTotal: Number(old.total), oldNatural, dc, oldDegree, raise, bonusRolled });
    const degree = (value) => (value === null || value === undefined ? "no degree (no DC)" : DEGREE_WORDS[value]);
    const lines = [
        Number.isFinite(raise.die)
            ? `${actor.name}'s roll: a ${raise.die} on the die instead of ${oldNatural ?? "?"} — ${result.total}${dc ? ` against DC ${dc}` : ""}: ${degree(result.degree)} (was ${degree(result.before)}).`
            : raise.ac
            ? `${triggering.actor?.name ?? "The attacker"}'s attack roll (${old.total}) against ${state.user.name}'s AC ${dc ?? "?"} + ${raise.ac.value} ${raise.ac.type} = ${result.dc ?? "?"}: ${degree(result.degree)} (was ${degree(result.before)}).`
            : raise.change
            ? `${actor.name}'s roll (${old.total}): ${degree(result.before)} becomes ${degree(result.degree)}.`
            : `${actor.name}'s roll: ${old.total} + ${result.added} ${raise.bonus.type} = ${result.total}${dc ? ` against DC ${dc}` : ""}: ${degree(result.degree)} (was ${degree(result.before)}).`,
        "PF2e's message isn't changed: the GM uses this result."
    ];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

