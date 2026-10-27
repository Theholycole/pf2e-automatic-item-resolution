// Live play for an item that teleports its user a short way (src/compiler/teleport.js, src/live/teleport-card.js): the card's Pick has
// the presser click the space on their own canvas (the next left click, snapped to the grid for the token's size; a right click or
// Escape cancels); the active GM's client checks the space is on the scene, unoccupied and within range — of the user's token, or of
// the creature targeted — and moves the token there at once (Foundry's teleport, no animation). The same card for its user's own move, a
// Stride, Step or Leap (src/compiler/move.js): the token moved on the map as a move is.

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { createTeleportCard, freeSpacesBeside, squaresAlong, teleportCardHTML, teleportRange } from "../src/live/teleport-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, damageRollClass, entryOf, spaceOf, stateOf } from "./foundry.js";
import { smokeZone } from "./cast-smoke.js";

// (PF2e 8.6's movement.speeds.land; before it, attributes.speed.)
const landSpeed = (actor) => Number(actor?.system?.movement?.speeds?.land?.value ?? actor?.system?.attributes?.speed?.total ?? actor?.system?.attributes?.speed?.value) || null;

// (The ranged weapon its ammunition is loaded in — Transposition Ammunition's, PF2e's selectedAmmoId — else its user's held ranged weapon with
// the longest range increment: that increment.)
function weaponRangeFor(actor, ammo) {
    const ranged = (actor?.itemTypes?.weapon ?? []).filter((weapon) => Number(weapon.system?.range) > 0);
    const loaded = ranged.find((weapon) => ammo?.id && weapon.system?.selectedAmmoId === ammo.id);
    const held = ranged.filter((weapon) => weapon.system?.equipped?.carryType === "held").sort((a, b) => Number(b.system.range) - Number(a.system.range))[0];
    return Number((loaded ?? held)?.system?.range) || null;
}

export async function postTeleportCard({ message, plan, used, actor, token }) {
    const weaponRange = plan.teleport?.weaponRange ? weaponRangeFor(actor, used.data) : null;
    const state = createTeleportCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), speed: landSpeed(actor), weaponRange });
    return ChatMessage.create({ content: teleportCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// On the presser's client: the space clicked for the user's token → { x, y } (its top-left corner), or null when cancelled.
// moved: the token moved when it isn't its user's — the creature targeted that a summon brings, Whistle of Calling's (2026-10-27).
export async function pickTeleportSpace(state, { moved = null } = {}) {
    const token = moved ? await fromUuid(moved).catch(() => null) : state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (!token || !canvas?.ready || token.parent?.id !== canvas.scene?.id) throw new Error(`${moved ? token?.name ?? "The creature targeted" : state.user.name}'s token isn't on this scene.`);
    const size = canvas.grid.size;
    const width = (Number(token.width) || 1) * size;
    const height = (Number(token.height) || 1) * size;
    return new Promise((resolve) => {
        ui.notifications?.info?.(`${state.item.name}: click the space ${state.user.name} ${state.plan?.teleport?.place ? "is moved" : state.plan?.teleport?.move ? "moves" : "teleports"} to (right-click or Escape cancels).`);
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

// Whether a wall that blocks movement stands between the centre of the token's space and the centre of the space at { x, y } (Foundry's move
// collision): no line of effect.
export function wallBetween(token, at) {
    const size = canvas.grid.size;
    const half = { x: ((Number(token.width) || 1) * size) / 2, y: ((Number(token.height) || 1) * size) / 2 };
    const backend = CONFIG.Canvas.polygonBackends?.move;
    if (!backend?.testCollision) return false;
    return Boolean(backend.testCollision({ x: Number(token.x) + half.x, y: Number(token.y) + half.y }, { x: at.x + half.x, y: at.y + half.y }, { type: "move", mode: "any" }));
}

// The creatures (token documents) whose spaces the line from the centre of the token's old space to the centre of its new one crosses: not
// its own, nor a hidden one.
export function creaturesOnLine(token, start, end) {
    const size = canvas.grid.size;
    const half = { x: ((Number(token.width) || 1) * size) / 2, y: ((Number(token.height) || 1) * size) / 2 };
    const a = { x: start.x + half.x, y: start.y + half.y };
    const b = { x: end.x + half.x, y: end.y + half.y };
    // (A segment against a rectangle, a hair inside its edges so a line along a border doesn't take both sides: Liang–Barsky.)
    const crosses = (left, top, right, bottom) => {
        let low = 0;
        let high = 1;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]]) {
            if (p === 0) {
                if (q < 0) return false;
                continue;
            }
            const t = q / p;
            if (p < 0) low = Math.max(low, t);
            else high = Math.min(high, t);
            if (low > high) return false;
        }
        return true;
    };
    return canvas.scene.tokens.filter((other) => other.id !== token.id && !other.hidden && other.actor?.isOfType?.("creature") && crosses(other.x + 1, other.y + 1, other.x + (Number(other.width) || 1) * size - 1, other.y + (Number(other.height) || 1) * size - 1));
}

// On the active GM's client: { destination: { x, y }, targets: [token uuids], critical } → the token moved, the card applied.
// critical: the triggering save was a critical success (the farther range, Dweomerveil's).
export async function applyTeleportCard(message, { destination = null, targets = [], critical = false } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "teleport" || state.status !== "open") return null;
    if (!destination || !Number.isFinite(Number(destination.x)) || !Number.isFinite(Number(destination.y))) throw new Error("Pick the space first.");
    const own = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (!own) throw new Error(`${state.user.name}'s token isn't there any more.`);
    const teleport = state.plan.teleport;
    // (A creature brought to its user, Whistle of Calling's attuned one: the creature targeted is the one moved, its range from its user.)
    const summoned = teleport.summon ? (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).find((other) => other && other.uuid !== own.uuid && other.parent?.id === own.parent?.id) ?? null : null;
    if (teleport.summon && !summoned) throw new Error("Target the creature it brings (its token on this scene) first, then press Pick.");
    const token = summoned ?? own;
    // (Measured from the creature targeted, Golden Spur's "within 10 feet of the target"; else from where its user stands.)
    const aimed = teleport.from === "target" ? (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).find((other) => other && other.uuid !== token.uuid) ?? null : null;
    // (Or no creature, a square fired at, Dimension Shot's: measured from its user, out to its weapon's farthest range and the square beyond.)
    const atSquare = teleport.from === "target" && !aimed && teleport.orSquare;
    if (teleport.from === "target" && !aimed && !atSquare) throw new Error("Target the creature first, then press Pick.");
    const farthest = atSquare ? weaponRangeFor(await fromUuid(state.user.actorUuid).catch(() => null), null) : null;
    if (atSquare && !Number.isFinite(farthest)) throw new Error(`${state.item.name}: target the creature it hit (${state.user.name} holds no ranged weapon to measure a square from).`);
    const range = atSquare ? farthest * 6 + 5 : critical && teleport.critical ? teleport.critical.within : teleportRange(teleport, { speed: state.speed, weaponRange: state.weaponRange ?? null });
    if (teleport.weaponRange && !Number.isFinite(range)) throw new Error(`${state.item.name}: ${state.user.name} has no ranged weapon loaded with it.`);
    const at = { x: Number(destination.x), y: Number(destination.y) };
    const problem = spaceProblem(token, at, { from: aimed ?? own, range });
    if (problem) throw new Error(`${state.item.name}: ${problem}.`);
    if (teleport.lineOfEffect && wallBetween(token, at)) throw new Error(`${state.item.name}: ${state.user.name} has no line of effect to that space (a wall is in the way).`);
    // (A move that must end beside an ally, Squire's Tabard's: a creature PF2e counts its ally — its alliance, isAllyOf — within 5 feet of
    // the space; without it, its token's disposition.)
    if (teleport.move?.endsBeside === "ally") {
        const size = canvas.grid.size;
        const spot = { x: at.x, y: at.y, w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size, elevation: Number(token.elevation ?? 0) };
        const grid = { size, gridFeet: canvas.dimensions?.distance ?? 5 };
        const beside = canvas.scene.tokens.some((other) => other.id !== token.id && !other.hidden && other.actor?.isOfType?.("creature") && (token.actor?.isAllyOf ? token.actor.isAllyOf(other.actor) : other.disposition === token.disposition) && distanceFeet(spaceOf(other), spot, grid) <= 5);
        if (!beside) throw new Error(`${state.item.name}: ${state.user.name}'s movement must end beside an ally.`);
    }
    // (A creature moved by its user, src/compiler/placed.js: within nearSource feet of them too — Whip-Tongue Sling's 20.)
    const place = teleport.place ?? null;
    if (Number.isFinite(place?.nearSource)) {
        const by = place.by?.tokenUuid ? await fromUuid(place.by.tokenUuid).catch(() => null) : null;
        const size = canvas.grid.size;
        const spot = { x: at.x, y: at.y, w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size, elevation: Number(token.elevation ?? 0) };
        const far = by ? distanceFeet(spaceOf(by), spot, { size, gridFeet: canvas.dimensions?.distance ?? 5 }) : null;
        if (Number.isFinite(far) && far > place.nearSource) throw new Error(`${state.item.name}: that space is ${far} feet from ${place.by.name} (the item allows ${place.nearSource}).`);
    }
    const start = { x: Number(token.x), y: Number(token.y) };
    // (Its user's own move, src/compiler/move.js: a move on the map, as a Stride is — not a teleport. A creature moved by its user: forced
    // movement, as the core's is — at once, flagged so.)
    const move = teleport.move ?? null;
    const options = place ? { teleport: true, animate: false, "pf2e-resolution-core": { forcedMovement: true, reason: state.item.name }, [MODULE_ID]: { placed: true } }
        : move ? { [MODULE_ID]: { moved: true } } : { teleport: true, animate: false, [MODULE_ID]: { teleported: true } };
    await token.update({ x: at.x, y: at.y }, options);
    const VERBED = { Stride: "Strides", Step: "Steps", Leap: "Leaps", Burrow: "Burrows", Fly: "Flies", Swim: "Swims", Climb: "Climbs" };
    const done = place ? `is ${place.teleport ? "teleported" : "moved"}${place.by?.name ? ` by ${place.by.name}` : ""}` : move ? (VERBED[move.verb] ?? "moves").replace(/^./, (letter) => letter.toLowerCase()) : "teleports";
    const results = [summoned ? `${summoned.name} teleports to ${state.user.name}${Number.isFinite(range) ? ` (within ${range} feet)` : ""}.` : `${state.user.name} ${done}${aimed ? ` beside ${aimed.name}` : ""}${Number.isFinite(range) ? ` (within ${range} feet)` : ""}.`];
    // (Others along, teleport.with: Bring Me Near's, Blink Blade's target, Transposition Ammunition's.)
    if (teleport.with) results.push(...(await bringAlong(token, start, at, targets, teleport.with)));
    // (The trail its move leaves, Hellfire Boots': the ability module's zone over the squares it crossed.)
    if (move?.trail) results.push(await trailZone(move.trail, token, start, at, state.item));
    // (Smoke where it left and where it lands, Blink Blade's: the ability module's zone at each, Concealed inside.)
    if (teleport.smoke) results.push(await smokeAt(teleport.smoke, token, [start, at], state.item));
    // (Damage along the way, Quartz-Coil Rail Transport's: its user and each creature the line between its two spaces crosses.)
    if (teleport.line) {
        const struck = [token, ...creaturesOnLine(token, start, at)];
        const DamageRoll = damageRollClass();
        for (const other of struck) {
            const actor = other.actor;
            if (!actor) continue;
            await actor.applyDamage({ damage: await new DamageRoll(`${teleport.line.formula}[${teleport.line.type}]`).evaluate(), token: other });
        }
        results.push(`${teleport.line.formula} ${teleport.line.type} damage to ${struck.map((other) => other.name).join(", ")}.`);
    }
    // (Again for each action more, Spleen Bloodstone's: still open, from where it ends.)
    const next = move?.again ? { ...state, results: [...(state.results ?? []), ...results] } : { ...state, status: "applied", results };
    return message.update({ content: teleportCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The creatures its presser targeted that go along (teleport.with { count, target? }): beside its user where it was — or, the creature it hit
// (Blink Blade's), wherever it was —, up to that many, each teleported into the free space beside where its user landed nearest to where it
// stood from it. → the card's lines.
export async function bringAlong(token, start, at, targets, along) {
    const size = canvas.grid.size;
    const grid = { size, gridFeet: canvas.dimensions?.distance ?? 5 };
    const before = { x: start.x, y: start.y, w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size, elevation: Number(token.elevation ?? 0) };
    const others = (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((other) => other && other.uuid !== token.uuid && other.parent?.id === token.parent?.id && other.actor?.isOfType?.("creature"));
    const near = along.target ? others : others.filter((other) => distanceFeet(spaceOf(other), before, grid) <= 5);
    const lines = [];
    if (!along.target && near.length < others.length) lines.push(`Not beside ${token.name}, left behind: ${others.filter((other) => !near.includes(other)).map((other) => other.name).join(", ")}.`);
    if (near.length > along.count) lines.push(`Only ${along.count} can go along: ${near.slice(along.count).map((other) => other.name).join(", ")} stayed.`);
    const space = { x: at.x, y: at.y, w: before.w, h: before.h };
    const placed = [];
    for (const other of near.slice(0, along.count)) {
        const own = { w: (Number(other.width) || 1) * size, h: (Number(other.height) || 1) * size };
        const occupied = [...canvas.scene.tokens.filter((one) => one.id !== other.id && one.id !== token.id && !one.hidden).map((one) => spaceOf(one)), ...placed];
        // (Where it stood from its user, kept as near as it can be.)
        const prefer = { x: at.x + before.w / 2 + (Number(other.x) + own.w / 2 - (start.x + before.w / 2)), y: at.y + before.h / 2 + (Number(other.y) + own.h / 2 - (start.y + before.h / 2)) };
        const [spot] = freeSpacesBeside(space, own, occupied, { grid: size, bounds: canvas.dimensions.sceneRect, prefer });
        if (!spot) {
            lines.push(`No free space beside ${token.name} for ${other.name}: it stays.`);
            continue;
        }
        await other.update({ x: spot.x, y: spot.y }, { teleport: true, animate: false, [MODULE_ID]: { teleported: true } });
        placed.push({ ...spot, ...own });
        lines.push(`${other.name} goes along, beside ${token.name}.`);
    }
    return lines;
}

// Smoke at the spaces it left and landed in (teleport.smoke): the ability module's zone at each, Concealed inside for its time. → the card's line.
export async function smokeAt(smoke, token, points, item) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    const size = Math.max(Number(token.width) || 1, Number(token.height) || 1);
    if (!startZone) return "Smoke at the space it left and the one it landed in: Concealed inside until the end of its next turn (by hand).";
    for (const point of points) await startZone({ item: { name: item.name, uuid: item.uuid ?? null, actor: token.actor }, plan: { builtin: "zone", source: { name: item.name }, zone: smokeZone(smoke, size) }, sourceToken: token, at: { token: { id: null, x: point.x, y: point.y, width: size, height: size, shape: 0 }, scene: token.parent } });
    return "Smoke fills the space it left and the one it landed in.";
}

// The trail a move leaves (teleport.move.trail { formula, lasts }): one ability module zone over the squares the token crossed — made at the first,
// its shapes then each of them — hazardous terrain, its damage to a creature entering it, for its time. → the card's line.
export async function trailZone(trail, token, start, at, item) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    const size = canvas.grid.size;
    const cells = squaresAlong(start, at, { w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size }, size);
    const words = `${trail.formula.replace(/\[(\w+)\]/g, " $1")} damage to a creature moving through`;
    if (!startZone || !cells.length) return `Each square it moved through is hazardous terrain, ${words} (by hand).`;
    const zone = { area: { type: "square", value: 5 }, centre: "snare", range: 0, lasts: trail.lasts, untilReused: false, concealed: false, terrain: [], others: false, hazard: { formulas: [trail.formula] }, saves: [], damage: [], effect: null, modifiers: [], notes: [`The squares it moved through: hazardous terrain, ${words}.`] };
    const scene = token.parent;
    const before = new Set((scene.regions?.contents ?? [...(scene.regions ?? [])]).map((region) => region.id));
    await startZone({ item: { name: item.name, uuid: item.uuid ?? null, actor: token.actor }, plan: { builtin: "zone", source: { name: item.name }, zone }, sourceToken: token, at: { token: { id: null, x: cells[0].x, y: cells[0].y, width: 1, height: 1, shape: 0 }, scene } });
    const region = (scene.regions?.contents ?? [...(scene.regions ?? [])]).find((one) => !before.has(one.id) && one.flags?.[ABILITY_ID]?.zone);
    if (region && cells.length > 1) await region.update({ shapes: cells.map((cell) => ({ type: "rectangle", x: cell.x + size / 2, y: cell.y + size / 2, width: size, height: size, anchorX: 0.5, anchorY: 0.5, rotation: 0, gridBased: true })) });
    return `The ${cells.length} square${cells.length === 1 ? "" : "s"} it moved through: hazardous terrain, ${words}.`;
}
