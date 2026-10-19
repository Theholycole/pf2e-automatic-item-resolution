// A world setting (the user's answer of 2026-10-19): saves against an item's own DC — and the DCs of the spells it casts — use its user's
// class DC or spell DC instead when that's higher (src/compiler/item-data.js raiseItemDCs). Off by default. Applied as each card is posted,
// so the DC is its user's as it is then; its user's own saves (a drawback's, an elixir's "you must attempt") keep the item's. Not a
// poison's (the user's answer of 2026-10-19): an alchemist's own feats raise a poison's DC, at most to their class DC.

import { raiseItemDCs } from "../src/compiler/item-data.js";
import { isOwnSave } from "../src/live/poison-card.js";
import { MODULE_ID, ownerDCsOf } from "./foundry.js";

export const USER_DCS = "itemDCsFromUser";

export function registerItemDCSettings() {
    game.settings.register(MODULE_ID, USER_DCS, {
        name: "Item DCs from their user",
        hint: "Saves against an item's own DC, and the DCs of spells it casts, use the user's class DC or spell DC instead when that's higher. Not poisons: an alchemist's own feats raise those.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
}

const enabled = () => {
    try {
        return game.settings.get(MODULE_ID, USER_DCS) === true;
    } catch {
        return false;
    }
};
const SELF = /^(?:you|yourself|self|the user|the drinker|its user)$/i;

// A poison: PF2e's poison category, or the poison trait with how it's delivered (contact, ingested, inhaled, injury).
export const isPoison = (item) => item?.system?.category === "poison" || ((item?.system?.traits?.value ?? []).includes("poison") && (item?.system?.traits?.value ?? []).some((trait) => ["contact", "ingested", "inhaled", "injury"].includes(trait)));

// The plan as its card plays it: raised when the setting is on and it isn't its user's own save, nor a poison's (item: the one used).
export function withUserDCs(plan, actor, text = "", item = null) {
    if (!plan || !actor || !enabled() || isPoison(item)) return plan;
    if (isOwnSave(plan, text) || (plan.resolution?.check?.roll === "save" && SELF.test(String(plan.targeting?.target ?? "").trim()))) return plan;
    return raiseItemDCs(plan, ownerDCsOf(actor)).plan;
}
