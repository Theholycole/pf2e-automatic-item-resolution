// A weapon lent a property rune for a while: Burial Oil's "applied to a weapon grants the benefits of a Vitalizing rune for
// 1 minute", Oil of Swiftness's "the benefits of the Quickstrike rune for 1 minute", Frost Fair Yanyuedao's "Until the end of
// your turn, the Frost Fair Yanyuedao gains the effects of a Greater Frost rune". plan.item.rune { key, name, duration, own }:
// the item card gives the weapon picked (the item itself, own) an Effect with PF2e's AdjustStrike rule that adds the rune,
// as PF2e's own Wounding Oil does. key is PF2e's rune key (its remastered names keep the old keys: Vitalizing is
// "disrupting", Quickstrike "speed"); live play checks it against PF2e's own rune names. Not a passive one ("While invested
// …", "This ammunition has the benefits …"), nor an item that links PF2e's own Effect for it. Pure.
//
// To give another item this mechanic when its words differ, add it to EXTRA (by its slug) — see docs/mechanics.md.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const RUNE = /\b(?:benefits?|effects?) of (?:a|an|the) ((?:(?:Greater|Major|True) )?[A-Z][\w']*(?: [A-Z][\w']*)?) (?:property )?rune\b/;
const PASSIVE = /\b(?:invest|While\b|Any creature|This ammunition|has the benefits)\b/i;
const FOR_TIME = /\bfor (\d+|one|a|an) (round|rounds|minute|minutes|hour|hours)\b/i;
const UNTIL_TURN_END = /\bUntil the end of your turn\b/i;
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const COUNT = { one: 1, a: 1, an: 1 };
// (Its remastered names over PF2e's keys.)
const RENAMED = { vitalizing: "disrupting", "greater vitalizing": "greater-disrupting", quickstrike: "speed" };
export const runeKey = (name) => RENAMED[String(name).toLowerCase()] ?? String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Items whose words the reader doesn't take, by slug: { name, duration, own }.
export const EXTRA = Object.freeze({});

// The text (plain) and the item → { key, name, duration, own } or null.
export function readRuneLoan(text, item = null) {
    const extra = EXTRA[item?.system?.slug ?? ""];
    if (extra) return { key: runeKey(extra.name), name: extra.name, duration: extra.duration ?? null, own: Boolean(extra.own) };
    if (/@UUID\[[^\]]*\]\{Effect:/i.test(String(item?.system?.description?.value ?? ""))) return null;
    for (const sentence of String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const match = RUNE.exec(sentence);
        if (!match || PASSIVE.test(sentence)) continue;
        const time = FOR_TIME.exec(sentence) ?? FOR_TIME.exec(String(text));
        const duration = UNTIL_TURN_END.test(sentence)
            ? { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end" }
            : time ? { mode: "fixed", value: COUNT[time[1].toLowerCase()] ?? Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start" } : null;
        // (The item itself, a weapon that "gains the effects": no weapon to pick.)
        const own = item?.type === "weapon" && !/\ba weapon\b/i.test(sentence);
        return { key: runeKey(match[1]), name: match[1], duration, own };
    }
    return null;
}

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan for an item whose only reading is the rune: the item card's (an automatic row with nothing in it, the rune on
// plan.item). notes: what else the text says.
export function runeLoanPlan(base, notes = []) {
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
