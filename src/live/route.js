// Which card a used consumable gets (scripts/live.js), as a pure decision the census shares: "coat" (an injury
// poison), "expose" (a contact, inhaled or ingested poison, or a drug), "cast" (a spell PF2e has no Effect for, the
// spell module's), "save" (another item's save on its Use, at the presser's targets), "focus" (a Focus Point for its
// user), "strike" (its user's next Strike carries its riders), "reroll" (PF2e rerolls the roll that triggered it), "fortune" (its user's next roll of a kind rolled twice), "action" (PF2e's own skill action, with its bonus), "counteract" (what it counteracts on its drinker), "teleport" (a short teleport for its user, the space picked on the canvas), "table" (a roll on its own table, the row's card), "item" (healing, PF2e Effects, the item's own row), or null (none yet).

import { isExposurePoison, isInjuryPoison, isLaterSave, isUseSave } from "./poison-card.js";
import { isCast } from "./cast-card.js";
import { isStrikeItem } from "./strike-card.js";
import { isFortune } from "./fortune-card.js";
import { isToggle } from "./toggle-card.js";
import { isWays } from "./ways-card.js";
import { isTeleport } from "./teleport-card.js";
import { isObjects } from "./objects-card.js";
import { isTable } from "./table-card.js";
import { isTake } from "./take-card.js";
import { isFeatUse } from "./feat-use-card.js";
import { isBond } from "./bond-card.js";

// (Or modifiers alone, outright at it — North Wind's Night Verse's Speed penalty, src/compiler/direct-damage.js, whose check is
// "automatic" — not its user's own bonus with a creature named, Spectacles of Inquiry's.)
// An automatic row aimed at a creature other than the user (the ability compiler's "The target is grabbed until the end of
// your next turn", "The target is Quickened for 1 round"; damage outright, "The attacking creature takes 2d6 fire
// damage"): for the creatures the presser targets, through the save card — not the item card, which acts on its user or
// drinker.
const targetedRow = (plan) => plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" && Boolean(plan.targeting?.target)
    && !/^(?:the drinker|you|yourself|self|itself)$/i.test(String(plan.targeting.target).trim())
    && ((plan.resolution.outcomes?.success?.effects ?? []).some((effect) => effect.recipient !== "self") || (plan.resolution.outcomes?.success?.damage?.mode ?? "none") !== "none" || (plan.resolution.check?.statistic === "automatic" && (plan.resolution.outcomes?.success?.modifiers ?? []).length > 0)
        // (Or a push alone: Avalanche Boots' Shove pushed farther, src/compiler/shove-farther.js.)
        || Boolean(plan.resolution.outcomes?.success?.forcedMovement)
        // (Or a note Effect alone on the vehicle its user targets, Feather Token (Anchor)'s stopped boat: src/compiler/vehicles.js, 2026-10-27.)
        || (/\bvehicle\b/i.test(String(plan.targeting.target)) && (plan.resolution.outcomes?.success?.noteEffects ?? []).length > 0)
        // (Or a note Effect alone on the creature it's at, plan.atTarget — Shadowed Scale, the Jungle Secret's body decomposed: 2026-10-27.)
        || (Boolean(plan.atTarget) && (plan.resolution.outcomes?.success?.noteEffects ?? []).length > 0));

// Its user's own skill check against a creature's DC (The Crows' Thievery against the Reflex DC, Whip-Tongue Sling's Athletics against
// the Fortitude DC): the ability module's card at the creatures the presser targets, its user's skill rolled (the core's check family).
const targetedCheck = (plan) => plan?.resolution?.kind === "check" && ["skill", "perception"].includes(plan.resolution.check?.roll) && plan.resolution.check?.against?.dc === "target"
    && !/^(?:the drinker|you|yourself|self|itself)$/i.test(String(plan.targeting?.target ?? "").trim());

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
    // (A spell cast into Spellstrike Ammunition: its user's own dialog, scripts/spellstrike.js.)
    if (plan.builtin === "spellstrike" && plan.spellstrike) return "spellstrike";
    // (A Focus Point for its user: the item module's own card, scripts/focus.js.)
    if (plan.builtin === "focus-point" && plan.focus) return "focus";
    // (One of the item's own PF2e toggles set to a way: scripts/toggle.js.)
    if (isToggle(plan)) return "toggle";
    // (One of several ways, each its own Activate block: the ways card, scripts/ways.js.)
    if (isWays(plan)) return "ways";
    // (A roll on its own table: its row's own card, scripts/table.js.)
    if (isTable(plan)) return "table";
    // (A short teleport for its user: the space picked on the canvas, scripts/teleport.js.)
    if (isTeleport(plan)) return "teleport";
    // (What it tells its user, whispered to the GM and the user: src/compiler/decided.js, the user's ruling.)
    if (plan.builtin === "whisper" && plan.whisper?.text) return "whisper";
    // (One of its user's items moved or changed, or itself: the objects card, scripts/objects.js.)
    if (isObjects(plan)) return "objects";
    // (An ally's condition taken onto its user: scripts/take.js.)
    if (isTake(plan)) return "take";
    // (One more use of a feat its user just used: scripts/feat-uses.js, 2026-10-27.)
    if (isFeatUse(plan)) return "feat-use";
    // (A bond with a willing creature: scripts/bonds.js, 2026-10-27.)
    if (isBond(plan)) return "bond";
    // (A lasting area or a snare: the ability module's zone.)
    if (plan.builtin === "zone" && plan.zone) return "zone";
    // (A creature it becomes, Wondrous Figurines': the ability module's conjured token.)
    if (plan.builtin === "conjure" && plan.creatures?.length) return "conjure";
    // (A check with the item's own modifier at a creature: the ability module's card, as a save at the targets.)
    // (What it gives its user and allies in an area: the same card, at the creatures the presser targets.)
    // (Damage to a creature that touches its drinker, for the item's time: the later card, kept open.)
    if (plan.retaliation) return "later";
    if (plan.ownCheck || plan.allyArea || isUseSave(plan, text) || targetedRow(plan) || targetedCheck(plan)) return "save";
    if (isLaterSave(plan, text)) return "later";
    if (playedOnItemCard(plan)) return "item";
    return null;
}
