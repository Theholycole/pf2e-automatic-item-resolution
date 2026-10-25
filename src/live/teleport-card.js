// The teleport card: an item that teleports its user a short way (src/compiler/teleport.js) — the presser clicks the space on their
// own canvas, and the active GM's client checks it and moves the token (scripts/teleport.js). Its range in feet from its user, or from
// the creature the presser targets; or a multiple of its user's Speed. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isTeleport = (plan) => plan?.builtin === "teleport" && Boolean(plan.teleport) && (Number.isFinite(plan.teleport.within) || Number.isFinite(plan.teleport.speedTimes) || Number.isFinite(plan.teleport.leapTimes) || plan.teleport.weaponRange === true);

// Its range in feet: its own, or its multiple of its user's land Speed (speed: that Speed).
// (Half a Speed rounded down to the grid's 5 feet: a 25-foot Speed's half is 10.)
// (A Leap's, PF2e's: 10 feet with a Speed of 15 or more, 15 with 30 or more. "+15-foot status bonus … for this movement": plus.)
// (Its weapon's first range increment, Transposition Ammunition's: weaponRange, that weapon's when the card is made.)
export function teleportRange(teleport, { speed = null, weaponRange = null } = {}) {
    const plus = Number(teleport?.plus) || 0;
    if (teleport?.weaponRange) return Number.isFinite(weaponRange) ? weaponRange : null;
    if (Number.isFinite(teleport?.within)) return teleport.within + plus;
    if (Number.isFinite(teleport?.leapTimes)) return Number.isFinite(speed) ? teleport.leapTimes * (speed >= 30 ? 15 : speed >= 15 ? 10 : 0) : null;
    return Number.isFinite(teleport?.speedTimes) && Number.isFinite(speed) ? Math.floor((teleport.speedTimes * speed) / 5) * 5 + plus : null;
}

const TIMES = { 0.5: "half ", 1: "", 2: "double ", 3: "triple " };
// Its range in words: "Up to 30 feet", "Within 10 feet of the creature targeted", "Up to double your Speed (50 feet)".
export function teleportText(teleport, { speed = null, weaponRange = null } = {}) {
    const range = teleportRange(teleport, { speed, weaponRange });
    if (teleport?.weaponRange) return `Within its weapon's first range increment${Number.isFinite(range) ? ` (${range} feet)` : " (no ranged weapon loaded with it)"}`;
    const plus = Number(teleport?.plus) ? ` + ${teleport.plus} feet` : "";
    if (Number.isFinite(teleport?.leapTimes)) return `Up to ${TIMES[teleport.leapTimes] ?? `${teleport.leapTimes} times `}its user's Leap${Number.isFinite(range) ? ` (${range} feet)` : ""}`;
    if (Number.isFinite(teleport?.speedTimes)) return `Up to ${TIMES[teleport.speedTimes] ?? `${teleport.speedTimes} times `}its user's Speed${plus}${Number.isFinite(range) ? ` (${range} feet)` : ""}`;
    return teleport?.from === "target" ? (range === 5 ? "To a space adjacent to the creature targeted" : `Within ${range} feet of the creature targeted`) : `Up to ${range} feet`;
}

// Its other lines: the farther range after a critical success, its user alone, the damage along the way.
export function teleportLines(teleport) {
    return [
        // (Its user's own move, src/compiler/move.js: what it ignores, how it ends.)
        ...(teleport?.move?.lines ?? []),
        // (A creature moved to a space its user picks, src/compiler/placed.js: how near its user, its own lines.)
        Number.isFinite(teleport?.place?.nearSource) ? `Into a space within ${teleport.place.nearSource} feet of ${teleport.place.by?.name ?? "its user"}` : null,
        teleport?.place?.optional ? `${teleport.place.by?.name ?? "Its user"} can leave it where it is` : null,
        ...(teleport?.place?.lines ?? []),
        teleport?.critical ? `Within ${teleport.critical.within} feet instead if the triggering save was a critical success (tick it before Pick)` : null,
        teleport?.alone ? `Its user alone, with what they wear and hold: with another creature along, even in an extradimensional container, it fails${teleport.alone.used ? " and the activation is used" : ""}` : null,
        teleport?.line ? `${teleport.line.formula} ${teleport.line.type} damage to its user and each creature in the line between where it was and where it lands` : null
    ].filter(Boolean);
}

// speed: its user's land Speed, for a range that's a multiple of it.
// presser: who picks the space when that's not the one moved — a creature moved by its user (src/compiler/placed.js): { actorUuid, name }.
export function createTeleportCard({ plan, item, user, speed = null, presser = null, weaponRange = null }) {
    return { kind: "teleport", status: "open", plan, item, user, speed: Number.isFinite(speed) ? speed : null, results: [], ...(presser ? { presser } : {}), ...(Number.isFinite(weaponRange) ? { weaponRange } : {}) };
}

export function teleportCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    // (A move, not a teleport: "Stride: Up to its user's Speed (25 feet)".)
    const verb = state.plan.teleport.place ? `${state.plan.teleport.place.teleport ? "Teleport" : "Move"} ${state.user.name}` : state.plan.teleport.move?.verb ?? "Teleport";
    const range = `<p class="aar-actions">${escape(verb)}: ${escape(teleportText(state.plan.teleport, { speed: state.speed, weaponRange: state.weaponRange ?? null }))}.</p>`;
    const lines = teleportLines(state.plan.teleport);
    const said = lines.length ? `<ul class="aar-lines">${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const tick = open && canApply && state.plan.teleport.critical ? `<label class="aar-choice"><input type="checkbox" data-air-field="critical"> The triggering save was a critical success (within ${escape(state.plan.teleport.critical.within)} feet)</label>` : "";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const aim = state.plan.teleport.from === "target" ? "Target the creature first, then press Pick and click" : "Press Pick and click";
    const hint = open && canApply ? `<p class="aar-hint">${aim} the space ${state.plan.teleport.place ? `${escape(state.user.name)} is moved to` : `it ${state.plan.teleport.move ? "moves to" : "lands in"}`} (right-click or Escape cancels).</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const again = state.plan.teleport.move?.again && state.results.length;
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${again ? "Pick again (another action)" : "Pick"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.presser?.name ?? state.user.name)}'s player or the GM to pick it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${range}${said}${notes}${tick}${hint}${results}${controls}</section>`;
}
