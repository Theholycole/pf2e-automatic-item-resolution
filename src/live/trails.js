// A trail its user's own Strides leave while an Effect lasts (2026-10-28, src/compiler/stride-trails.js — Instinct Crown (Breach)'s): the
// Effect's flag trail { lasts, inside, notes, label }; each of its token's walked moves (Foundry's moveToken: its legs walked, not flown,
// teleported or jumped) leaves the ability module's zone over the squares crossed — PF2e's difficult terrain, for the trail's time, with what
// its maker gets inside (zone.inside, who "own"). Pure: the legs, the squares, the zone.

import { squaresAlong } from "./teleport-card.js";

// (PF2e's difficult terrain, as the zones' own: src/compiler/area-readings.js DIFFICULT.)
const DIFFICULT = [{ movement: ["walk"], difficulty: 2 }];

// (Foundry's movement actions that are walking on the ground: a Stride, a Step.)
const WALKED = new Set(["walk"]);

// A moveToken movement → its walked legs: [{ from: { x, y }, to: { x, y } }] — from its origin through the waypoints it passed, each leg
// walked when the waypoint it reaches was (no action said: a walk).
export function walkedLegs(movement) {
    const origin = movement?.origin;
    if (!Number.isFinite(Number(origin?.x)) || !Number.isFinite(Number(origin?.y))) return [];
    const passed = (movement?.passed?.waypoints ?? []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
    const points = passed.length ? passed : movement?.destination ? [movement.destination] : [];
    const legs = [];
    let from = { x: Number(origin.x), y: Number(origin.y) };
    for (const point of points) {
        const to = { x: Number(point.x), y: Number(point.y) };
        if (WALKED.has(point.action ?? "walk") && (to.x !== from.x || to.y !== from.y)) legs.push({ from, to });
        from = to;
    }
    return legs;
}

// The squares its walked legs cross, each once: size { w, h } its space in pixels, grid the grid's size.
export function trailCells(movement, size, grid) {
    const cells = new Map();
    for (const { from, to } of walkedLegs(movement)) for (const cell of squaresAlong(from, to, size, grid)) cells.set(`${cell.x},${cell.y}`, cell);
    return [...cells.values()];
}

// The trail's zone over those squares.
export function trailZone(trail, cells) {
    return { area: { type: "squares", cells }, centre: "snare", range: 0, lasts: trail.lasts ?? null, untilReused: false, concealed: false, terrain: DIFFICULT.map((entry) => ({ ...entry })), others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], inside: (trail.inside ?? []).map((entry) => ({ ...entry })), notes: [...(trail.notes ?? [])] };
}
