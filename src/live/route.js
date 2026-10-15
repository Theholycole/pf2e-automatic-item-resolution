// Which card a used consumable gets (scripts/live.js), as a pure decision the census shares: "coat" (an injury
// poison), "expose" (a contact, inhaled or ingested poison, or a drug), "cast" (a spell PF2e has no Effect for, the
// spell module's), "save" (another item's save on its Use, at the presser's targets), "item" (healing, PF2e Effects,
// the item's own row), or null (none yet).

import { isExposurePoison, isInjuryPoison, isUseSave } from "./poison-card.js";
import { isCast } from "./cast-card.js";

const playedOnItemCard = (plan) => ["healing", "effect"].includes(plan?.resolution?.kind) || (plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic");

export function routeOf(plan, text = "") {
    if (!plan) return null;
    if (isInjuryPoison(plan)) return "coat";
    if (isExposurePoison(plan)) return "expose";
    if (isCast(plan)) return "cast";
    if (isUseSave(plan, text)) return "save";
    if (playedOnItemCard(plan)) return "item";
    return null;
}
