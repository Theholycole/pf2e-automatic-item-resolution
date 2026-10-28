// Live play for creatures teleported to a paired stone (2026-10-27, src/compiler/paired-stone.js: Jahan Waystone): once the ability module's
// save card is applied ("applied" hook, on the presser's client — sent on to the active GM's), each creature whose degree teleports it goes to
// an open space within the feet given of the other stone of the pair: a token on any scene named as the item, or whose actor holds it, not the
// one its user stands by. On another scene, its token is made there and taken off this one. No open space: it stays, said so.

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { freeSpacesBeside } from "../src/live/teleport-card.js";
import { ABILITY_ID, MODULE_ID, SOCKET, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const isStone = (token, paired) => (token?.actor?.items?.contents ?? [...(token?.actor?.items ?? [])]).some((item) => item.system?.slug === paired.slug) || String(token?.name ?? "").toLowerCase().replace(/[^a-z]+/g, "-") === paired.slug;
const spaceIn = (token, size) => ({ x: Number(token.x), y: Number(token.y), w: Math.max(1, Number(token.width) || 1) * size, h: Math.max(1, Number(token.height) || 1) * size, elevation: Number(token.elevation ?? 0) });

// The stone its user stands by (the nearest on their scene), and the other of the pair (on any scene).
function stonesFor(sourceToken, paired) {
    const scene = sourceToken?.parent;
    const size = scene?.grid?.size ?? 100;
    const grid = { size, gridFeet: scene?.grid?.distance ?? 5 };
    const here = (scene?.tokens?.contents ?? [...(scene?.tokens ?? [])]).filter((token) => isStone(token, paired)).sort((a, b) => distanceFeet(spaceIn(sourceToken, size), spaceIn(a, size), grid) - distanceFeet(spaceIn(sourceToken, size), spaceIn(b, size), grid));
    const used = here[0] ?? null;
    const others = [...(game.scenes?.contents ?? [])].flatMap((one) => (one.tokens?.contents ?? [...(one.tokens ?? [])]).filter((token) => isStone(token, paired) && token.uuid !== used?.uuid));
    return { used, other: others.find((token) => token.parent?.id === scene?.id) ?? others[0] ?? null };
}

// An open space for a token within feet of the stone (rings outward), or null.
function openNear(stone, token, feet) {
    const scene = stone.parent;
    const size = scene.grid.size;
    const grid = { size, gridFeet: scene.grid.distance ?? 5 };
    const own = { w: Math.max(1, Number(token.width) || 1) * size, h: Math.max(1, Number(token.height) || 1) * size };
    const occupied = (scene.tokens.contents ?? [...scene.tokens]).filter((one) => one.id !== token.id && !one.hidden).map((one) => spaceIn(one, size));
    const reach = Math.ceil(feet / grid.gridFeet) * size;
    const ring = { x: Number(stone.x) - reach, y: Number(stone.y) - reach, w: spaceIn(stone, size).w + 2 * reach, h: spaceIn(stone, size).h + 2 * reach };
    const spots = freeSpacesBeside(spaceIn(stone, size), own, occupied, { grid: size, bounds: scene.dimensions?.sceneRect ?? null }).filter((spot) => spot.x >= ring.x && spot.y >= ring.y);
    if (spots.length) return spots[0];
    // (Farther out than beside it: each square within reach, nearest first.)
    for (let x = ring.x; x <= ring.x + ring.w; x += size) for (let y = ring.y; y <= ring.y + ring.h; y += size) {
        const spot = { x, y, ...own };
        if (occupied.some((other) => spot.x < other.x + other.w && spot.x + spot.w > other.x && spot.y < other.y + other.h && spot.y + spot.h > other.y)) continue;
        if (distanceFeet(spaceIn(stone, size), { ...spot, elevation: 0 }, grid) <= feet) return { x, y };
    }
    return null;
}

// The card applied (on the active GM's client): { state, targets } → the chat's line.
export async function teleportToPair({ state, targets }) {
    const paired = state?.plan?.pairedStone;
    if (!paired) return null;
    const going = (targets ?? []).filter((target) => paired.degrees.includes(target.degree) && target.tokenUuid);
    if (!going.length) return null;
    const source = state.source?.tokenUuid ? await fromUuid(state.source.tokenUuid).catch(() => null) : null;
    const { other } = stonesFor(source, paired);
    const lines = [];
    if (!other) lines.push(`No paired stone on any scene: ${going.map((target) => target.name).join(", ")} stay${going.length === 1 ? "s" : ""} (put the other stone's token on its map).`);
    for (const target of other ? going : []) {
        const token = await fromUuid(target.tokenUuid).catch(() => null);
        if (!token) continue;
        const spot = openNear(other, token, paired.within);
        if (!spot) {
            lines.push(`${target.name}: no open space within ${paired.within} feet of the paired stone — the teleportation fails.`);
            continue;
        }
        if (token.parent?.id === other.parent?.id) await token.update({ x: spot.x, y: spot.y }, { teleport: true, animate: false, [MODULE_ID]: { teleported: true } });
        else {
            await other.parent.createEmbeddedDocuments("Token", [{ ...token.toObject(), x: spot.x, y: spot.y }]);
            await token.delete();
        }
        lines.push(`${target.name} is teleported to the paired stone${token.parent?.id === other.parent?.id ? "" : ` (${other.parent?.name ?? "its scene"})`}.`);
    }
    return ChatMessage.create({ content: `<p><strong>${escape(state.ability?.name ?? "The stone")}</strong>: ${lines.map(escape).join(" ")}</p>` });
}

export function setUpPairedStone() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!payload?.state?.plan?.pairedStone) return;
        if (isActiveGM()) teleportToPair(payload).catch((error) => console.error(`${MODULE_ID} | paired stone`, error));
        else game.socket.emit(SOCKET, { action: "paired-stone", state: { plan: { pairedStone: payload.state.plan.pairedStone }, source: payload.state.source ?? null, ability: { name: payload.state.ability?.name ?? null } }, targets: (payload.targets ?? []).map((target) => ({ tokenUuid: target.tokenUuid, name: target.name, degree: target.degree })), userId: game.user.id });
    });
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "paired-stone" || !isActiveGM()) return;
        teleportToPair({ state: data.state, targets: data.targets }).catch((error) => console.error(`${MODULE_ID} | paired stone`, error));
    });
}
