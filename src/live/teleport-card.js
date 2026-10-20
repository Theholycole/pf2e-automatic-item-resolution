// The teleport card: an item that teleports its user a short way (src/compiler/teleport.js) — the presser clicks the space on their
// own canvas, and the active GM's client checks it and moves the token (scripts/teleport.js). Its range in feet from its user, or from
// the creature the presser targets; or a multiple of its user's Speed. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isTeleport = (plan) => plan?.builtin === "teleport" && Boolean(plan.teleport) && (Number.isFinite(plan.teleport.within) || Number.isFinite(plan.teleport.speedTimes));

// Its range in feet: its own, or its multiple of its user's land Speed (speed: that Speed).
export function teleportRange(teleport, { speed = null } = {}) {
    if (Number.isFinite(teleport?.within)) return teleport.within;
    return Number.isFinite(teleport?.speedTimes) && Number.isFinite(speed) ? teleport.speedTimes * speed : null;
}

const TIMES = { 1: "", 2: "double ", 3: "triple " };
// Its range in words: "Up to 30 feet", "Within 10 feet of the creature targeted", "Up to double your Speed (50 feet)".
export function teleportText(teleport, { speed = null } = {}) {
    const range = teleportRange(teleport, { speed });
    if (Number.isFinite(teleport?.speedTimes)) return `Up to ${TIMES[teleport.speedTimes] ?? `${teleport.speedTimes} times `}its user's Speed${Number.isFinite(range) ? ` (${range} feet)` : ""}`;
    return teleport?.from === "target" ? (range === 5 ? "To a space adjacent to the creature targeted" : `Within ${range} feet of the creature targeted`) : `Up to ${range} feet`;
}

// Its other lines: the farther range after a critical success, its user alone, the damage along the way.
export function teleportLines(teleport) {
    return [
        teleport?.critical ? `Within ${teleport.critical.within} feet instead if the triggering save was a critical success (tick it before Pick)` : null,
        teleport?.alone ? `Its user alone, with what they wear and hold: with another creature along, even in an extradimensional container, it fails${teleport.alone.used ? " and the activation is used" : ""}` : null,
        teleport?.line ? `${teleport.line.formula} ${teleport.line.type} damage to its user and each creature in the line between where it was and where it lands` : null
    ].filter(Boolean);
}

// speed: its user's land Speed, for a range that's a multiple of it.
export function createTeleportCard({ plan, item, user, speed = null }) {
    return { kind: "teleport", status: "open", plan, item, user, speed: Number.isFinite(speed) ? speed : null, results: [] };
}

export function teleportCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const range = `<p class="aar-actions">Teleport: ${escape(teleportText(state.plan.teleport, { speed: state.speed }))}.</p>`;
    const lines = teleportLines(state.plan.teleport);
    const said = lines.length ? `<ul class="aar-lines">${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const tick = open && canApply && state.plan.teleport.critical ? `<label class="aar-choice"><input type="checkbox" data-air-field="critical"> The triggering save was a critical success (within ${escape(state.plan.teleport.critical.within)} feet)</label>` : "";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const aim = state.plan.teleport.from === "target" ? "Target the creature first, then press Pick and click" : "Press Pick and click";
    const hint = open && canApply ? `<p class="aar-hint">${aim} the space it lands in (right-click or Escape cancels).</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Pick</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to pick it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${range}${said}${notes}${tick}${hint}${results}${controls}</section>`;
}
