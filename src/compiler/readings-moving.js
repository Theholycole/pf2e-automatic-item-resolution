// Moving creatures and the user, and forms: the readings of the 2026-10-28 batch's moving group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.

import { withKnockbackAmmo } from "./knockback-ammo.js";
import { withBuoyedSwim, withLongerCrawl, withStickyShove } from "./move-parts.js";
import { withSoftSquare } from "./fall-zones.js";
import { withReleasedCreature } from "./released-creatures.js";
import { withCreatureCast } from "./creature-casts.js";
import { withRollingMines } from "./rolling-mines.js";
import { withJetFlight } from "./jet-flight.js";
import { withStrideTrail } from "./stride-trails.js";

export function withMovingGroup(plan, context) {
    if (context.kind === "activation") return withStrideTrail(withKnockbackAmmo(plan, context.item, context.text), context.text, context);
    // (Marble Mines' zone, its setting off a one-off rule: the user's rulings again, which make it the zone card's line.)
    const mines = withRollingMines(plan, context.text, context);
    if (mines !== plan) return context.decide(mines);
    return withJetFlight(withCreatureCast(withReleasedCreature(withSoftSquare(withLongerCrawl(withStickyShove(withBuoyedSwim(plan, context.text, context.name), context.text, context.name), context.text), context.text, context), context.text, context), context.text), context.text, context);
}
