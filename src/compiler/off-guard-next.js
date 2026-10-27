// A creature its user picks off-guard to its user's next attack this turn (2026-10-27): Boots of the Dead's "You shuffle your boots, …,
// causing one undead creature of your choice to think that you too are undead. The target is Off-Guard against the next melee attack you
// attempt against it before the end of your current turn." Here, the core's check family with no roll: the creature the presser targets Off-Guard
// until the end of its user's turn, only to its user's attacks (melee ones when it says so) and only once — the core's scope, as Mercurial
// Mantle's Cunning Dodge has it (src/compiler/perception-check.js). The kind of creature it names is the presser's to pick. Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const CHOSEN = /^You [^.]+?, causing one ((?:[a-z]+ )?)creature of your choice to [^.]+\.$/i;
const OFF_GUARD = /^The target is Off-Guard against the next (melee )?attack you attempt against it before the end of your current turn\.$/i;

// From the activation's html and the plan's base: the plan, or null.
export function offGuardNextPlan(html, base) {
    const sentences = plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const chosen = sentences.length === 2 ? CHOSEN.exec(sentences[0]) : null;
    const offGuard = chosen ? OFF_GUARD.exec(sentences[1]) : null;
    if (!offGuard) return null;
    const effect = { kind: "condition", slug: "off-guard", value: null, duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, scope: { against: "actor", attacks: offGuard[1] ? "melee" : "any", uses: 1 } };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: `1 ${chosen[1]}creature`, range: null, area: null },
        trigger: { event: "use", ...(base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), effects: [effect] }, failure: none(), criticalFailure: none() } }
    };
}
