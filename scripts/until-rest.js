// Live play for an item card's Effects that last until their creature's next daily preparations, or until the item's next use (2026-10-27,
// src/compiler/artifact-readings.js: Slithermaw's Bane (Heroic)'s Terrain Adaptation, "until your next daily preparations or the next time
// you activate it"): an Effect flagged untilRest is deleted at PF2e's Rest for the Night (its pf2e.restForTheNight hook, on the active GM's
// client); one flagged replaces takes the place of the creature's earlier Effect of that name from the same item (replacedBy, before it's
// made: scripts/live.js).

import { MODULE_ID, isActiveGM } from "./foundry.js";

// The creature's Effects of this module from that item (its uuid, the Effect's origin — whichever of its ways made it) of that kind: an
// item rule Effect of that name, or a temperature protection → their ids. Pure.
export function replacedBy(actor, { itemUuid, name = null, kind = "rule" }) {
    if (!itemUuid) return [];
    return (actor?.itemTypes?.effect ?? []).filter((effect) => {
        const flags = effect.flags?.[MODULE_ID] ?? {};
        if (!flags.replaces || effect.system?.context?.origin?.item !== itemUuid) return false;
        return kind === "temperature" ? Boolean(flags.temperature) : flags.ruleEffect === name;
    }).map((effect) => effect.id);
}

export function setUpUntilRest() {
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        const ids = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.untilRest).map((effect) => effect.id);
        if (ids.length) actor.deleteEmbeddedDocuments("Item", ids).catch((error) => console.error(`${MODULE_ID} | Effects until rest`, error));
    });
}
