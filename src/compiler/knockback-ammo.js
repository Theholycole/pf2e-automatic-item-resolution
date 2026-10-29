// Ammunition that knocks its target back (2026-10-28, docs/needs.md "Moving creatures and the user"): the Agglomerative Cannonball's four
// grades — extra bludgeoning damage, a trait for the Strike, and a push away from the shooter on a critical hit (the Lesser and Moderate) or
// on any hit, farther on a critical hit (the Greater and Major). Its damage is PF2e's own FlatModifier on the round (src/compiler/pf2e-rules.js),
// said on the card (strike.ownRules); the trait PF2e's AdjustStrike on the readied Strike (strike.traits, src/live/strike-card.js); the push the
// hit's rows' forcedMovement, which the Strike card puts on the creature hit (scripts/strikes.js, the ability module's move). The round's
// flavour and "this is forced movement" no rule. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { ownStrikeRules } from "./pf2e-rules.js";
import { sentencesOf } from "./lasting.js";

// (Their sentences split by \s+: the module's words stay theirs.)
const DAMAGE = /^An activated [\w' -]+? deals (\d+) additional (\w+) damage to its\s+target, and the\s+Strike gains the (\w+) trait\.$/i;
const CRITICAL = /^On a critical hit, the target is\s+also knocked back (\d+) feet\.$/i;
const HIT = /^On (?:a )?hit, the target is\s+also knocked back (\d+) feet, or (\d+) feet\s+on a critical hit\.$/i;
const FORCED = /^This is forced movement\.$/i;
// (After the activation's own words, "Activate 1 Interact".)
const FLAVOUR = /^(?:Activate\b[^.]*?\s)?The contents of this vial\b[^.]*\bwhen fired\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const pushed = (feet) => ({ ...none(), forcedMovement: { kind: "push", distance: Number(feet), upTo: false, optional: false, direction: "away" } });

// The pf2e-rules plan of a round, the round and its activation's plain text → its Strike plan, or the same plan.
export function withKnockbackAmmo(plan, item, text) {
    if (plan?.builtin !== "pf2e-rules" || item?.type !== "ammo") return plan;
    const sentences = sentencesOf(text);
    const damage = sentences.map((sentence) => DAMAGE.exec(sentence)).find(Boolean);
    const critical = sentences.map((sentence) => CRITICAL.exec(sentence)).find(Boolean);
    const hit = sentences.map((sentence) => HIT.exec(sentence)).find(Boolean);
    if (!damage || (!critical && !hit)) return plan;
    // (Every sentence one of these: none dropped.)
    if (sentences.some((sentence) => ![DAMAGE, CRITICAL, HIT, FORCED, FLAVOUR].some((pattern) => pattern.test(sentence)))) return plan;
    // (Its damage the round's own rule: the same number and type, or not this reading.)
    const [rule, ...more] = ownStrikeRules(item);
    if (more.length || rule?.key !== "FlatModifier" || Number(rule.value) !== Number(damage[1]) || String(rule.damageType ?? "").toLowerCase() !== damage[2].toLowerCase()) return plan;
    return {
        ...plan,
        builtin: undefined,
        rules: undefined,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: pushed(hit ? hit[2] : critical[1]), success: hit ? pushed(hit[1]) : none(), failure: none(), criticalFailure: none() }
        },
        strike: { range: "ranged", save: null, ammo: true, uses: 1, until: "turn-end", missKeeps: false, hit: false, ownRules: [`${damage[1]} ${damage[2].toLowerCase()} damage`], traits: [damage[3].toLowerCase()], notes: [] },
        notes: undefined,
        partial: undefined
    };
}
