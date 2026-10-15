// Damage an item deals outright to one creature, with no roll against it: Forge Warden's "The attacking creature takes
// 2d6 fire damage", Kortos Diamond's "You deal an additional 2d8 force damage to the struck creature", Clear Cutter's
// Axe's "deals an additional 1d10 persistent fire damage to the plant", Horns of Naraga's "The creature takes 5d6 void
// damage". The plan is the ability compiler's shape for such damage — the check family with no roll ("automatic"), the
// damage shared — so live play sends it to the creatures its presser targets through the ability module's card, which
// rolls it and applies it with PF2e's resistances. What else the text says is a note. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";

const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed|untyped";
const DICE = String.raw`(\d+d\d+(?:\s*\+\s*\d+)?)`;
const KIND = String.raw`(?:(persistent) )?(?:(${TYPES}) )?damage`;
// The one creature: "The attacking creature", "the struck creature", "The creature", "the triggering enemy", "the plant",
// "the undead that caused the condition", "The required creature", "the target".
const ONE = String.raw`(?:the|that|your) (?:(?:attacking|triggering|struck|damaged|required|living|affected|grabbed) )?(?:creature|enemy|foe|attacker|target|plant|undead|construct|aberration)(?: (?:that|who|you) [\w ]{1,40}?)?`;
const TAKES = new RegExp(String.raw`\b${ONE} takes (?:an additional |an extra )?${DICE} ${KIND}\b`, "i");
const DEALS_TO = new RegExp(String.raw`\b(?:you deal|deals?|inflicts?) (?:an additional |an extra )?${DICE} (?:additional )?${KIND} to ${ONE}\b`, "i");
// Not one creature, or not outright: an area, a save, a condition on it, a number not rolled.
const NOT_OUTRIGHT = /\b(?:each|every|all|any) (?:other )?(?:creatures?|enem(?:y|ies)|foes?)\b|\bcreatures in\b|\bwithin \d+ feet\b|\bsave\b|\bsaving throw\b|@Check|\bbasic\b|\bequal to\b|\bper\b|\bfor every\b|\bif (?!you are)/i;

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A text whose damage isn't outright: degrees of a save ("Success The creature takes 2d6 acid damage"), a save at all, or
// a Strike's on a hit ("On a successful hit, the target takes an additional 1d6 force damage", Hydrocannon's).
const DEGREES = /\b(?:Critical Success|Critical Failure)\b|\b(?:Success|Failure) (?:The|the|You|you|It|it)\b/;
const SAVED = /@Check\[(?:type:)?(?:fortitude|reflex|will)\b|\b(?:save|saving throw)\b/i;
const STRUCK = /\b(?:make|makes|attempt|attempts) an? (?:[\w-]+ ){0,3}?Strike\b|\bsuccessful (?:attack|hit|Strike)\b|\bon a hit\b|\bhits a target\b|\bUpon Striking\b/i;
const ROW_START = /^(?:On a|Even on|Success|Failure|Critical)\b/;
// (A shield's statistics line, "Hardness HP BT 6 36 18": not a note.)
const STATS = /^Hardness\b.*\bHP\b/;

// The text (plain, from the activation's Effect on) → { formula, type, category, effects, modifiers, notes } or null.
// A save only for others ("All the target's allies within 20 feet take 1d8 electricity damage with a basic Reflex save",
// Shei Long's Blade): not this card's, a note beside the target's outright damage.
const OTHERS_SAVE = /^(?:(?:All|Each|Every|Any) (?:of )?(?:the target['’]s |its |other )?(?:allies|creatures|enemies|foes)\b|Creatures (?:who|that) (?:critically )?(?:fail|succeed))/i;
const savedForTarget = (body) => body.split(/(?<=[.!?])\s+(?=[A-Z])/).some((sentence) => SAVED.test(sentence) && !OTHERS_SAVE.test(sentence.trim()));

export function readDirectDamage(text) {
    const plain = String(text ?? "");
    if (DEGREES.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    if (savedForTarget(body) || (SAVED.test(plain) && !SAVED.test(body))) return null;
    if (STRUCK.test(body)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = TAKES.exec(sentence) ?? DEALS_TO.exec(sentence);
        if (!match || NOT_OUTRIGHT.test(sentence) || ROW_START.test(sentence)) continue;
        const [, formula, given, type] = match;
        // (Bleed is always persistent.)
        const category = given || /^bleed$/i.test(type ?? "") ? "persistent" : null;
        // (What the sentence leaves — "Reduce the value of the drained condition you gain by 1, and …" — and the others, as notes.)
        const rest = sentence.replace(match[0], "").replace(/^[\s,.;]+|[\s,.;]+$/g, "");
        // ("… takes 1d6 bleed damage and is off-guard until the end of your next turn": its conditions too, the bombs' reader.)
        const clause = /\band (?:is|becomes) ([^.]+)/i.exec(rest);
        const riders = clause ? riderRow(`is ${clause[1]}`) : null;
        const ridden = Boolean(riders && (riders.effects.length || riders.modifiers.length));
        const left = ridden ? rest.replace(clause[0], "").replace(/^(?:When you activate (?:it|the [\w' -]+?),)?[\s,.;]*$/i, "") : rest;
        const notes = [...(left.split(/\s+/).filter(Boolean).length > 3 ? [sentence] : []), ...sentences.filter((other, at) => at !== index && !STATS.test(other))];
        return { formula: formula.replace(/\s+/g, ""), type: type && type.toLowerCase() !== "untyped" ? type.toLowerCase() : null, category, effects: ridden ? riders.effects : [], modifiers: ridden ? riders.modifiers : [], notes };
    }
    return null;
}

// Conditions an item puts outright on the one creature it names, no damage, no roll (Imposing Shield's "The creature that
// made the attack that triggered your Shield Block becomes Frightened 2", Highhelm War Shield's "The creature becomes
// Grabbed"): { effects, modifiers, notes } or null — the bombs' rider reader on the sentence. Not one scoped to you ("Off-
// Guard against the next melee attack you attempt"), nor under a condition.
const ONE_IS = /^(?:The|That) (?:(?:attacking|triggering|struck|damaged|affected) )?(?:creature|target|attacker|foe|enemy)(?: that [^.]{1,80}?)? (?:is|becomes)\b\s*(.+)$/i;
export function readOutrightConditions(text) {
    const plain = String(text ?? "");
    if (DEGREES.test(plain) || SAVED.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    if (STRUCK.test(body)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = ONE_IS.exec(sentence);
        if (!match || NOT_OUTRIGHT.test(sentence) || /\b(?:against (?:the next|your)|to you\b|to your\b)/i.test(sentence)) continue;
        const row = riderRow(`is ${match[1]}`);
        if (!row.effects.length && !row.modifiers.length) continue;
        return { effects: row.effects, modifiers: row.modifiers, notes: sentences.filter((other, at) => at !== index && !STATS.test(other)) };
    }
    return null;
}

// The plan: the check family with no roll, at the creature the presser targets; null when nothing is read. Not for
// ammunition (PF2e's own rules deal its damage on the Strike).
export function directDamagePlan(text, base, { item = null } = {}) {
    if (item?.type === "ammo" || /\bammunition\b|\bbullet\b|\barrow\b|\bbolt\b/i.test(item?.name ?? "") || (item?.system?.traits?.value ?? []).includes("ammunition")) return null;
    const read = readDirectDamage(text);
    if (!read) {
        // (Conditions alone, outright.)
        const conditions = readOutrightConditions(text);
        if (!conditions) return null;
        return {
            ...base,
            modelVersion: MODEL_VERSION,
            automation: { level: conditions.notes.length ? "guided" : "automatic" },
            targeting: { target: "1 creature", range: null, area: null },
            trigger: { event: "use" },
            resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { damage: none().damage, effects: conditions.effects, modifiers: conditions.modifiers, ...(conditions.notes.length ? { manualInstructions: conditions.notes.map((note) => `{target}: ${note}`) } : {}) }, failure: none(), criticalFailure: none() } },
            notes: conditions.notes,
            ...(conditions.notes.length ? { partial: true } : {})
        };
    }
    const component = { id: "0", formula: read.formula, type: read.type, category: read.category };
    const success = {
        damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] },
        effects: read.effects,
        modifiers: read.modifiers,
        ...(read.notes.length ? { manualInstructions: read.notes.map((note) => `{target}: ${note}`) } : {})
    };
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [component] }, outcomes: { criticalSuccess: none(), success, failure: none(), criticalFailure: none() } },
        directDamage: { formula: read.formula, type: read.type, category: read.category },
        notes: read.notes,
        ...(read.notes.length ? { partial: true } : {})
    };
}

// The plan to keep: the damage over nothing, a note alone or the GM's fallback.
export function directDamageOver(plan, damage) {
    if (!damage) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? damage : plan;
}
