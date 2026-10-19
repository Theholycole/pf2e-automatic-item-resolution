// The Focus Point card (src/compiler/focus.js): an activation that gives its user a Focus Point. Apply adds it, up to
// the pool's maximum (as the spell module gives its "+" features' points); one that's lost at the end of the turn is
// taken back then if it wasn't spent (scripts/focus.js). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function createFocusCard({ plan, item, user }) {
    return { kind: "focus", status: "open", plan, item, user, results: [] };
}

// What it gives, in words: "1 Focus Point, only to cast a witch hex spell; lost at the end of the turn if not spent".
// (word: the point's name, "Focus Point" — or a Mythic Point's, "Mythic Point" or "Hero Point" as the world setting has it.)
export const pointWord = (focus, word = null) => word ?? (focus?.resource === "mythic" ? "Mythic Point" : "Focus Point");
export function focusText(focus, word = null) {
    const points = `${focus.amount} ${pointWord(focus, word)}${focus.amount === 1 ? "" : "s"}`;
    return [focus.only ? `${points}, only to ${focus.only}` : points, focus.lost === "turn-end" ? "lost at the end of the turn if not spent" : null].filter(Boolean).join("; ");
}

// The pool after the gain: { value, gained } — none without a pool, none over its maximum.
export function poolAfter(pool, amount) {
    const max = Number(pool?.max) || 0;
    const value = Number(pool?.value) || 0;
    if (max <= 0) return { value, gained: 0, max, reason: "no-pool" };
    const next = Math.min(max, value + amount);
    return { value: next, gained: next - value, max, reason: next === value ? "full" : null };
}

// At the end of the turn: the points to take back, those of the gain still unspent (the pool above what it was).
export function unspent(grant, pool) {
    const value = Number(pool?.value) || 0;
    return Math.max(0, Math.min(Number(grant?.gained) || 0, value - (Number(grant?.before) || 0)));
}

export function focusCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const word = pointWord(state.plan.focus, state.word ?? null);
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Gain the ${word}${state.plan.focus.amount === 1 ? "" : "s"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(word)}</span></header><p class="aar-actions">${escape(state.user.name)}: ${escape(focusText(state.plan.focus, word))}</p>${results}${controls}</section>`;
}
