// More damage when the roll was a critical hit before a better degree (2026-10-28, docs/needs.md "reader"): Tian Xia+'s Pham Lê Ngọc's
// Ceremonial Sword (and its Greater, Major and True grades), whose Focused Attack is a Strike one degree better, and when the roll was a
// critical hit already, some precision dice more. The readied Strike's degree is PF2e's AdjustDegreeOfSuccess already
// (src/compiler/strike-damage.js); its dice are the Strike's own extra dice (strike.damage), PF2e's critical-only dice, predicated on the
// roll option ROLLED_CRITICAL — which scripts/strikes.js puts on the readied Effect after an attack roll whose unadjusted outcome (PF2e's
// context.unadjustedOutcome) was a critical success (strike.rolledCritical), before its damage roll. Its requirement, a creature its user
// hasn't attacked today, a line of the Strike card about its target. Pure.

export const ROLLED_CRITICAL = "air-rolled-critical";

const ALREADY = /^If the outcome was already\s+a critical success, your target\s+takes an additional (\d+)d(\d+) precision damage\.$/;
const UNATTACKED = /<strong>\s*Requirements\s*<\/strong>\s*You haven't attacked\s+your target today\b/i;

// The Strike plan and its activation's html → the plan with those dice, or the same plan.
export function withRolledCritical(plan, html) {
    const strike = plan?.strike;
    if (!strike?.degree || plan.resolution?.check?.roll !== "attack") return plan;
    const line = (strike.notes ?? []).map((note) => [note, ALREADY.exec(String(note).trim())]).find(([, match]) => match);
    if (!line) return plan;
    const [, count, faces] = line[1];
    const notes = strike.notes.filter((note) => note !== line[0]);
    const requires = UNATTACKED.test(String(html ?? "")) ? ["One its user hasn't attacked yet today (its user's to keep)."] : [];
    const left = notes.length || (plan.notes ?? []).length || (plan.unread ?? []).length;
    return {
        ...plan,
        strike: { ...strike, damage: [...(strike.damage ?? []), { diceNumber: Number(count), dieSize: `d${faces}`, category: "precision", critical: true, predicate: [ROLLED_CRITICAL] }], rolledCritical: true, ...(requires.length ? { requires: [...(strike.requires ?? []), ...requires] } : {}), notes },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
