// A condition its user takes for a spell an item casts on them (2026-10-28, docs/needs.md "reader"): Tian Xia+'s Cat's Eye, whose See
// Mysteries gives its user a spell's effects at the cost of a valued condition. The cast is the spell module's (plan.builtin "cast-spell",
// self); the condition is plan.userEffects [{ slug, value, duration: null }], given to its user as it's used (scripts/live.js
// giveUserConditions, the ability module's applyChange) — PF2e's own condition, lowered as PF2e lowers it (Drained by a night's rest). Its
// sentence off the notes. Pure.

const VALUED = /^You gain the effects of an? ([A-Z][\w' -]+?) spell\s+but become (Drained|Enfeebled|Clumsy|Stupefied|Fatigued|Sickened) ?(\d)?\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan (a self cast's) → the plan with its user's condition, or the same plan.
export function withCastPrice(plan) {
    if (plan?.builtin !== "cast-spell" || !plan.self) return plan;
    const note = (plan.notes ?? []).find((entry) => {
        const found = VALUED.exec(said(entry));
        return found && found[1].toLowerCase() === String(plan.spell?.name ?? "").toLowerCase();
    });
    if (!note) return plan;
    const found = VALUED.exec(said(note));
    const slug = found[2].toLowerCase();
    const value = found[3] ? Number(found[3]) : slug === "fatigued" ? null : 1;
    const notes = plan.notes.filter((entry) => entry !== note);
    const left = notes.length || (plan.unread ?? []).length;
    const { notes: _notes, partial, ...rest } = plan;
    return {
        ...rest,
        ...(notes.length ? { notes } : {}),
        userEffects: [...(plan.userEffects ?? []), { slug, value, duration: null }],
        ...(left ? { partial } : { automation: { ...(plan.automation ?? {}), level: "automatic" } })
    };
}
