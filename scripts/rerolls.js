// Live play for an item that rerolls the roll that triggered it (src/compiler/rerolls.js, src/live/reroll-card.js): Apply,
// on the active GM's client, finds that roll in the recent chat and PF2e rerolls it (game.pf2e.Check.rerollFromMessage,
// which the GM may do for any message) — keeping the new result as PF2e's own "Keep new" does, or the higher or lower.

import { DEGREE_WORDS, bonusReroll, createRerollCard, raisedResult, rerollCardHTML, triggeringRoll } from "../src/live/reroll-card.js";
import { FLAG, MODULE_ID, applyRiders, entryOf, stateOf } from "./foundry.js";

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
    const companion = reroll.who === "companion" || reroll.who === "either" || reroll.who === "target" ? await fromUuid(Array.isArray(targets) ? targets[0] ?? "" : "").catch(() => null) : null;
    if (reroll.who === "companion" && !companion?.actor) throw new Error("Target the companion first.");
    if (reroll.who === "target" && !companion?.actor) throw new Error("Target the creature first.");
    const actor = companion?.actor ?? (await fromUuid(state.user.actorUuid).catch(() => null));
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const recent = (game.messages?.contents ?? []).slice(-RECENT);
    const id = triggeringRoll(recent.map(asRoll), reroll, { actorUuid: actor.uuid, actorId: actor.id });
    if (!id) throw new Error(reroll.who === "attacker" ? `No attack roll at ${state.user.name}${reroll.contest ? "" : " to reroll"} in the recent chat.` : `No ${reroll.statistic ? `${reroll.statistic} ` : ""}${WHAT_WORDS[reroll.what] ?? "roll"} by ${actor.name} to reroll in the recent chat.`);
    // (Behind a coin flip, Lucky Silver's and Fortune's Coin's: the card flips it; the other side, nothing happens.)
    if (reroll.coin) {
        const flip = await new Roll("1d2").evaluate();
        await flip.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: the coin (1 = the ${reroll.coin.win})` });
        if (flip.total !== 1) {
            const next = { ...state, status: "applied", results: [`The coin doesn't land on the ${reroll.coin.win}: nothing happens.`] };
            return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
        }
    }
    if (reroll.what === "damage") return rerollDamage(message, state, game.messages.get(id), actor);
    if (reroll.contest) return contestRoll(message, state, game.messages.get(id), actor);
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
    // (At mythic proficiency, Mythic Weapon Potency's: its user's level + 10 in place of the roll's own proficiency.)
    const proficiency = reroll.bonus.mythic ? Number((triggering.flags?.pf2e?.modifiers ?? []).find((entry) => entry.slug === "proficiency" && entry.enabled !== false)?.modifier) || 0 : 0;
    const value = reroll.bonus.mythic ? (Number(actor.level) || 0) + 10 - proficiency : reroll.bonus.value;
    const roll = await new Roll(`1d20 + ${modifier + value}`).evaluate();
    const newNatural = Number(roll.dice?.[0]?.total ?? roll.total - modifier - value);
    await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: reroll.bonus.mythic ? `${state.item.name}: reroll at mythic proficiency` : `${state.item.name}: reroll with a +${value} ${reroll.bonus.type} bonus` });
    const result = bonusReroll({ oldTotal: Number(old.total), oldNatural, newNatural, bonus: value, dc, keep: reroll.keep });
    const degree = (value) => (value === null ? "" : ` (${DEGREE_WORDS[value]})`);
    const lines = [
        `${actor.name}'s reroll: ${result.total} (${newNatural} + ${modifier} + ${value} ${reroll.bonus.mythic ? `mythic proficiency over the roll's ${proficiency}` : reroll.bonus.type})${dc ? ` against DC ${dc}` : ""}${degree(result.degree)}; the first roll was ${old.total}${degree(result.oldDegree)}.`,
        `${result.kept === "new" ? "The new result stands" : "The first result stands"}. PF2e's message isn't changed: the GM uses this one.`
    ];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A damage roll rerolled, the higher kept (Mythic Striking's "reroll your weapon damage dice, taking the higher of the two results"): PF2e's
// damage roll rolled again; the new one posted with PF2e's own buttons when it's higher, else the first stands (the GM applies whichever).
async function rerollDamage(message, state, triggering, actor) {
    const old = triggering.rolls?.[0];
    if (!old || !Number.isFinite(Number(old.total))) throw new Error("That damage roll has no total.");
    const again = await old.reroll();
    const higher = Number(again.total) > Number(old.total);
    if (higher) await again.toMessage({ speaker: triggering.speaker ?? ChatMessage.getSpeaker({ actor }), flavor: `${triggering.flavor ?? ""}<p>${state.item.name}: rerolled, the higher kept.</p>` });
    // (Healing, Mask of Mercy's: its words.)
    const what = state.plan.reroll.healing ? "healing" : "damage";
    const lines = [higher
        ? `${actor.name}'s ${what} rerolled: ${again.total}, higher than ${old.total} — apply the new roll's ${what} (its message has PF2e's buttons), not the first.`
        : `${actor.name}'s ${what} rerolled: ${again.total}, not higher than ${old.total} — the first roll stands.`];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its user's save against the attack that hit (src/compiler/rerolls.js readContest): PF2e rolls the save; higher than the attack's total, the
// attack misses — the GM's to undo, PF2e's message as it was — and the attacker gets what a miss gives (The Demon's Lantern's Dazzled).
async function contestRoll(message, state, triggering, actor) {
    const reroll = state.plan.reroll;
    if (reroll.contest.flat) return flatAgainst(message, state, triggering, actor);
    const attack = Number(triggering.rolls?.[0]?.total);
    if (!Number.isFinite(attack)) throw new Error("That attack roll has no total.");
    const save = await actor.saves?.[reroll.contest.statistic]?.roll?.({ skipDialog: true });
    const total = Number(save?.total ?? save?.rolls?.[0]?.total);
    if (!Number.isFinite(total)) throw new Error(`${actor.name}'s ${reroll.contest.statistic} save didn't roll.`);
    const attacker = triggering.actor ?? null;
    const misses = total > attack;
    const named = `${reroll.contest.statistic.charAt(0).toUpperCase()}${reroll.contest.statistic.slice(1)}`;
    const lines = [`${actor.name}'s ${named} save ${total} against ${attacker?.name ?? "the attacker"}'s attack roll ${attack}: ${misses ? "higher — the attack misses (PF2e's message isn't changed: the GM undoes its damage)" : "not higher — the attack stands"}.`];
    if (misses && reroll.onMiss && attacker) {
        const plan = { resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [{ kind: "condition", slug: reroll.onMiss.slug, value: reroll.onMiss.value ?? null, duration: reroll.onMiss.duration }], modifiers: [] } } } };
        const target = entryOf(triggering.token?.object ?? attacker.getActiveTokens?.(true)?.[0] ?? null, attacker);
        lines.push(...(await applyRiders({ plan, degree: "success", user: state.user, target, item: state.item })));
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its user Concealed against the attack (src/compiler/rerolls.js readConcealedAgainst): an attack that hit, a DC 5 flat check rolled here;
// failed, it misses — the GM's to undo, as for the save against it. An attack that missed anyway needs no check.
async function flatAgainst(message, state, triggering, actor) {
    if (state.plan.reroll.contest.flat === "target") return flatForTarget(message, state, triggering, actor);
    const dc = state.plan.reroll.contest.flat;
    const outcome = triggering.flags?.pf2e?.context?.outcome ?? null;
    const attacker = triggering.actor?.name ?? "the attacker";
    let lines;
    if (outcome === "failure" || outcome === "criticalFailure") lines = [`${attacker}'s attack already missed ${actor.name}: no flat check.`];
    else {
        const roll = await new Roll("1d20").evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: flat check DC ${dc} (${actor.name} Concealed)` });
        lines = [roll.total >= dc ? `Flat check ${roll.total} against DC ${dc}: ${attacker}'s attack still hits ${actor.name}.` : `Flat check ${roll.total} against DC ${dc}: failed — ${attacker}'s attack misses ${actor.name} (PF2e's message isn't changed: the GM undoes its damage).`];
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its user's flat check against the creature their latest attack targeted (Eye of Fortune's, rolled twice, the higher kept): DC 11 when it's
// Hidden, else DC 5 (Concealed). Failed, the attack misses — the GM's to undo.
async function flatForTarget(message, state, triggering, actor) {
    const reroll = state.plan.reroll;
    const target = await fromUuid(triggering.flags?.pf2e?.context?.target?.actor ?? "").catch(() => null);
    const hidden = Boolean(target?.hasCondition?.("hidden"));
    const dc = hidden ? 11 : 5;
    const roll = await new Roll(reroll.contest.twice ? "2d20kh" : "1d20").evaluate();
    await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: flat check DC ${dc} (${target?.name ?? "the target"} ${hidden ? "Hidden" : "Concealed"})${reroll.contest.twice ? ", rolled twice" : ""}` });
    const dice = (roll.dice?.[0]?.results ?? []).map((result) => result.result);
    const said = dice.length > 1 ? `${dice.join(" and ")}, the higher ${roll.total}` : `${roll.total}`;
    const lines = [roll.total >= dc ? `Flat check ${said} against DC ${dc}: ${actor.name}'s attack goes on against ${target?.name ?? "the target"}.` : `Flat check ${said} against DC ${dc}: failed — ${actor.name}'s attack misses ${target?.name ?? "the target"} (PF2e's message isn't changed: the GM undoes its damage).`];
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
            ? `${state.plan.reroll.who === "attacker" ? `${triggering.actor?.name ?? "The attacker"}'s ${state.plan.reroll.what === "check" ? "check" : "attack roll"}` : `${actor.name}'s roll`} (${old.total}): ${degree(result.before)}${result.degree === result.before ? ", nothing to change" : ` becomes ${degree(result.degree)}`}.`
            : `${actor.name}'s roll: ${old.total} + ${result.added} ${raise.bonus.type} = ${result.total}${dc ? ` against DC ${dc}` : ""}: ${degree(result.degree)} (was ${degree(result.before)}).`,
        "PF2e's message isn't changed: the GM uses this result."
    ];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: rerollCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

