// What follows a condition that goes on, a note Effect beside it (2026-10-27, docs/needs.md "dying"):
// - Dreaming Round's sleep, "If the target's actions are reduced to 0 by this effect, it immediately falls into a deep sleep and is Unconscious,
//   during which it no longer attempts a save at the end of its turn. It wakes up automatically after 1 hour or if it takes damage, but not due
//   to non-painful stimuli (such as noise or being nudged). When it wakes up, its slowed condition decreases by 1, though it must once again save
//   at the end of each of its turns and might risk falling asleep again." — its Slowed and the saves at the end of its turns the ability
//   module's (a save-ends condition that escalates); asleep at no actions left, its Slowed 3, the ability module's Unconscious at that value
//   (escalate.atValue, 2026-10-28; no higher by it, max 3: it saves no more asleep); its waking and the saves skipped while asleep a note Effect
//   on the creature on a failure or worse, as long as that goes on (the GM's to remove).
// - Urn of Ashes' own doom, "The ashes in the urn intervene, taking the doomed condition in your place … Each night when you get a full night's
//   rest, you can reduce your own doomed condition or that of the urn, but not both", its Requirements "The ashes aren't doomed": a note Effect on
//   its user for as long as the ashes are doomed, saying it can't be used again until a night's rest lowers the urn's doom (its user removes it
//   then). Pure.

const SLEEP = /^If the target's actions are reduced to 0 by this effect, it immediately falls into a deep sleep and is Unconscious, during which it no longer attempts a save at the end of its turn\. It wakes up automatically after (\d+) (hours?|minutes?) or if it takes damage, but not due to non-painful stimuli \(such as noise or being nudged\)\. When it wakes up, its slowed condition decreases by 1, though it must once again save at the end of each of its turns and might risk falling asleep again\.$/;
const URN = /^The urn's ashes are now doomed in its place: it can't be used so again until a night's rest lowers the urn's doom instead of its user's \(the GM's, out of combat\)\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const done = (plan, notes) => ({ ...(notes.length ? { notes } : { notes: undefined }), ...(plan.partial && !notes.length && !(plan.unread ?? []).length && !Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length) ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) });

// The plan → the plan with its note Effects, or the same plan.
export function withSleepNotes(plan) {
    const notes = plan?.notes ?? [];
    const outcomes = plan?.resolution?.outcomes;
    const sleep = notes.map((note) => [note, SLEEP.exec(said(note))]).find(([, found]) => found);
    const slowed = (row) => (row?.effects ?? []).some((effect) => effect.slug === "slowed" && effect.duration?.saveEnds?.mode === "escalate");
    if (sleep && slowed(outcomes?.failure) && slowed(outcomes?.criticalFailure)) {
        const [note, found] = sleep;
        const words = { label: "Drowsy", text: `At Slowed 3 its actions are gone: deeply asleep, Unconscious (given), it attempts no saves at the end of its turns (skip them). It wakes after ${found[1]} ${found[2]} or when it takes damage (not from noise or a nudge): remove Unconscious, its Slowed 1 lower, and those saves start again, so it may fall asleep again.`, duration: null };
        // (Its actions at 0, Slowed 3: Unconscious then — the ability module's escalate.atValue — and no higher by it.)
        const asleep = (effect) => (effect.slug === "slowed" && effect.duration?.saveEnds?.mode === "escalate" ? { ...effect, duration: { ...effect.duration, saveEnds: { ...effect.duration.saveEnds, max: 3, escalate: { ...effect.duration.saveEnds.escalate, atValue: { 3: "unconscious" } } } } } : effect);
        const given = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, slowed(row) ? { ...row, effects: row.effects.map(asleep), noteEffects: [...(row.noteEffects ?? []), words] } : row]));
        return { ...plan, resolution: { ...plan.resolution, outcomes: given }, ...done(plan, notes.filter((entry) => entry !== note)) };
    }
    const urn = notes.find((note) => URN.test(said(note)));
    const row = outcomes?.success;
    if (urn && row && (plan.item?.ruleEffects ?? []).some((effect) => (effect.prevents ?? []).includes("doomed"))) {
        const words = { label: "The urn's ashes are doomed", text: "The ashes took the Doomed in its place: Doom the Urn can't be used again until a night's rest lowers the urn's doom rather than its user's (remove this then).", duration: null };
        return { ...plan, resolution: { ...plan.resolution, outcomes: { ...outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []), words] } } }, ...done(plan, notes.filter((entry) => entry !== urn)) };
    }
    return plan;
}
