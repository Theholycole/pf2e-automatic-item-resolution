// Live play for plan.endEarly (src/compiler/end-early.js): once the ability module's card for the item has applied (its "applied" hook, on the
// GM's client), an end-early card lists each creature it affected. Pressed for one, its next try is made: a flat check of that try's DC (or it
// ends outright), or its Interact actions spent. Ending it deletes the item's Effects on that creature that grant the conditions it names (all
// the item's Effects on it when it names none) — the ability module's timed conditions, which take their conditions with them.

import { createEndEarlyCard, endEarlyCardHTML, tryWords } from "../src/live/end-early-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, stateOf } from "./foundry.js";

export function setUpEndEarly() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        postEndEarly(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | end early`, error));
    });
}

// The item's Effects on the creature this ends: named for the item ("<item>: <Condition>"), the conditions it names when it names some.
const endedBy = (actor, itemName, conditions) => (actor?.itemTypes?.effect ?? []).filter((effect) => {
    const name = String(effect.name ?? "");
    if (!name.startsWith(`${itemName}:`) && !name.startsWith(`${itemName} `)) return false;
    return !conditions?.length || conditions.some((slug) => name.toLowerCase().includes(slug));
});

export async function postEndEarly({ state, targets }) {
    const endEarly = state?.plan?.endEarly;
    if (!endEarly) return null;
    const itemName = state.ability?.name ?? state.plan.source?.name ?? "The item";
    const creatures = [];
    for (const target of targets ?? []) {
        // (Only the creatures that rolled its row, Blindpepper Bolt's success.)
        if (endEarly.degrees?.length && !endEarly.degrees.includes(target.degree)) continue;
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor || !endedBy(actor, itemName, endEarly.conditions).length) continue;
        creatures.push({ actorUuid: actor.uuid, tokenUuid: target.tokenUuid ?? null, name: target.name ?? actor.name });
    }
    if (!creatures.length) return null;
    const card = createEndEarlyCard({ endEarly, item: { name: itemName, uuid: state.ability?.uuid ?? null }, user: { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? itemName }, creatures });
    return ChatMessage.create({ content: endEarlyCardHTML(card, { canApply: true }), flags: { [MODULE_ID]: { [FLAG]: card } } });
}

// choices: { entry } — the creature the try is for.
export async function applyEndEarlyCard(message, { entry = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "end-early" || state.status !== "open") return null;
    const index = Number.isInteger(entry) ? entry : state.entries.findIndex((one) => !one.done);
    const one = state.entries[index];
    if (!one || one.done) throw new Error("Pick a creature it still affects.");
    const actor = await fromUuid(one.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${one.name} isn't there any more.`);
    const endEarly = state.plan.endEarly;
    const lines = [];
    let ends = endEarly.how.kind === "actions";
    let step = one.step;
    if (endEarly.how.kind === "flat") {
        const dc = endEarly.how.steps[one.step] ?? endEarly.how.steps.at(-1);
        if (dc === "auto") ends = true;
        else {
            const roll = await new Roll("1d20").evaluate();
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: DC ${dc} flat check to end it` });
            ends = roll.total >= dc;
            lines.push(`${one.name}: ${roll.total} on the DC ${dc} flat check${ends ? "" : ", not ended"}.`);
            if (!ends) step = Math.min(one.step + 1, endEarly.how.steps.length - 1);
        }
    }
    if (ends) {
        const effects = endedBy(actor, state.item.name, endEarly.conditions);
        if (effects.length) await actor.deleteEmbeddedDocuments("Item", effects.map((effect) => effect.id));
        lines.push(`${one.name}: ${endEarly.conditions?.length ? endEarly.conditions.join(" and ") : "its effects"} from ${state.item.name} ended${endEarly.how.kind === "actions" ? ` (${tryWords(endEarly, one)})` : ""}.`);
    }
    const entries = state.entries.map((other, at) => (at === index ? { ...other, step, done: ends } : other));
    const next = { ...state, entries, status: entries.every((other) => other.done) ? "applied" : "open", results: [...state.results, ...lines].slice(-8) };
    return message.update({ content: endEarlyCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
