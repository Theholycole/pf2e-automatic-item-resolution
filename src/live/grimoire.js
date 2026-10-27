// A spell the GM grants for a day (2026-10-27, src/compiler/relic-readings.js plan.grantSpell: Grimoire of Unknown Necessities): "temporary
// knowledge of a single spell of the highest rank you're capable of casting that you don't already have recorded …, chosen by the GM", gone
// "at the start of the next day" with every copy made of it. { tradition, prepared, rank: "highest", until: "next-day" }: the card's
// spell is named by the GM; Apply puts it in its user's prepared spellcasting entry of that tradition (refusing one of another rank, or
// one already there), flagged with its day; at its user's next rest (PF2e's pf2e.restForTheNight) or the next day's start, it's gone,
// and with it every scroll, wand or spell of it its user made since (scripts/grimoire.js). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isGrantSpell = (plan) => plan?.builtin === "grant-spell" && Boolean(plan.grantSpell);

// The highest rank a prepared entry casts: its slots' highest with any (slot1 … slot10).
export function highestRank(slots) {
    let best = 0;
    for (const [key, slot] of Object.entries(slots ?? {})) {
        const rank = Number(/^slot(\d+)$/.exec(key)?.[1]);
        if (rank > 0 && Number(slot?.max) > 0) best = Math.max(best, rank);
    }
    return best;
}

// Whether a spell may be granted: { rank, traditions, cantrip, sourceId } against the entry's highest rank, its tradition, and the spells
// already in it (their sourceIds). → null, or why not.
export function grantProblem(spell, { tradition, rank, known = [] }) {
    if (!spell) return "no such spell";
    if (spell.cantrip) return `${spell.name} is a cantrip, not a spell of rank ${rank}`;
    if (Number(spell.rank) !== Number(rank)) return `${spell.name} is rank ${spell.rank}, not ${rank} (the highest its user casts)`;
    if (tradition && !(spell.traditions ?? []).includes(tradition)) return `${spell.name} isn't an ${tradition} spell`;
    if (spell.sourceId && known.includes(spell.sourceId)) return `${spell.name} is already in its user's spellbook`;
    return null;
}

// Its copies to remove with it: the user's items of that spell made since it was granted — scrolls, wands (their spell's sourceId) and
// spells — [{ id, sourceId, createdTime }].
export const copiesSince = (items, sourceId, since) => (items ?? []).filter((item) => item.sourceId === sourceId && Number(item.createdTime) >= Number(since));

export function createGrantCard({ plan, item, user, entry = null, rank = 0 }) {
    return { kind: "grant-spell", status: "open", plan, item, user, entry, rank, results: [] };
}

export function grantCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const line = state.entry
        ? `<p class="aar-actions">The GM names a ${escape(state.plan.grantSpell.tradition)} spell of rank ${state.rank} (the highest ${escape(state.user.name)} casts) not in its spellbook, useful for the day ahead: it's in ${escape(state.entry.name)} until the next day, every copy of it gone then.</p>`
        : `<p class="aar-hint">${escape(state.user.name)} has no ${escape(state.plan.grantSpell.tradition)} prepared spellcasting: its Requirements aren't met.</p>`;
    const field = open && canApply && state.entry ? `<p class="aar-actions">Spell (the GM's pick): <input type="text" data-air-field="spell" placeholder="its name"></p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.entry ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Grant it</button></footer>` : open && state.entry ? `<p class="aar-hint">Waiting for the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">a spell for the day</span></header>${line}${notes}${field}${results}${controls}</section>`;
}
