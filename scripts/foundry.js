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

// A Strike's riders on the creature it hit (a bomb's, an item's Strike): the plan resolved by the core at the degree PF2e
// rolled, each change through the ability module's api.live.applyChange. → the lines for the card.
export async function applyRiders({ plan, degree, user, target, item }) {
    const core = game.modules.get(CORE_ID)?.api;
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const context = { caster: { id: "source" }, targets: [{ id: "target" }], id: (creature) => creature.id, statistic: () => ({ modifier: 0, dc: 10 }), allied: () => false };
    const result = core ? await core.registry.resolve(plan, context, { roll: () => ({ degree, total: null, natural: null }), damage: () => 0, choose: () => undefined }) : { changes: [] };
    const abilityState = {
        plan,
        ability: { name: item.name, uuid: item.uuid ?? null },
        source: { actorUuid: user.actorUuid, tokenUuid: user.tokenUuid ?? null, name: user.name },
        targets: [{ id: "target", actorUuid: target.actorUuid, tokenUuid: target.tokenUuid ?? null, name: target.name }]
    };
    const lines = [];
    for (const change of result.changes) {
        try {
            const line = ability?.applyChange ? await ability.applyChange(change, abilityState) : `${target.name}: ${change.op} to apply by hand (the ability module isn't active).`;
            lines.push(line ?? `${target.name}: ${change.op === "condition" ? `${change.slug}${Number.isFinite(change.value) ? ` ${change.value}` : ""}` : change.effect?.kind === "modifier" ? `${change.effect.modifier.value} to ${change.effect.modifier.selector}` : change.op}`);
        } catch (error) {
            lines.push(`Couldn't apply ${change.op} to ${target.name}: ${error.message}`);
        }
    }
    return lines;
}

// The started encounter the creature is in, and its combatant there: the GM may be viewing another encounter, or an unlinked
// one (game.combat is the viewed one). → { combat, combatant } or null.
export function encounterOf(actor) {
    if (!actor) return null;
    const isIt = (combatant) => combatant.actor?.uuid === actor.uuid || combatant.actorId === actor.id;
    const combats = [game.combat, ...(game.combats?.contents ?? [])].filter((combat, index, list) => combat?.started && list.indexOf(combat) === index);
    for (const combat of combats) {
        const combatant = combat.combatants.find(isIt);
        if (combatant) return { combat, combatant };
    }
    return null;
}

// The initiative a new Effect starts at: the current turn's in the creature's encounter, else none.
export const startInitiative = (actor) => {
    const found = encounterOf(actor);
    return found ? found.combat.combatant?.initiative ?? null : null;
};

// The owner's own DCs, for a save against "your class DC or spell DC" (src/compiler/item-data.js fillOwnerDCs): PF2e's
// attributes classDC and spellDC, which it keeps on characters and NPCs alike.
export function ownerDCsOf(actor) {
    const number = (value) => (Number(value) > 0 ? Number(value) : null);
    const attributes = actor?.system?.attributes ?? {};
    return { class: number(attributes.classDC?.value), spell: number(attributes.spellDC?.value) };
}
