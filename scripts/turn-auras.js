// Live play for an item's Effect's turnAuras (src/live/turn-auras.js, 2026-10-27: Clockwork Sun's illumination): at the start and the end of
// each creature's turn (PF2e's pf2e.startTurn and pf2e.endTurn, the active GM's client), every token on the scene bearing such an Effect is
// checked: the creature within an aura's radius that fits it (sighted, no Avert Gaze, an ability of the kind named) gets that aura's save
// card, the ability module's, from the bearer.

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { auraFits } from "../src/live/turn-auras.js";
import { ABILITY_ID, MODULE_ID, isActiveGM, spaceOf } from "./foundry.js";

// (A name as PF2e slugs it: an NPC's ability often has no slug of its own.)
const slugOf = (name) => String(name ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The Effects with auras on a token's actor, still lasting.
const aurasOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => (effect.flags?.[MODULE_ID]?.turnAuras ?? []).length && !(effect.isExpired ?? effect.system?.expired));

async function checkAuras(combatant, at) {
    const token = combatant?.token?.object ?? combatant?.token ?? null;
    const actor = combatant?.actor;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    if (!token || !actor || !postCard || !canvas?.ready) return;
    const placeable = token.object ?? token;
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    const facts = { at, conditions: (actor.conditions?.contents ?? actor.itemTypes?.condition ?? []).map((condition) => condition.slug), effects: (actor.itemTypes?.effect ?? []).map((effect) => effect.slug).filter(Boolean), abilities: [...(actor.itemTypes?.action ?? []), ...(actor.itemTypes?.feat ?? [])].flatMap((entry) => [entry.slug ?? entry.system?.slug, slugOf(entry.name)]).filter(Boolean) };
    for (const bearer of canvas.tokens.placeables) {
        if (!bearer.actor) continue;
        for (const effect of aurasOf(bearer.actor)) {
            for (const aura of effect.flags[MODULE_ID].turnAuras) {
                const self = bearer.document.uuid === placeable.document?.uuid || bearer.actor.uuid === actor.uuid;
                if (!auraFits(aura, { ...facts, self, distance: distanceFeet(spaceOf(bearer), spaceOf(placeable), grid) })) continue;
                const name = effect.flags[MODULE_ID].from ?? effect.name;
                // (Its item the Effect's origin item — PF2e's effect.origin is the origin actor, and a save rolled with an actor as its item
                // throws in PF2e's Check.roll: 2026-10-29, found live —, else the Effect itself.)
                await postCard({ plan: aura.plan, item: { name, uuid: effect.system?.context?.origin?.item ?? effect.uuid ?? null }, sourceActor: bearer.actor, sourceToken: bearer, tokens: [placeable], cause: `${name}: ${aura.label ?? "its save"}` });
            }
        }
    }
}

export function setUpTurnAuras() {
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (isActiveGM()) checkAuras(combatant, "start").catch((error) => console.error(`${MODULE_ID} | turn auras`, error));
    });
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (isActiveGM()) checkAuras(combatant, "end").catch((error) => console.error(`${MODULE_ID} | turn auras`, error));
    });
}
