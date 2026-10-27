// The readings of 2026-10-27's rules group (docs/needs.md: immunities and resistances by situation, bonuses only in some situations, use limits
// of its own, plain results the reader doesn't parse yet, numbers the text doesn't give, results for some creatures only, fortune), each in a
// file of its own, run last on an activation's plan (src/compiler/permanent.js) and a consumable's (src/compiler/index.js), after the user's
// rulings (src/compiler/decided.js) left it as it was. Each returns the plan as it was when it isn't its item's. Pure.

import { withFoodImmunityLine, withSecondaryFatigue, withShellBreathing, withSoberedImmunity } from "./immune-after.js";
import { withMerged } from "./merged.js";
import { withMechanismLine, withSituational, withToastedMarks } from "./situational.js";

// An activation's plan, its activation ({ name, html }) and its item → the plan as these read it.
export function withActivationRules(plan, activation, item) {
    const html = activation?.html ?? "";
    return withShellBreathing(withToastedMarks(withMerged(plan, html), item), html, item);
}

// A consumable's plan and the item → the plan as these read it.
export function withConsumableRules(plan, item) {
    return withFoodImmunityLine(withSecondaryFatigue(withSoberedImmunity(withMechanismLine(withSituational(plan, item)), item), item));
}
