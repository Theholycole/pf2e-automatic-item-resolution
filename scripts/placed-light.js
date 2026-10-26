// A light an item puts in a square, not on its user (src/compiler/placed-light.js, plan.item.placedLight — Flare Beacon's, 2026-10-25): a
// Foundry light at its user's token when it's used (on the active GM's client, which may create one), flagged with the world time it goes
// out at; the active GM's client removes it once the world's time passes that (Foundry's updateWorldTime, which a combat's rounds advance).
// Moved by hand when its user puts it farther away.

import { MODULE_ID, isActiveGM } from "./foundry.js";

const SECONDS = { rounds: 6, minutes: 60, hours: 3600 };
const KEY = "placedLight";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// light: { bright, dim, duration } (feet); token: its user's; item: { name }. → the light made, or null without a token on a scene.
export async function placeLight(light, { token, actor, item }) {
    const placeable = token?.object ?? token ?? null;
    const scene = placeable?.document?.parent ?? placeable?.scene ?? null;
    if (!placeable || !scene) return null;
    const document = placeable.document ?? placeable;
    const size = scene.grid?.size ?? canvas.grid?.size ?? 100;
    const center = placeable.center ?? { x: document.x + ((document.width ?? 1) * size) / 2, y: document.y + ((document.height ?? 1) * size) / 2 };
    const seconds = light.duration?.mode === "fixed" ? (Number(light.duration.value) || 1) * (SECONDS[light.duration.unit] ?? 60) : null;
    const endsAt = seconds ? (Number(game.time.worldTime) || 0) + seconds : null;
    const [made] = await scene.createEmbeddedDocuments("AmbientLight", [{ x: center.x, y: center.y, config: { bright: light.bright, dim: light.dim }, flags: { [MODULE_ID]: { [KEY]: { item: item?.name ?? null, endsAt } } } }]);
    const time = light.duration?.mode === "fixed" ? ` for ${light.duration.value} ${light.duration.value === 1 ? light.duration.unit.replace(/s$/, "") : light.duration.unit}` : "";
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(item?.name ?? "The item")}</strong>: its light (bright ${light.bright} feet, dim ${light.dim} feet) is placed at ${escape(document.name ?? actor?.name ?? "its user")}'s square${time}. Move it on the scene if it's put farther away.</p>` });
    return made ?? null;
}

// (A zone's light at its centre, Spark Wafer's sparks — plan.zone.light, src/compiler/spark-column.js: its zone's region found once the ability
// module has placed it — the newest of its zones named for the item —, the light flagged with that region and its zone's time, gone with it.)
export async function lightZone(light, lasts, { scene, item }) {
    const ability = "pf2e-automatic-ability-resolution";
    const regions = (scene?.regions?.contents ?? [...(scene?.regions ?? [])]).filter((region) => region.flags?.[ability]?.zone && String(region.name ?? "").startsWith(item?.name ?? "\u0000"));
    const region = regions.at(-1);
    const shape = region?.shapes?.[0];
    if (!shape || !Number.isFinite(Number(shape.x))) return null;
    const seconds = lasts?.mode === "fixed" ? (Number(lasts.value) || 1) * (SECONDS[lasts.unit] ?? 60) : null;
    const endsAt = seconds ? (Number(game.time.worldTime) || 0) + seconds : null;
    const [made] = await scene.createEmbeddedDocuments("AmbientLight", [{ x: Number(shape.x), y: Number(shape.y), config: { bright: light.bright, dim: light.dim }, flags: { [MODULE_ID]: { [KEY]: { item: item?.name ?? null, endsAt, regionUuid: region.uuid } } } }]);
    return made ?? null;
}

// The lights whose time is up, on every scene, removed.
export async function expireLights(worldTime) {
    for (const scene of game.scenes ?? []) {
        const ids = (scene.lights?.contents ?? [...(scene.lights ?? [])]).filter((light) => {
            const endsAt = Number(light.flags?.[MODULE_ID]?.[KEY]?.endsAt);
            return Number.isFinite(endsAt) && worldTime >= endsAt;
        }).map((light) => light.id);
        if (ids.length) await scene.deleteEmbeddedDocuments("AmbientLight", ids);
    }
}

export function setUpPlacedLights() {
    Hooks.on("updateWorldTime", (worldTime) => {
        if (!isActiveGM()) return;
        expireLights(Number(worldTime) || 0).catch((error) => console.error(`${MODULE_ID} | placed lights`, error));
    });
    // (A zone's light gone with its zone, ended on its card.)
    Hooks.on("deleteRegion", (region) => {
        const scene = region?.parent;
        if (!scene || !isActiveGM()) return;
        const ids = (scene.lights?.contents ?? [...(scene.lights ?? [])]).filter((light) => light.flags?.[MODULE_ID]?.[KEY]?.regionUuid === region.uuid).map((light) => light.id);
        if (ids.length) scene.deleteEmbeddedDocuments("AmbientLight", ids).catch((error) => console.error(`${MODULE_ID} | zone light`, error));
    });
}
