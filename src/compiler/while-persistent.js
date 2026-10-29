// A condition from a Strike for as long as its persistent damage lasts (2026-10-28, docs/needs.md "afflictions"): Alchemists+'s Fume
// Ammunition, whose gas leaves the creature it hits Dazzled while it keeps taking the shot's persistent acid. src/compiler/item-data.js words
// it as a hit's condition, the Strike's extra persistent dice and a line saying it stays; here that condition on the hit's rows is a note
// Effect on the creature hit with PF2e's GrantItem of the condition, for as long as that persistent damage lasts (the ability module's
// whilePersistent — scripts/foundry.js applyRiders waits for the damage roll's condition before it's given, as for Garrote Shot's). The
// gas it can't see through, its words. Pure.

import { conditionUuid } from "./row-readings.js";

// (As src/compiler/item-data.js writes it: "It stays <condition> while it takes the persistent damage", then the item's own words of why.)
const STAYS = /^It stays ([A-Z][\w-]+) while it takes the persistent damage(?:,\s*([^.]+))?\.$/;

// The Strike plan → the plan with that note Effect, or the same plan.
export function withWhilePersistent(plan) {
    const strike = plan?.strike;
    if (!strike || plan.resolution?.check?.roll !== "attack") return plan;
    const line = (strike.notes ?? []).map((note) => [note, STAYS.exec(String(note).trim())]).find(([, match]) => match);
    if (!line) return plan;
    const slug = line[1][1].toLowerCase();
    const uuid = conditionUuid(slug);
    const persistent = (strike.damage ?? []).filter((entry) => entry.category === "persistent" && entry.damageType);
    if (!uuid || persistent.length !== 1) return plan;
    const type = persistent[0].damageType;
    const outcomes = plan.resolution.outcomes ?? {};
    const hits = ["success", "criticalSuccess"];
    if (!hits.every((degree) => (outcomes[degree]?.effects ?? []).some((effect) => effect.kind === "condition" && effect.slug === slug))) return plan;
    const note = { label: `${line[1][1]} while it takes persistent ${type}`, text: `${line[1][1]} until its persistent ${type} damage ends${line[1][2] ? ` (${line[1][2].trim()})` : ""}.`, duration: null, whilePersistent: type, rules: [{ key: "GrantItem", uuid, allowDuplicate: false }] };
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, hits.includes(degree) ? { ...row, effects: row.effects.filter((effect) => !(effect.kind === "condition" && effect.slug === slug)), noteEffects: [...(row.noteEffects ?? []), note] } : row]));
    const notes = strike.notes.filter((note) => note !== line[0]);
    const left = notes.length || (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(rows).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        resolution: { ...plan.resolution, outcomes: rows },
        strike: { ...strike, notes },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
