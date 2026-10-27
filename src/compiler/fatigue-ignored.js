// A condition's penalties ignored until it's given again (2026-10-27, docs/needs.md): Ring of the Weary Traveler's "For 10 minutes, you can
// ignore the penalties from the fatigued condition. … If something would cause you to become fatigued again while the ring's power is in effect,
// the suppression ends, and you immediately take the penalties again." Its suppression is plan.item.suppress already (PF2e's AdjustModifier on
// the condition's own modifiers, src/live/card.js suppressEffectSource); this is its end: entry.endsOnAgain — a RollOption
// "air-ends-on:<condition>" on that Effect, which scripts/ends-on-hostile.js ends it by when PF2e gives the creature that condition again. The
// sentence read, its reminder of the whole text gone when nothing else is left. Pure.

const AGAIN = /^If something would cause you to become (fatigued|sickened|frightened|stupefied|enfeebled|clumsy|drained) again while [\w' -]+? is in effect, the suppression ends, and you immediately take the penalties again\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → the plan with its suppression's end, or the same plan.
export function withFatigueIgnored(plan) {
    const line = (plan?.unread ?? []).map((entry) => [entry, AGAIN.exec(said(entry))]).find(([, match]) => match);
    const slug = line?.[1][1].toLowerCase();
    const suppress = plan?.item?.suppress ?? [];
    if (!line || !suppress.some((entry) => entry.slug === slug)) return plan;
    const unread = plan.unread.filter((entry) => entry !== line[0]);
    const outcomes = unread.length ? plan.resolution?.outcomes : Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((note) => !note.reminder) } : row]));
    const left = unread.length || (plan.notes ?? []).length || Object.values(outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    const { unread: _, ...rest } = plan;
    return {
        ...rest,
        ...(unread.length ? { unread } : {}),
        ...(outcomes ? { resolution: { ...plan.resolution, outcomes } } : {}),
        noteOnly: undefined,
        item: { ...plan.item, suppress: suppress.map((entry) => (entry.slug === slug ? { ...entry, endsOnAgain: true } : entry)) },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
