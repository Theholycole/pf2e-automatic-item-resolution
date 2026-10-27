// The sworn creature's critical hits (2026-10-27, docs/needs.md): Oathbow's "Your critical hits against the target gain the bow's critical
// specialization effect; if they would already do so, they instead increase the DC of the Athletics check to Escape when critically hit to DC
// 20." Beside its mark (src/compiler/marked.js) an Effect on its user for the oath's 7 days with PF2e's CriticalSpecialization for the bow's
// Strikes against the marked creature, and PF2e's Note on those critical hits for the DC 20 when its user already has the bow's critical
// specialization (PF2e's own text says DC 10). The bow by its slug, item:slug:<slug>. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const OATH = /^Your critical hits against the target gain the bow's critical specialization effect; if they would already do so, they instead increase the DC of the Athletics check to Escape when critically hit to DC (\d+)\.$/;

// The plan and the item → the plan with that Effect, or the same plan.
export function withOathCritical(plan, item) {
    const line = (plan?.unread ?? []).find((entry) => OATH.test(said(entry)));
    const mark = plan?.item?.mark;
    const slug = item?.system?.slug;
    if (!line || !mark?.slug || !slug) return plan;
    const dc = OATH.exec(said(line))[1];
    const predicate = [`item:slug:${slug}`, `target:mark:${mark.slug}`];
    const effect = {
        name: "the oath's critical hits",
        words: `Critical hits with the bow against the sworn creature gain the bow's critical specialization effect (one that would already: the Athletics check to pull the missile free is DC ${dc})`,
        rules: [
            { key: "CriticalSpecialization", predicate },
            { key: "Note", selector: "strike-damage", outcome: ["criticalSuccess"], predicate, title: item.name, text: `If you already had the bow's critical specialization effect, the Athletics check to pull the missile free is DC ${dc} instead.` }
        ],
        duration: mark.duration
    };
    const unread = plan.unread.filter((entry) => entry !== line);
    const left = unread.length || (plan.notes ?? []).length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    const { unread: _, ...rest } = plan;
    return { ...rest, ...(unread.length ? { unread } : {}), item: { ...plan.item, ruleEffects: [...(plan.item.ruleEffects ?? []), effect] }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
