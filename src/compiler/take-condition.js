// An ally's persistent damage taken onto its user: Bloodstained Waistcoat's "The waistcoat ends a persistent bleed condition for one ally
// within 30 feet, but you gain that condition with the same parameters" → plan.take = { slug: "persistent-damage", damageType: "bleed" },
// at the ally the presser targets. Live play moves PF2e's condition, its formula and DC as they were (scripts/take.js). Pure.

const TAKE = /\bends an? persistent (\w+) condition for one ally within (\d+) feet, but you gain that condition with the same parameters\b/i;

// The activation's html, its base → the plan, or null.
export function takePlan(html, base) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const match = TAKE.exec(text);
    if (!match) return null;
    return {
        ...base,
        builtin: "take-condition",
        automation: { level: "automatic" },
        targeting: { target: "1 ally", range: `${match[2]} feet`, area: null },
        trigger: { event: "use" },
        take: { slug: "persistent-damage", damageType: match[1].toLowerCase(), range: Number(match[2]) }
    };
}
