// Live play for items that cast a spell PF2e has no Effect for (src/live/cast-card.js): the spell module casts it
// through PF2e (its api.castFromItem), so its own cast handling resolves it as any cast.

import { castCardHTML, castRequest, chosenSpell, createCastCard, darkLightCounteract, needsTargets, selfOf } from "../src/live/cast-card.js";
import { postCounteractAt } from "./counteract.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { FLAG, MODULE_ID, creaturesNear, entryOf, ownerDCsOf, spaceOf, stateOf } from "./foundry.js";
import { castRankAt } from "../src/compiler/cast-owner.js";
import { impulseNumbers } from "../src/compiler/cast-changes.js";
import { rememberCastDuration } from "./cast-duration.js";
import { smokeAfterMove } from "./cast-smoke.js";
import { arrivalAfterMove } from "./cast-arrival.js";
import { castDegreeEffectSource, castPenaltySource, itemNoteSource, ruleEffectSource } from "../src/live/card.js";
import { castNoteText } from "../src/compiler/cast-note.js";
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
            const from = state.plan.castDC.from;
            const best = Math.max(0, ...[from !== "spell" ? dcs.class : null, from !== "class" ? dcs.spell : null].filter((value) => Number(value) > 0));
            if (best > 0) request.dc = best;
        }
        // (A kineticist's impulse DC and attack modifier for a spell of one of its kinetic elements, Gate Attenuator's: the better of them and
        // the item's — src/compiler/cast-changes.js, PF2e's flags.system.kineticist.elements and impulse statistic.)
        if (state.plan.castImpulse) {
            const impulse = actor.getStatistic?.("impulse") ?? null;
            const elements = (actor.flags?.system?.kineticist?.elements ?? []).map((entry) => entry?.value ?? entry);
            const better = impulseNumbers({ dc: request.dc, attack: request.counteract }, chosenSpell(state), { elements, dc: impulse?.dc?.value ?? ownerDCsOf(actor)?.class ?? null, attack: impulse?.check?.mod ?? null });
            if (better.impulse) {
                request.dc = better.dc;
                request.counteract = better.attack;
                lines.push(`${actor.name}'s impulse numbers: DC ${better.dc}, attack +${better.attack}.`);
            }
        }
        const token = request.casterTokenUuid ? await fromUuid(request.casterTokenUuid).catch(() => null) : null;
        const targetTokens = (await Promise.all(request.targetUuids.map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
        if (needsTargets(state.plan, chosenSpell(state)) && !targetTokens.length) throw new Error("Target the creatures first.");
        // (Up to so many targets, The Joke's 10: refused beyond that.)
        if (state.plan.castTargets && targetTokens.length > state.plan.castTargets.max) throw new Error(`Target up to ${state.plan.castTargets.max} creatures.`);
        // (By touch, The Winged Serpent's Foresight on another creature: within its caster's reach.)
        const far = beyondRange(chosenSpell(state).touch ? { reach: true } : state.plan.castRange, token, actor, selfOf(state) ? [] : targetTokens);
        if (far.length) throw new Error(`${far.join(", ")} ${far.length === 1 ? "is" : "are"} beyond ${state.item.name}'s range.`);
        // (Smoke where its user was and where it arrives, Charlatan's Cape's Translocate: watched for before the cast moves it, scripts/cast-smoke.js.)
        const smoke = state.plan.castSmoke ? smokeAfterMove(state.plan.castSmoke, { actor, token, item: state.item }) : null;
        // (Damage beside where it was and where it arrives, Fiendish Teleportation's brimstone: scripts/cast-arrival.js, watched for the same way.)
        const arrival = state.plan.castArrival ? arrivalAfterMove(state.plan.castArrival, { actor, token, item: state.item }) : null;
        // (A worse save for targets of a kind, Radiant Spark's celestials: PF2e's AdjustDegreeOfSuccess on each before the cast, till its save.)
        if (state.plan.castDegree) {
            for (const target of targetTokens) {
                const traits = [...(target.actor?.traits ?? new Set(target.actor?.system?.traits?.value ?? []))];
                if (!target.actor || !state.plan.castDegree.traits.some((trait) => traits.includes(trait))) continue;
                await target.actor.createEmbeddedDocuments("Item", [castDegreeEffectSource(state.plan.castDegree, spellName, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                lines.push(`${target.name}, a ${state.plan.castDegree.traits.join(" or ")}: its save is one degree worse.`);
            }
        }
        // (Creatures of a kind immune and others worse off, Castrovel's Beacon's elves and demons: the immune targeted left out of the cast, the
        // others' penalty on them before it.)
        let castTargets = targetTokens;
        if (state.plan.castTraits) {
            const traitsOf = (target) => [...(target.actor?.traits ?? new Set(target.actor?.system?.traits?.value ?? []))];
            // (Or only those of a kind, Orb of Dragonkind's dragon: the others left out — 2026-10-27.)
            const only = state.plan.castTraits.only ?? [];
            const immune = targetTokens.filter((target) => state.plan.castTraits.immune.some((trait) => traitsOf(target).includes(trait)) || (only.length && !only.some((trait) => traitsOf(target).includes(trait))));
            castTargets = targetTokens.filter((target) => !immune.includes(target));
            for (const target of immune) lines.push(only.length && !state.plan.castTraits.immune.some((trait) => traitsOf(target).includes(trait)) ? `${target.name} isn't a ${only.join(" or ")}: left out of the cast.` : `${target.name} is immune (${state.plan.castTraits.immune.join(" or ")}): left out of the cast.`);
            for (const penalty of state.plan.castTraits.penalties) {
                for (const target of castTargets.filter((one) => one.actor && penalty.traits.some((trait) => traitsOf(one).includes(trait)))) {
                    await target.actor.createEmbeddedDocuments("Item", [castPenaltySource(penalty, spellName, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                    lines.push(penalty.words ? `${target.name}: ${penalty.words.charAt(0).toLowerCase()}${penalty.words.slice(1)}.` : `${target.name}: ${penalty.value} ${penalty.type} to its ${penalty.selector} saves against it.`);
                }
            }
            if (!targetTokens.length) lines.push(`Target the creatures in its area to leave out the ${state.plan.castTraits.immune.join(" and ")}s and give the penalty.`);
        }
        // (PF2e's rules on its caster for the cast, before it — Soulcutter (Heroic)'s Soulcutting Storm, all its damage spirit: a DamageAlteration
        // on that spell's damage, src/compiler/legend-readings.js, 2026-10-27; the spell module rolls spell damage through PF2e.)
        if (state.plan.castCaster) {
            await actor.createEmbeddedDocuments("Item", [ruleEffectSource(state.plan.castCaster, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${actor.name}: ${state.plan.castCaster.words}.`);
        }
        const cast = await castFromItem({ actor, token: token ?? undefined, spell: request.spell, rank: request.rank ?? undefined, dc: request.dc ?? undefined, counteract: request.counteract ?? undefined, targets: castTargets, item: request.item });
        lines.push(`${actor.name} casts ${spellName}${cast?.rank ? ` at rank ${cast.rank}` : ""}${castTargets.length && !selfOf(state) ? ` at ${castTargets.map((target) => target.name).join(", ")}` : ""}.`);
        // (The item's duration for the spell's Effects: scripts/cast-duration.js.)
        // (Or the chosen spell's own, Cloak of the False Foe's Medium cryptid's hour and Large cryptid's 10 minutes.)
        const duration = chosenSpell(state).castDuration ?? state.plan.castDuration;
        const lasts = duration ? await rememberCastDuration(cast, duration, { actor, targets: targetTokens }) : null;
        if (lasts) lines.push(lasts);
        // (Healing at the end of each of its user's turns for the item's time: scripts/turn-heal.js.)
        const heals = state.plan.turnHeal ? await rememberTurnHeal(state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : actor, state.plan.turnHeal, { item: state.item, duration: state.plan.castDuration }) : null;
        if (heals) lines.push(heals);
        if (smoke) lines.push(smoke);
        if (arrival) lines.push(arrival);
        // (A note Effect beside the spell with its user's numbers, Enigma-Sight Potion's Truesight checks: src/compiler/cast-note.js.)
        if (state.plan.castNote) {
            const words = castNoteText(state.plan.castNote, { perception: Number(actor.perception?.mod ?? actor.system?.perception?.mod), level: Number(actor.level) });
            await actor.createEmbeddedDocuments("Item", [itemNoteSource({ name: state.plan.castNote.label, words, duration: state.plan.castNote.duration, img: "icons/svg/eye.svg" }, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${actor.name}: ${words}`);
        }
        // (A light spell against darkness, Dawnlight's: its counteract card, the spell's rank and 1 more — src/live/cast-card.js darkLightCounteract.)
        const dark = darkLightCounteract(state.plan, chosenSpell(state), cast?.rank ?? request.rank);
        if (dark) {
            await postCounteractAt({ counteract: dark, item: state.item, user: state.user, drinkers: [] });
            lines.push(`If it meets magical darkness: its counteract card follows (rank ${dark.rank ?? "the spell's + 1"}, +${dark.modifier}).`);
        }
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
