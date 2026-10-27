// A persistent bleed that grows with each failure to stop it (2026-10-27, docs/needs.md): Bloodgorger Scythe's Root in Blood, "The target takes
// @Damage[1[bleed]] damage at the end of their turn. Each failure to stop the bleeding increases this bleed damage by 1 as a small scythe tree
// grows from the wound, to a maximum of 3 persistent bleed damage." The row's damage PF2e's persistent bleed (the ability compiler read it as
// plain bleed, dealt once), and a note Effect while that bleed lasts (ability cf8d902's whilePersistent) with PF2e's RollOption
// "air-bleed-grows:<type>:<by>:<max>" — scripts/bleed-grows.js raises it at each of the creature's turns it still bleeds. Pure.

const GROWS = /^\{target\}: Each failure to stop the bleeding increases this bleed damage by (\d+) as [^,]+, to a maximum of (\d+) persistent bleed damage\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → the plan with that bleed and its growth, or the same plan.
export function withGrowingBleed(plan) {
    const outcomes = plan?.resolution?.outcomes;
    const component = plan?.resolution?.sharedDamage?.components?.[0];
    const start = /^(\d+)\[bleed\]$/.exec(String(component?.formula ?? ""));
    if (!outcomes?.success || !start) return plan;
    const line = (outcomes.success.manualInstructions ?? []).map((entry) => [entry, GROWS.exec(said(entry))]).find(([, match]) => match);
    if (!line) return plan;
    const [, by, max] = line[1];
    const { manualInstructions, ...rest } = outcomes.success;
    const kept = manualInstructions.filter((entry) => entry !== line[0]);
    const note = { label: "Scythe tree in the wound", text: `Each failure to stop its persistent bleed adds ${by} to it, up to ${max}.`, rules: [{ key: "RollOption", option: `air-bleed-grows:bleed:${by}:${max}` }], whilePersistent: "bleed" };
    const success = { ...rest, damage: { mode: "formulas", formulas: [{ formula: `${start[1]}[persistent,bleed]` }], rollScope: "outcome" }, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(rest.noteEffects ?? []), note] };
    const left = kept.length || (plan.notes ?? []).length || (plan.unread ?? []).length;
    return {
        ...plan,
        resolution: { ...plan.resolution, sharedDamage: null, outcomes: { ...outcomes, success } },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
