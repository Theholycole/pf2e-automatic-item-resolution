// The cast card: an item that casts a spell PF2e has no Effect for (Invisibility Potion, Fade Band, Truesight Potion,
// Crystal Ball's Scrying). Apply asks the spell module to cast it through PF2e (its api.castFromItem, the user's answer 4
// of 2026-10-15): on the drinker for a potion ("you gain the effects of"), on its user for a talisman ("casts … on
// you"), or at the targets of whoever presses Apply for a spell aimed at others; an area or untargeted spell as the
// spell module places it. Several spells to choose from ("cast either Darkvision or See the Unseen"): a picker. Pure;
// the ability module's classes.

import { rangeWords } from "../compiler/cast-range.js";
import { castNoteText } from "../compiler/cast-note.js";
import { effectSource } from "./card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isCast = (plan) => plan?.builtin === "cast-spell" && Boolean(plan.spell?.uuid);

// drinkers: the user first, then the creatures next to them (a drinker item's self cast only).
export function createCastCard({ plan, item, user, drinkers = [] }) {
    const choose = plan.self && plan.item?.recipient === "drinker";
    const choices = choose ? [user, ...drinkers.filter((entry) => entry.actorUuid !== user.actorUuid || entry.tokenUuid !== user.tokenUuid)] : [];
    return { kind: "cast", status: "open", plan, item, user, drinkers: choices, drinker: choose ? 0 : null, choice: plan.choices?.length ? 0 : null, results: [] };
}

// The spell to cast: the one picked of the item's choices ("cast either Darkvision or See the Unseen"), else its one.
export const chosenSpell = (state) => state.plan.choices?.[state.choice ?? 0] ?? { spell: state.plan.spell, rank: state.plan.rank ?? null };

// Whether the card needs the presser's targets: a spell at others that targets creatures, not an area's (the spell module
// places that) nor one with no target (Translocate, Creation).
// choice: the chosen one of several, whose own (a spell on its user among others at targets) goes first.
export const needsTargets = (plan, choice = null) => !(choice?.self ?? plan.self) && (choice?.targets ?? plan.targets) !== false && !(choice?.area ?? plan.area);
// Whether the chosen spell is cast on its user.
export const selfOf = (state) => Boolean(chosenSpell(state).self ?? state.plan.self);

// Who casts it and on whom: the chosen drinker for a potion's self cast, else the user (with "targets" for a spell at others).
export function casterOf(state) {
    return state.drinker === null || state.drinker === undefined ? state.user : state.drinkers[state.drinker] ?? state.user;
}

// The spell module's call: castFromItem({ actor, token, spell, rank, dc, counteract, targets, item }) — actor, token and
// targets filled in by the caller from these uuids.
export function castRequest(state, { targetUuids = [] } = {}) {
    const caster = casterOf(state);
    return {
        casterUuid: caster.actorUuid,
        casterTokenUuid: caster.tokenUuid ?? null,
        spell: chosenSpell(state).spell.uuid,
        rank: chosenSpell(state).rank ?? null,
        dc: chosenSpell(state).dc ?? state.plan.dc ?? null,
        counteract: state.plan.attack ?? null,
        targetUuids: selfOf(state) ? [caster.tokenUuid].filter(Boolean) : targetUuids,
        item: { name: state.item.name, uuid: state.item.uuid ?? null, img: state.item.img ?? null }
    };
}

// The item's duration for the spell (src/compiler/cast-duration.js): "lasts 10 minutes (1 hour from 17th level)".
const timeWords = (time) => (time.unit === "unlimited" ? "with no time limit" : `${time.value} ${time.value === 1 ? time.unit.replace(/s$/, "") : time.unit}`);
export const lastsWords = (castDuration) => (castDuration ? `lasts ${timeWords(castDuration)}${castDuration.sustained ? " at most, while its user Sustains it (end it sooner if they stop)" : ""}${castDuration.atLevel ? ` (${timeWords(castDuration.atLevel)} from level ${castDuration.atLevel.level})` : ""}` : null);

// Its light spells against darkness (src/compiler/dark-light.js plan.darkLight, Dawnlight's): the chosen spell's counteract card against the
// magical darkness once it's cast — the item's counteract modifier, the spell's rank and rankUp more —, the flash's save card after a success;
// null for a spell without the light trait. rank: the rank it was cast at.
export function darkLightCounteract(plan, chosen, rank) {
    const dark = plan?.darkLight;
    if (!dark || !dark.spells?.includes(chosen?.spell?.uuid) || !Number.isFinite(plan.attack)) return null;
    const own = Number(rank ?? chosen.rank);
    return {
        modifier: plan.attack,
        rank: Number.isFinite(own) ? own + dark.rankUp : null,
        conditions: [],
        traits: [],
        afflictions: [],
        free: { name: "the magical darkness" },
        pick: "one",
        notes: [`${chosen.spell.name} counts ${dark.rankUp} rank higher against darkness.`, ...(dark.flash ? ["If it counteracts the darkness, a flash of light: the save card for the creatures with darkvision in the spell's area or targeted by it follows."] : [])],
        ...(dark.flash ? { flash: dark.flash } : {})
    };
}
// The cast card's line for it.
export const darkLightWords = (plan) => (plan?.darkLight ? `Its ${plan.darkLight.spells.length > 1 ? "light spells count" : "light spell counts"} ${plan.darkLight.rankUp} rank higher to counteract darkness: its counteract card follows the cast${plan.darkLight.flash ? `, and a success flashes — a DC ${plan.darkLight.flash.resolution.check.against.value} Fortitude save or Dazzled for ${plan.darkLight.flash.resolution.outcomes.failure.effects[0].duration.value} round, only for creatures with darkvision` : ""}.` : null);

// The cast card's line for a kineticist's own numbers (src/compiler/cast-changes.js castImpulse).
export const impulseWords = "A kineticist whose kinetic elements include the spell's casts it with its impulse DC and attack modifier where they're better.";

// PF2e's own Effects made with the cast (src/compiler/adventure-readings.js plan.castLinks, Assassin's Bracers' Focus on the Doomed): its
// user's and the creature it designates — in words, and each one's source from its compendium Effect, its TokenMark at that creature.
export const castLinksWords = (links) => `With it: ${links.map((link) => `${link.label} on ${link.on === "user" ? "its user" : "the creature targeted"}`).join(", ")} (PF2e's Effects)`;
export function castLinkSource(template, link, { markUuid = null, item = {}, user = {}, worldTime = 0, initiative = null } = {}) {
    const source = effectSource(template, { item, user, worldTime, initiative });
    if (link.mark && markUuid) source.system.rules = (source.system.rules ?? []).map((rule) => (rule?.key === "TokenMark" ? { ...rule, uuid: markUuid } : rule));
    return source;
}

export function castCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const plan = state.plan;
    const chosen = chosenSpell(state);
    // (Its rank and DC from its caster, The Inquisitor's: in words until it's cast.)
    const numbers = [chosen.rank ? `rank ${chosen.rank}` : plan.castRank ? `rank half its caster's level, rounded ${plan.castRank.round} (at least ${plan.castRank.min})` : null, plan.dc ? `DC ${plan.dc}` : plan.castDC ? (plan.castDC.from === "class-spell" ? "DC its caster's class DC or spell DC, the higher" : `DC its caster's ${plan.castDC.from} DC`) : null, Number.isFinite(plan.attack) ? `counteract +${plan.attack}` : null, lastsWords(plan.castDuration), rangeWords(plan.castRange), plan.castTargets ? `up to ${plan.castTargets.max} targets` : null].filter(Boolean).join(", ");
    // (A condition on its user with the cast, Locket of Sealed Nightmares': a line of its own, with several spells too.)
    const self = `${plan.castSelf ? `<p class="aar-actions">With it, its user becomes ${escape(plan.castSelf.slug)}${plan.castSelf.value ? ` ${escape(plan.castSelf.value)}` : ""}.</p>` : ""}${open && plan.darkLight ? `<p class="aar-actions">${escape(darkLightWords(plan))}</p>` : ""}${open && plan.castArrival ? `<p class="aar-actions">${escape(`Where it leaves and where it arrives: ${plan.castArrival.words} (its card follows the move).`)}</p>` : ""}${open && plan.castNote ? `<p class="aar-actions">${escape(`With it, a note on its caster: ${castNoteText(plan.castNote)}`)}</p>` : ""}${open && plan.castImpulse ? `<p class="aar-actions">${escape(impulseWords)}</p>` : ""}`;
    const caster = casterOf(state);
    // (Several spells to choose from: a picker while it's open.)
    const pick = plan.choices?.length > 1 && open && canApply
        ? `<p class="aar-actions">Spell: <select data-air-field="choice">${plan.choices.map((entry, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(entry.spell.name)}${entry.rank ? ` (rank ${entry.rank})` : ""}${entry.self === false && state.plan.self ? " on another creature" : ""}${entry.touch ? " by touch" : ""}${entry.minLevel ? ` (from level ${entry.minLevel})` : ""}${entry.dc ? `, DC ${escape(entry.dc)}` : ""}${entry.when ? ` (${escape(entry.when)})` : ""}</option>`).join("")}</select></p>`
        : "";
    const who = state.drinker === null || state.drinker === undefined
        ? `<p class="aar-actions">${selfOf(state) ? `On ${escape(caster.name)}` : needsTargets(plan, chosen) ? "At the targets of whoever applies it" : "Placed or aimed as the spell says"}</p>`
        : open && canApply && state.drinkers.length > 1
            ? `<p class="aar-actions">Drinker: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Drinker: ${escape(caster.name)}</p>`;
    // (And its lines, what's its user's, the map's or the GM's to do — src/compiler/cast-changes.js castLines — before its notes.)
    const said = [...(plan.castLines ?? []), ...(plan.castLinks?.length ? [castLinksWords(plan.castLinks)] : []), ...(plan.castDamage ? [`All of its damage is ${plan.castDamage.type} damage (PF2e's DamageAlteration on its caster)`] : []), ...(plan.notes ?? [])];
    const notes = open && said.length ? `<ul class="aar-notes">${said.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const label = plan.choices?.length > 1 && open ? "the chosen spell" : chosen.spell.name ?? "the spell";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Cast ${escape(label)}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to cast it.</p>` : "";
    const heading = plan.choices?.length > 1 && open ? plan.choices.map((entry) => entry.spell.name).join(" or ") : chosen.spell.name ?? "a spell";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(heading)}${numbers && !(plan.choices?.length > 1 && open) ? ` (${escape(numbers)})` : ""}</span></header>${pick}${who}${self}${notes}${results}${controls}</section>`;
}
