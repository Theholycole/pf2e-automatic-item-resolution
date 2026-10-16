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
