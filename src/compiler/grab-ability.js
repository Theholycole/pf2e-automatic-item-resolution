// A grab that works as the Grab creature ability (2026-10-27, docs/needs.md): Scizore of the Crab's "The target is grabbed until the end of your next
// turn. A grabbed creature can use the Escape action to get out of the Grab, and the Grab ends for a grabbed creature if you move away from it.
// This functions as the Grab creature ability." The Grabbed's Escape against its user's Athletics DC — escape { ownerDC: "athletics" }, filled
// in from its user as the card is made (src/compiler/item-data.js fillOwnerDCs), the ability module's Escape ending it — and the grab's end
// when its user moves away words on a note Effect for that time (no PF2e rule ends it so). The two lines gone. Pure.

const ESCAPE = /^\{target\}: A grabbed creature can use the Escape action to get out of the Grab, and the Grab ends for a grabbed creature if you move away from it\.$/i;
const FUNCTIONS = /^\{target\}: This functions as the Grab creature ability\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → the plan with that grab, or the same plan.
export function withGrabAbility(plan) {
    const row = plan?.resolution?.outcomes?.success;
    const grab = (row?.effects ?? []).find((effect) => effect.slug === "grabbed");
    const lines = (row?.manualInstructions ?? []).filter((entry) => ESCAPE.test(said(entry)) || FUNCTIONS.test(said(entry)));
    if (!grab || !lines.some((entry) => ESCAPE.test(said(entry)))) return plan;
    const { manualInstructions, ...rest } = row;
    const kept = manualInstructions.filter((entry) => !lines.includes(entry));
    const effects = row.effects.map((effect) => (effect === grab ? { ...effect, duration: { ...(effect.duration ?? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }), escape: { ownerDC: "athletics" } } } : effect));
    const note = { label: "Grabbed by it", text: "The grab ends if its grabber moves away from it.", duration: grab.duration ?? null };
    const success = { ...rest, effects, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(rest.noteEffects ?? []), note] };
    const left = kept.length || (plan.notes ?? []).length || (plan.unread ?? []).length;
    return { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success } }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
