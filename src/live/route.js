// Which card a used consumable gets (scripts/live.js), as a pure decision the census shares: "coat" (an injury
// poison), "expose" (a contact, inhaled or ingested poison, or a drug), "cast" (a spell PF2e has no Effect for, the
// spell module's), "save" (another item's save on its Use, at the presser's targets), "focus" (a Focus Point for its
// user), "strike" (its user's next Strike carries its riders), "reroll" (PF2e rerolls the roll that triggered it), "fortune" (its user's next roll of a kind rolled twice), "action" (PF2e's own skill action, with its bonus), "counteract" (what it counteracts on its drinker), "item" (healing, PF2e Effects, the item's own row), or null (none yet).

import { isExposurePoison, isInjuryPoison, isLaterSave, isUseSave } from "./poison-card.js";
import { isCast } from "./cast-card.js";
import { isStrikeItem } from "./strike-card.js";
import { isFortune } from "./fortune-card.js";
import { isToggle } from "./toggle-card.js";

// An automatic row aimed at a creature other than the user (the ability compiler's "The target is grabbed until the end of
// your next turn", "The target is Quickened for 1 round"; damage outright, "The attacking creature takes 2d6 fire
// damage"): for the creatures the presser targets, through the save card — not the item card, which acts on its user or
// drinker.
const targetedRow = (plan) => plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" && Boolean(plan.targeting?.target)
    && !/^(?:the drinker|you|yourself|self|itself)$/i.test(String(plan.targeting.target).trim())
    && ((plan.resolution.outcomes?.success?.effects ?? []).some((effect) => effect.recipient !== "self") || (plan.resolution.outcomes?.success?.damage?.mode ?? "none") !== "none");

const playedOnItemCard = (plan) => ["healing", "effect"].includes(plan?.resolution?.kind) || (plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic");

export function routeOf(plan, text = "") {
    if (!plan) return null;
    if (isInjuryPoison(plan)) return "coat";
    if (isExposurePoison(plan)) return "expose";
    if (isCast(plan)) return "cast";
    // (A counteract on the drinker: the counteract card, scripts/counteract.js.)
    if (plan.builtin === "counteract" && plan.item?.counteract) return "counteract";
    // (A skill action taken with it: PF2e's own action with its bonus, scripts/item-actions.js.)
    if (plan.builtin === "item-action" && plan.action) return "action";
    // (A reroll of the roll that triggered it: PF2e's own reroll, scripts/rerolls.js.)
    if (plan.builtin === "reroll" && plan.reroll) return "reroll";
    // (Its user's next roll of a kind rolled twice: PF2e's RollTwice, scripts/fortune.js.)
    if (isFortune(plan)) return "fortune";
    // (Used by Striking: the user's next Strike carries its riders, scripts/strikes.js.)
    if (isStrikeItem(plan)) return "strike";
    // (A Focus Point for its user: the item module's own card, scripts/focus.js.)
    if (plan.builtin === "focus-point" && plan.focus) return "focus";
    // (One of the item's own PF2e toggles set to a way: scripts/toggle.js.)
    if (isToggle(plan)) return "toggle";
    // (A lasting area or a snare: the ability module's zone.)
    if (plan.builtin === "zone" && plan.zone) return "zone";
    // (A check with the item's own modifier at a creature: the ability module's card, as a save at the targets.)
    // (What it gives its user and allies in an area: the same card, at the creatures the presser targets.)
    if (plan.ownCheck || plan.allyArea || isUseSave(plan, text) || targetedRow(plan)) return "save";
    if (isLaterSave(plan, text)) return "later";
    if (playedOnItemCard(plan)) return "item";
    return null;
}
