// Changes to Strikes, triggers, fortune, situational bonuses and the user's actions: the readings of the 2026-10-28 batch's strike group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.

import { withAttackThenSave } from "./attack-then-save.js";
import { withGauntletShots } from "./gauntlet-shots.js";
import { withHeldOrWorn } from "./held-or-worn.js";
import { withPlantActions } from "./plant-actions.js";
import { withRageRiders } from "./rage-riders.js";
import { withReleasedStrikes } from "./released-strikes.js";
import { withSecondaryRules } from "./secondary-rules.js";
import { withTrailString } from "./trail-string.js";
import { withTriggeringSave } from "./triggering-save.js";
import { withinTreatment } from "./within-treatment.js";

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const done = (plan) => {
    const next = { ...plan, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    return next;
};

// (A bonus for one roll its user picks within a time, a third-party sandwich's: the fortune card's readied bonus — src/compiler/readied-bonus.js
// pickedRoll —, its Apply pressed just before that roll, the immunity after it the item's. Its note, the user's own timing, is the card's line:
// said in our words, done.)
const PICKED = /^Press Apply just before the roll you pick:/;
function withPickedRoll(plan, { kind }) {
    if (kind !== "consumable" || plan?.builtin !== "readied-bonus" || !plan.partial || (plan.unread ?? []).length) return plan;
    const notes = (plan.notes ?? []).map(said);
    if (notes.length !== 1 || !PICKED.test(notes[0]) || !((plan.bonus?.spend ?? []).length > 1)) return plan;
    const [first] = plan.bonus.modifiers;
    const kinds = { "attack-roll": "attack roll", "skill-check": "skill check", "saving-throw": "save", perception: "Perception check" };
    const rolls = plan.bonus.spend.map((selector) => kinds[selector] ?? selector);
    const which = rolls.length > 1 ? `${rolls.slice(0, -1).join(", ")} or ${rolls.at(-1)}` : rolls[0];
    return done({ ...plan, notes: [`Press Apply just before the roll you pick, once within the hour after it's eaten: +${first.value} ${first.type} bonus to that one ${which}.`] });
}

const READINGS = [withPickedRoll, withSecondaryRules, withReleasedStrikes, withPlantActions, withTriggeringSave, withHeldOrWorn, withAttackThenSave, withRageRiders, withGauntletShots, withTrailString, withinTreatment];

export function withStrikeGroup(plan, context) {
    return READINGS.reduce((next, reading) => reading(next, context) ?? next, plan);
}
