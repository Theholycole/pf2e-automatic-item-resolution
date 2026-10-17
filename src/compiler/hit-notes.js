// What a hit does that isn't a condition or damage, as a note Effect on the creature hit, the user's note-Effect rule for what
// can't be automated. A save on the hit, Blister Ammunition's "must attempt a @Check[fortitude|dc:19] save or begin to itch
// uncontrollably for 3 rounds …", Golden Silencer's "… save or be silenced as well until the start of its next turn", Escalation
// Ammunition's "the target must attempt a @Check[fortitude|dc:30] save. On a failure, the target rolls the next saving throw …
// twice": the save's own card at the creature hit, its failure and critical failure that note. With no save, Magekiller Bullet's
// "Each time within the next week an affected target Casts a Spell, it must attempt a @Check[flat|dc:11]. On a failure, it takes
// 2d12 force damage": the note on the hit itself, only when the text gives its time. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
const sentencesOf = (text) => String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
// (A sentence that says a rule, not flavor.)
const RULE = /\b(?:checks?|saves?|saving throws?|damage|penalty|bonus|can't|cannot|Casts? a Spell|casting spells|concentrate|Hidden|Invisible|Interact|attack rolls?|flat check|loses?|actions?|counteract\w*)\b|@Check/i;
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days", week: "days", weeks: "days" };
// Its time: "for 3 rounds", "for up to 1 minute", "lasts for up to 1 minute", "within the next week", "until the start of its next turn".
function timeOf(text) {
    if (/\buntil the start of its next turn\b/i.test(text)) return { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
    const match = /\b(?:for (?:up to )?|lasts? (?:for )?(?:up to )?|within the next )(\d+|a|an|one)?\s*(rounds?|minutes?|hours?|days?|weeks?)\b/i.exec(text);
    if (!match) return null;
    const count = /^\d+$/.test(match[1] ?? "") ? Number(match[1]) : 1;
    const unit = match[2].toLowerCase();
    return { mode: "fixed", value: /^weeks?$/.test(unit) ? count * 7 : count, unit: UNITS[unit], expiry: "turn-start", anchor: "effect-start" };
}

const SAVE = /@Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?(?: save| saving throw)?(?: or (.+?))?\.$/i;

// The hit's text (from "On a hit") → { save } (a save plan at the creature hit) or { note } (for the hit's own rows), or null.
// (From the hit on: not a save before the attack, Reactive Flash's "the target must first succeed at a … save".)
const HIT = /\b(?:On a hit|On a successful (?:hit|Strike)|If (?:your|the) (?:Strike|attack) hits|If it hits)\b/i;
// (Not what its user gains — Reaper's Toll's "you gain temporary Hit Points", Shadow's Heart's "you also leave behind" a duplicate —
// nor a list of options to pick, Hydrocannon's "Piercing The target …".)
const USERS = /^(?:(?:On a hit|If (?:your|the) (?:Strike|attack) hits|If it hits),\s*)?you (?:also )?(?:gain|regain|leave|become|are|can|may)\b/i;
const OPTION = /^(?:Bludgeoning|Piercing|Slashing|Acid|Cold|Electricity|Fire|Sonic|Force|Mental|Poison|Vitality|Void)\s+(?:The|the|It|it)\b/;
export function hitNotes(after, base) {
    const from = String(after ?? "").search(HIT);
    if (from < 0) return null;
    const all = sentencesOf(String(after).slice(from));
    if (all.some((sentence) => OPTION.test(sentence))) return null;
    const sentences = all.filter((sentence) => !USERS.test(sentence));
    // (The creature hit's save only: not "All creatures in a 10-foot emanation around the target … must succeed".)
    const at = sentences.findIndex((sentence) => SAVE.test(sentence) && !/^(?:All|Each|Every|Any|Creatures?|Other)\b/i.test(sentence.replace(/^On a hit,\s*/i, "")));
    if (at < 0 && sentences.some((sentence) => SAVE.test(sentence))) return null;
    if (at >= 0) {
        const [, statistic, dc, or] = SAVE.exec(sentences[at]);
        // (What a failure does: the "or …" clause, else a sentence "On a failure, …"; and what follows on it — not a critical hit's change.)
        const failing = or ? [`Failed save: ${or.replace(/\s+in addition to (?:the )?damage the attack normally deals$/i, "")}.`] : [];
        const rest = sentences.slice(at + 1).filter((sentence) => !/^On a critical hit\b/i.test(sentence));
        const lines = [...failing, ...rest].filter((sentence) => RULE.test(sentence) || /^On a failure\b/i.test(sentence));
        if (!lines.length) return null;
        const note = { text: lines.join(" "), ...(timeOf(lines.join(" ")) ? { duration: timeOf(lines.join(" ")) } : {}) };
        const plan = {
            ...base,
            modelVersion: MODEL_VERSION,
            automation: { level: "guided" },
            targeting: { target: "the creature the Strike hits", range: null, area: null },
            trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
            resolution: { kind: "save", check: { roll: "save", statistic: statistic.toLowerCase(), basic: false, against: { dc: "fixed", value: Number(dc) } }, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [note] }, criticalFailure: { ...none(), noteEffects: [note] } } }
        };
        // (A critical hit's change, its save link as plain words: the Strike card's note, not a second save.)
        return { save: { plan }, notes: sentences.filter((sentence) => /^On a critical hit\b/i.test(sentence)).map((sentence) => sentence.replace(/@Check\[(?:fortitude|reflex|will)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $1")) };
    }
    // (No save: the hit's own note, its rule sentences and the one giving its time ("This effect lasts for up to 1 minute"), when there is
    // one; not the Strike's own sentence.)
    // (The hit's own sentence always.)
    const lines = sentences.filter((sentence, index) => (index === 0 && HIT.test(sentence)) || ((RULE.test(sentence) || timeOf(sentence)) && !/\b(?:make|makes|attempt|attempts) an? (?:[\w-]+ ){0,3}?Strike\b/i.test(sentence)));
    const duration = timeOf(lines.join(" "));
    if (!lines.length || !duration) return null;
    return { note: { text: lines.join(" "), duration } };
}
