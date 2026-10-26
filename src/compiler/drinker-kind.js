// A drinker its potion fails for (2026-10-26): Elysian Dew's "If you're unholy and drink this potion, it fails to work, and you must succeed at a
// DC 30 Fortitude save or the potion renders you Drained 2". plan.item.unlessKind { traits, save }: the item card at a drinker with one of those
// traits applies none of its own results and posts that save card at it instead (scripts/live.js); the sentence no longer a note. Pure.

const FAILS = /^If you're (unholy|holy|undead|living) and drink this potion, it fails to work, and you must succeed at a DC (\d+) (Fortitude|Reflex|Will) save or the potion renders you ([A-Z][a-z-]+) (\d+)\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

export function withDrinkerKind(plan) {
    if (!plan?.resolution || plan.builtin || !Array.isArray(plan.notes)) return plan;
    const found = plan.notes.map((note) => [note, FAILS.exec(said(note))]).find(([, match]) => match);
    if (!found) return plan;
    const [note, [, kind, dc, statistic, condition, value]] = found;
    const failed = () => ({ ...none(), effects: [{ kind: "condition", slug: condition.toLowerCase(), value: Number(value), duration: null }] });
    const save = {
        modelVersion: plan.modelVersion,
        source: plan.source,
        rank: plan.rank,
        traits: plan.traits,
        activation: plan.activation,
        automation: { level: "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: statistic.toLowerCase(), basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: failed(), criticalFailure: failed() } }
    };
    const notes = plan.notes.filter((entry) => entry !== note);
    return { ...plan, notes: notes.length ? notes : undefined, item: { ...(plan.item ?? {}), unlessKind: { traits: [kind.toLowerCase()], save } } };
}
