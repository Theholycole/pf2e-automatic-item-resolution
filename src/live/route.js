// Which card a used consumable gets (scripts/live.js), as a pure decision the census shares: "coat" (an injury
// poison), "expose" (a contact, inhaled or ingested poison, or a drug), "cast" (a spell PF2e has no Effect for, the
// spell module's), "save" (another item's save on its Use, at the presser's targets), "item" (healing, PF2e Effects,
// the item's own row), or null (none yet).

import { isExposurePoison, isInjuryPoison, isLaterSave, isUseSave } from "./poison-card.js";
import { isCast } from "./cast-card.js";

// An automatic row aimed at a creature other than the user (the ability compiler's "The target is grabbed until the end of
// your next turn", "The target is Quickened for 1 round"): for the creatures the presser targets, through the save card —
// not the item card, which acts on its user or drinker.
const targetedRow = (plan) => plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" && Boolean(plan.targeting?.target)
    && !/^(?:the drinker|you|yourself|self|itself)$/i.test(String(plan.targeting.target).trim())
    && (plan.resolution.outcomes?.success?.effects ?? []).some((effect) => effect.recipient !== "self");

const playedOnItemCard = (plan) => ["healing", "effect"].includes(plan?.resolution?.kind) || (plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic");

export function routeOf(plan, text = "") {
    if (!plan) return null;
    if (isInjuryPoison(plan)) return "coat";
    if (isExposurePoison(plan)) return "expose";
    if (isCast(plan)) return "cast";
    // (A lasting area or a snare: the ability module's zone.)
    if (plan.builtin === "zone" && plan.zone) return "zone";
    if (isUseSave(plan, text) || targetedRow(plan)) return "save";
    if (isLaterSave(plan, text)) return "later";
    if (playedOnItemCard(plan)) return "item";
    return null;
}
