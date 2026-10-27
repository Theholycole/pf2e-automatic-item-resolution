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

// (Each instance with its own type kept: "{(1d8 + 4)[piercing],1d6[fire]}" → [{ formula: "1d8 + 4", type: "piercing" }, { formula: "1d6", type: "fire" }] —
// for a Strike redirected with its own damage, Turnabout Shield's, 2026-10-27.)
export function formulaInstances(formula) {
    return instancesOf(formula).map((instance) => {
        const flavor = /\[([^\]]*)\]\s*\)?\s*$/.exec(instance)?.[1]?.split(",").map((word) => word.trim()) ?? [];
        return { formula: termsOf(instance), type: flavor.find((word) => !["persistent", "precision", "splash"].includes(word)) ?? null, category: flavor.includes("persistent") ? "persistent" : null };
    }).filter((entry) => entry.formula);
}

// The latest Strike that missed its user, Turnabout Shield's trigger: the chat's recent rolls, newest last — [{ type, outcome, ranged, targetActorUuid,
// actorUuid, itemId }] → that entry, or null. (A ranged attack roll at it that failed or critically failed.)
export function triggeringMiss(rolls, userUuid) {
    return [...(rolls ?? [])].reverse().find((roll) => roll?.type === "attack-roll" && ["failure", "criticalFailure"].includes(roll.outcome) && roll.ranged && roll.targetActorUuid === userUuid && roll.actorUuid && roll.actorUuid !== userUuid) ?? null;
}

// The plan and the Strike's formula → the plan with that damage on its rows (shared, at each row's multiplier, beside the row's own formulas).
export function withStrikeFormula(plan, formula) {
    // (Its types kept, plan.strikeDamage.as null: a component for each instance.)
    if (plan?.strikeDamage && !plan.strikeDamage.as) {
        const parts = formulaInstances(formula);
        if (!parts.length) return plan;
        const components = parts.map((part, index) => ({ id: `strike${index}`, formula: part.formula, type: part.type ?? "untyped", category: part.category }));
        const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => {
            const multiplier = plan.strikeDamage.rows[degree];
            return [degree, multiplier && row ? { ...row, damage: { mode: "shared", multiplier, sourceComponentIds: components.map((component) => component.id) } } : row];
        }));
        return { ...plan, resolution: { ...plan.resolution, sharedDamage: { rollOnce: true, components }, outcomes } };
    }
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
