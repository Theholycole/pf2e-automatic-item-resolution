// An item that lowers a condition its user (or drinker) has: Lion Badge's "reduce the value of your frightened condition
// by 1", Pepper Poultice's "reduce your Sickened value by 1", Coin of Comfort's "You reduce your Frightened condition by
// 1", The Timeless Bond's "Reduce your doomed value by 2". Read as plan.item.reduce [{ slug, by }], which the item card
// applies after its own row (PF2e's decreaseCondition, as many times as it says); an item with nothing else gets a plan
// of its own for it. Not an ally's or an area's ("You and each ally in a 5-foot emanation reduce your Frightened values"),
// nor a passive one ("Whenever you become Frightened, reduce the condition value by 1"). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const VALUED = ["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"];
const COUNT = { one: 1, two: 2, three: 3 };
const REDUCE = new RegExp(String.raw`\b(?:(?:you )?reduc(?:e|es|ing) (?:the value of )?your (${VALUED.join("|")})(?: condition| value)?(?: value)?|your (${VALUED.join("|")}) (?:value|condition) decreases) by (\d|one|two|three)\b`, "gi");
const NOT_YOURS = /\b(?:each|every|all) (?:other )?(?:all(?:y|ies)|creatures?)\b|\bemanation\b|\baura\b|\bWhenever\b|\banytime\b|\beach round\b|\bat the (?:beginning|start|end) of (?:each of )?your turns?\b|\bif (?:successful|it succeeds|you succeed)\b/i;
// (Its use only: not a later "Secondary Effect" — Ginger Chew's "Reduce your sickened value by 1" is for when it's used again.)
const ownUse = (text) => String(text ?? "").split(/\bSecondary Effect\b/)[0];
const RULE_WORDS = /\b(?:check|save|saving throw|damage|bonus|penalty|Hit Points|condition|Speed|resistance|immune)\b/i;

// The text (plain) → [{ slug, by }] — the conditions it lowers, each once.
export function readReductions(text) {
    const found = [];
    for (const sentence of ownUse(text).split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        if (NOT_YOURS.test(sentence)) continue;
        for (const match of sentence.matchAll(REDUCE)) {
            const slug = (match[1] ?? match[2]).toLowerCase();
            if (found.some((entry) => entry.slug === slug)) continue;
            found.push({ slug, by: COUNT[match[3].toLowerCase()] ?? Number(match[3]) });
        }
    }
    return found;
}

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A plan for an item whose only reading is the reduction: the item card's (an automatic row with nothing in it, its
// reduce on plan.item). notes: what else the text says.
export function reductionPlan(base, reduce, notes = []) {
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        reduce,
        ...(notes.length ? { notes, partial: true } : {})
    };
}

// What else the text says that a card should show (rules, not its flavor): its other sentences with rule words.
export function reductionNotes(text) {
    // (A copy without the global flag: the shared one keeps its place between calls.)
    const reduces = new RegExp(REDUCE.source, "i");
    // (The reduction's own sentence too when it says more: "…, and you regain 1 Mythic Point".)
    return ownUse(text).replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && (reduces.test(sentence) ? /\band (?:you )?(?:regain|gain|become|are|take|can)\b/i.test(sentence) : RULE_WORDS.test(sentence)) && !/^(?:Activate|Usage|Trigger|Requirements?)\b/.test(sentence));
}

