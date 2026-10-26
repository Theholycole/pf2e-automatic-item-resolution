// The cast card: an item that casts a spell PF2e has no Effect for (Invisibility Potion, Fade Band, Truesight Potion,
// Crystal Ball's Scrying). Apply asks the spell module to cast it through PF2e (its api.castFromItem, the user's answer 4
// of 2026-10-15): on the drinker for a potion ("you gain the effects of"), on its user for a talisman ("casts … on
// you"), or at the targets of whoever presses Apply for a spell aimed at others; an area or untargeted spell as the
// spell module places it. Several spells to choose from ("cast either Darkvision or See the Unseen"): a picker. Pure;
// the ability module's classes.

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
export const lastsWords = (castDuration) => (castDuration ? `lasts ${timeWords(castDuration)}${castDuration.atLevel ? ` (${timeWords(castDuration.atLevel)} from level ${castDuration.atLevel.level})` : ""}` : null);

export function castCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const plan = state.plan;
    const chosen = chosenSpell(state);
    const numbers = [chosen.rank ? `rank ${chosen.rank}` : null, plan.dc ? `DC ${plan.dc}` : null, Number.isFinite(plan.attack) ? `counteract +${plan.attack}` : null, lastsWords(plan.castDuration)].filter(Boolean).join(", ");
    const caster = casterOf(state);
    // (Several spells to choose from: a picker while it's open.)
    const pick = plan.choices?.length > 1 && open && canApply
        ? `<p class="aar-actions">Spell: <select data-air-field="choice">${plan.choices.map((entry, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(entry.spell.name)}${entry.rank ? ` (rank ${entry.rank})` : ""}</option>`).join("")}</select></p>`
        : "";
    const who = state.drinker === null || state.drinker === undefined
        ? `<p class="aar-actions">${selfOf(state) ? `On ${escape(caster.name)}` : needsTargets(plan, chosen) ? "At the targets of whoever applies it" : "Placed or aimed as the spell says"}</p>`
        : open && canApply && state.drinkers.length > 1
            ? `<p class="aar-actions">Drinker: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Drinker: ${escape(caster.name)}</p>`;
    const notes = open && (plan.notes ?? []).length ? `<ul class="aar-notes">${plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const label = plan.choices?.length > 1 && open ? "the chosen spell" : chosen.spell.name ?? "the spell";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Cast ${escape(label)}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to cast it.</p>` : "";
    const heading = plan.choices?.length > 1 && open ? plan.choices.map((entry) => entry.spell.name).join(" or ") : chosen.spell.name ?? "a spell";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(heading)}${numbers && !(plan.choices?.length > 1 && open) ? ` (${escape(numbers)})` : ""}</span></header>${pick}${who}${notes}${results}${controls}</section>`;
}
