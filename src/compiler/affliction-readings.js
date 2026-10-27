// The afflictions group's readings (2026-10-27, docs/needs.md "afflictions" and "dying"): poisons, diseases, curses and addictions, persistent
// damage, and dying, unconsciousness and death — each mechanism in its own file, applied here last over a consumable's plan
// (src/compiler/index.js compileItem) and an activation's (src/compiler/permanent.js compileActivations). Pure.

import { withAddictionSuppressed } from "./addiction.js";
import { withAfflictionHeldOff, withSaveAgainstOne } from "./affliction-saves.js";
import { withOwnCounteract } from "./own-counteract.js";
import { expandStageRange, withPoisonLines } from "./poison-reading.js";
import { withHiddenSymptom } from "./hidden-symptom.js";
import { withCumulativeWeakness } from "./curse-weakness.js";
import { withVaccineStrain } from "./vaccine.js";
import { withCleanAir } from "./breathe-clean.js";
import { withShooedSwarm } from "./shooed-swarm.js";
import { withTripod } from "./tripod.js";
import { withFirstAidMore } from "./first-aid.js";
import { withDyingLift } from "./dying-lift.js";
import { withSleepNotes } from "./sleep-notes.js";

// A consumable's plan, its item, and how to compile the item again with other html → the plan as these read it.
// (A poison's range of stages alike, Unending Itch's "Stages 1–5", written out a stage each and compiled again: src/compiler/poison-reading.js.)
export function withAfflictionReadings(plan, item, recompile = null) {
    // (Compiled again, it's been through these already.)
    const expanded = plan?.noteOnly && recompile ? expandStageRange(item?.system?.description?.value) : null;
    if (expanded) return recompile(expanded) ?? plan;
    const html = item?.system?.description?.value;
    return withFirstAidMore(withTripod(withVaccineStrain(withHiddenSymptom(withPoisonLines(withOwnCounteract(withSaveAgainstOne(withAddictionSuppressed(plan, html), html), html), html), html)), html));
}

// An activation's plan, its item and its entry ({ activation: { name, html } }) → the plan as these read it.
export function withAfflictionActivations(plan, item, entry) {
    return withSleepNotes(withDyingLift(withShooedSwarm(withCleanAir(withCumulativeWeakness(withAfflictionHeldOff(plan, item, entry), item, entry), entry))));
}
