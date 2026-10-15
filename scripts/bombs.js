// Live play for bombs: after PF2e's damage roll for a bomb Strike, a card with
// the splash on the creatures within 5 feet of the target and the riders for the
// Strike's degree (src/compiler/bombs.js). PF2e's own splash-only rolls give the
// amount; their apply buttons come off that message, so no one is splashed
// twice (as healing's, the user's rule of 2026-10-15). PF2e's main damage roll
// stays PF2e's: on a hit it already includes the target's splash.

import { compileBomb, isBomb } from "../src/compiler/bombs.js";
import { bombCardHTML, createBombCard, riderRow, saveFor, splashText, withChoices } from "../src/live/bomb-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, creatureOf, creaturesNear, damageRollClass, entryOf, stateOf } from "./foundry.js";

const DEGREES = new Set(["criticalSuccess", "success", "failure"]);
// The last bomb thrown, kept as PF2e deletes it (its damage message comes after): uuid → data.
const thrown = new Map();

export function rememberDeletedBomb(item) {
    if (!isBomb(item)) return;
    thrown.set(item.uuid, { ...item.toObject(false), uuid: item.uuid });
    setTimeout(() => thrown.delete(item.uuid), 120_000);
}

async function bombOf(origin) {
    const live = origin?.uuid ? await fromUuid(origin.uuid).catch(() => null) : null;
    if (live) return { ...live.toObject(false), uuid: live.uuid };
    if (thrown.has(origin?.uuid)) return thrown.get(origin.uuid);
    const source = origin?.sourceId ? await fromUuid(origin.sourceId).catch(() => null) : null;
    return source ? { ...source.toObject(false), uuid: origin.uuid ?? null } : null;
}

// PF2e's splash for each damage type, from its splash-only rolls (8.6.1); on a miss with none, the roll itself.
function splashOf(message, outcome) {
    const rolls = message.rolls ?? [];
    const indices = rolls.map((roll, index) => (roll?.options?.splashOnly ? index : -1)).filter((index) => index >= 0);
    const splash = indices.map((index) => ({ type: rolls[index].instances?.[0]?.type ?? rolls[index].options?.damageType ?? "untyped", total: Number(rolls[index].total) || 0 })).filter((entry) => entry.total > 0);
    if (!splash.length && outcome === "failure" && rolls[0]) return { splash: [{ type: rolls[0].instances?.[0]?.type ?? "untyped", total: Number(rolls[0].total) || 0 }], indices: [] };
    return { splash, indices };
}

export async function cardForBomb(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "damage-roll" || message.flags?.[MODULE_ID] || !DEGREES.has(context.outcome)) return;
    const data = await bombOf(message.flags.pf2e.origin);
    if (!isBomb(data)) return;
    const plan = compileBomb(data);
    if (!plan) return;
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const target = targetToken?.actor ? entryOf(targetToken.object ?? targetToken, targetToken.actor) : null;
    const { splash, indices } = splashOf(message, context.outcome);
    const near = target ? creaturesNear(targetToken, 5) : [];
    const row = riderRow({ plan, outcome: context.outcome });
    const riders = target && ((row?.effects ?? []).length || (row?.modifiers ?? []).length);
    const save = plan.item?.save ?? null;
    const burst = target && save?.scope === "burst" ? creaturesNear(targetToken, save.radius ?? 5) : [];
    const saves = target && save && (save.scope !== "target" || ["success", "criticalSuccess"].includes(context.outcome));
    if (!riders && !saves && !(splash.length && (near.length || (context.outcome === "failure" && target)))) return;
    const actor = message.actor;
    if (!actor) return;
    const userToken = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    const state = createBombCard({
        plan,
        item: { name: data.name, uuid: data.uuid ?? null, slug: data.system?.slug ?? null },
        user: entryOf(userToken, actor),
        target,
        outcome: context.outcome,
        splash,
        near,
        burst
    });
    const card = await ChatMessage.create({ content: bombCardHTML(state, { canApply: true }), speaker: message.speaker, flags: { [MODULE_ID]: { [FLAG]: state } } });
    // PF2e's splash-only rolls are the card's: their apply buttons come off the message.
    if (card && indices.length) await message.update({ [`flags.${MODULE_ID}.coveredSplash`]: indices, [`flags.${MODULE_ID}.covered`]: card.id });
}

// On PF2e's damage message, the apply buttons of the splash-only rolls (in roll order).
export function hideCoveredSplash(message, html) {
    const indices = message?.getFlag?.(MODULE_ID, "coveredSplash");
    if (!Array.isArray(indices) || !indices.length) return false;
    const sections = [...html.querySelectorAll(".damage-application")];
    for (const index of indices) sections[index]?.remove();
    return true;
}

export async function applyBombCard(message, { included = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "bomb" || state.status !== "open") return null;
    state = withChoices(state, included);
    const lines = [];
    const DamageRoll = damageRollClass();
    for (const entry of state.splashed.filter((candidate) => candidate.include)) {
        const { token, actor } = await creatureOf(entry);
        if (!actor) continue;
        for (const part of state.splash) {
            try {
                const roll = await new DamageRoll(`(${part.total}[splash])[${part.type}]`).evaluate();
                await actor.applyDamage({ damage: roll, token: token ?? undefined });
            } catch (error) {
                lines.push(`Couldn't splash ${entry.name}: ${error.message}`);
            }
        }
        lines.push(`${entry.name} takes the splash (${splashText(state.splash)})`);
    }
    const row = riderRow(state);
    if (state.target && ((row?.effects ?? []).length || (row?.modifiers ?? []).length)) lines.push(...(await applyRiders({ plan: state.plan, degree: state.outcome, user: state.user, target: state.target, item: state.item })));
    // The bomb's save: the ability module's save card for those who attempt it (the GM's note without it).
    const save = state.plan?.item?.save;
    const savers = saveFor(state);
    if (save && savers.length) {
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const sourceActor = await fromUuid(state.user.actorUuid).catch(() => null);
        const sourceToken = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
        const tokens = (await Promise.all(savers.map((entry) => (entry.tokenUuid ? fromUuid(entry.tokenUuid).catch(() => null) : null)))).filter(Boolean).map((token) => token.object ?? token);
        const check = save.plan.resolution.check;
        if (postCard && sourceActor && tokens.length) {
            await postCard({ plan: save.plan, item: { name: state.item.name, uuid: state.item.uuid ?? null }, sourceActor, sourceToken, tokens, cause: "bomb" });
            lines.push(`${state.item.name}'s save card: ${savers.map((entry) => entry.name).join(", ")}`);
        } else {
            lines.push(`${savers.map((entry) => entry.name).join(", ")}: DC ${check.against.value} ${check.statistic} save against ${state.item.name} (roll it by hand).`);
        }
    }
    const next = { ...state, status: "applied", results: lines.length ? lines : ["Nothing to apply."] };
    return message.update({ content: bombCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
