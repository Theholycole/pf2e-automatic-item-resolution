// The afflictions group's readings (2026-10-27, docs/needs.md "afflictions" and "dying"): poisons, diseases, curses and addictions, persistent
// damage, and dying, unconsciousness and death — each mechanism in its own file, applied here last over a consumable's plan
// (src/compiler/index.js compileItem) and an activation's (src/compiler/permanent.js compileActivations). Pure.

import { withAddictionSuppressed } from "./addiction.js";
import { withAfflictionHeldOff, withSaveAgainstOne } from "./affliction-saves.js";
import { withOwnCounteract } from "./own-counteract.js";

// A consumable's plan and its item → the plan as these read it.
export function withAfflictionReadings(plan, item) {
    const html = item?.system?.description?.value;
    return withOwnCounteract(withSaveAgainstOne(withAddictionSuppressed(plan, html), html), html);
}

// An activation's plan, its item and its entry ({ activation: { name, html } }) → the plan as these read it.
export function withAfflictionActivations(plan, item, entry) {
    return withAfflictionHeldOff(plan, item, entry);
}
