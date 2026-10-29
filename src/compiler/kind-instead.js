// Another damage type for the creatures of one trait, the GM's to switch back (2026-10-28, docs/needs.md "reader"): Alchemists+'s Phoenix
// Flagon, whose phoenix's flight is a Reflex save or fire damage, and whose unholy creatures take as much spirit damage in place of the fire
// when that harms them more, the GM's call. The save's fire is its shared damage (one roll, the failures' rows); its unholy creatures' card
// the spirit (plan.ifTarget [{ traits, formula }], src/live/if-target.js: the save card goes out once for each group); the GM's call a line
// of the card, as the user's ruling has a choice the text leaves to the GM. The path a Gargantuan phoenix flies is its card's line too. Pure.

const INSTEAD = /^The [\w' -]+? burns those that are (\w+);\s+an? (\w+) creature takes\s+(\d+d\d+) (\w+) damage\s+instead of (\w+) damage\s+if that would be\s+more detrimental to the creature\s+\(as determined by the GM\)(?: \(by hand\))?\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const shared = (multiplier) => ({ mode: multiplier ? "shared" : "none", multiplier, sourceComponentIds: multiplier ? ["0"] : [] });

// The plan (a save's, not basic) and its item's plain text → the plan with the trait's own damage, or the same plan.
export function withKindInstead(plan, text) {
    const resolution = plan?.resolution;
    if (resolution?.kind !== "save" || resolution.check?.basic || plan.builtin || (plan.ifTarget ?? []).length) return plan;
    const note = (plan.notes ?? []).find((entry) => INSTEAD.test(said(entry)));
    const found = note ? INSTEAD.exec(said(note)) : null;
    if (!found || found[1].toLowerCase() !== found[2].toLowerCase()) return plan;
    const [trait, dice, type, usual] = [found[2].toLowerCase(), found[3], found[4].toLowerCase(), found[5].toLowerCase()];
    const formula = `${dice}[${usual}]`;
    const outcomes = resolution.outcomes ?? {};
    // (Its failures' damage the usual type's dice, nothing on a success: as the ability compiler read "a save or take".)
    const fails = ["failure", "criticalFailure"];
    if (!fails.every((degree) => (outcomes[degree]?.damage?.formulas ?? []).map((entry) => entry.formula).join() === formula)) return plan;
    if (["criticalSuccess", "success"].some((degree) => (outcomes[degree]?.damage?.mode ?? "none") !== "none")) return plan;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, { ...row, damage: shared(fails.includes(degree) ? 1 : 0) }]));
    const gargantuan = /\bWhen Activated, a Gargantuan (\w+) emerges\.\s+It flies up to (\d+) feet;/.exec(String(text ?? ""));
    const notes = [
        ...(plan.notes ?? []).filter((entry) => entry !== note),
        `An ${trait} creature takes ${dice} ${type} damage in place of the ${usual} (its own card); the GM may give it the ${usual} instead, when that would harm it more.`,
        ...(gargantuan ? [`The ${gargantuan[1]} is Gargantuan: its ${gargantuan[2]}-foot flight's path is as wide as it is, so target every creature it passes over.`] : [])
    ];
    const left = (plan.unread ?? []).length || Object.values(rows).some((row) => (row?.manualInstructions ?? []).length);
    const { partial, ...rest } = plan;
    return {
        ...rest,
        notes,
        resolution: { ...resolution, sharedDamage: { rollOnce: true, components: [{ id: "0", formula, type: null, category: null }] }, outcomes: rows },
        ifTarget: [{ traits: [trait], formula: `${dice}[${type}]` }],
        ...(left ? { partial } : { automation: { ...(plan.automation ?? {}), level: "automatic" } })
    };
}
