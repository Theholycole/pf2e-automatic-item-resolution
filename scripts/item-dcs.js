// A world setting (the user's answer of 2026-10-19): saves against an item's own DC — and the DCs of the spells it casts — use its user's
// class DC or spell DC instead when that's higher (src/compiler/item-data.js raiseItemDCs). Off by default. Applied as each card is posted,
// so the DC is its user's as it is then; its user's own saves (a drawback's, an elixir's "you must attempt") keep the item's. A poison
// too, and +4 on top for a user with Potent Poisoner (the user's answers of 2026-10-19: past the feat's own cap of their class DC).
// Whatever the setting, PF2e's Powerful Alchemy: an infused alchemical item's DC at its alchemist's class DC, as PF2e's own inline checks
// have it (its AdjustModifier on "inline-dc" for item:trait:infused).

import { raiseItemDCs } from "../src/compiler/item-data.js";
import { isOwnSave } from "../src/live/poison-card.js";
import { MODULE_ID, ownerDCsOf } from "./foundry.js";

export const USER_DCS = "itemDCsFromUser";

export function registerItemDCSettings() {
    game.settings.register(MODULE_ID, USER_DCS, {
        name: "Item DCs from their user",
        hint: "Saves against an item's own DC, and the DCs of spells it casts, use the user's class DC or spell DC instead when that's higher. Poisons too, +4 on top for a user with Potent Poisoner.",
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

// Its user's feat or class feature by slug (Potent Poisoner, Powerful Alchemy).
const hasFeature = (actor, slug) => [...(actor?.itemTypes?.feat ?? []), ...(actor?.items?.contents ?? [])].some((entry) => (entry?.system?.slug ?? entry?.slug) === slug);
// An alchemist's class DC, as Powerful Alchemy's rule reads it (@actor.classDCs.alchemist).
const alchemistDC = (actor) => Number(actor?.classDCs?.alchemist?.dc?.value ?? actor?.classDCs?.alchemist?.value) || null;

// The plan as its card plays it (item: the one used): raised when the setting is on — a poison +4 more with Potent Poisoner — or, setting or
// not, for an alchemist's infused item under Powerful Alchemy; not its user's own save.
export function withUserDCs(plan, actor, text = "", item = null) {
    if (!plan || !actor) return plan;
    const setting = enabled();
    const infused = (item?.system?.traits?.value ?? []).includes("infused") && hasFeature(actor, "powerful-alchemy") ? alchemistDC(actor) : null;
    if (!setting && !infused) return plan;
    if (isOwnSave(plan, text) || (plan.resolution?.check?.roll === "save" && SELF.test(String(plan.targeting?.target ?? "").trim()))) return plan;
    let dcs = setting ? ownerDCsOf(actor) : {};
    if (infused && !(Number(dcs.class) >= infused) && !(Number(dcs.spell) >= infused)) dcs = { ...dcs, class: infused };
    const potent = setting && isPoison(item) && hasFeature(actor, "potent-poisoner") ? { value: 4, name: "Potent Poisoner" } : null;
    const reason = [setting ? "the world setting" : null, infused ? "Powerful Alchemy, an infused item" : null].filter(Boolean).join("; ");
    return raiseItemDCs(plan, dcs, { plus: potent, reason, label: infused && !setting ? "alchemist class" : null }).plan;
}
