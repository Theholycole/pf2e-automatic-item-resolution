// A Strike's damage formula as PF2e gives it ("{(4d4 + 4)[slashing],1d6[sonic]}", or its readable "3d4 slashing + 1d6 sonic"), all of one type: its instances' terms summed under that type,
// "(4d4 + 4 + 1d6)[sonic]" (src/compiler/strike-as.js). And the plan with it as its rows' shared damage. Pure.

// Split at the top level's commas only.
function instancesOf(formula) {
    const text = String(formula ?? "").trim().replace(/^\{([\s\S]*)\}$/, "$1");
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let at = 0; at < text.length; at++) {
        const character = text[at];
        if ("([{".includes(character)) depth++;
        else if (")]}".includes(character)) depth--;
        else if (character === "," && depth === 0) {
            parts.push(text.slice(start, at));
            start = at + 1;
        }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
}

// One instance's terms without its flavor: "(4d4 + 4)[slashing]" → "4d4 + 4"; "1d6[sonic]" → "1d6". And PF2e's readable form, "3d4 slashing +
// 1d6 sonic" (its DamageRoll's formula): the type words gone too.
const termsOf = (instance) => instance.replace(/\[[^\]]*\]/g, "").replace(/\b(?![\d])[a-z][a-z-]*\b/gi, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/^\((.*)\)$/s, "$1").replace(/(?:\s*\+\s*)+$/, "").trim();

export function formulaAs(formula, type) {
    const terms = instancesOf(formula).map(termsOf).filter(Boolean);
    return terms.length ? `(${terms.join(" + ")})[${type}]` : null;
}

// The plan and the Strike's formula → the plan with that damage on its rows (shared, at each row's multiplier, beside the row's own formulas).
export function withStrikeFormula(plan, formula) {
    const as = plan?.strikeDamage ? formulaAs(formula, plan.strikeDamage.as) : null;
    if (!as) return plan;
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => {
        const multiplier = plan.strikeDamage.rows[degree];
        if (!multiplier || !row) return [degree, row];
        const shared = { mode: "shared", multiplier, sourceComponentIds: ["strike"] };
        const own = row.damage?.mode === "formulas" ? row.damage : null;
        return [degree, { ...row, damage: own ? { mode: "mixed", shared, formulas: own.formulas, rollScope: own.rollScope ?? "outcome" } : shared }];
    }));
    return { ...plan, resolution: { ...plan.resolution, sharedDamage: { rollOnce: true, components: [{ id: "strike", formula: as, type: null, category: null }] }, outcomes } };
}
