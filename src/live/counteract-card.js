// The counteract card (src/compiler/counteract.js; the user's answer of 2026-10-15): an item that counteracts what afflicts
// its drinker. Two steps:
//   1. pick the drinker (the user, or a creature next to them) and find what on them the item can counteract;
//   2. the card lists those — each Effect with the trait or granting a listed condition, each listed condition no Effect
//      grants, each curse, disease or poison — with its DC and counteract rank, filled in when PF2e knows them (an Effect's
//      level, its origin's class or spell DC; an affliction's DC and half its level) and typed by the GM otherwise; it rolls
//      the item's counteract check for each one ticked and removes those it counteracts (PF2e's counteract rule).
// Pure; the ability module's classes.

import { DEGREE_WORDS, degreeOf } from "./reroll-card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function createCounteractCard({ counteract, item, user, drinkers = [], only = false }) {
    // (only: the creatures given and not its user, a Strike's hit's — Awakened Silver Shot's creature hit.)
    const choices = only && drinkers.length ? drinkers : [user, ...drinkers.filter((entry) => entry.actorUuid !== user.actorUuid || entry.tokenUuid !== user.tokenUuid)];
    // (Not on a creature — the triggering spell, a magical fire: straight to its one row, its DC and rank the GM's.)
    if (counteract.free) return { kind: "counteract", status: "open", step: "pick", counteract, item, user, drinkers: choices, drinker: 0, rows: [{ id: "free", name: counteract.free.name, kind: "free", rank: null, dc: null, ticked: true }], results: [] };
    return { kind: "counteract", status: "open", step: "find", counteract, item, user, drinkers: choices, drinker: 0, rows: [], results: [] };
}

// PF2e's counteract rule: a critical success counteracts up to 3 ranks above the check's, a success up to 1 above, a failure
// only a lower rank, a critical failure nothing. degree: 0 … 3.
export function counteracts(degree, ours, theirs) {
    if (!Number.isFinite(theirs) || !Number.isFinite(ours)) return false;
    return degree === 3 ? theirs <= ours + 3 : degree === 2 ? theirs <= ours + 1 : degree === 1 ? theirs < ours : false;
}

// What the item can counteract on the creature: rows [{ id, name, kind, rank, dc, ticked }]. creature: { effects: [{ id, name,
// traits, level, dc }], conditions: [{ id, slug, name, value, grantedBy }], afflictions: [{ id, name, traits, level, dc }] }.
export function counteractCandidates(creature, counteract) {
    const rows = [];
    const grantsOf = (effect) => (creature.conditions ?? []).filter((condition) => condition.grantedBy === effect.id).map((condition) => condition.slug);
    const fits = (traits) => (counteract.traits ?? []).some((trait) => traits.includes(trait)) || (counteract.afflictions ?? []).some((kind) => traits.includes(kind));
    for (const effect of creature.effects ?? []) {
        const grants = grantsOf(effect);
        // (A spell's Effect, for an item that counteracts a spell: each one the creature has.)
        // (Or a magical one too, Determination's "spell or other magical effect": one with the magical trait or a tradition's.)
        const magical = counteract.magical && (effect.traits ?? []).some((trait) => ["magical", "arcane", "divine", "occult", "primal"].includes(trait));
        // (Or what one creature put on it, Awakened Cold Iron Shot's "the spell or effect the target is using to manipulate that creature's mind":
        // each Effect whose origin is that creature, the GM ticking the one.)
        if (counteract.originActorUuid) {
            if (effect.origin !== counteract.originActorUuid) continue;
        } else if (counteract.spells ? !effect.spell && !magical : !fits(effect.traits ?? []) && !grants.some((slug) => (counteract.conditions ?? []).includes(slug))) continue;
        rows.push({ id: effect.id, name: effect.name, kind: "effect", rank: Number.isFinite(effect.level) ? effect.level : null, dc: Number.isFinite(effect.dc) ? effect.dc : null });
    }
    // (A condition no listed Effect grants: itself, the GM's numbers.)
    for (const condition of creature.conditions ?? []) {
        if (!(counteract.conditions ?? []).includes(condition.slug) || (condition.grantedBy && rows.some((row) => row.id === condition.grantedBy))) continue;
        // (PF2e's condition names carry their value already: "Clumsy 1".)
        const name = condition.name ?? condition.slug;
        rows.push({ id: condition.id, name: Number.isFinite(condition.value) && !new RegExp(String.raw`\b${condition.value}$`).test(name) ? `${name} ${condition.value}` : name, kind: "condition", slug: condition.slug, rank: null, dc: null, ...(counteract.endsConditions ? { ends: true } : {}) });
    }
    for (const affliction of creature.afflictions ?? []) {
        if (!fits(affliction.traits ?? [])) continue;
        rows.push({ id: affliction.id, name: affliction.name, kind: "affliction", rank: Number.isFinite(affliction.level) ? Math.ceil(affliction.level / 2) : null, dc: Number.isFinite(affliction.dc) ? affliction.dc : null });
    }
    // (Which are ticked: all for "each"; the highest rank for "highest"; for "one", the only one, else the GM picks.)
    const highest = rows.reduce((best, row, index) => (best === null || (row.rank ?? -1) > (rows[best].rank ?? -1) ? index : best), null);
    return rows.map((row, index) => ({ ...row, ticked: counteract.pick === "each" || (counteract.pick === "highest" && index === highest) || (counteract.pick === "one" && rows.length === 1) }));
}

// One row's result: { degree, total, removed }.
export function counteractResult({ total, natural, dc, ours, theirs }) {
    const degree = degreeOf({ total, dc, natural });
    return { degree, removed: degree !== null && counteracts(degree, ours, theirs) };
}

const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0] ?? "");
// "Counteract +8, rank 2: each effect inflicting clumsy or enfeebled, or with the emotion trait".
export function counteractText(counteract) {
    // ("Counteract +22, rank 8: one spell or magical effect on you, or one condition, which ends outright" — Determination's.)
    if (counteract.endsConditions) return `Counteract +${counteract.modifier}, rank ${counteract.rank}: one spell or magical effect on you, or one condition, which ends outright`;
    // ("Counteract +7, rank 2: one spell on a creature within 30 feet".)
    if (counteract.spells) return `Counteract +${counteract.modifier}, rank ${counteract.rank}: one spell on a creature${counteract.within ? ` within ${counteract.within} feet` : ""}`;
    // ("Counteract +26, rank 7: the triggering spell".)
    if (counteract.free) return `Counteract +${counteract.modifier}${Number.isFinite(counteract.rank) ? `, rank ${counteract.rank}` : ""}: ${counteract.free.name}`;
    // ("Counteract +27, rank 9: the effect the creature hit uses on this creature's mind" — Awakened Cold Iron Shot's.)
    if (counteract.origin === "target") return `Counteract +${counteract.modifier}, rank ${counteract.rank}: the effect the creature hit uses on this creature's mind${counteract.failToSuccess ? ` (a failure is a success against a ${list(counteract.failToSuccess.traits)})` : ""}`;
    const what = [
        counteract.conditions?.length ? `inflicting ${list(counteract.conditions)}` : null,
        counteract.traits?.length ? `with the ${list(counteract.traits)} trait` : null,
        counteract.afflictions?.length ? `a ${list(counteract.afflictions)}` : null
    ].filter(Boolean).join(", or ");
    const how = counteract.pick === "each" ? "each effect" : counteract.pick === "highest" ? "the highest-rank effect" : "one effect";
    return `Counteract +${counteract.modifier}, rank ${counteract.rank}: ${how} ${what}${counteract.failToSuccess ? ` (a failure is a success against a ${list(counteract.failToSuccess.traits)})` : ""}`;
}

export function counteractCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const who = state.drinkers[state.drinker] ?? state.user;
    const head = `<p class="aar-actions">${escape(counteractText(state.counteract))}</p>`;
    // (A condition after it, Fu Water's Sickened 1: a line of its own.)
    // (And a spell's effects on its user after it, Draconal Mask's Truesight for 1 minute.)
    const spell = state.counteract.thenSpell;
    const thenLine = [...(state.counteract.then ? [`Then ${state.counteract.then.slug} ${state.counteract.then.value}, whatever the result.`] : []), ...(spell ? [`Then its user gains the effects of ${spell.name} for ${spell.value} ${spell.value === 1 ? spell.unit.replace(/s$/, "") : spell.unit} (the spell module casts it).`] : [])];
    // (And its flat check after it, Aeon Stone (Pale Lavender Ellipsoid)'s DC 5: the item becomes another on a failure.)
    const burnout = state.counteract.burnout;
    const burnLine = burnout ? [`Then a flat check (DC ${burnout.dc}); if it fails, the item turns into ${burnout.becomes.name}.`] : [];
    const listed = [...thenLine, ...burnLine, ...(state.counteract.notes ?? [])];
    const notes = open && listed.length ? `<ul class="aar-notes">${listed.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    let body = "";
    let button = "";
    if (open && state.step === "find") {
        body = canApply && state.drinkers.length > 1
            ? `<p class="aar-actions">On: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">On: ${escape(who.name)}</p>`;
        button = "Find what it counteracts";
    } else if (open && state.step === "pick") {
        // (A free one's creature, when what it keeps that creature from is its own line — Devil's Trap's devil: picked here.)
        const whom = state.counteract.free && state.counteract.afterFree && canApply && state.drinkers.length > 1
            ? `<p class="aar-actions">The creature: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : "";
        body = whom + (state.rows.length
            ? `${state.counteract.free ? `<p class="aar-actions">Its DC and rank${Number.isFinite(state.counteract.rank) ? "" : `, and the item's counteract rank <input type="number" data-air-ownrank value="${escape(state.ownRank ?? "")}" style="width:3em"${canApply ? "" : " disabled"}>`}:</p><ul class="aar-targets">` : `<p class="aar-actions">On ${escape(who.name)}${state.counteract.pick === "one" ? " (tick one)" : ""}:</p><ul class="aar-targets">`}${state.rows.map((row, index) => `<li class="aar-target"><label><input type="checkbox" data-air-row="${index}"${row.ticked ? " checked" : ""}${canApply ? "" : " disabled"}> ${escape(row.name)}</label>${row.ends ? " (ends outright)" : ` DC <input type="number" data-air-dc="${index}" value="${row.dc ?? ""}" style="width:3.5em"${canApply ? "" : " disabled"}> rank <input type="number" data-air-rank="${index}" value="${row.rank ?? ""}" style="width:3em"${canApply ? "" : " disabled"}>${state.counteract.outrightBelow && row.kind === "condition" ? ` <label><input type="checkbox" data-air-outright="${index}"${row.outright ? " checked" : ""}${canApply ? "" : " disabled"}> its source over ${state.counteract.outrightBelow.levels} levels below yours: countered outright</label>` : ""}`}</li>`).join("")}</ul>`
            : `<p class="aar-hint">${escape(who.name)} has nothing this counteracts.</p>`);
        button = state.rows.length ? "Counteract" : "";
    }
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && button ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${escape(button)}</button></footer>` : open && button ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">counteract</span></header>${head}${notes}${body}${results}${controls}</section>`;
}

export { DEGREE_WORDS };
