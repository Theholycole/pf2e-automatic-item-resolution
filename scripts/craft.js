// Live play for the craft card (src/compiler/relic-readings.js plan.craft, src/live/craft-card.js, 2026-10-27): Aroden's Hearthstone's magical
// weapon or armor, Philosopher's Extractor's alchemical item. Posted: its user's known formulas that fit (PF2e's actor.crafting.getFormulas,
// with each item's level, Price and DC), and the levels it has left to make today. Applied (the active GM's client): with a check, the
// Requirements' proficiency held to (the GM may still press), the raw materials checked against its user's coins, then PF2e's Crafting
// check at the formula's DC (action:craft), and by its degree the materials paid (PF2e's removeCoins) and the item put in its user's
// inventory (PF2e's addToInventory); without one, the item made at once and its levels counted on the holder (flag craftLevels) for the day.
// An impeccable item is flagged so (flags.<module>.impeccable): its own uses then roll their maximum, last twice as long and have no
// drawback (src/live/craft-card.js impeccablePlan, scripts/live.js).

import { coinsText, craftCardHTML, craftOutcome, createCraftCard, fitsCraft, levelsLeft, materialsCost, withLevels } from "../src/live/craft-card.js";
import { periodOf } from "../src/live/activations-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

const LEVELS = "craftLevels";
const RANK_WORDS = ["untrained", "trained", "expert", "master", "legendary"];
const copperOf = (item) => Number(item?.price?.value?.copperValue ?? item?.system?.price?.value?.copperValue) || 0;

// Its user's formulas that fit: [{ uuid, name, level, price, dc }].
async function craftOptions(actor, craft) {
    const formulas = (await actor?.crafting?.getFormulas?.().catch(() => [])) ?? [];
    return formulas.filter((formula) => fitsCraft({ type: formula.item?.type, traits: [...(formula.item?.system?.traits?.value ?? [])], level: formula.item?.level ?? formula.item?.system?.level?.value }, craft, actor.level))
        .map((formula) => ({ uuid: formula.item.uuid, name: formula.item.name, level: Number(formula.item.level ?? formula.item.system?.level?.value) || 0, price: copperOf(formula.item), dc: Number(formula.dc) || null }))
        .sort((one, two) => two.level - one.level || one.name.localeCompare(two.name));
}

export async function postCraftCard({ message, plan, used, actor, token }) {
    const holderId = String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? used.data._id ?? null;
    const holder = holderId ? actor?.items?.get?.(holderId) : null;
    const craft = plan.craft;
    const left = craft.budget ? levelsLeft(craft.budget, holder?.getFlag?.(MODULE_ID, LEVELS), periodOf({ per: craft.budget.per }, { worldTime: game.time.worldTime })) : null;
    const options = (await craftOptions(actor, craft)).filter((option) => left === null || option.level <= left);
    const state = createCraftCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, id: holderId }, user: entryOf(token, actor), options, left });
    return ChatMessage.create({ content: craftCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// On the active GM's client: { pick, gm } → the check rolled and the item made (or not), the card applied.
// (gm: whether its presser is the GM — the socket's sender, or this client's own press.)
export async function applyCraftCard(message, { pick = 0, gm = false } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "craft" || state.status !== "open") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const craft = state.plan.craft;
    const option = state.options[Number(pick) || 0];
    if (!option) throw new Error("no formula picked.");
    const item = await fromUuid(option.uuid).catch(() => null);
    if (!item) throw new Error(`${option.name} wasn't found.`);
    const lines = [];
    // (Its Requirements: legendary in Crafting — below it, only the GM's press goes on.)
    if (craft.requires?.skill) {
        const rank = Number(actor.skills?.[craft.requires.skill]?.rank) || 0;
        if (rank < craft.requires.rank) {
            if (!gm) throw new Error(`its Requirements need ${state.user.name} to be ${craft.requires.words} (${RANK_WORDS[rank]}).`);
            lines.push(`${state.user.name} is ${RANK_WORDS[rank]} in Crafting, not ${craft.requires.words}: the GM pressed it anyway.`);
        }
    }
    const cost = materialsCost(craft, option.price);
    const purse = Number(actor.inventory?.coins?.copperValue) || 0;
    if (cost > purse) throw new Error(`${state.user.name} has ${coinsText(purse)}, short of the ${coinsText(cost)} of raw materials ${option.name} needs.`);
    let degree = 3;
    if (craft.check) {
        const statistic = actor.skills?.crafting;
        if (!statistic) throw new Error(`${state.user.name} has no Crafting to roll.`);
        const roll = await statistic.roll({ dc: { value: option.dc }, extraRollOptions: ["action:craft", "action:craft:item"], traits: ["downtime", "manipulate"], label: `${state.item.name}: Craft ${option.name}`, skipDialog: true });
        degree = Number(roll?.degreeOfSuccess ?? roll?.options?.degreeOfSuccess);
        if (!Number.isFinite(degree)) throw new Error("the Crafting check wasn't rolled.");
    }
    const outcome = craftOutcome(craft, degree, { name: option.name, priceCopper: option.price });
    if (outcome.paid > 0 && !(await actor.inventory.removeCoins({ cp: outcome.paid }))) lines.push(`Couldn't take ${coinsText(outcome.paid)} from ${state.user.name}'s coins: take them by hand.`);
    if (outcome.made) {
        const source = item.toObject();
        delete source._id;
        if (craft.impeccable) source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { ...(source.flags?.[MODULE_ID] ?? {}), impeccable: { from: state.item.name } } };
        const added = await actor.addToInventory(source).catch(() => null);
        if (!added) lines.push(`${option.name} couldn't be put in ${state.user.name}'s inventory: add it by hand.`);
        // (The levels made today, on the holder.)
        if (craft.budget && state.item.id) {
            const holder = actor.items.get(state.item.id);
            const period = periodOf({ per: craft.budget.per }, { worldTime: game.time.worldTime });
            if (holder) await holder.setFlag(MODULE_ID, LEVELS, withLevels(holder.getFlag(MODULE_ID, LEVELS), period, option.level));
        }
    }
    lines.unshift(outcome.line);
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: lines };
    return message.update({ content: craftCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
