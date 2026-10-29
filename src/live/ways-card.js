// The ways card (src/compiler/ways.js): a consumable used in one of several ways, each its own Activate block (Toadskin
// Salve's two reactions). Its user picks a way and presses "Use it", which posts that way's own card (the routes any item's
// card takes); the card stays open for the next, listing the ways used. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isWays = (plan) => plan?.builtin === "ways" && (plan.ways?.length ?? 0) > 1;

// (2026-10-28, Hook Chain: a card of so many uses in all, plan.waysMax — closed once they're spent; plan.once, after the first.)
export const waysLeft = (state) => (Number(state.plan?.waysMax) > 0 ? Math.max(0, state.plan.waysMax - (state.results?.length ?? 0)) : null);
export const waysSpent = (state) => Boolean(state.plan?.once) || waysLeft(state) === 0;

export function createWaysCard({ plan, item, user }) {
    return { kind: "ways", status: "open", plan, item, user, ways: plan.ways.map((way) => way.name), choice: 0, results: [] };
}

export function waysCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const pick = canApply
        ? `<p class="aar-actions">Way: <select data-air-field="choice">${state.ways.map((name, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></p>`
        : `<ul class="aar-notes">${state.ways.map((name) => `<li>${escape(name)}</li>`).join("")}</ul>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Use it</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">one of ${state.ways.length} ways${waysLeft(state) !== null ? `, ${waysLeft(state)} use${waysLeft(state) === 1 ? "" : "s"} left` : ""}</span></header>${pick}${results}${controls}</section>`;
}
