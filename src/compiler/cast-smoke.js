// Smoke where its caster was and where it arrives (2026-10-27, docs/needs.md): Charlatan's Cape's and Blink Blade's "You cast Translocate. The
// space you leave and the one you appear in are filled with puffs of smoke that make anyone within Concealed until they leave the smoke or the
// end of your next turn, at which point the smoke dissipates. Strong winds immediately disperse the smoke." → plan.castSmoke { lasts, notes }:
// once its user's token has moved after the cast (scripts/cast-smoke.js), the ability module's zone at each of those spaces — Concealed inside,
// until the end of its user's next turn; the wind its line. Pure.

const SMOKE = /^The space you leave and the one you appear in are filled with puffs of smoke that make anyone within Concealed until they leave the smoke or (?:until )?the end of your next turn, at which point the smoke dissipates\.$/i;
const WIND = /^(?:Strong winds immediately disperse the smoke|When used in strong winds, the smoke disperses immediately)\.$/i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();

// The cast's plan → the plan with castSmoke, or the same plan.
export function withCastSmoke(plan) {
    if (plan?.builtin !== "cast-spell") return plan;
    const notes = plan.notes ?? [];
    const smoke = notes.find((note) => SMOKE.test(said(note)));
    if (!smoke) return plan;
    const wind = notes.find((note) => WIND.test(said(note)));
    const left = notes.filter((note) => note !== smoke && note !== wind);
    const { notes: _, ...rest } = plan;
    return {
        ...rest,
        ...(left.length ? { notes: left } : {}),
        castSmoke: { lasts: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" }, notes: wind ? ["A strong wind disperses it at once."] : [] },
        ...(plan.partial && !left.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
