// No range penalty out to an increment for a while (2026-10-27, docs/needs.md "Changes to a Strike"): Falconsight Eye's "For 1 minute, you can
// close your eyes as a free action to see through a ranged weapon you're wielding, which reduces the penalty for firing into your weapon's
// second range increment from –2 to 0. This effect doesn't negate the Blinded condition." Its note Effect for that minute carries PF2e's own
// roll option for it, "ignore-range-penalty:2" on ranged attack rolls (as PF2e's Legendary Shot and Triangulate have it); closing its eyes is
// its user's own free action, a line of the Effect. Pure.

const FREE = /\bFor (\d+|one|a) (minutes?|rounds?), you can close your eyes as a free action to see through a ranged weapon you're wielding, which reduces the penalty for firing into your weapon's (second|third|fourth) range increment from [–-]\d+ to 0\.(?: This effect doesn't negate the Blinded condition\.)?/i;
const INCREMENT = { second: 2, third: 3, fourth: 4 };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan and its activation's plain text → the plan whose note Effect drops that penalty, or the same plan.
export function withRangeFree(plan, text) {
    const found = FREE.exec(String(text ?? ""));
    const row = plan?.noteOnly ? plan.resolution?.outcomes?.success : null;
    const notes = row?.noteEffects ?? [];
    if (!found || notes.length !== 1 || (plan.unread ?? []).length || (plan.notes ?? []).length) return plan;
    const count = /^\d+$/.test(found[1]) ? Number(found[1]) : 1;
    const note = { label: plan.source?.name ?? "Range", text: said(found[0]).replace(/^For \w+ \w+, you can/i, "You can"), duration: { mode: "fixed", value: count, unit: /^min/i.test(found[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" }, rules: [{ key: "RollOption", domain: "ranged-attack-roll", option: `ignore-range-penalty:${INCREMENT[found[3].toLowerCase()]}` }] };
    const { noteOnly, ...rest } = plan;
    return { ...rest, automation: { ...(plan.automation ?? {}), level: "automatic" }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [note] } } } };
}
