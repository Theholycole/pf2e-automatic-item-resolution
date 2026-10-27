// A cube of walls around its user (2026-10-27, src/compiler/cube-faces.js: Cube of Nex): its squares, as the environment module lays out a
// square structure round a point (the core's structureLayout: snapped to the grid), so its zone and its walls of force cover the same ground;
// and a cube made inert (its second activation): which items a creature holds are one it names. Pure.

// The grid squares a square of that many feet round a token's middle covers: token { x, y, w, h } in pixels, grid { size, gridFeet } →
// [{ x, y }] their top-left corners.
export function squareCellsAround(token, feet, { size, gridFeet = 5 }) {
    const squares = Math.max(1, Math.round((Number(feet) || 0) / gridFeet));
    const centre = { x: token.x + token.w / 2, y: token.y + token.h / 2 };
    const left = Math.round(centre.x / size - squares / 2) * size;
    const top = Math.round(centre.y / size - squares / 2) * size;
    const cells = [];
    for (let column = 0; column < squares; column++) for (let row = 0; row < squares; row++) cells.push({ x: left + column * size, y: top + row * size });
    return cells;
}

// A zone of the item module's own centre "around" (a square round its user): the ability module's zone of those squares.
export const aroundZone = (zone, token, grid) => (zone?.centre === "around" && zone.area?.type === "square" ? { ...zone, centre: "snare", area: { type: "squares", cells: squareCellsAround(token, zone.area.value, grid) } } : zone);

// The core's selective terrain for a zone whose difficult terrain spares some traits (zone.exceptTraits, The Eye of the Slumberer's water
// creatures): creatures [{ actorUuid, traits }] on its scene → { actions, default, creatures } (src/patch-logic.js selectiveDifficulty).
export function exemptSpec(zone, creatures) {
    const actions = [...new Set((zone.terrain ?? []).flatMap((entry) => entry.movement ?? ["walk"]))];
    const difficulty = Math.max(1, ...(zone.terrain ?? []).map((entry) => Number(entry.difficulty) || 2));
    return { actions, default: difficulty, creatures: creatures.filter((creature) => (creature.traits ?? []).some((trait) => (zone.exceptTraits ?? []).includes(trait))).map((creature) => ({ actorUuid: creature.actorUuid, difficulty: 1 })) };
}

// Whether an item is one the inert card names (its names, any case; "cube of force" also "Cube of Force").
export const namedInert = (inert, itemName) => (inert?.names ?? []).some((name) => String(name).toLowerCase() === String(itemName ?? "").toLowerCase());

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isInert = (plan) => plan?.builtin === "inert" && Boolean(plan.inert);
export const isStructure = (plan) => plan?.builtin === "structure" && Boolean(plan.structure);

// candidates: [{ itemUuid, name, holder }] the items it can make inert near its user.
export function createInertCard({ plan, item, user, candidates = [] }) {
    return { kind: "inert", status: "open", plan, item, user, candidates, pick: 0, results: [] };
}

export function inertCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const inert = state.plan.inert;
    const what = `<p class="aar-actions">Made inert: ${escape(inert.names.join(" or "))} within ${escape(inert.within)} feet — it can't be activated, its current activation ends, and its constant abilities stop.</p>`;
    const pick = open && state.candidates.length ? `<label class="aar-choice">Which: <select data-air-field="pick">${state.candidates.map((entry, index) => `<option value="${index}"${index === state.pick ? " selected" : ""}>${escape(entry.name)} (${escape(entry.holder)})</option>`).join("")}</select></label>` : "";
    const none = open && !state.candidates.length ? `<p class="aar-hint">None within ${escape(inert.within)} feet of ${escape(state.user.name)}.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.candidates.length ? `<footer class="aar-controls"><button type="button" data-air-inert="apply">Make it inert</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${what}${pick}${none}${results}${controls}</section>`;
}

// The structure card's words: what it places and its lines.
export function structureCardHTML({ item, user, structure, results = [] }) {
    const lines = [`${structure.feet}-foot ${structure.shape} of walls round ${user.name}: Hardness ${structure.stats?.hardness}, ${structure.stats?.hp} Hit Points${structure.ac ? `, AC ${structure.ac}` : ""}`, ...(structure.lines ?? [])];
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="applied"><header><strong>${escape(item.name)}</strong><span class="aar-check">used by ${escape(user.name)}</span></header><ul class="aar-lines">${lines.map((line) => `<li>${escape(line)}.</li>`).join("")}</ul>${results.length ? `<ul class="aar-applied">${results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : ""}</section>`;
}
