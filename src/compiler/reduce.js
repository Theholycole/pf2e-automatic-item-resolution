// An item that lowers a condition: its user's (or drinker's) — Lion Badge's "reduce the value of your frightened condition
// by 1", Pepper Poultice's "reduce your Sickened value by 1", Coin of Comfort's "You reduce your Frightened condition by
// 1", The Timeless Bond's "Reduce your doomed value by 2" — or another's. Read as plan.item.reduce, entries of
//   { slug, by }                     its user's or drinker's condition, lowered by that much (by "all": "to 0", Unending Youth);
//   { choose: [slugs], by }          one of them, the card's picker (Golden-Souled Yang Na's "your clumsy, enfeebled,
//                                    frightened, or stupefied condition by 1");
//   { slug, by, who: "targets" }     the creatures the presser targets: an ally or a creature (Banner of Common Cause's
//                                    "Reduce the ally's frightened condition by 1", Fearcutter's "that creature's"), or
//                                    "You and each ally in a 5-foot emanation" (Fearless Sash).
// A list with "and" lowers each (Sun Orchid Poultice's "your clumsy, drained, and enfeebled condition values by 2"). The
// item card applies them after its own row (PF2e's decreaseCondition, as many times as it says); an item with nothing
// else gets a plan of its own for it. Not a passive one ("Whenever you become Frightened, reduce the condition value by
// 1"), a save's degree row, or "can't reduce … below". Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const VALUED = ["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"];
const NAMES = VALUED.join("|");
const COUNT = { one: 1, two: 2, three: 3 };
const BY = String.raw`(?:by (?:up to )?(\d|one|two|three)|to (0))\b`;
const REDUCE = new RegExp(String.raw`\b(?:(?:you )?reduc(?:e|es|ing) (?:the values? of )?your (${NAMES})(?: conditions?| values?)?(?: values?)?|your (${NAMES}) (?:value|condition) decreases) by (?:up to )?(\d|one|two|three)\b`, "gi");
// (Its user's several: "your clumsy, drained, and enfeebled condition values by 2" — each; "… or stupefied condition by 1" — one.)
const LIST = new RegExp(String.raw`\breduc(?:e|es|ing) (?:the values? of )?your ((?:${NAMES})(?:\s*,\s*(?:(?:and|or) )?(?:${NAMES}))*\s*,?\s*(and|or) (?:${NAMES})) (?:conditions?|values?)(?: values?)? ${BY}`, "gi");
// (To 0: Unending Youth's "Reduce your doomed value to 0".)
const TO_ZERO = new RegExp(String.raw`\breduc(?:e|es|ing) (?:the value of )?your (${NAMES})(?: condition| value)?(?: value)? to 0\b`, "gi");
// (Another's: "Reduce the ally's frightened condition by 1", "Reduce that creature's frightened value by 1", "that target
// reduces the value of its frightened condition by 1", "each affected ally who's Frightened reduces their frightened value by 1".)
const OTHERS = new RegExp(String.raw`\b(?:reduc(?:e|es|ing) (?:the value of )?(?:the ally's|that ally's|that creature's|the creature's|the target's|that target's) (${NAMES})|(?:that target|the target|that creature|the creature|the ally|that ally|each (?:affected )?ally(?: who's \w+)?) reduces (?:the value of )?(?:its|their) (${NAMES}))(?: conditions?| values?)?(?: values?)? ${BY}`, "gi");
// (You and the allies around: "You and each ally in a 5-foot emanation reduce your Frightened values by 1", "You and your
// allies within 10 feet of you gain 30 temporary Hit Points …, and reduce your clumsy, … conditions by 1".)
const AREA = /\bYou and (?:each|every|all|your) (?:of your )?all(?:y|ies)\b/i;
const NOT_YOURS = /\b(?:each|every|all) (?:other )?(?:all(?:y|ies)|creatures?)\b|\bemanation\b|\baura\b/i;
const TIMED = /\bWhenever\b|\banytime\b|\beach round\b|\bat the (?:beginning|start|end) of (?:each of )?(?:your|each) turns?\b|\bif (?:successful|it succeeds|you succeed)\b|\bIf you successfully\b|\bcan(?:'t|not) reduce\b/i;
// (A save's degree row is the save's: "Success The target reduces its slowed condition by 1".)
const DEGREE_ROW = /^(?:Critical )?(?:Success|Failure)\b/;
// (On yourself or another: "When used on yourself or a creature within your reach, that target reduces …" — its drinker's.)
const EITHER = /\b(?:on|to) yourself or (?:an?|another|one) /i;
// (Its use only: not a later "Secondary Effect" — Ginger Chew's "Reduce your sickened value by 1" is for when it's used again.)
const ownUse = (text) => String(text ?? "").split(/\bSecondary Effect\b/)[0];
const RULE_WORDS = /\b(?:check|save|saving throw|damage|bonus|penalty|Hit Points|condition|Speed|resistance|immune)\b/i;
const amount = (count, zero) => (zero === "0" ? "all" : COUNT[String(count).toLowerCase()] ?? Number(count));
const copy = (pattern) => new RegExp(pattern.source, "gi");

// The text (plain) → reduce entries (above), each condition once for each recipient.
export function readReductions(text) {
    const found = [];
    const add = (entry) => {
        if (!found.some((other) => (other.slug ?? other.choose?.join()) === (entry.slug ?? entry.choose?.join()) && other.who === entry.who)) found.push(entry);
    };
    const either = EITHER.test(ownUse(text));
    for (const sentence of ownUse(text).split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        if (TIMED.test(sentence) || DEGREE_ROW.test(sentence.trim())) continue;
        const area = AREA.test(sentence);
        const who = area ? { who: "targets" } : {};
        // (Another's: the creatures targeted; on yourself or another, the drinker's.)
        for (const match of sentence.matchAll(copy(OTHERS))) add({ slug: (match[1] ?? match[2]).toLowerCase(), by: amount(match[3], match[4]), ...(either ? {} : { who: "targets" }) });
        if (NOT_YOURS.test(sentence) && !area) continue;
        for (const match of sentence.matchAll(copy(LIST))) {
            const slugs = [...match[1].toLowerCase().matchAll(new RegExp(NAMES, "g"))].map(([slug]) => slug);
            const by = amount(match[3], match[4]);
            if (match[2].toLowerCase() === "or") add({ choose: slugs, by, ...who });
            else for (const slug of slugs) add({ slug, by, ...who });
        }
        for (const match of sentence.matchAll(copy(TO_ZERO))) add({ slug: match[1].toLowerCase(), by: "all", ...who });
        for (const match of sentence.matchAll(copy(REDUCE))) add({ slug: (match[1] ?? match[2]).toLowerCase(), by: COUNT[match[3].toLowerCase()] ?? Number(match[3]), ...who });
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
    const patterns = [REDUCE, LIST, TO_ZERO, OTHERS].map((pattern) => new RegExp(pattern.source, "i"));
    const reduces = { test: (sentence) => patterns.some((pattern) => pattern.test(sentence)) };
    // (The reduction's own sentence too when it says more: "…, and you regain 1 Mythic Point".)
    return ownUse(text).replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && (reduces.test(sentence) ? /\band (?:you )?(?:regain|gain|become|are|take|can)\b/i.test(sentence) : RULE_WORDS.test(sentence)) && !/^(?:Activate|Usage|Trigger|Requirements?)\b/.test(sentence));
}

