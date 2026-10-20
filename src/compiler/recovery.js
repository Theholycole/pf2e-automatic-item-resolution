// An item that has its user (or the creature it's applied to) attempt the flat check to end persistent damage at once:
// Quenching Potion's "Immediately attempt a flat check to end any persistent acid, fire, poison, or void damage affecting
// you", Antivenom Potion's "attempt a @Check[flat|dc:10] to end any persistent poison damage", Ring of Torag's "you gain an
// immediate flat check to remove the persistent fire damage, and the DC typically decreases from 15 to 10", Cauterizing
// Torch's "an immediate flat check to end any persistent bleed effect with the lower DC for particularly effective
// assistance". Read as plan.item.recovery { types, dc }: the item card rolls PF2e's own recovery check (the condition's
// rollRecovery) for each persistent damage of those types the creature has, at that DC when it's lower (10, for
// particularly appropriate help). Not one whose type is the item's to choose ("the persistent damage the powder works
// against"), nor another creature's. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const TYPES = ["acid", "bleed", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void"];
const TYPE = `(?:${TYPES.join("|")})`;
const CHECK = new RegExp(String.raw`\b(?:attempts?|gain|roll) (?:a |an )?(?:immediate |new )?(?:@Check\[flat\|dc:(\d+)\](?:\{[^}]*\})?|flat check) to (?:end|remove) (?:any |all |the )?persistent (${TYPE}(?:(?:,|, or|, and| or| and) ${TYPE})*) (?:damage|effects?)\b`, "i");
// The DC for particularly appropriate help (Player Core's persistent damage): 10, or the number the text gives.
const LOWER = /\b(?:particularly (?:appropriate|effective)|especially effective)\b/i;
const LOWER_TO = /\bDC (?:typically )?(?:decreases|is lowered|lowers|drops) (?:from \d+ )?to (\d+)\b|\blowers the DC to (\d+)\b/i;
const NOT_YOURS = /\b(?:each|every|all) (?:other )?(?:all(?:y|ies)|creatures?)\b|\bemanation\b|\baura\b|\bWhenever\b/i;

// (One whose type is the powder's own, set when it's made: Soothing Powder's "Each damage type requires a different formula,
// with the most popular being bleed soothing powder, poison soothing powder, … The target can immediately attempt a new flat
// check to remove persistent damage the powder works against. This powder lowers the DC to 10" — the type the card's picker,
// { types, dc, choose: true }.)
const OWN_TYPE = /\battempt a new flat check to remove persistent damage the (?:powder|salve|remedy) works against\b/i;
const POPULAR = new RegExp(String.raw`\bthe most popular being ((?:${TYPE}) [\w ]+?(?:, (?:and )?(?:${TYPE}) [\w ]+?)*)\.`, "i");

// (Or ended outright, no check, Hollow Robes' "All persistent damage you're currently taking ends": every type, { ends: true }.)
const ENDS = /\bAll persistent damage you're currently taking ends\b/i;

// The text (plain) → { types, dc, ends? } or null. dc: null for the usual one.
export function readRecovery(text) {
    const plain = String(text ?? "");
    if (ENDS.test(plain)) return { types: [...TYPES], dc: null, ends: true };
    // (One type ended outright, Assassin's Skin's "You don't take the persistent bleed damage and instead regain Hit Points equal to the bleed
    // damage. The persistent bleed damage ends.")
    // (A sentence of its own, not a clause's "… ends when the persistent bleed damage ends" — Heedless Spurs', Horned Lion Amulet's.)
    const typeEnds = new RegExp(String.raw`(?:^|[.!?]\s+)The persistent (${TYPE}) damage ends\.`).exec(plain);
    if (typeEnds) return { types: [typeEnds[1].toLowerCase()], dc: null, ends: true };
    if (OWN_TYPE.test(plain)) {
        const listed = [...(POPULAR.exec(plain)?.[1] ?? "").matchAll(new RegExp(String.raw`\b(${TYPE})\b`, "gi"))].map(([type]) => type.toLowerCase());
        const lowered = LOWER_TO.exec(plain);
        return { types: [...new Set(listed.length ? listed : TYPES)], dc: lowered ? Number(lowered[1] ?? lowered[2]) : 10, choose: true };
    }
    const sentences = plain.split(/(?<=[.!?])\s+(?=[A-Z@])/);
    for (const sentence of sentences) {
        const match = CHECK.exec(sentence);
        if (!match || NOT_YOURS.test(sentence)) continue;
        const types = [...new Set(match[2].toLowerCase().split(/,? (?:or|and) |, /).map((word) => word.trim()).filter(Boolean))];
        const lowered = LOWER_TO.exec(plain);
        const dc = match[1] ? Number(match[1]) : lowered ? Number(lowered[1] ?? lowered[2]) : LOWER.test(plain) ? 10 : null;
        // (Another creature's, the one its user touches: the creatures the presser targets, whoever else the item's Effect is for.)
        return { types, dc, ...(/^\s*(?:A creature you touch|The creature touched)\b/i.test(sentence) ? { who: "targets" } : {}) };
    }
    return null;
}

// What else the text says that a card should show: its other rule sentences, not the check's, nor the help it counts as.
const RULE_WORDS = /\b(?:check|save|saving throw|damage|bonus|penalty|Hit Points|condition|Speed|resistance|immune)\b/i;
export function recoveryNotes(text) {
    return String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim())
        // (The check's own sentence too when it says more: Searing Suture's "The target creature takes 1d6 fire damage and can
        // immediately attempt …", Quenching Potion's "…, and attempt a new saving throw against any poison affecting you".)
        .filter((sentence) => sentence && !ENDS.test(sentence) && RULE_WORDS.test(CHECK.test(sentence) ? sentence.replace(CHECK, "").replace(/\bflat check\b|\bpersistent (?:\w+ )?damage\b/gi, "").replace(LOWER_TO, "") : sentence) && !(LOWER.test(sentence) && !CHECK.test(sentence)) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence));
}

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A plan for an item whose only reading is the check: the item card's (an automatic row with nothing in it, its recovery on
// plan.item). notes: what else the text says.
export function recoveryPlan(base, notes = []) {
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        ...(notes.length ? { notes, partial: true } : {})
    };
}

// Whether a sentence is the recovery's own, read as plan.item.recovery: the one ending it outright, or its flat check alone.
export function recoverySaid(sentence) {
    const text = String(sentence ?? "").trim();
    return ENDS.test(text) || new RegExp(String.raw`^The persistent ${TYPE} damage ends\.?$`, "i").test(text);
}
