// The cast card: an item that casts a spell PF2e has no Effect for (Invisibility Potion, Fade Band, Truesight Potion).
// Apply asks the spell module to cast it through PF2e (its api.castFromItem, the user's answer 4 of 2026-10-15): on the
// drinker for a potion ("you gain the effects of"), on its user for a talisman ("casts … on you"), or at the targets
// of whoever presses Apply for a spell aimed at others. Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isCast = (plan) => plan?.builtin === "cast-spell" && Boolean(plan.spell?.uuid);

// drinkers: the user first, then the creatures next to them (a drinker item's self cast only).
export function createCastCard({ plan, item, user, drinkers = [] }) {
    const choose = plan.self && plan.item?.recipient === "drinker";
    const choices = choose ? [user, ...drinkers.filter((entry) => entry.actorUuid !== user.actorUuid || entry.tokenUuid !== user.tokenUuid)] : [];
    return { kind: "cast", status: "open", plan, item, user, drinkers: choices, drinker: choose ? 0 : null, results: [] };
}

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
        spell: state.plan.spell.uuid,
        rank: state.plan.rank ?? null,
        dc: state.plan.dc ?? null,
        counteract: state.plan.attack ?? null,
        targetUuids: state.plan.self ? [caster.tokenUuid].filter(Boolean) : targetUuids,
        item: { name: state.item.name, uuid: state.item.uuid ?? null, img: state.item.img ?? null }
    };
}

export function castCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const plan = state.plan;
    const numbers = [plan.rank ? `rank ${plan.rank}` : null, plan.dc ? `DC ${plan.dc}` : null, Number.isFinite(plan.attack) ? `counteract +${plan.attack}` : null].filter(Boolean).join(", ");
    const caster = casterOf(state);
    const who = state.drinker === null || state.drinker === undefined
        ? `<p class="aar-actions">${plan.self ? `On ${escape(caster.name)}` : "At the targets of whoever applies it"}</p>`
        : open && canApply && state.drinkers.length > 1
            ? `<p class="aar-actions">Drinker: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Drinker: ${escape(caster.name)}</p>`;
    const notes = open && (plan.notes ?? []).length ? `<ul class="aar-notes">${plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Cast ${escape(plan.spell.name ?? "the spell")}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to cast it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(plan.spell.name ?? "a spell")}${numbers ? ` (${escape(numbers)})` : ""}</span></header>${who}${notes}${results}${controls}</section>`;
}
