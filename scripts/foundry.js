// Foundry helpers the item module's cards share (scripts/live.js, scripts/bombs.js).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";

export const MODULE_ID = "pf2e-automatic-item-resolution";
export const CORE_ID = "pf2e-resolution-core";
export const ABILITY_ID = "pf2e-automatic-ability-resolution";
export const FLAG = "card";
export const SOCKET = `module.${MODULE_ID}`;

export const isActiveGM = () => game.users.activeGM?.isSelf ?? game.user.isGM;
export const stateOf = (message) => message?.getFlag?.(MODULE_ID, FLAG) ?? null;

// A card's entry for a creature: its actor, its token (when on a scene) and the name shown.
export const entryOf = (token, actor) => ({ actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null, name: token?.name ?? actor.name });

// A token's space for the core's distance (as the ability module measures auras).
export function spaceOf(token) {
    const size = canvas.grid.size;
    const data = token.document ?? token;
    return { x: Number(data.x), y: Number(data.y), w: Math.max(1, Number(data.width ?? 1)) * size, h: Math.max(1, Number(data.height ?? 1)) * size, elevation: Number(data.elevation ?? 0) };
}

// The visible creatures within that many feet of a token on the current scene (not the token itself).
export function creaturesNear(token, feet = 5) {
    const placeable = token?.object ?? token;
    const sceneId = placeable?.document?.parent?.id ?? placeable?.parent?.id;
    if (!placeable || !canvas?.ready || sceneId !== canvas.scene?.id) return [];
    const from = spaceOf(placeable);
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    return canvas.tokens.placeables
        .filter((other) => other !== placeable && other.document?.uuid !== placeable.document?.uuid && other.actor?.isOfType?.("creature") && !other.document.hidden && distanceFeet(from, spaceOf(other), grid) <= feet)
        .map((other) => entryOf(other, other.actor));
}

// The actor and token of a card's entry.
export async function creatureOf(entry) {
    const token = entry?.tokenUuid ? await fromUuid(entry.tokenUuid).catch(() => null) : null;
    return { token, actor: token?.actor ?? (entry?.actorUuid ? await fromUuid(entry.actorUuid).catch(() => null) : null) };
}

// Whether this user may press a card's Apply: the GM, or an owner of the item's user.
export function mayApply(state) {
    if (game.user.isGM) return true;
    try {
        return !!fromUuidSync(state.user.actorUuid)?.testUserPermission?.(game.user, "OWNER");
    } catch {
        return false;
    }
}

export const damageRollClass = () => (CONFIG.Dice?.rolls ?? []).find((roll) => roll?.name === "DamageRoll");
