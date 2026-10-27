// The readings of 2026-10-27's rules group (docs/needs.md: immunities and resistances by situation, bonuses only in some situations, use limits
// of its own, plain results the reader doesn't parse yet, numbers the text doesn't give, results for some creatures only, fortune), each in a
// file of its own, run last on an activation's plan (src/compiler/permanent.js) and a consumable's (src/compiler/index.js), after the user's
// rulings (src/compiler/decided.js) left it as it was. Each returns the plan as it was when it isn't its item's. Pure.

import { withFoodImmunityLine, withSecondaryFatigue, withShellBreathing, withSoberedImmunity } from "./immune-after.js";
import { withAttitudeSave } from "./attitude.js";
import { withFundamentalOil } from "./fundamental.js";
import { withHeartbeatFloor } from "./heartbeat.js";
import { withIntactShot } from "./intact-shot.js";
import { withMerged } from "./merged.js";
import { oneOff } from "./one-offs.js";
import { isSpecialItem } from "./decided.js";
import { withOathCritical } from "./oath.js";
import { withActivationLines, withBroomFlight, withNullifyLines, withTableLines, withTossLines } from "./table-lines.js";
import { withFirstEntrySave, withRidingSnare, withZoneOwnEffect } from "./zone-readings.js";
import { withActivationSituational, withMechanismLine, withSituational, withToastedMarks } from "./situational.js";

// (A one-off rule left in a builtin's notes — Earthglide Cloak's expulsion beside its teleport card's Burrow —, which decided.js leaves to the
// builtin: its card's lines, counted done, as decided.js's one-offs are.)
function withBuiltinOneOff(plan, item) {
    if (!plan?.builtin || !plan.partial || isSpecialItem(item) || !oneOff(plan.source?.name) || (plan.unread ?? []).length) return plan;
    return { ...plan, partial: undefined, decided: "one-off", automation: { ...(plan.automation ?? {}), level: "automatic" } };
}

// An activation's plan, its entry ({ activation: { name, html }, index }), its item and its base (a plan maker, for one nothing read) → the
// plan as these read it.
export function withActivationRules(plan, entry, item, base) {
    const html = entry?.activation?.html ?? "";
    return withTossLines(withZoneOwnEffect(withNullifyLines(withBuiltinOneOff(withIntactShot(withOathCritical(withShellBreathing(withToastedMarks(withBroomFlight(withAttitudeSave(withActivationSituational(withMerged(withActivationLines(plan, entry, item, base), html), html), html, item), html), item), html, item), item), item), item), html), html), html);
}

// A consumable's plan, the item and its base → the plan as these read it.
export function withConsumableRules(plan, item, base) {
    return withFirstEntrySave(withHeartbeatFloor(withFoodImmunityLine(withSecondaryFatigue(withSoberedImmunity(withMechanismLine(withSituational(withFundamentalOil(withRidingSnare(withTableLines(plan, item, base), item, base), item, base), item)), item), item)), item), item);
}
