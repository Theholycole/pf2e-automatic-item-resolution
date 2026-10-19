// The table card: an item whose effect is a roll on its own table (src/compiler/random-table.js) — Roll rolls the die, and the row it
// lands on posts its own card (a cast, a save at the targets, the item card) or its words for the GM (scripts/table.js). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isTable = (plan) => plan?.builtin === "table" && (plan.table?.rows?.length ?? 0) > 1;

export function createTableCard({ plan, item, user }) {
    return { kind: "table", status: "open", plan, item, user, results: [] };
}

export function tableCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const table = state.plan.table;
    const read = table.rows.filter((row) => row.plan).length;
    const summary = `<p class="aar-actions">Roll ${escape(table.die)} on its table (${table.rows.length} rows, ${read} with their own card).</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const hint = open && canApply ? `<p class="aar-hint">Target the creature it's aimed at first, then press Roll.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Roll</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(table.die)} table</span></header>${summary}${notes}${hint}${results}${controls}</section>`;
}
