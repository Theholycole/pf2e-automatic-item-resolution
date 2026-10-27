// Bane Oil against elementals, of the target's greatest weakness (2026-10-27, docs/needs.md "Immunities and resistances by situation"):
// Fundamental Oil's "A weapon anointed with this oil acts as Bane Oil to elementals, but the damage type is the same as the target's greatest
// weakness if the target has weakness to acid, cold, electricity, fire, or sonic damage. If it has none of these, the additional damage is the
// same type as the weapon's damage type. These effects last 1 minute." plan.item.rune as Bane Oil's (src/compiler/rune-loans.js), its type
// the elemental one, with damageTypes: the item card's Effect on the weapon picked has a toggle always on whose suboption is the type, and a
// DamageDice of each (src/live/card.js runeEffectSource) — PF2e has no roll option for a creature's weaknesses, so its user (or the GM)
// sets it for the target. Pure.

const FUNDAMENTAL = /\bA weapon anointed with this oil acts as Bane Oil to (elementals), but the damage type is the same as the target's greatest weakness if the target has weakness to ((?:[a-z]+, )+)or ([a-z]+) damage\. If it has none of these, the additional damage is the same type as the weapon's damage type\. These effects last (\d+) (minutes?|rounds?)\./i;
const flat = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// A consumable's plan, the item and its base → the plan of its rune, or the same plan.
export function withFundamentalOil(plan, item, base) {
    const read = FUNDAMENTAL.exec(flat(item?.system?.description?.value));
    if (plan || !read) return plan;
    const [, , list, last, value, unit] = read;
    const made = base();
    return {
        ...made,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        item: { ...made.item, recipient: "user", rune: { key: "bane", name: "Bane", traits: ["elemental"], damageTypes: [...list.split(/,\s*/).filter(Boolean), last].map((type) => type.toLowerCase()), duration: { mode: "fixed", value: Number(value), unit: /^round/i.test(unit) ? "rounds" : "minutes", expiry: "turn-start", anchor: "effect-start" } } }
    };
}
