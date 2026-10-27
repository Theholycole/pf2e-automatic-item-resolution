// Live play for items that cast a spell PF2e has no Effect for (src/live/cast-card.js): the spell module casts it
// through PF2e (its api.castFromItem), so its own cast handling resolves it as any cast.

import { castCardHTML, castRequest, chosenSpell, createCastCard, needsTargets, selfOf } from "../src/live/cast-card.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { FLAG, MODULE_ID, creaturesNear, entryOf, ownerDCsOf, spaceOf, stateOf } from "./foundry.js";
import { castRankAt } from "../src/compiler/cast-owner.js";
import { rememberCastDuration } from "./cast-duration.js";
import { rememberTurnHeal } from "./turn-heal.js";

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

// The targets beyond the item's own range (src/compiler/cast-range.js: Medusa's Scream's 30 feet, Tiger Shield's melee reach), by name; none
// when it gives no feet, or the caster has no token on this scene.
export function beyondRange(castRange, casterToken, actor, targets) {
    const feet = castRange?.feet ?? (castRange?.reach ? Number(actor?.system?.attributes?.reach?.base ?? 5) || 5 : null);
    const placeable = casterToken?.object ?? casterToken;
    if (!feet || !placeable || !canvas?.ready || (placeable.document?.parent?.id ?? placeable.parent?.id) !== canvas.scene?.id) return [];
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    const from = spaceOf(placeable);
    // (A burst's creatures as far as its edge: its radius past the range.)
    return targets.filter((target) => distanceFeet(from, spaceOf(target.object ?? target), grid) > feet + (Number(castRange?.area) || 0)).map((target) => target.name);
}

// The cast's bonus beside the spell (src/compiler/cast-riders.js castBonus) on each creature it's cast on: PF2e's FlatModifier rules for its
// time. → the card's lines.
export async function giveCastBonus(state, actors) {
    const { modifiers, said } = state.plan.castBonus;
    const time = modifiers[0].duration;
    const words = said.replace(/^(?:and|with) /i, "");
    const lines = [];
    for (const actor of actors) {
        await actor.createEmbeddedDocuments("Item", [{
            name: `${state.item.name}: ${words.replace(/ for \d+ \w+$/, "")}`,
            type: "effect",
            img: state.item.img ?? "icons/svg/upgrade.svg",
            flags: { [MODULE_ID]: { castBonus: true } },
            system: { description: { value: `<p>${words.charAt(0).toUpperCase()}${words.slice(1)} (${state.item.name}).</p>` }, duration: { value: time.value, unit: time.unit, expiry: time.expiry ?? "turn-start", sustained: false }, start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null }, tokenIcon: { show: true },
                rules: modifiers.map((modifier) => ({ key: "FlatModifier", selector: modifier.selector, type: modifier.type, value: modifier.value, label: state.item.name, ...(modifier.predicate ? { predicate: modifier.predicate } : {}) })) }
        }]);
        lines.push(`${actor.name} gains ${words}.`);
    }
    return lines;
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
        // (A spell only from a level on, The Sickness's Spiritual Epidemic from 15th: refused below it.)
        const minLevel = chosenSpell(state).minLevel;
        if (minLevel && Number(actor.level) < minLevel) throw new Error(`${chosenSpell(state).spell.name} needs its caster at level ${minLevel} or higher.`);
        // (Its rank and DC from its caster, src/compiler/cast-owner.js: The Inquisitor's half its level, its class DC or spell DC.)
        if (!request.rank && state.plan.castRank) request.rank = castRankAt(state.plan.castRank, actor.level);
        if (!request.dc && state.plan.castDC) {
            const dcs = ownerDCsOf(actor);
            const best = Math.max(0, ...[dcs.class, dcs.spell].filter((value) => Number(value) > 0));
            if (best > 0) request.dc = best;
        }
        const token = request.casterTokenUuid ? await fromUuid(request.casterTokenUuid).catch(() => null) : null;
        const targetTokens = (await Promise.all(request.targetUuids.map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
        if (needsTargets(state.plan, chosenSpell(state)) && !targetTokens.length) throw new Error("Target the creatures first.");
        const far = beyondRange(state.plan.castRange, token, actor, selfOf(state) ? [] : targetTokens);
        if (far.length) throw new Error(`${far.join(", ")} ${far.length === 1 ? "is" : "are"} beyond ${state.item.name}'s range.`);
        const cast = await castFromItem({ actor, token: token ?? undefined, spell: request.spell, rank: request.rank ?? undefined, dc: request.dc ?? undefined, counteract: request.counteract ?? undefined, targets: targetTokens, item: request.item });
        lines.push(`${actor.name} casts ${spellName}${cast?.rank ? ` at rank ${cast.rank}` : ""}${targetTokens.length && !selfOf(state) ? ` at ${targetTokens.map((target) => target.name).join(", ")}` : ""}.`);
        // (The item's duration for the spell's Effects: scripts/cast-duration.js.)
        const lasts = state.plan.castDuration ? await rememberCastDuration(cast, state.plan.castDuration, { actor, targets: targetTokens }) : null;
        if (lasts) lines.push(lasts);
        // (Healing at the end of each of its user's turns for the item's time: scripts/turn-heal.js.)
        const heals = state.plan.turnHeal ? await rememberTurnHeal(state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : actor, state.plan.turnHeal, { item: state.item, duration: state.plan.castDuration }) : null;
        if (heals) lines.push(heals);
        // (A bonus with the spell, Psyche Salts': an Effect of PF2e's rules on the creature it's cast on.)
        if (state.plan.castBonus) lines.push(...await giveCastBonus(state, selfOf(state) ? [actor] : targetTokens.map((target) => target.actor).filter(Boolean)));
        // (A condition on its user with the cast, Locket of Sealed Nightmares' fatigued: PF2e's condition on the item's user.)
        if (state.plan.castSelf) {
            const user = state.user?.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : actor;
            if (user?.increaseCondition) {
                await user.increaseCondition(state.plan.castSelf.slug, state.plan.castSelf.value ? { value: state.plan.castSelf.value } : {});
                lines.push(`${user.name} is ${state.plan.castSelf.slug}${state.plan.castSelf.value ? ` ${state.plan.castSelf.value}` : ""}.`);
            }
        }
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: castCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
