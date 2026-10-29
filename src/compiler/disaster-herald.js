// Persistent damage from its user's own rage emanation, for the rage (2026-10-28, docs/needs.md "afflictions"): Barbarians+'s Instinct Crown
// (Disaster), whose second activation — once a day, its user's instinct the crown's — makes the creatures ending their turns in its user's
// Disaster instinct emanation take persistent damage of the emanation's own amount and type as well. That instinct (Barbarians+'s feat) is a
// ChoiceSet on its user (flags.pf2e.disasterInstinct: the damage type, and its amount by level, 1 to 4) and a PF2e Aura of 5 or 10 feet. Now
// an Effect on its user for its rage (item.ruleEffects, untilRage: only while raging, gone when its Rage ends — scripts/live.js) with a turn
// aura (turnAuras, scripts/turn-auras.js): as each creature's turn within the emanation's radius ends, an automatic card of that
// persistent damage — its amount, type and radius filled from its user's instinct as the card is applied (src/live/disaster.js); none
// for a user without the Disaster instinct. Its suppressed emanation a card line. Pure.

const HERALD = /^You bring disaster and ruin\s+as the herald of the end\.\s+Creatures that end their turn\s+within the area of your emanation\s+take persistent damage of the same\s+amount and type\s+as the emanation would deal\.$/;
const REQUIRES = /\bRequirements The crown's instinct matches\s+your barbarian instinct\b/;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const RAGE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };

// Nothing read before, the activation's html (plain) and its context → the card with the Effect, or the plan as it was.
export function disasterHeraldPlan(plan, { text, base, info, frequency }) {
    if (plan || !base) return plan;
    const effect = String(text ?? "").replace(/^.*?\bEffect\s+/s, "").trim();
    if (!HERALD.test(effect) || !REQUIRES.test(String(text ?? ""))) return plan;
    // (The aura's card: its damage and radius from its user's instinct, src/live/disaster.js.)
    const burn = {
        ...base,
        source: { ...(base.source ?? {}), name: `${base.source?.name ?? "Instinct Crown"}: the herald's ruin` },
        automation: { level: "automatic" },
        targeting: { target: "a creature that ends its turn in the emanation", range: null, area: null },
        trigger: { event: "zone" },
        resolution: { kind: "check", check: { roll: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: null, type: null, category: null }] }, outcomes: { success: { ...none(), damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] } } } }
    };
    const herald = {
        name: "Herald of the end",
        words: "Creatures ending their turns in its Disaster emanation take its damage again as persistent damage, for its rage",
        rules: [],
        duration: RAGE,
        untilRage: true,
        fromInstinct: "disaster",
        turnAuras: [{ radius: null, at: "end", plan: burn, label: "its emanation's persistent damage" }]
    };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(base.trigger ?? {}), event: "use", ...(frequency ? { frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: ["While its user suppresses its emanation (its choice as it Rages and at each turn's start), skip the persistent damage cards."],
        item: { ...(info ?? {}), recipient: "user", ruleEffects: [herald] }
    };
}
