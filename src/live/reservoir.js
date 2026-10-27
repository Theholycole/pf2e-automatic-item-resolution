// A weapon's poison reservoir (2026-10-27, src/compiler/artifact-readings.js: Reaper's Lancet, "a hidden reservoir … large enough to hold only
// 3 doses at a time. Any sort of injury-delivered poison can be placed in it, though all doses must be of the same poison" and its reaction,
// "You poison the creature you hit with the poison currently in the reservoir"): its record on the weapon { poison: { name, uuid, plan }, doses },
// filled from its user's own injury poisons, a dose spent on each creature it poisons. Pure.

export const RESERVOIR = "reservoir";
export const isReservoir = (plan) => plan?.builtin === "reservoir" && Boolean(plan.reservoir);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// How many doses of a poison can go in now: none of another poison while doses are left; up to its room.
export function fillable(record, poison, max, quantity) {
    if ((record?.doses ?? 0) > 0 && record.poison?.name !== poison.name) return 0;
    return Math.max(0, Math.min(Number(quantity) || 0, max - (record?.doses ?? 0)));
}

export function createReservoirCard({ plan, item, user, record = null, poisons = [] }) {
    return { kind: "reservoir", status: "open", plan, item, user, record, poisons, pick: 0, results: [] };
}

export function reservoirCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const record = state.record;
    const held = record?.doses ? `${record.doses} dose${record.doses === 1 ? "" : "s"} of ${record.poison.name}` : "empty";
    const fill = open && canApply && state.poisons.length ? `<label class="aar-choice">Fill with: <select data-air-field="pick">${state.poisons.map((entry, index) => `<option value="${index}"${index === state.pick ? " selected" : ""}>${escape(entry.name)} (${escape(entry.quantity)})</option>`).join("")}</select></label>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const buttons = [record?.doses ? `<button type="button" data-air-reservoir="poison">Poison my target</button>` : "", state.poisons.length ? `<button type="button" data-air-reservoir="fill">Fill it (1 minute)</button>` : ""].filter(Boolean).join("");
    const controls = open && canApply && buttons ? `<footer class="aar-controls">${buttons}</footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">Its reservoir: ${escape(held)} (${escape(state.plan.reservoir.max)} at most, of one injury poison). Target the creature it hit to poison it.</p>${fill}${results}${controls}</section>`;
}
