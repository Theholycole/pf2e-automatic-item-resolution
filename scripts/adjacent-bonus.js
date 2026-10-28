// Live play for a bonus for each adjacent enemy (2026-10-27, src/live/adjacent-bonus.js: Vambrace of Gorum's Blade of Iron): on the active
// GM's client, whenever a token on a scene moves, appears or goes, or a turn passes, each creature there with such an Effect has its bonus set
// to the enemies adjacent to it now (living creatures that aren't its allies, PF2e's isAllyOf; not dead).

import { ADJACENT, adjacentRules, isAdjacent } from "../src/live/adjacent-bonus.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const spaceOf = (token, size) => ({ x: Number(token.x), y: Number(token.y), w: Math.max(1, Number(token.width) || 1) * size, h: Math.max(1, Number(token.height) || 1) * size });
const dead = (actor) => Boolean(actor?.statuses?.has?.("dead")) || Number(actor?.system?.attributes?.hp?.value ?? 1) <= 0;

async function refresh(scene) {
    if (!scene || !isActiveGM()) return;
    const size = scene.grid?.size ?? 100;
    const tokens = scene.tokens?.contents ?? [...(scene.tokens ?? [])];
    for (const token of tokens) {
        const actor = token.actor;
        const effects = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[ADJACENT]);
        if (!effects.length) continue;
        const near = tokens.filter((other) => other.id !== token.id && other.actor?.isOfType?.("creature") && !dead(other.actor) && !(actor.isAllyOf?.(other.actor) ?? other.disposition === token.disposition) && isAdjacent(spaceOf(token, size), spaceOf(other, size), size)).length;
        for (const effect of effects) {
            const rules = adjacentRules(effect.flags[MODULE_ID][ADJACENT], near);
            if (JSON.stringify((effect.system?.rules ?? []).map((rule) => rule.value)) !== JSON.stringify(rules.map((rule) => rule.value))) await effect.update({ "system.rules": rules });
        }
    }
}

export function setUpAdjacentBonus() {
    const later = (scene) => refresh(scene).catch((error) => console.error(`${MODULE_ID} | adjacent bonus`, error));
    Hooks.on("updateToken", (token, changes) => {
        if ("x" in (changes ?? {}) || "y" in (changes ?? {}) || "disposition" in (changes ?? {})) later(token.parent);
    });
    Hooks.on("createToken", (token) => later(token.parent));
    Hooks.on("deleteToken", (token) => later(token.parent));
    Hooks.on("createItem", (item) => {
        if (item.flags?.[MODULE_ID]?.[ADJACENT]) later(item.actor?.getActiveTokens?.(true, true)?.[0]?.parent ?? canvas?.scene);
    });
    Hooks.on("combatTurn", (combat) => later(combat.scene ?? canvas?.scene));
}
