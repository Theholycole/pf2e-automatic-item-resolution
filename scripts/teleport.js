// Live play for an item that teleports its user a short way (src/compiler/teleport.js, src/live/teleport-card.js): the card's Pick has
// the presser click the space on their own canvas (the next left click, snapped to the grid for the token's size; a right click or
// Escape cancels); the active GM's client checks the space is on the scene, unoccupied and within range — of the user's token, or of
// the creature targeted — and moves the token there at once (Foundry's teleport, no animation).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { createTeleportCard, teleportCardHTML, teleportRange } from "../src/live/teleport-card.js";
import { FLAG, MODULE_ID, entryOf, spaceOf, stateOf } from "./foundry.js";

const landSpeed = (actor) => Number(actor?.system?.attributes?.speed?.total ?? actor?.system?.attributes?.speed?.value) || null;

export async function postTeleportCard({ message, plan, used, actor, token }) {
    const state = createTeleportCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), speed: landSpeed(actor) });
    return ChatMessage.create({ content: teleportCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// On the presser's client: the space clicked for the user's token → { x, y } (its top-left corner), or null when cancelled.
export async function pickTeleportSpace(state) {
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (!token || !canvas?.ready || token.parent?.id !== canvas.scene?.id) throw new Error(`${state.user.name}'s token isn't on this scene.`);
    const size = canvas.grid.size;
    const width = (Number(token.width) || 1) * size;
    const height = (Number(token.height) || 1) * size;
    return new Promise((resolve) => {
        ui.notifications?.info?.(`${state.item.name}: click the space ${state.user.name} teleports to (right-click or Escape cancels).`);
        const stage = canvas.stage;
        const finish = (value) => {
            stage.off("pointerdown", down);
            document.removeEventListener("keydown", key);
            resolve(value);
        };
        const down = (event) => {
            if (event.button === 2) return finish(null);
            const point = event.getLocalPosition?.(canvas.tokens) ?? event.data?.getLocalPosition?.(canvas.tokens);
            if (!point) return finish(null);
            const corner = { x: point.x - width / 2 + size / 2, y: point.y - height / 2 + size / 2 };
            const snapped = canvas.grid.getTopLeftPoint?.(corner) ?? { x: Math.floor(corner.x / size) * size, y: Math.floor(corner.y / size) * size };
            finish({ x: snapped.x, y: snapped.y });
        };
        const key = (event) => {
            if (event.key === "Escape") finish(null);
        };
        stage.on("pointerdown", down);
        document.addEventListener("keydown", key);
    });
}

// What's wrong with putting the token at { x, y }, or null: off the scene, another token there, or out of range of where it's measured from.
export function spaceProblem(token, at, { from = null, range = null } = {}) {
    const size = canvas.grid.size;
    const width = (Number(token.width) || 1) * size;
    const height = (Number(token.height) || 1) * size;
    const rect = canvas.dimensions.sceneRect;
    if (at.x < rect.x || at.y < rect.y || at.x + width > rect.x + rect.width || at.y + height > rect.y + rect.height) return "that space is off the map";
    const overlaps = canvas.scene.tokens.some((other) => other.id !== token.id && !other.hidden && at.x < other.x + (Number(other.width) || 1) * size && at.x + width > other.x && at.y < other.y + (Number(other.height) || 1) * size && at.y + height > other.y);
    if (overlaps) return "that space is occupied";
    if (from && Number.isFinite(range)) {
        const grid = { size, gridFeet: canvas.dimensions?.distance ?? 5 };
        const far = distanceFeet(spaceOf(from), { x: at.x, y: at.y, w: width, h: height, elevation: Number(token.elevation ?? 0) }, grid);
        if (far > range) return `that space is ${far} feet away (the item allows ${range})`;
    }
    return null;
}

// On the active GM's client: { destination: { x, y }, targets: [token uuids] } → the token moved, the card applied.
export async function applyTeleportCard(message, { destination = null, targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "teleport" || state.status !== "open") return null;
    if (!destination || !Number.isFinite(Number(destination.x)) || !Number.isFinite(Number(destination.y))) throw new Error("Pick the space first.");
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (!token) throw new Error(`${state.user.name}'s token isn't there any more.`);
    const teleport = state.plan.teleport;
    // (Measured from the creature targeted, Golden Spur's "within 10 feet of the target"; else from where its user stands.)
    const aimed = teleport.from === "target" ? (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).find((other) => other && other.uuid !== token.uuid) ?? null : null;
    if (teleport.from === "target" && !aimed) throw new Error("Target the creature first, then press Pick.");
    const range = teleportRange(teleport, { speed: state.speed });
    const at = { x: Number(destination.x), y: Number(destination.y) };
    const problem = spaceProblem(token, at, { from: aimed ?? token, range });
    if (problem) throw new Error(`${state.item.name}: ${problem}.`);
    await token.update({ x: at.x, y: at.y }, { teleport: true, animate: false, [MODULE_ID]: { teleported: true } });
    const line = `${state.user.name} teleports${aimed ? ` beside ${aimed.name}` : ""}${Number.isFinite(range) ? ` (within ${range} feet)` : ""}.`;
    const next = { ...state, status: "applied", results: [line] };
    return message.update({ content: teleportCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
