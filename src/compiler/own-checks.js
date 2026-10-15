// A check an item makes with its own modifier, at one creature: a maneuver ("The tentacle attempts to Grapple with a +13
// bonus", Tentacle Cannon; "You shove the creature using the bands' Athletics modifier of +14", Bands of Force) — PF2e's
// basic action rows (the ability module's compiled actions) rolled at that modifier — or an attack of its own ("The armor
// makes a melee attack with an attack modifier of +14 that deals 2d6 piercing damage", Swallow-Spike) against the
// target's AC, its damage on a hit and double on a critical hit. Both are the core's check family with a set modifier
// (check.modifier), which the ability module's card rolls as that, at the creature its presser targets. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { ACTION_SLUGS } from "./item-actions.js";

const MANEUVERS = ["grapple", "shove", "trip", "disarm", "reposition", "demoralize", "feint"];
const NAMES = MANEUVERS.join("|");
const OWN_MANEUVER = new RegExp(String.raw`\b(?:attempts?|attempt another check) to (${NAMES})\b[^.]*?\bwith an? \+(\d+) (?:bonus|modifier)\b|\b(${NAMES})\b[^.]*?\busing [^.]*?\b(?:Athletics|Acrobatics|Intimidation|Deception) modifier of \+(\d+)`, "i");
const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed";
const OWN_ATTACK = new RegExp(String.raw`\bmakes? an? (?:(melee|ranged) )?(?:attack|Strike)\b[^.]*?\b(?:attack modifier of \+(\d+)|with an? \+(\d+) (?:to hit|attack modifier))\b[^.]*?\bdeal(?:s|ing)? (\d+d\d+(?:\s*\+\s*\d+)?) (?:(persistent) )?(${TYPES}) damage\b`, "i");
const MANY = /\b(?:each|every|all|up to (?:two|three|four|\d+))\b/i;

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const sentencesOf = (text) => String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// The text (plain) → { kind: "maneuver", slug, modifier, notes } | { kind: "attack", range, modifier, formula, type, category, notes } | null.
export function readOwnCheck(text) {
    const sentences = sentencesOf(text);
    for (const [index, sentence] of sentences.entries()) {
        if (MANY.test(sentence)) continue;
        const notes = sentences.filter((_, at) => at !== index);
        const maneuver = OWN_MANEUVER.exec(sentence);
        if (maneuver) {
            const slug = ACTION_SLUGS[(maneuver[1] ?? maneuver[3]).toLowerCase()] ?? (maneuver[1] ?? maneuver[3]).toLowerCase();
            return { kind: "maneuver", slug, modifier: Number(maneuver[2] ?? maneuver[4]), notes };
        }
        const attack = OWN_ATTACK.exec(sentence);
        if (attack) return { kind: "attack", range: attack[1]?.toLowerCase() ?? null, modifier: Number(attack[2] ?? attack[3]), formula: attack[4].replace(/\s+/g, ""), category: attack[5] ? "persistent" : null, type: attack[6].toLowerCase(), notes };
    }
    return null;
}

// The plan; null when nothing is read, or a maneuver whose basic action the ability module hasn't compiled.
// options.basicActions: the ability module's compiled actions.
export function ownCheckPlan(text, base, options = {}) {
    const read = readOwnCheck(text);
    if (!read) return null;
    const common = { ...base, modelVersion: MODEL_VERSION, automation: { level: read.notes.length ? "guided" : "automatic" }, trigger: { event: "use" }, ownCheck: { kind: read.kind, modifier: read.modifier }, notes: read.notes, ...(read.notes.length ? { partial: true } : {}) };
    if (read.kind === "maneuver") {
        const basic = options.basicActions?.[read.slug];
        if (!basic?.resolution?.check || basic.builtin) return null;
        return { ...common, targeting: { ...(basic.targeting ?? {}), target: "1 creature" }, resolution: { ...basic.resolution, check: { ...basic.resolution.check, modifier: read.modifier } } };
    }
    const component = { id: "0", formula: read.formula, type: read.type, category: read.category };
    const hit = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["0"] }, effects: [], modifiers: [] });
    return {
        ...common,
        targeting: { target: "1 creature", range: null, area: null },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: read.modifier }, sharedDamage: { rollOnce: true, components: [component] }, outcomes: { criticalSuccess: hit(2), success: hit(1), failure: none(), criticalFailure: none() } }
    };
}

// The plan to keep: the check over nothing, a note alone or the GM's fallback.
export function ownCheckOver(plan, check) {
    if (!check) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? check : plan;
}
