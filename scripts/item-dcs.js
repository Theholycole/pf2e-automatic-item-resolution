// A world setting (the user's answer of 2026-10-19): saves against an item's own DC — and the DCs of the spells it casts — use its user's
// class DC or spell DC instead when that's higher (src/compiler/item-data.js raiseItemDCs). Off by default. Applied as each card is posted,
// so the DC is its user's as it is then; its user's own saves (a drawback's, an elixir's "you must attempt") keep the item's.

import { raiseItemDCs } from "../src/compiler/item-data.js";
import { isOwnSave } from "../src/live/poison-card.js";
import { MODULE_ID, ownerDCsOf } from "./foundry.js";

export const USER_DCS = "itemDCsFromUser";

export function registerItemDCSettings() {
    game.settings.register(MODULE_ID, USER_DCS, {
        name: "Item DCs from their user",
        hint: "Saves against an item's own DC, and the DCs of spells it casts, use the user's class DC or spell DC instead when that's higher.",
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

// The plan as its card plays it: raised when the setting is on and it isn't its user's own save.
export function withUserDCs(plan, actor, text = "") {
    if (!plan || !actor || !enabled()) return plan;
    if (isOwnSave(plan, text) || (plan.resolution?.check?.roll === "save" && SELF.test(String(plan.targeting?.target ?? "").trim()))) return plan;
    return raiseItemDCs(plan, ownerDCsOf(actor)).plan;
}
