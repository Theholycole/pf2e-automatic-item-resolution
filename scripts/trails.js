// Live play for a trail its user's Strides leave (src/live/trails.js, src/compiler/stride-trails.js — Instinct Crown (Breach)'s): on the active
// GM's client, each walked move of a token whose actor has an Effect of this module's flagged trail leaves the ability module's zone over the
// squares it crossed, difficult terrain for the trail's time.

import { trailCells, trailZone } from "../src/live/trails.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

export function setUpTrails() {
    Hooks.on("moveToken", (token, movement) => {
        if (!isActiveGM()) return;
        const effect = (token?.actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.trail);
        if (!effect) return;
        leaveTrail(token, movement, effect).catch((error) => console.error(`${MODULE_ID} | trail`, error));
    });
}

async function leaveTrail(token, movement, effect) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    const scene = token.parent;
    const size = Number(scene?.grid?.size) || canvas.grid.size;
    const cells = trailCells(movement, { w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size }, size);
    if (!startZone || !cells.length) return;
    const trail = effect.flags[MODULE_ID].trail;
    const item = { name: trail.label ?? effect.name, uuid: effect.system?.context?.origin?.item ?? null, actor: token.actor };
    await startZone({ item, plan: { builtin: "zone", source: { name: item.name }, zone: trailZone(trail, cells) }, sourceToken: token, at: { token: { id: null, x: cells[0].x, y: cells[0].y, width: 1, height: 1, shape: 0 }, scene } });
}
