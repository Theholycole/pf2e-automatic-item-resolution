// Damage the text treats as a precious material: Moonlit Spellgun's "The spellgun's damage is treated as silver for the
// purposes of weaknesses, resistances, and the like", Silver Crescent's, Fiendsbane Shield's. The material joins each damage
// formula's flavor ("3d8[fire]" → "3d8[fire,silver]"), which PF2e's damage roll reads as the material (its
// materialDamageEffects), so a weakness to silver applies. Pure.

const TREATED = /\b(?:damage|This|It|All damage[^.]*?) (?:is|are) treated as (silver|cold iron|adamantine)\b(?: for the purposes of weaknesses)?/i;
const MATERIAL = { silver: "silver", "cold iron": "cold-iron", adamantine: "adamantine" };

const withFlavor = (formula, material) => String(formula ?? "").replace(/\[([a-z,-]+)\]/gi, (whole, flavor) => (flavor.split(",").includes(material) || /^healing$/i.test(flavor) ? whole : `[${flavor},${material}]`));

// The plan with that material in its damage (its shared damage and its damage choices); the same plan when the text says none.
export function damageMaterial(plan, text) {
    const match = TREATED.exec(String(text ?? ""));
    const material = match ? MATERIAL[match[1].toLowerCase()] : null;
    const components = plan?.resolution?.sharedDamage?.components;
    if (!material || (!components?.length && !plan?.damageChoices?.length)) return plan;
    return {
        ...plan,
        ...(components?.length ? { resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: components.map((component) => ({ ...component, formula: withFlavor(component.formula, material) })) } } } : {}),
        ...(plan.damageChoices?.length ? { damageChoices: plan.damageChoices.map((choice) => ({ ...choice, formula: withFlavor(choice.formula, material) })) } : {})
    };
}

// A rider only for a creature the material gets past (2026-10-20): Moonlit Spellgun's "Critical Success … If it has a weakness to silver or a
// resistance that can be bypassed by silver, it's also Enfeebled 1 for 1 minute" — plan.ifTarget [{ material, degree, effects }]: the attack
// card gives those creatures the plan with the rider (scripts/poisons.js, src/live/if-target.js), the rest the plain one. Its note no longer.
const IF_MATERIAL = /^(Critical success|Success): If it has a weakness to (silver|cold iron|adamantine) or a resistance that can be bypassed by \2, it's also ([A-Z]?[a-z]+) (\d+) for (\d+|one|a|an) (round|minute)s?\.$/i;
const UNITS = { round: "rounds", minute: "minutes" };
export function withMaterialRider(plan) {
    const notes = plan?.notes ?? [];
    const found = notes.map((note) => [note, IF_MATERIAL.exec(String(note).trim())]).filter(([, match]) => match);
    if (!found.length || plan.resolution?.check?.against?.statistic !== "ac") return plan;
    const ifTarget = found.map(([, match]) => ({
        material: MATERIAL[match[2].toLowerCase()],
        degree: /^critical/i.test(match[1]) ? "criticalSuccess" : "success",
        effects: [{ kind: "condition", slug: match[3].toLowerCase(), value: Number(match[4]), duration: { mode: "fixed", value: /^\d+$/.test(match[5]) ? Number(match[5]) : 1, unit: UNITS[match[6].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } }]
    }));
    const left = notes.filter((note) => !found.some(([said]) => said === note));
    const { partial, ...rest } = plan;
    const done = left.length === 0 && !(plan.unread ?? []).length;
    return { ...(done ? rest : plan), ifTarget, notes: left.length ? left : undefined, ...(done ? { automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
