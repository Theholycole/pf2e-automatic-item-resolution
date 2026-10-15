// An item that rerolls the roll that triggered it (Lucky Rabbit's Foot's "reroll the triggering Reflex save", Starfaring
// Cloak's "Reroll the triggering roll and take the higher result", Mail of Luck's "You force the attacker to reroll the
// attack roll and use the worse result"): a builtin the item module plays with PF2e's own reroll (scripts/rerolls.js).
// Not one with a bonus on the reroll (Redsand Hourglass's "+4 circumstance bonus": PF2e's reroll keeps the roll's
// modifiers), one another creature rerolls (a companion, an ally), one behind a coin flip or a Mythic Point, or a choice
// of results the module can't make. Pure.

import { plainText } from "./rows.js";

// (Its object named: "reroll the triggering Reflex save", "reroll your saving throw", "reroll a single failed saving
// throw" — not a table's "Reroll two results", "10 = reroll".)
const SENTENCE = /[^.]*\breroll(?:s|ing)?\s+(?:the|your|that|this|a single|their)\b[^.]*\./i;
const WHAT = [["save", /\b(?:saving throw|save)\b/i], ["attack", /\b(?:attack roll|Strike)\b/i], ["check", /\bcheck\b/i], ["roll", /\broll\b/i]];

// The text → { what: "save" | "attack" | "check" | "roll", keep: "new" | "higher" | "lower", who: "self" | "attacker",
// statistic?, after? } or null. after: what the text says next, for the card ("If you fail the second roll as well, you can Stride").
export function readReroll(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    // (Its Effect, else its text without the Trigger: "Trigger You use a feat or ability to reroll a failed … save" is when.)
    const effect = /\bEffect\b/.test(text) ? text.replace(/^[\s\S]*?\bEffect\b\s*/, "") : text.replace(/\bTrigger\b[^.]*\./gi, " ");
    const match = SENTENCE.exec(effect);
    if (!match) return null;
    const sentence = match[0];
    if (/\bwith an? [+-]?\d+ (?:circumstance |item |status )?bonus\b/i.test(sentence)) return null;
    if (/\b(?:If it lands on|Mythic Point|flat check)\b/i.test(effect.slice(0, match.index + sentence.length))) return null;
    // (A reroll kept for later — Old Tillimaquin's "within the next 24 hours" — isn't this roll's.)
    if (/\bwithin the next\b|\blater\b/i.test(sentence)) return null;
    if (/\b(?:the result of your choice|either result)\b/i.test(sentence)) return null;
    const attacker = /\bforces? the attacker to reroll\b/i.test(sentence);
    if (!attacker && /\b(?:the creature|the triggering ally|your companion|an? ally|allies|the target|they)\b[^.]*\brerolls?\b/i.test(sentence)) return null;
    // (What is rerolled: the sentence's own word, else the trigger's: "reroll the triggering roll" for "You make an attack roll …".)
    const object = /\breroll(?:s|ing)?\b\s+(.*)$/i.exec(sentence)?.[1] ?? "";
    const what = WHAT.find(([, pattern]) => pattern.test(object.split(/\b(?:and|,)\b/)[0]))?.[0] ?? "roll";
    // ("you must take the second result, even if it's worse": the new one.)
    const keep = /\b(?:take|use|keep|using|taking|takes|uses) the (?:better|higher)\b/i.test(sentence) ? "higher" : /\b(?:take|use|keep|using|taking|takes|uses) the (?:worse|lower)\b/i.test(sentence) ? "lower" : "new";
    // (Only what follows from the reroll: "If you fail the second roll as well, you can Stride up to your Speed.")
    const next = effect.slice(match.index + sentence.length).split(/(?<=[.!?])\s+(?=[A-Z])/).map((line) => line.trim()).find(Boolean) ?? "";
    const after = /^If\b/.test(next) ? next : "";
    // (A named save: "reroll the triggering Reflex save" — PF2e's check domains say which.)
    const statistic = what === "save" ? /\b(Fortitude|Reflex|Will)\b/i.exec(object)?.[1]?.toLowerCase() ?? null : null;
    return { what, keep, who: attacker ? "attacker" : "self", ...(statistic ? { statistic } : {}), ...(after ? { after } : {}) };
}

export function rerollPlan(html, base) {
    const reroll = readReroll(html);
    if (!reroll) return null;
    return { ...base, builtin: "reroll", automation: { level: "automatic" }, targeting: { target: reroll.who === "attacker" ? "the attacker" : "self", range: null, area: null }, trigger: { event: "use" }, reroll };
}

// The plan to keep: the reroll over nothing, a note alone or the GM's fallback.
export const rerollOver = (plan, reroll) => (reroll && (!plan || plan.noteOnly || plan.builtin === "no-effect") ? reroll : plan);
