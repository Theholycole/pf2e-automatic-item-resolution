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

// Each instance with its own type kept, PF2e's "{(1d8 + 4)[piercing],1d6[persistent,fire]}" → [{ formula: "1d8 + 4", type: "piercing", category: null },
// { formula: "1d6", type: "fire", category: "persistent" }]: a Strike's damage kept as it is — Turnabout Shield's redirected Strike, Dinosaur
// Boots' Trample (2026-10-27). A typeless instance's type the fallback (null: kept typeless).
const NOT_TYPES = new Set(["persistent", "precision", "splash"]);
export function formulaInstances(formula, fallback = null) {
    return instancesOf(formula).map((instance) => {
        const flavor = /\[([^\]]*)\]\s*\)?\s*$/.exec(instance)?.[1] ?? "";
        const words = flavor.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
        return { formula: termsOf(instance), type: words.filter((word) => !NOT_TYPES.has(word)).at(-1) ?? fallback, category: words.includes("persistent") ? "persistent" : null };
    }).filter((part) => part.formula);
}

// The latest Strike that missed its user, Turnabout Shield's trigger: the chat's recent rolls, newest last — [{ type, outcome, ranged, targetActorUuid,
// actorUuid, itemId }] → that entry, or null. (A ranged attack roll at it that failed or critically failed.)
export function triggeringMiss(rolls, userUuid) {
    return [...(rolls ?? [])].reverse().find((roll) => roll?.type === "attack-roll" && ["failure", "criticalFailure"].includes(roll.outcome) && roll.ranged && roll.targetActorUuid === userUuid && roll.actorUuid && roll.actorUuid !== userUuid) ?? null;
}

// The plan and the Strike's formula → the plan with that damage on its rows (shared, at each row's multiplier, beside the row's own formulas).
// (Its types kept when it gives none to turn it all into, strikeDamage.as null: each instance a component of its own.)
export function withStrikeFormula(plan, formula) {
    // (Its types kept, plan.strikeDamage.as null: a component for each instance — a typeless one's its fallback, else untyped.)
    if (plan?.strikeDamage && !plan.strikeDamage.as) {
        const parts = formulaInstances(formula, plan.strikeDamage.fallback ?? "untyped");
        if (!parts.length) return plan;
        const components = parts.map((part, index) => ({ id: `strike${index}`, formula: part.formula, type: part.type, category: part.category }));
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
