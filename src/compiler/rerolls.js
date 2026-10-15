// An item that rerolls the roll that triggered it (Lucky Rabbit's Foot's "reroll the triggering Reflex save", Starfaring
// Cloak's "Reroll the triggering roll and take the higher result", Mail of Luck's "You force the attacker to reroll the
// attack roll and use the worse result"): a builtin the item module plays with PF2e's own reroll (scripts/rerolls.js).
// One with a bonus on the reroll (Redsand Hourglass's "+4 circumstance bonus") is rolled by the card itself, since PF2e's
// reroll keeps the roll's modifiers. Not one another creature rerolls (an ally, allies) other than a companion the
// presser targets, one behind a coin flip or a Mythic Point, or a choice of results the module can't make. Pure.

import { plainText } from "./rows.js";

// (Its object named: "reroll the triggering Reflex save", "reroll your saving throw", "reroll a single failed saving
// throw" — not a table's "Reroll two results", "10 = reroll".)
const SENTENCE = /[^.]*\breroll(?:s|ing)?\s+(?:the|your|that|this|a single|their)\b[^.]*\./i;
const WHAT = [["save", /\b(?:saving throw|save)\b/i], ["attack", /\b(?:attack roll|Strike)\b/i], ["check", /\bcheck\b/i], ["roll", /\broll\b/i]];

// The text → { what: "save" | "attack" | "check" | "roll", keep: "new" | "higher" | "lower", who: "self" | "attacker" |
// "companion", statistic?, bonus? { value, type }, after? } or null. after: what the text says next, for the card ("If you fail the second roll as well, you can Stride").
export function readReroll(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    // (Its Effect, else its text without the Trigger: "Trigger You use a feat or ability to reroll a failed … save" is when.)
    const effect = /\bEffect\b/.test(text) ? text.replace(/^[\s\S]*?\bEffect\b\s*/, "") : text.replace(/\bTrigger\b[^.]*\./gi, " ");
    const match = SENTENCE.exec(effect);
    if (!match) return null;
    const sentence = match[0];
    // (A bonus on the reroll — Redsand Hourglass's "+4 circumstance": PF2e's reroll keeps the roll's modifiers, so the card
    // rolls it itself, the user's answer of 2026-10-15.)
    const bonusMatch = /\bwith an? \+(\d+) (circumstance|item|status)? ?bonus\b/i.exec(sentence);
    const bonus = bonusMatch ? { value: Number(bonusMatch[1]), type: (bonusMatch[2] ?? "untyped").toLowerCase() } : null;
    if (/\b(?:If it lands on|Mythic Point|flat check)\b/i.test(effect.slice(0, match.index + sentence.length))) return null;
    // (A reroll kept for later — Old Tillimaquin's "within the next 24 hours" — isn't this roll's.)
    if (/\bwithin the next\b|\blater\b/i.test(sentence)) return null;
    if (/\b(?:the result of your choice|either result)\b/i.test(sentence)) return null;
    const attacker = /\bforces? the attacker to reroll\b/i.test(sentence);
    // (Your companion's save, Navaratna of the Solar Ruby's "The creature rerolls the triggering saving throw": the creature
    // the presser targets.)
    const companion = !attacker && /^\s*The creature rerolls\b/i.test(sentence) && /\byour companion\b/i.test(effect.slice(0, match.index));
    if (!attacker && !companion && /\b(?:the creature|the triggering ally|your companion|an? ally|allies|the target|they)\b[^.]*\brerolls?\b/i.test(sentence)) return null;
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
    return { what, keep, who: attacker ? "attacker" : companion ? "companion" : "self", ...(statistic ? { statistic } : {}), ...(bonus ? { bonus } : {}), ...(after ? { after } : {}) };
}

// A change to the roll that triggered it, after the roll and without a new one (the user's answer 3 of 2026-10-15, as for a
// reroll with a bonus: the card works out the result, the GM uses it): Breastplate of the Mountain's "If you failed the
// saving throw, it becomes a success. If you critically failed, it becomes a failure instead", Sash of Prowess's "You
// critically succeed instead", Hunter's Arrowhead's "+2 circumstance bonus to your attack roll, possibly turning a miss
// into a hit", Successor Doll's "Roll 1d4 and add the result to your Diplomacy check as a circumstance bonus". The roll is
// the trigger's ("You fail or critically fail a Fortitude saving throw", "You would miss with an attack"). → { what,
// keep: "new", who: "self", statistic?, raise: { change?: { failure: "success", … }, bonus?: { value | formula, type } } }.
const CHANGES = [
    [/\bIf you (?:failed|fail) (?:the|your) [\w ]*?(?:saving throw|save|check|roll), it becomes a success\b/i, ["failure", "success"]],
    [/\bIf you (?:critically failed|critically fail)\b[^.]*?, it becomes a failure\b/i, ["criticalFailure", "failure"]],
    [/(?:^|\.\s+|\bEffect\s+)You critically succeed instead\b/i, ["success", "criticalSuccess"]],
    // (Essence Charm's "A failed check becomes a success, and a critical failure becomes a failure"; Red Thread Knot's "Treat
    // your saving throw as if you failed the check rather than critically failed the check".)
    [/\bA failed (?:check|save|saving throw|roll) becomes a success\b/i, ["failure", "success"]],
    [/\ba critical failure becomes a failure\b/i, ["criticalFailure", "failure"]],
    [/\bTreat your [\w ]*?(?:saving throw|save|check|roll) as if you failed (?:the check )?rather than critically failed\b/i, ["criticalFailure", "failure"]]
];
const RAISE_BONUS = /\b(?:You gain an? \+(\d+) (circumstance|status|item) bonus to (?:your|the) [\w ]*?(?:attack roll|check|save|saving throw)|Roll (\d+d\d+) and add the result to your [\w ]*?(?:check|save|attack roll|roll) as an? (circumstance|status|item) bonus)\b[^.]*\b(?:possibly turning|which might|might improve|could turn)\b/i;
const SKILL_NAMES = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery", "perception"];
export function readRaise(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    // (After the roll only: "You fail …", "You would miss …", "You succeed at …" — not "but you haven't rolled yet".)
    if (!/\b(?:fail|fails|failed|critically fail|succeed|succeeds|would miss|miss|roll a)\b/i.test(trigger) || /\bhaven't rolled\b/i.test(trigger)) return null;
    const effect = /\bEffect\b/.test(text) ? text.replace(/^[\s\S]*?\bEffect\b\s*/, "") : text;
    const change = {};
    for (const [pattern, [from, to]] of CHANGES) if (pattern.test(`Effect ${effect}`)) change[from] = to;
    const bonusMatch = RAISE_BONUS.exec(effect);
    const bonus = bonusMatch ? (bonusMatch[1] ? { value: Number(bonusMatch[1]), type: bonusMatch[2].toLowerCase() } : { formula: bonusMatch[3], type: bonusMatch[4].toLowerCase() }) : null;
    if (!Object.keys(change).length && !bonus) return null;
    const what = WHAT.find(([, pattern]) => pattern.test(trigger))?.[0] ?? (/\b(?:attack|miss)\b/i.test(trigger) ? "attack" : /\b(?:Request|Demoralize|Feint|Trip|Shove|Grapple)\b/.test(trigger) ? "check" : "roll");
    const save = what === "save" ? /\b(Fortitude|Reflex|Will)\b/i.exec(trigger)?.[1]?.toLowerCase() ?? null : null;
    const skills = what !== "save" ? SKILL_NAMES.filter((name) => new RegExp(String.raw`\b${name}\b`, "i").test(`${trigger} ${effect}`)) : [];
    const statistic = save ?? (skills.length === 1 ? skills[0] : skills.length ? skills : null);
    return { what: what === "roll" && skills.length ? "check" : what, keep: "new", who: "self", ...(statistic ? { statistic } : {}), raise: { ...(Object.keys(change).length ? { change } : {}), ...(bonus ? { bonus } : {}) } };
}

export function rerollPlan(html, base) {
    const reroll = readReroll(html) ?? readRaise(html);
    if (!reroll) return null;
    return { ...base, builtin: "reroll", automation: { level: "automatic" }, targeting: { target: reroll.who === "attacker" ? "the attacker" : reroll.who === "companion" ? "the creature targeted" : "self", range: null, area: null }, trigger: { event: "use" }, reroll };
}

// The plan to keep: the reroll over nothing, a note alone or the GM's fallback.
export const rerollOver = (plan, reroll) => (reroll && (!plan || plan.noteOnly || plan.builtin === "no-effect") ? reroll : plan);
