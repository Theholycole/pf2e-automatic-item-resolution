// The structure card (2026-10-27, src/compiler/artifact-readings.js plan.structure: the Guiding Chisel's building, "filling up to ten contiguous
// 10-foot cubes within 1,000 feet of the chisel"): its user picks one of the building's shapes, presses Place it, then clicks where it stands;
// the environment module's placeStructure makes its walls and door (scripts/structure.js), the last one this item made gone first. Pure: the
// card's state, its HTML, and the environment module's template for the shape picked at the point clicked.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isStructure = (plan) => plan?.builtin === "structure" && (plan.structure?.sizes?.length ?? 0) > 0;

export function createStructureCard({ plan, item, user }) {
    return { kind: "structure", status: "open", plan, item, user, choice: 0, results: [] };
}

// The shape's words: "A 30-foot-square building, 10 feet high (9 cubes)".
export const sizeText = (size) => `A ${size.feet}-foot-square building, ${size.height} feet high (${(size.feet / 10) ** 2 * Math.max(1, Math.round(size.height / 10))} cube${(size.feet / 10) ** 2 * Math.max(1, Math.round(size.height / 10)) === 1 ? "" : "s"})`;

export function structureCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const structure = state.plan.structure;
    const pick = open && canApply
        ? `<p class="aar-actions">Shape: <select data-air-field="choice">${structure.sizes.map((size, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(sizeText(size))}</option>`).join("")}</select></p>`
        : `<p class="aar-actions">${escape(sizeText(structure.sizes[state.choice ?? 0]))}</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Place it</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">a building${structure.within ? ` within ${structure.within} feet` : ""}</span></header>${pick}${notes}${results}${controls}</section>`;
}

// The environment module's template (its scripts/structure-template.js placeStructure): a square of the shape's side round the point, its
// walls of the structure's kind, its door on one side, its height for its Climb; who made it, for the next one to replace it.
export function structureTemplate(state, at, choice = 0) {
    const structure = state.plan.structure;
    const size = structure.sizes[choice] ?? structure.sizes[0];
    return {
        name: structure.name ?? state.item.name,
        at: { x: Number(at.x), y: Number(at.y) },
        shape: "square",
        feet: size.feet,
        height: size.height,
        kind: structure.kind ?? "wall-masonry",
        ...(structure.door ? { door: { ...structure.door } } : {}),
        pushOut: true,
        source: { actorUuid: state.user.actorUuid ?? null, itemUuid: state.item.uuid ?? null, name: state.item.name }
    };
}
