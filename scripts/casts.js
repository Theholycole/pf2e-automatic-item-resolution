// Live play for items that cast a spell PF2e has no Effect for (src/live/cast-card.js): the spell module casts it
// through PF2e (its api.castFromItem), so its own cast handling resolves it as any cast.

import { castCardHTML, castRequest, chosenSpell, createCastCard, needsTargets, selfOf } from "../src/live/cast-card.js";
import { FLAG, MODULE_ID, creaturesNear, entryOf, stateOf } from "./foundry.js";
import { rememberCastDuration } from "./cast-duration.js";

const SPELL_ID = "pf2e-automatic-resolution";

export async function postCastCard({ message, plan, used, actor, token }) {
    const state = createCastCard({
        plan,
        item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null },
        user: entryOf(token, actor),
        drinkers: plan.self && plan.item?.recipient === "drinker" ? creaturesNear(token, 5) : []
    });
    return ChatMessage.create({ content: castCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// targets: the token uuids of whoever pressed Apply, for a spell aimed at others; choice: the spell picked of several.
export async function applyCastCard(message, { drinker = null, targets = [], choice = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "cast" || state.status !== "open") return null;
    if (state.drinker !== null && Number.isInteger(drinker) && state.drinkers[drinker]) state = { ...state, drinker };
    if (Number.isInteger(choice) && state.plan.choices?.[choice]) state = { ...state, choice };
    const request = castRequest(state, { targetUuids: Array.isArray(targets) ? targets : [] });
    const spellName = chosenSpell(state).spell.name;
    const castFromItem = game.modules.get(SPELL_ID)?.api?.castFromItem;
    const lines = [];
    if (!castFromItem) lines.push(`Cast ${spellName} by hand${request.rank ? ` at rank ${request.rank}` : ""} (PF2e Automatic Spell Resolution isn't active).`);
    else {
        const actor = await fromUuid(request.casterUuid).catch(() => null);
        if (!actor) throw new Error("The caster isn't there any more.");
        const token = request.casterTokenUuid ? await fromUuid(request.casterTokenUuid).catch(() => null) : null;
        const targetTokens = (await Promise.all(request.targetUuids.map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
        if (needsTargets(state.plan, chosenSpell(state)) && !targetTokens.length) throw new Error("Target the creatures first.");
        const cast = await castFromItem({ actor, token: token ?? undefined, spell: request.spell, rank: request.rank ?? undefined, dc: request.dc ?? undefined, counteract: request.counteract ?? undefined, targets: targetTokens, item: request.item });
        lines.push(`${actor.name} casts ${spellName}${cast?.rank ? ` at rank ${cast.rank}` : ""}${targetTokens.length && !selfOf(state) ? ` at ${targetTokens.map((target) => target.name).join(", ")}` : ""}.`);
        // (The item's duration for the spell's Effects: scripts/cast-duration.js.)
        const lasts = state.plan.castDuration ? await rememberCastDuration(cast, state.plan.castDuration, { actor, targets: targetTokens }) : null;
        if (lasts) lines.push(lasts);
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: castCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
