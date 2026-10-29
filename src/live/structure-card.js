// The structure card (2026-10-27, src/compiler/artifact-readings.js plan.structure: the Guiding Chisel's building, "filling up to ten contiguous
// 10-foot cubes within 1,000 feet of the chisel"): its user picks one of the building's shapes, presses Place it, then clicks where it stands;
// the environment module's placeStructure makes its walls and door (scripts/structure.js), the last one this item made gone first. Pure: the
// card's state, its HTML, and the environment module's template for the shape picked at the point clicked.
// (2026-10-28, src/compiler/placed-structures.js: Instant Fortress, Warding Escutcheon's door and Testudo Shield's barrier on it too — a
// shape's own words, a line along the grid's lines, the item's own material and numbers, a door facing its user, see-through walls; and once
// it's placed, the card stays open for what its user commands: its door opened, or shut and locked; the structure ended, its activation's
// wait started from then. It ends on its own after its time, or as its door is opened or broken: scripts/structure.js.)

import { rechargeSeconds } from "./activations-card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isStructure = (plan) => plan?.builtin === "structure" && (plan.structure?.sizes?.length ?? 0) > 0;

export function createStructureCard({ plan, item, user }) {
    return { kind: "structure", status: "open", plan, item, user, choice: 0, results: [] };
}

// The shape's words: "A 30-foot-square building, 10 feet high (9 cubes)", or its own.
export const sizeText = (size) => size.words ?? `A ${size.feet}-foot-square building, ${size.height} feet high (${(size.feet / 10) ** 2 * Math.max(1, Math.round(size.height / 10))} cube${(size.feet / 10) ** 2 * Math.max(1, Math.round(size.height / 10)) === 1 ? "" : "s"})`;

// What it is, for the card's header and the click's prompt: "building" unless the structure says.
export const whatOf = (structure) => structure?.what ?? "building";

// What its user can command once it's placed: [{ key, label }] — its door opened, or shut and locked (Instant Fortress's), and its end.
export function commandsOf(structure) {
    return [
        ...(structure?.door?.command ? [{ key: "open", label: "Open its door" }, { key: "lock", label: "Shut and lock its door" }] : []),
        ...(structure?.ends ? [{ key: "end", label: structure.ends.label ?? "End it" }] : [])
    ];
}

// Whether the card stays open once it's placed: something to command. (One that only ends on its own, Testudo Shield's barrier after its
// minute, is applied at once: its end is said in the chat.)
export const keepsWatch = (structure) => commandsOf(structure).length > 0;

export function structureCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const placed = state.step === "placed";
    const structure = state.plan.structure;
    const size = structure.sizes[state.size ?? state.choice ?? 0] ?? structure.sizes[0];
    const commands = commandsOf(structure);
    const pick = placed
        ? (open && canApply && commands.length > 1 ? `<p class="aar-actions">Command: <select data-air-field="choice">${commands.map((command, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(command.label)}</option>`).join("")}</select></p>` : `<p class="aar-actions">${escape(sizeText(size))}</p>`)
        : open && canApply
            ? `<p class="aar-actions">Shape: <select data-air-field="choice">${structure.sizes.map((one, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(sizeText(one))}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">${escape(sizeText(size))}</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const label = placed ? (commands.length === 1 ? commands[0].label : "Do it") : "Place it";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${escape(label)}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">a ${escape(whatOf(structure))}${structure.within ? ` within ${structure.within} feet` : ""}</span></header>${pick}${notes}${results}${controls}</section>`;
}

// The side of a square facing a point (its user's middle): its door in front of its user, Instant Fortress's. → "north" | "east" | "south" |
// "west" ("south" when it's at the middle).
export function sideFacing(at, from) {
    const dx = Number(from?.x) - Number(at?.x);
    const dy = Number(from?.y) - Number(at?.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return "south";
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
    return dy > 0 ? "south" : "north";
}

// The environment module's template (its scripts/structure-template.js placeStructure): a square of the shape's side round the point, or a
// line along the grid's lines through it, its walls of the structure's kind (its material, its own numbers), its door on one side (the side
// facing `from`, its user's middle, when it says "facing"), its height for its Climb; who made it, for the next one to replace it.
export function structureTemplate(state, at, choice = 0, { from = null } = {}) {
    const structure = state.plan.structure;
    const size = structure.sizes[choice] ?? structure.sizes[0];
    const shape = size.shape ?? "square";
    const point = { x: Number(at.x), y: Number(at.y) };
    const door = structure.door ? (({ command, ...rest }) => ({ ...rest, ...(rest.side === "facing" ? { side: sideFacing(point, from) } : {}) }))(structure.door) : null;
    return {
        name: structure.name ?? state.item.name,
        at: point,
        shape,
        feet: size.feet,
        ...(shape === "line" ? { rotation: Number(size.rotation) || 0 } : {}),
        ...(size.height ? { height: size.height } : {}),
        kind: structure.kind ?? "wall-masonry",
        ...(structure.material ? { material: structure.material } : {}),
        ...(structure.stats ? { stats: { ...structure.stats } } : {}),
        ...(door ? { door } : {}),
        ...(structure.transparent ? { transparent: true } : {}),
        pushOut: shape === "square",
        source: { actorUuid: state.user.actorUuid ?? null, itemUuid: state.item.uuid ?? null, name: state.item.name }
    };
}

// What the item keeps of the one it placed (its flag "structure"): its id and scene, its door's wall, the card, when it ends on its own, and
// whether its door opened or broken ends it.
export function placedRecord(structure, { id, sceneId, door = null, messageId = null, worldTime = 0 }) {
    const lasts = structure?.lasts ? rechargeSeconds(structure.lasts) : 0;
    return {
        id,
        sceneId,
        ...(door ? { door } : {}),
        ...(messageId && keepsWatch(structure) ? { messageId } : {}),
        ...(lasts ? { endsAt: Number(worldTime) + lasts } : {}),
        ...(structure?.ends?.whenOpened ? { whenOpened: true } : {})
    };
}

// Whether a wall's change opens its door or breaks it (Foundry's door state 1, open; the environment module's condition): its end, when it
// ends so.
export function opensOrBreaks(change, envId) {
    if (Number(change?.ds) === 1) return "opened";
    const condition = change?.flags?.[envId]?.structure?.condition ?? change?.[`flags.${envId}.structure.condition`] ?? null;
    return condition === "broken" || condition === "destroyed" ? condition : null;
}
