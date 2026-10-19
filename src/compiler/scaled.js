// Damage only the table knows the amount of: a Strike's damage dealt again (Twisting Gale, Kaldemash's Lament), the distance
// traveled (Juggernaut Plate), one die per charge stored (Conflagration Club). src/compiler/item-data.js rewords each to a save's
// damage of 1 (or one die) and marks it "Its damage is … (typed on the card)"; this reads that mark as plan.scaled = { of, die? }:
// the save card's Amount field, the damage that many (or that many dice) when it's posted. "Its type is … (picked on the card)"
// adds the energy types as the card's damage picker. Pure.

const MARK = /\s*\bIts damage is (?:1(d\d+) per )?(.+?) \(typed on the card\)\.\s*/i;
const TYPE_MARK = /\s*\bIts type is (.+?) \(picked on the card\)\.\s*/i;
const ENERGY = ["acid", "cold", "electricity", "fire", "sonic"];

// The text (plain) → { of, die } or null.
export function readScaled(text) {
    const mark = MARK.exec(String(text ?? ""));
    return mark ? { of: mark[2].trim(), ...(mark[1] ? { die: mark[1] } : {}) } : null;
}

// The plan with its scaled damage, when it has one damage component; else the same plan.
export function withScaled(plan, text) {
    const scaled = readScaled(text);
    const components = plan?.resolution?.sharedDamage?.components ?? [];
    if (!scaled || components.length !== 1) return plan;
    const typed = TYPE_MARK.exec(String(text ?? ""));
    const formula = String(components[0].formula ?? "");
    const choices = typed ? ENERGY.map((type) => ({ label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`, formula: formula.replace(/\[untyped\]/, `[${type}]`) })) : null;
    const notes = (plan.notes ?? []).filter((note) => !MARK.test(note) && !TYPE_MARK.test(note));
    // (Nor the mark as a row's words for the GM: "{target}: Its damage is … (typed on the card).")
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => {
        const words = (row?.manualInstructions ?? []).filter((line) => !MARK.test(line) && !TYPE_MARK.test(line));
        return [degree, row?.manualInstructions ? { ...row, manualInstructions: words.length ? words : undefined } : row];
    }));
    return { ...plan, resolution: { ...plan.resolution, outcomes }, scaled, ...(choices ? { damageChoices: choices } : {}), ...(notes.length ? { notes } : { notes: undefined }) };
}

// The damage formula for the amount typed: "1[sonic]" with 23 → "23[sonic]"; "1d6[fire]" with 4 → "4d6[fire]".
export function scaledFormula(formula, scaled, amount) {
    const count = Math.max(0, Math.floor(Number(amount) || 0));
    return scaled?.die ? String(formula).replace(/^\d+(d\d+)/, `${count}$1`) : String(formula).replace(/^\d+(?=\[)/, String(count));
}

// The plan whose damage is the amount typed.
export function scaledPlan(plan, amount) {
    if (!plan?.scaled) return plan;
    const components = plan.resolution.sharedDamage.components.map((component, index) => (index === 0 ? { ...component, formula: scaledFormula(component.formula, plan.scaled, amount) } : component));
    return { ...plan, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components } } };
}
