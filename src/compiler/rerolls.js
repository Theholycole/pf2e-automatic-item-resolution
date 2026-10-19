// An item that rerolls the roll that triggered it (Lucky Rabbit's Foot's "reroll the triggering Reflex save", Starfaring
// Cloak's "Reroll the triggering roll and take the higher result", Mail of Luck's "You force the attacker to reroll the
// attack roll and use the worse result"): a builtin the item module plays with PF2e's own reroll (scripts/rerolls.js).
// One with a bonus on the reroll (Redsand Hourglass's "+4 circumstance bonus") is rolled by the card itself, since PF2e's
// reroll keeps the roll's modifiers. Not one another creature rerolls (an ally, allies) other than a companion the
// presser targets, one behind a Mythic Point, or a choice of results the module can't make. One behind a coin flip has the card flip it first
// (plan.reroll.coin). Pure.

import { plainText } from "./rows.js";

// (Its object named: "reroll the triggering Reflex save", "reroll your saving throw", "reroll a single failed saving
// throw" — not a table's "Reroll two results", "10 = reroll".)
const SENTENCE = /[^.]*\breroll(?:s|ing)?\s+(?:the|your|that|this|a single|their)\b[^.]*\./i;
// "Flip the coin. If it lands on the smiling face, …" → its winning side.
const COIN = /\bFlip the coin\.\s*If it lands on the ([\w' -]+? (?:side|face)),/i;
// (A damage roll too, Mythic Striking's "reroll your weapon damage dice": the card's own reroll, scripts/rerolls.js.)
const WHAT = [["damage", /\bdamage (?:dice|roll)\b/i], ["save", /\b(?:saving throw|save)\b/i], ["attack", /\b(?:attack roll|Strike)\b/i], ["check", /\bcheck\b/i], ["roll", /\broll\b/i]];

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
    // (Or at mythic proficiency, Mythic Weapon Potency's "reroll your attack roll with mythic proficiency": the card's own d20, its
    // proficiency its user's level + 10 instead of the roll's.)
    const bonus = bonusMatch ? { value: Number(bonusMatch[1]), type: (bonusMatch[2] ?? "untyped").toLowerCase() } : /\bwith mythic proficiency\b/i.test(sentence) ? { mythic: true, type: "proficiency" } : null;
    // (Behind a coin flip, Lucky Silver's "Flip the coin. If it lands on the smiling face, reroll the triggering check": the card flips it
    // first, plan.reroll.coin.)
    const coin = COIN.exec(effect.slice(0, match.index + sentence.length));
    // (One behind a Mythic Point is read: its cost is plan.spend, src/compiler/spend.js.)
    if (/\bflat check\b/i.test(effect.slice(0, match.index + sentence.length)) || (!coin && /\bIf it lands on\b/i.test(effect.slice(0, match.index + sentence.length)))) return null;
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
    const named = WHAT.find(([, pattern]) => pattern.test(object.split(/\b(?:and|,)\b/)[0]))?.[0] ?? "roll";
    // ("the triggering check" for a trigger of "a skill check or a saving throw", Lucky Silver's: either roll.)
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    const what = named === "check" && /\bcheck\b/i.test(trigger) && /\bsaving throw\b/i.test(trigger) ? "roll" : named;
    // ("you must take the second result, even if it's worse": the new one.)
    const keep = /\b(?:take|use|keep|using|taking|takes|uses) the (?:better|higher)\b/i.test(sentence) ? "higher" : /\b(?:take|use|keep|using|taking|takes|uses) the (?:worse|lower)\b/i.test(sentence) ? "lower" : "new";
    // (Only what follows from the reroll: "If you fail the second roll as well, you can Stride up to your Speed.")
    const next = effect.slice(match.index + sentence.length).split(/(?<=[.!?])\s+(?=[A-Z])/).map((line) => line.trim()).find(Boolean) ?? "";
    const after = /^If\b/.test(next) ? next : "";
    // (A named save: "reroll the triggering Reflex save" — PF2e's check domains say which.)
    const statistic = what === "save" ? /\b(Fortitude|Reflex|Will)\b/i.exec(object)?.[1]?.toLowerCase() ?? null : null;
    return { what, keep, who: attacker ? "attacker" : companion ? "companion" : "self", ...(statistic ? { statistic } : {}), ...(bonus ? { bonus } : {}), ...(after ? { after } : {}), ...(coin ? { coin: { win: coin[1] } } : {}) };
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
    [/\bTreat your [\w ]*?(?:saving throw|save|check|roll) as if you failed (?:the check )?rather than critically failed\b/i, ["criticalFailure", "failure"]],
    // (Laurel of the Empath's "Treat the failed saving throw as a success"; The Paladin's "Adjust the result of your saving throw up
    // by one degree of success" — each degree one better.)
    [/\bTreat the failed (?:saving throw|save|check|roll) as a success\b/i, ["failure", "success"]],
    // (Pilferer's Gloves' "If you failed the Thievery skill check, you succeed at that check instead. If you critically failed, you fail
    // instead.")
    [/\bIf you failed the [\w ]*?(?:check|save|saving throw|roll), you succeed at (?:that|the) (?:check|save|saving throw|roll) instead\b/i, ["failure", "success"]],
    [/\bIf you critically failed, you fail instead\b/i, ["criticalFailure", "failure"]],
    [/\bAdjust the result of your [\w ]*?(?:saving throw|save|check|roll) up by one degree of success\b/i, ["criticalFailure", "failure"]],
    [/\bAdjust the result of your [\w ]*?(?:saving throw|save|check|roll) up by one degree of success\b/i, ["failure", "success"]],
    [/\bAdjust the result of your [\w ]*?(?:saving throw|save|check|roll) up by one degree of success\b/i, ["success", "criticalSuccess"]],
    // (The Lost's "Increase the result of your failed saving throw by one degree of success": each failed degree one better.)
    [/\bIncrease the result of your failed (?:saving throw|save|check|roll) by one degree of success\b/i, ["criticalFailure", "failure"]],
    [/\bIncrease the result of your failed (?:saving throw|save|check|roll) by one degree of success\b/i, ["failure", "success"]]
];
const RAISE_BONUS = /\b(?:You gain an? \+(\d+) (circumstance|status|item) bonus to (?:your|the) [\w ]*?(?:attack roll|check|save|saving throw)|Roll (\d+d\d+) and add the result to your [\w ]*?(?:check|save|attack roll|roll) as an? (circumstance|status|item) bonus)\b[^.]*\b(?:possibly turning|which might|might improve|could turn)\b/i;
const SKILL_NAMES = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery", "perception"];
// (Or its d20 set, behind a coin flip: Fortune's Coin's "Flip the coin. If it lands on the seraph side, you get a 12 on the die instead of
// what you rolled" → raise.die 12, coin.)
const SET_DIE = /\bFlip the (?:\[\[\/r 1dc[^\]]*\]\]\{)?coin\}?\.\s*If it lands on the ([\w' -]+? (?:side|face)), you get an? (\d+) on the die instead of what you rolled\./i;
export function readRaise(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const setDie = SET_DIE.exec(String(html ?? "").replace(/<[^>]+>/g, " ")) ?? SET_DIE.exec(text);
    if (setDie) {
        const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
        const what = /\battack\b/i.test(trigger) && !/\bcheck\b/i.test(trigger) ? "attack" : /\bsav(?:e|ing throw)\b/i.test(trigger) && !/\bcheck\b/i.test(trigger) ? "save" : "roll";
        return { what, keep: "new", who: "self", raise: { die: Number(setDie[2]) }, coin: { win: setDie[1] } };
    }
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

// A bonus to its user's AC against an attack roll already made, Animal-Turning Fulu's "Trigger A creature with the animal trait
// successfully Strikes you … gaining a +2 item bonus to AC against the triggering Strike. If this causes the Strike to miss, …": the
// latest attack roll at the user, its degree again against that much higher an AC (the card works it out, the GM uses it). What else
// it says on a miss is a note. → { what: "attack", keep: "new", who: "attacker", raise: { ac: { value, type } }, after? }.
const STRUCK = /\b(?:successfully Strikes you|would be hit by an attack|(?:hits|critically hits) you)\b/i;
const AC_AGAINST = /\b(?:gaining|you gain|gain) an? \+(\d+) (circumstance|status|item) bonus to (?:your )?AC against the triggering (?:Strike|attack)\b/i;
export function readArmorRaise(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|\.\s|$)/s.exec(text)?.[1] ?? "";
    const bonus = AC_AGAINST.exec(text);
    if (!STRUCK.test(trigger) || !bonus) return null;
    const after = text.slice(bonus.index).split(/(?<=[.!?])\s+(?=[A-Z])/).slice(1).find((sentence) => /^If this causes the (?:Strike|attack) to miss\b/i.test(sentence.trim()));
    return { what: "attack", keep: "new", who: "attacker", raise: { ac: { value: Number(bonus[1]), type: bonus[2].toLowerCase() } }, ...(after ? { after: after.trim() } : {}) };
}

// A save that automatically succeeds, its user's or an ally's, said before it's rolled: Robe of the Archmagi's "Trigger You or an ally within 30
// feet attempts a saving throw against an arcane spell, but you haven't rolled yet Effect You or the ally automatically succeed at your save"
// — the card turns that save's failure or critical failure into a success once it's rolled (who "either": the creature targeted, else its
// user).
// (Its user's own, "You automatically succeed at your save", is PF2e's AdjustDegreeOfSuccess before the roll, src/compiler/readied-bonus.js.)
const AUTO_SUCCEED = /\bYou or the ally automatically succeed at (?:your|the) sav(?:e|ing throw)\b/i;
export function readAutoSuccess(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    if (!AUTO_SUCCEED.test(text) || !/\bsaving throw\b/i.test(trigger)) return null;
    return { what: "save", keep: "new", who: "either", raise: { change: { failure: "success", criticalFailure: "success" } } };
}

// Its user's save against the attack roll that hit, The Demon's Lantern's "attempt a Reflex saving throw. If your saving throw is higher
// than the attack roll for the triggering attack, it misses. If the attack misses, the attacker is Dazzled until the end of your next turn":
// the card rolls that save and compares it with the latest attack roll at its user; higher, the attack misses (for the GM) and the
// attacker gets what a miss gives. → { what: "attack", who: "attacker", keep: "new", contest: { statistic }, onMiss? { slug, duration } }.
const CONTEST = /\battempt an? (Reflex|Fortitude|Will) saving throw\. If your saving throw is higher than the attack roll for the triggering attack, it misses\./i;
const ON_MISS = /\bIf the attack misses, the attacker is (Dazzled|Frightened 1|Off-Guard|Sickened 1) until the end of your next turn\./i;
export function readContest(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    const contest = CONTEST.exec(text);
    if (!contest || !/\bhits you\b/i.test(trigger)) return null;
    const miss = ON_MISS.exec(text);
    const [slug, value] = miss ? miss[1].toLowerCase().split(" ") : [];
    return { what: "attack", who: "attacker", keep: "new", contest: { statistic: contest[1].toLowerCase() }, ...(miss ? { onMiss: { slug, value: value ? Number(value) : null, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } } } : {}) };
}

// (Or a DC 5 flat check, the user Concealed against the attack: Phantom Fang's "causing you to become Concealed against the triggering attack"
// — failed, the attack misses.)
const CONCEALED_AGAINST = /\b(?:you )?become Concealed against the triggering (?:attack|Strike)\b/i;
// (Or its user's own flat check against a concealed or hidden creature they attack, rolled twice, Eye of Fortune's "You can roll the flat check
// for the concealed or hidden condition twice and use the higher result": the card rolls it, DC 5 or 11 by the target's condition — PF2e
// doesn't roll it.)
const FLAT_TWICE = /\broll the flat check for the concealed or hidden condition twice and use the (?:higher|better) result\b/i;
export function readConcealedAgainst(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    if (FLAT_TWICE.test(text)) return { what: "attack", who: "self", keep: "higher", contest: { flat: "target", twice: true } };
    if (!CONCEALED_AGAINST.test(text) || !/\b(?:targeted by|hits you|attacks you)\b/i.test(trigger)) return null;
    return { what: "attack", who: "attacker", keep: "new", contest: { flat: 5 } };
}

// Other rolls of the attack and save that triggered it, said without "reroll": Keep Stone Amulet's "The caster must roll the spell attack
// roll twice and take the worse result" (the caster's spell attack at its user, rerolled and the worse kept — rolling twice is that);
// Scapular of Shields' "You take normal damage from the triggering attack as if the attack were a normal hit instead" (a critical hit at its
// user a hit); Extra Lung's "immediately attempting a new save against the effect" (its user's latest save, rerolled).
const ROLL_TWICE = /\bThe (?:caster|attacker) must roll the (spell attack roll|attack roll) twice and take the (worse|lower|better|higher) result\b/i;
const NORMAL_HIT = /\bYou take normal damage from the triggering attack as if the attack were a normal hit instead\b/i;
const NEW_SAVE = /\bimmediately attempting a new save against the effect\b/i;
// (And degrees changed on another creature's roll: Crimson Bluff's "The triggering Strike uses the outcome for one degree of success worse than
// the result of the attack roll", Golden Greaves' "Your opponent instead critically fails on the triggering check" for a Shove, Trip or
// Reposition at its user, Tome of Dripping Shadows' "The triggering creature's saving throw result is a failure, not a critical failure" — the
// creature its user targets; what follows it, for the card.)
const ONE_WORSE = /\bThe triggering Strike uses the outcome for one degree of success worse than the result of the attack roll\b/i;
const OPPONENT_CRIT_FAILS = /\bYour opponent instead critically fails on the triggering check\b/i;
const TARGET_SAVE_FAILURE = /\bThe triggering creature's saving throw result is a failure, not a critical failure\./i;
export function readOtherRoll(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const trigger = /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "";
    if (ONE_WORSE.test(text)) return { what: "attack", who: "attacker", keep: "new", raise: { change: { criticalSuccess: "success", success: "failure", failure: "criticalFailure" } } };
    if (OPPONENT_CRIT_FAILS.test(text) && /\bfails to (?:Reposition|Shove|Trip|Grapple|Disarm)\b/i.test(trigger)) return { what: "check", who: "attacker", keep: "new", raise: { change: { failure: "criticalFailure" } } };
    const target = TARGET_SAVE_FAILURE.exec(text);
    if (target) {
        const after = text.slice(target.index + target[0].length).trim().split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(" ");
        return { what: "save", who: "target", keep: "new", raise: { change: { criticalFailure: "failure" } }, ...(after ? { after } : {}) };
    }
    const twice = ROLL_TWICE.exec(text);
    if (twice) return { what: /spell/i.test(twice[1]) ? "spellAttack" : "attack", who: "attacker", keep: /worse|lower/i.test(twice[2]) ? "lower" : "higher" };
    if (NORMAL_HIT.test(text) && /\bcritically hit\b/i.test(trigger)) return { what: "attack", who: "attacker", keep: "new", raise: { change: { criticalSuccess: "success" } } };
    if (NEW_SAVE.test(text)) return { what: "save", who: "self", keep: "new" };
    return null;
}

// A degree change that depends on whether the source is mythic, Mythic Resilient's "if the triggering save was made due to an effect created
// by a mythic monster, hazard, or other effect, it's a normal failure instead. If … wasn't mythic, it becomes a success" and Mythic Armor
// Potency's critical hit at its user "a normal success" from a mythic creature, "a failure" from another: the ways card's two buttons (the
// user's answer of 2026-10-19), each way its reroll card's change.
const MYTHIC_SAVE = /\bif the triggering save was made due to an effect created by a mythic [^.]*?, it's a normal failure instead\. If the save was made due to an effect that wasn't mythic, it becomes a success\./i;
const MYTHIC_STRIKE = /\bif the triggering Strike was made by a mythic creature, it's a normal success instead\. If it was made by a non-mythic creature, it's a failure\./i;
export function mythicWaysPlan(html, base) {
    const text = plainText(html);
    const save = MYTHIC_SAVE.test(text);
    if (!save && !MYTHIC_STRIKE.test(text)) return null;
    const way = (name, reroll) => ({ name, html: String(html ?? ""), plan: rerollPlanOf(reroll, base) });
    const ways = save
        ? [way("Against a mythic effect", { what: "save", who: "self", keep: "new", raise: { change: { criticalFailure: "failure" } } }), way("Against any other effect", { what: "save", who: "self", keep: "new", raise: { change: { criticalFailure: "success" } } })]
        : [way("A mythic creature's Strike", { what: "attack", who: "attacker", keep: "new", raise: { change: { criticalSuccess: "success" } } }), way("Any other creature's Strike", { what: "attack", who: "attacker", keep: "new", raise: { change: { criticalSuccess: "failure" } } })];
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, once: true };
}

export function rerollPlan(html, base) {
    const reroll = readReroll(html) ?? readRaise(html) ?? readArmorRaise(html) ?? readAutoSuccess(html) ?? readContest(html) ?? readConcealedAgainst(html) ?? readOtherRoll(html);
    return reroll ? rerollPlanOf(reroll, base) : null;
}

function rerollPlanOf(reroll, base) {
    return { ...base, builtin: "reroll", automation: { level: "automatic" }, targeting: { target: reroll.who === "attacker" ? "the attacker" : reroll.who === "companion" || reroll.who === "target" ? "the creature targeted" : reroll.who === "either" ? "its user or the creature targeted" : "self", range: null, area: null }, trigger: { event: "use" }, reroll };
}

// The plan to keep: the reroll over nothing, a note alone or the GM's fallback.
export const rerollOver = (plan, reroll) => (reroll && (!plan || plan.noteOnly || plan.builtin === "no-effect") ? reroll : plan);
