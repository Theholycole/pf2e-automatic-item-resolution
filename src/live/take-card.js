// The take card: an item that moves an ally's condition onto its user (src/compiler/take-condition.js) — Take, with the ally targeted, ends
// the ally's condition and gives its user the same one (scripts/take.js). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isTake = (plan) => plan?.builtin === "take-condition" && Boolean(plan.take?.slug);

export function createTakeCard({ plan, item, user }) {
    return { kind: "take", status: "open", plan, item, user, results: [] };
}

// "The targeted ally's persistent bleed damage, moved onto you (within 30 feet)".
export const takeText = (take) => `The targeted ally's persistent ${take.damageType} damage, moved onto you as it is${Number.isFinite(take.range) ? ` (within ${take.range} feet)` : ""}`;

export function takeCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const hint = open && canApply ? `<p class="aar-hint">Target the ally first, then press Take.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Take</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">${escape(takeText(state.plan.take))}.</p>${hint}${results}${controls}</section>`;
}
