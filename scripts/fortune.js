// Live play for an item that has its user roll their next roll of a kind twice, or gives them a bonus for a moment
// (src/compiler/fortune.js, src/compiler/readied-bonus.js, src/live/fortune-card.js): Apply gives the user an Effect with
// PF2e's rules (one at a time per item); PF2e rolls that roll twice and removes a RollTwice Effect after it. On the active
// GM's client, a check message whose domains hold the roll an Effect is for removes it (a bonus for one roll; a RollTwice
// should PF2e's "remove expired effects" setting be off). A bonus for a time ends with PF2e's own duration.

import { MODULE_KEY, createFortuneCard, fortuneCardHTML, fortuneEffectSource, isForTarget, readiedWords } from "../src/live/fortune-card.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, startInitiative, stateOf } from "./foundry.js";

export async function postFortuneCard({ message, plan, used, actor, token }) {
    const state = createFortuneCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: fortuneCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// choices: { targets } (token uuids), for a bonus another creature gets (Resonant Guitar's): each of them, not the user.
export async function applyFortuneCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "fortune" || state.status !== "open") return null;
    const forTarget = isForTarget(state.plan);
    if (forTarget && !targets.length) throw new Error("Target the creature first.");
    const creatures = forTarget
        ? (await Promise.all(targets.map(async (uuid) => { const token = await fromUuid(uuid).catch(() => null); return token?.actor ? { actor: token.actor, name: token.name ?? token.actor.name } : null; }))).filter(Boolean)
        : [{ actor: await fromUuid(state.user.actorUuid).catch(() => null), name: state.user.name }];
    if (!creatures.length || !creatures[0].actor) throw new Error(`${forTarget ? "That creature" : state.user.name} isn't there any more.`);
    for (const { actor } of creatures) {
        // (The same item's earlier one, unused: replaced.)
        const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.item?.name === state.item.name);
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
        await actor.createEmbeddedDocuments("Item", [fortuneEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID })]);
    }
    const results = creatures.map(({ name }) => `${name}: ${readiedWords(state.plan)}.`);
    if (state.plan.bonus?.breaks) results.push(await breakItem(state.item));
    const next = { ...state, status: "applied", results };
    return message.update({ content: fortuneCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The item broken by its own use (Worldscale Shield's Absorb Blow): its Hit Points down to its Broken Threshold, or to 0 — destroyed — if
// it was broken already. → the card's line.
async function breakItem(entry) {
    const item = entry?.uuid ? await fromUuid(entry.uuid).catch(() => null) : null;
    const hp = item?.system?.hp;
    if (!item || !Number.isFinite(Number(hp?.value))) return `${entry?.name ?? "The item"}: break it by hand (it isn't there to update).`;
    // (No Hit Points in its data — PF2e's Worldscale Shield has none, its text's 60 aside: by hand.)
    if (!(Number(hp.max) > 0)) return `${item.name}: break it by hand (its data has no Hit Points).`;
    const threshold = Number(hp.brokenThreshold) || 0;
    const broken = Number(hp.value) <= threshold;
    const value = broken ? 0 : threshold;
    await item.update({ "system.hp.value": value });
    return `${item.name}: ${broken ? "destroyed" : "broken"} (Hit Points ${hp.value} → ${value}).`;
}

// A check by a creature with such an Effect, rolled for its roll: the Effect gone (PF2e's own removal may have done it).
export async function fortuneRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (!context?.type || context.type === "damage-roll") return;
    const actor = message.actor;
    const domains = context.domains ?? [];
    // (A RollTwice Effect PF2e removes itself after the roll, when its "remove expired effects" setting is on: not twice.)
    const pf2eRemoves = Boolean(game.pf2e?.settings?.automation?.removeEffects);
    const options = new Set(context.options ?? []);
    const spent = (actor?.itemTypes?.effect ?? []).filter((effect) => {
        const flag = effect.flags?.[MODULE_ID]?.[MODULE_KEY];
        if (pf2eRemoves && (effect.system?.rules ?? []).some((rule) => rule.key === "RollTwice")) return false;
        if (!flag || !(flag.spend ?? [flag.selector]).some((selector) => selector && domains.includes(selector))) return false;
        // (Only a roll its bonus is for: a save against a mental effect for Psychic Warding Bracelet's, not any save.)
        const predicates = (effect.system?.rules ?? []).filter((rule) => rule.key === "FlatModifier" && Array.isArray(rule.predicate) && rule.predicate.length);
        const fits = (predicate) => {
            const Predicate = game.pf2e?.Predicate;
            if (Predicate) return new Predicate(predicate).test(options);
            return predicate.every((term) => typeof term !== "string" || options.has(term));
        };
        return !predicates.length || predicates.some((rule) => fits(rule.predicate));
    });
    if (spent.length) await actor.deleteEmbeddedDocuments("Item", spent.map((effect) => effect.id)).catch(() => null);
}
