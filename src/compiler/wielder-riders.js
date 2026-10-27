// A weapon's critical-hit rider only for some wielders (2026-10-27, docs/needs.md): Blessed Reformer's section "Redeemer Wielder If you're a
// champion with the redemption cause, you also gain the following two benefits." and its first, "When you critically hit an unholy creature
// with the blessed reformer, until the end of your next turn, the creature takes a –10-foot penalty to its Speeds and can't Step." The
// weapon's own riders (src/compiler/rune-strikes.js runeCritRiders reads only its text before its first activation; this section comes
// after one): a rider for the creature of that trait, only.wielder { class, feature } — live, scripts/rune-strikes.js plays it only for a
// wielder of that class with that feature (PF2e's class feature slug, the cause) — its plan the target's PF2e Speed penalty and a note Effect
// that it can't Step, until the end of its wielder's next turn. The section's other benefit, "You can Activate the weapon in the following
// way.", is the next activation's. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const SECTION = /<p>\s*<strong>\s*([A-Z][\w-]+) Wielder\s*<\/strong>\s*If you're an? (\w+) with the (\w+) cause, you also gain the following \w+ benefits\.\s*<\/p>\s*<ul>([\s\S]*?)<\/ul>/i;
const SLOWED = /^When you critically hit an? (\w+) creature with the [\w' -]+?, until the end of your next turn, the creature takes an? [–-](\d+)-foot penalty to its Speeds and can't Step\.$/i;
const END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The weapon's source → its wielder-only critical-hit riders: [{ plan, optional, only: { trait, wielder }, text }].
export function wielderCritRiders(weapon) {
    const section = SECTION.exec(String(weapon?.system?.description?.value ?? ""));
    if (!section) return [];
    const wielder = { class: section[2].toLowerCase(), feature: section[3].toLowerCase() };
    const riders = [];
    for (const [, item] of section[4].matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
        const sentence = plain(item);
        const slowed = SLOWED.exec(sentence);
        if (!slowed) continue;
        const plan = {
            modelVersion: MODEL_VERSION,
            source: { name: weapon.name, slug: weapon.system?.slug ?? null, uuid: weapon.uuid ?? null, type: weapon.type },
            automation: { level: "automatic" },
            targeting: { target: "1 creature", range: null, area: null },
            trigger: { event: "use" },
            resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), modifiers: [{ selector: "all-speeds", value: -Number(slowed[2]), type: "untyped", duration: END }], noteEffects: [{ label: "Can't Step", text: "It can't Step.", duration: END }] }, failure: none(), criticalFailure: none() } }
        };
        riders.push({ plan, optional: false, only: { trait: slowed[1].toLowerCase(), wielder }, text: sentence });
    }
    return riders;
}

// Whether a rider is for its wielder: { class: PF2e's class slug, features: [its class features' slugs] }.
export function wielderFits(rider, wielder = {}) {
    const want = rider?.only?.wielder;
    if (!want) return true;
    return wielder.class === want.class && (wielder.features ?? []).includes(want.feature);
}

// The sentences of a section like that, for the activation before it whose text took them in: they're the weapon's, not its.
export const isWielderSection = (sentence) => /^[A-Z][\w-]+ Wielder If you're an? \w+ with the \w+ cause, you also gain the following \w+ benefits\.$/.test(sentence) || SLOWED.test(sentence) || /^You can Activate the weapon in the following way\.$/.test(sentence);
