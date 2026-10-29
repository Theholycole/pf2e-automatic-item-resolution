// Live play for items that cast a spell PF2e has no Effect for (src/live/cast-card.js): the spell module casts it
// through PF2e (its api.castFromItem), so its own cast handling resolves it as any cast.

import { CONTRACT, contractChoices, contractRefusal, dayOf, withContractCast } from "../src/live/contract-spells.js";
import { rememberStrikeSustain } from "./strike-sustain.js";
import { castCardHTML, castChanges, castLinkSource, castRequest, chosenSpell, createCastCard, darkLightCounteract, needsTargets, selfOf } from "../src/live/cast-card.js";
import { postCounteractAt } from "./counteract.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { FLAG, MODULE_ID, creaturesNear, destroyUsedItem, entryOf, originOptionsOf, ownerDCsOf, spaceOf, stateOf } from "./foundry.js";
import { castRankAt } from "../src/compiler/cast-owner.js";
import { rankFromLevel } from "../src/compiler/unique-rules.js";
import { impulseNumbers } from "../src/compiler/cast-changes.js";
import { rememberCastDuration } from "./cast-duration.js";
import { smokeAfterMove } from "./cast-smoke.js";
import { arrivalAfterMove } from "./cast-arrival.js";
import { castDamageSource, castDegreeEffectSource, castPenaltySource, itemNoteSource, ruleEffectSource } from "../src/live/card.js";
import { castNoteText } from "../src/compiler/cast-note.js";
import { rememberTurnHeal } from "./turn-heal.js";
import { startItemZone } from "./zones.js";
import { createExposureCard, exposureCardHTML } from "../src/live/poison-card.js";

const SPELL_ID = "pf2e-automatic-resolution";

export async function postCastCard({ message, plan, used, actor, token }) {
    // (A contract's selected spells, Limitless Power's: its record on the item narrowing the choices — src/live/contract-spells.js.)
    if (plan.contract) {
        const holder = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
        const choices = contractChoices(plan, holder?.getFlag?.(MODULE_ID, CONTRACT), dayOf(game.time.worldTime));
        if (!choices.length) throw new Error(`${used.data.name}: each of its spells has been cast today.`);
        plan = { ...plan, choices, spell: choices[0].spell, rank: choices[0].rank };
    }
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
// time. → the card's lines. casterKnew: whether its caster knew castBonus.ifKnows before the cast.
export async function giveCastBonus(state, actors, { casterKnew = false } = {}) {
    // (Or PF2e's own rules for it, The Courtesan's degree better to Impersonate: castBonus.rules, its time castBonus.duration — 2026-10-27.)
    const { modifiers = [], said, ifKnows, rules = null } = state.plan.castBonus;
    // (Only for a caster who already has that spell or ritual, the Oculus of Abaddon's Binding Circle: none otherwise — 2026-10-27. Read before the
    // cast: the spell module's cast puts the spell among its caster's own, 2026-10-29.)
    if (ifKnows && !casterKnew) return [`No ${said.replace(/^(?:and|with) /i, "")}: its caster doesn't know ${ifKnows}.`];
    const time = state.plan.castBonus.duration ?? modifiers[0].duration;
    const words = said.replace(/^(?:and|with) /i, "");
    const lines = [];
    for (const actor of actors) {
        await actor.createEmbeddedDocuments("Item", [{
            name: `${state.item.name}: ${words.replace(/ for \d+ \w+$/, "")}`,
            type: "effect",
            img: state.item.img ?? "icons/svg/upgrade.svg",
            flags: { [MODULE_ID]: { castBonus: true } },
            system: { description: { value: `<p>${words.charAt(0).toUpperCase()}${words.slice(1)} (${state.item.name}).</p>` }, duration: { value: time.value, unit: time.unit, expiry: time.expiry ?? "turn-start", sustained: false }, start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null }, tokenIcon: { show: true },
                rules: rules ?? modifiers.map((modifier) => ({ key: "FlatModifier", selector: modifier.selector, type: modifier.type, value: modifier.value, label: state.item.name, ...(modifier.predicate ? { predicate: modifier.predicate } : {}) })) }
        }]);
        lines.push(`${actor.name} gains ${words}.`);
    }
    return lines;
}

// PF2e's own Effects with the cast (plan.castLinks, Assassin's Bracers'): each made from its compendium Effect on its user, or on the one creature
// the presser targets — the user's TokenMark at it. → the card's lines.
async function giveCastLinks(state, { user, designated }) {
    const lines = [];
    for (const link of state.plan.castLinks) {
        const template = (await fromUuid(link.uuid).catch(() => null))?.toObject?.();
        const actors = link.on === "user" ? [user] : designated.map((token) => token.actor);
        if (!template) {
            lines.push(`${link.label}: apply it by hand (PF2e's Effect wasn't found).`);
            continue;
        }
        for (const actor of actors.filter(Boolean)) {
            const source = castLinkSource(template, link, { markUuid: designated[0]?.document?.uuid ?? designated[0]?.uuid ?? null, item: state.item, user: state.user, originOptions: originOptionsOf(state.item?.uuid, state.user?.actorUuid), worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null });
            await actor.createEmbeddedDocuments("Item", [source]);
            lines.push(`${actor.name} gains ${template.name}.`);
        }
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
        // (The creature its linked Effects are for, Assassin's Bracers' designated one: one, the presser's target, within its distance.)
        const forTarget = (state.plan.castLinks ?? []).find((link) => link.on === "target");
        const designated = forTarget ? (await Promise.all((Array.isArray(targets) ? targets : []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean) : [];
        if (forTarget && designated.length !== 1) throw new Error("Target the one creature it designates first.");
        const tooFar = forTarget?.within ? beyondRange({ feet: forTarget.within }, token, actor, designated) : [];
        if (tooFar.length) throw new Error(`${tooFar.join(", ")} is beyond ${forTarget.within} feet.`);
        const targetTokens = (await Promise.all(request.targetUuids.map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
        // (Its rank from the body its user targets, Shadowed Scale, the Jungle Secret's half the slain creature's level: one its other activation
        // decomposed (that Effect's roll option), adjacent to its caster — the body no target of the spell. src/compiler/unique-rules.js, 2026-10-27.)
        const by = state.plan.castRankBy;
        const bodyToken = by ? targetTokens[0] ?? null : null;
        if (by) {
            const body = bodyToken?.actor ?? null;
            if (!body) throw new Error(`Target ${by.target} first.`);
            if (by.mark && !(body.itemTypes?.effect ?? []).some((effect) => (effect.system?.rules ?? []).some((rule) => rule?.key === "RollOption" && rule.option === by.mark))) throw new Error(`${bodyToken.name ?? body.name} isn't ${by.target}.`);
            const placeable = token?.object ?? token;
            const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
            if (by.within && placeable && canvas?.ready && distanceFeet(spaceOf(placeable), spaceOf(bodyToken.object ?? bodyToken), grid) > by.within) throw new Error(`${bodyToken.name ?? body.name} is more than ${by.within} feet from ${actor.name}.`);
            request.rank = rankFromLevel(by, body.level);
            lines.push(`${bodyToken.name ?? body.name} was level ${body.level}: ${spellName} at rank ${request.rank}.`);
        }
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
            const degree = state.plan.castDegree;
            for (const target of targetTokens) {
                const traits = [...(target.actor?.traits ?? new Set(target.actor?.system?.traits?.value ?? []))];
                // (Or below a level, the Oculus of Abaddon's mass suggestion: those under 7th level can't save, their save a failure — 2026-10-27.)
                const fits = degree.belowLevel ? Number(target.actor?.level) < degree.belowLevel : (degree.traits ?? []).some((trait) => traits.includes(trait));
                if (!target.actor || !fits) continue;
                await target.actor.createEmbeddedDocuments("Item", [castDegreeEffectSource(degree, spellName, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                lines.push(degree.belowLevel ? `${target.name}, below level ${degree.belowLevel}: it can't resist, its save a failure.` : `${target.name}, a ${degree.traits.join(" or ")}: its save is one degree worse.`);
            }
        }
        // (Creatures of a kind immune and others worse off, Castrovel's Beacon's elves and demons: the immune targeted left out of the cast, the
        // others' penalty on them before it.)
        let castTargets = bodyToken ? targetTokens.filter((target) => target !== bodyToken) : targetTokens;
        if (state.plan.castTraits) {
            const traitsOf = (target) => [...(target.actor?.traits ?? new Set(target.actor?.system?.traits?.value ?? []))];
            // (Or its user itself, Dragonfire Halfbow's "You and your mount are immune": its own token left out — castTraits.user.)
            // (Or only those of a kind, Orb of Dragonkind's dragon: the others left out — 2026-10-27.)
            const own = (target) => Boolean(state.plan.castTraits.user) && (target.uuid ?? target.document?.uuid) === (token?.uuid ?? token?.document?.uuid ?? request.casterTokenUuid);
            const only = state.plan.castTraits.only ?? [];
            const ofKind = (target) => state.plan.castTraits.immune.some((trait) => traitsOf(target).includes(trait));
            const immune = targetTokens.filter((target) => own(target) || ofKind(target) || (only.length && !only.some((trait) => traitsOf(target).includes(trait))));
            castTargets = targetTokens.filter((target) => !immune.includes(target));
            for (const target of immune) lines.push(own(target) ? `${target.name} is immune (its user): left out of the cast.` : ofKind(target) ? `${target.name} is immune (${state.plan.castTraits.immune.join(" or ")}): left out of the cast.` : `${target.name} isn't a ${only.join(" or ")}: left out of the cast.`);
            for (const given of state.plan.castTraits.penalties) {
                // (Its value the weapon's damage dice, Blessed Reformer's: read off the weapon now, its runes as they are — 2026-10-29.)
                const holder = given.valueFrom === "weapon-dice" ? await fromUuid(state.item.uuid).catch(() => null) : null;
                const dice = holder ? Number(holder.system?.damage?.dice) || 1 : null;
                const penalty = dice ? { ...given, value: -dice, rules: (given.rules ?? []).map((rule) => (rule.key === "FlatModifier" ? { ...rule, value: -dice } : rule)), words: `${given.words} (−${dice})` } : given;
                for (const target of castTargets.filter((one) => one.actor && (penalty.all || (penalty.traits ?? []).some((trait) => traitsOf(one).includes(trait))))) {
                    await target.actor.createEmbeddedDocuments("Item", [castPenaltySource(penalty, spellName, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                    lines.push(penalty.words ? `${target.name}: ${penalty.words.charAt(0).toLowerCase()}${penalty.words.slice(1)}.` : `${target.name}: ${penalty.value} ${penalty.type} to its ${penalty.selector} saves against it.`);
                }
            }
            if (!targetTokens.length) lines.push(`Target the creatures in its area to leave out ${[...state.plan.castTraits.immune.map((trait) => `the ${trait}s`), ...(state.plan.castTraits.user ? ["its user"] : [])].join(" and ")}${state.plan.castTraits.penalties.length ? " and give the penalty" : ""}.`);
        }
        // (All its damage of one type, Sacred Valkyrie Helm's: PF2e's DamageAlteration on its caster for that spell, before it's cast.)
        if (state.plan.castDamage) {
            await actor.createEmbeddedDocuments("Item", [castDamageSource(state.plan.castDamage, spellName, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null })]);
            lines.push(`All of its ${spellName}'s damage is ${state.plan.castDamage.type} damage.`);
        }
        // (PF2e's rules on its caster for the cast, before it — Soulcutter (Heroic)'s Soulcutting Storm, all its damage spirit: a DamageAlteration
        // on that spell's damage, src/compiler/legend-readings.js, 2026-10-27; the spell module rolls spell damage through PF2e.)
        if (state.plan.castCaster) {
            await actor.createEmbeddedDocuments("Item", [ruleEffectSource(state.plan.castCaster, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${actor.name}: ${state.plan.castCaster.words}.`);
        }
        // (All its damage of one type, Soulcutter's Soulcutting Storm's spirit: the spell module's damageType, once it takes it — its
        // castFromItemOptions says so; until then, a line to change it by hand. 2026-10-27.)
        // (Sacred Valkyrie Helm's "all electricity" too, plan.castDamage: the spell module rolls some spells' damage itself, Weapon Storm's
        // weapon dice, where PF2e's DamageAlteration never reaches — found by the 2026-10-28 case writers; its damageType when it takes one.)
        const wanted = state.plan.castDamageType ?? state.plan.castDamage ?? null;
        const takes = game.modules.get(SPELL_ID)?.api?.castFromItemOptions ?? [];
        const typed = wanted && takes.includes("damageType") ? { damageType: wanted.type } : {};
        if (wanted && !typed.damageType) lines.push(`All its damage is ${wanted.type}: change its type by hand on the spell's damage${state.plan.castDamage ? " where it isn't already" : ""}.`);
        // (The item's other changes to the spell, made by the spell module's castFromItem on its copy — 2026-10-29: Ivory Baton's Dominate without
        // mental, Fan of Soothing Winds' 3-action Heal in a cone with air, Gate Attenuator's spell with its element's trait; by hand where it
        // doesn't take them.)
        const changes = castChanges(state.plan, chosenSpell(state), takes);
        lines.push(...changes.lines);
        // (A contract's spell cast today already, or not its signer's selection: refused.)
        const holder = state.plan.contract && state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
        const refused = holder ? contractRefusal(state.plan, holder.getFlag(MODULE_ID, CONTRACT), chosenSpell(state), dayOf(game.time.worldTime)) : null;
        if (refused) throw new Error(`${state.item.name}: ${refused}.`);
        const knows = state.plan.castBonus?.ifKnows?.toLowerCase();
        const casterKnew = Boolean(knows) && (actor.itemTypes?.spell ?? []).some((spell) => spell.name.toLowerCase() === knows);
        const cast = await castFromItem({ actor, token: token ?? undefined, spell: request.spell, rank: request.rank ?? undefined, dc: request.dc ?? undefined, counteract: request.counteract ?? undefined, targets: castTargets, item: request.item, ...typed, ...changes.options });
        lines.push(`${actor.name} casts ${spellName}${cast?.rank ? ` at rank ${cast.rank}` : ""}${castTargets.length && !selfOf(state) ? ` at ${castTargets.map((target) => target.name).join(", ")}` : ""}.`);
        if (holder) await holder.setFlag(MODULE_ID, CONTRACT, withContractCast(holder.getFlag(MODULE_ID, CONTRACT), chosenSpell(state), dayOf(game.time.worldTime)));
        // (The item's duration for the spell's Effects: scripts/cast-duration.js.)
        // (Or the chosen spell's own, Cloak of the False Foe's Medium cryptid's hour and Large cryptid's 10 minutes.)
        const duration = chosenSpell(state).castDuration ?? state.plan.castDuration;
        const lasts = duration ? await rememberCastDuration(cast, duration, { actor, targets: targetTokens }) : null;
        if (lasts) lines.push(lasts);
        // (Kept up by its user's Strikes with the item, Phoenix Fighting Fan's Quandary: scripts/strike-sustain.js.)
        if (state.plan.castSustain?.by === "strike") {
            const kept = await rememberStrikeSustain(cast, { actor, weaponId: String(state.item.uuid ?? "").split(".").at(-1), name: state.item.name });
            if (kept) lines.push(kept);
        }
        // (Healing at the end of each of its user's turns for the item's time: scripts/turn-heal.js.)
        const heals = state.plan.turnHeal ? await rememberTurnHeal(state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : actor, state.plan.turnHeal, { item: state.item, duration: state.plan.castDuration }) : null;
        if (heals) lines.push(heals);
        if (smoke) lines.push(smoke);
        if (arrival) lines.push(arrival);
        // (A check its user rolls with the chosen cast, Cane of the Maelstrom's Crafting for a delicate or complex object: PF2e's own roll, its DC
        // the object's, the GM's — src/compiler/unique-rules.js withCheckedCreation, 2026-10-27.)
        const check = chosenSpell(state).castCheck;
        if (check) {
            const statistic = actor.getStatistic?.(check.statistic) ?? actor.skills?.[check.statistic] ?? null;
            if (statistic?.roll) await statistic.roll(check.dc ? { dc: { value: check.dc } } : {}).catch((error) => console.error(`${MODULE_ID} | cast check`, error));
            lines.push(statistic?.roll ? `${actor.name} rolls ${check.statistic} ${check.why}${check.dc ? ` (DC ${check.dc})` : "; the GM sets its DC by the object"}.` : `${actor.name}: roll ${check.statistic} ${check.why} by hand.`);
        }
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
        // (PF2e's own Effects with it, Assassin's Bracers': its user's and the designated creature's.)
        if (state.plan.castLinks?.length) lines.push(...await giveCastLinks(state, { user: state.user?.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) ?? actor : actor, designated }));
        // (A bonus with the spell, Psyche Salts': an Effect of PF2e's rules on the creature it's cast on.)
        if (state.plan.castBonus) lines.push(...await giveCastBonus(state, selfOf(state) ? [actor] : targetTokens.map((target) => target.actor).filter(Boolean), { casterKnew }));
        // (A condition on its user with the cast, Locket of Sealed Nightmares' fatigued: PF2e's condition on the item's user.)
        // (A zone over the spell's area beside it, The Beating's difficult terrain: the ability module's, placed once the spell is cast —
        // src/compiler/artifact-readings.js castZone.)
        if (state.plan.castZone) {
            await startItemZone({ plan: { ...state.plan.castZone, item: state.plan.item }, used: { data: { name: state.item.name, uuid: state.item.uuid ?? null } }, actor, token }).catch((error) => console.error(`${MODULE_ID} | cast zone`, error));
            lines.push(`Place ${state.plan.castZone.zone?.terrain?.length ? "its difficult terrain" : "its zone"} over ${spellName}'s area.`);
        }
        // (What the cast spends on its caster, Flame of the Radiant Spark's flame: its Effect of that name, plan.castEndsRule.)
        if (state.plan.castEndsRule) {
            const caster = state.user?.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : actor;
            const ids = (caster?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.ruleEffect === state.plan.castEndsRule).map((effect) => effect.id);
            if (ids.length) await caster.deleteEmbeddedDocuments("Item", ids);
            lines.push(ids.length ? `${caster.name}'s ${state.plan.castEndsRule} is spent.` : `${caster?.name ?? state.user.name} had no ${state.plan.castEndsRule} to spend: remove it by hand if it's there.`);
        }
        // (Its user's own save later beside the cast, Whispering Remnant's nightmares on waking: plan.castAgain, the save card kept for then.)
        if (state.plan.castAgain?.plan) {
            const card = createExposureCard({ plan: state.plan.castAgain.plan, item: state.item, user: state.user, later: true, own: Boolean(state.plan.castAgain.own), when: state.plan.castAgain.when ?? null });
            await ChatMessage.create({ content: exposureCardHTML(card, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: card } } });
            lines.push(`${state.user.name}: its own save's card for later follows.`);
        }
        // (The item consumed by the cast, Phoenix Fighting Fan's Raise Dead: plan.item.destroyed.)
        if (state.plan.item?.destroyed) lines.push(await destroyUsedItem(state.item));
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
