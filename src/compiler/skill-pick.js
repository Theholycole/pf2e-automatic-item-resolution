// A skill its user picked when the item was made, named in its text — Words of Wisdom's "When the tattoo is applied, choose
// whether the phrase is of threatening words (Intimidation), persuasive words (Deception), or dramatic words (Performance)" —
// for its activation's "you gain a +1 item bonus to Diplomacy checks and checks of the skill associated with your phrase": the
// card's picker of those skills (plan.item.skillPick), the bonus the activation gives Diplomacy also given to the one picked, and
// "When you roll a critical failure on a Diplomacy check or the associated skill during this time, you get a failure instead"
// PF2e's AdjustDegreeOfSuccess on both, for the activation's time. Pure.

const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const CHOICE = /\bchoose whether the phrase is of ([^.]+)\./i;
const ASSOCIATED = /\bchecks of the skill associated with your phrase\b/i;
const DEGREE = /\bWhen you roll a critical failure on an? (\w+) check or the associated skill during this time, you get a failure instead\b/i;

// (Or any skill, chosen with the item's bargain, Stone of Unrivaled Skill's "For the next 10 minutes, you gain a +3 status bonus to skill checks
// using the skill you chose for your contract": the card's picker of every skill, its bonus and time from those words.)
const CONTRACT = /\bFor the next (\d+) (minutes?|rounds?|hours?), you gain an? \+(\d+) (status|item|circumstance) bonus to skill checks using the skill you chose for your [\w ]+?\./i;

// The item's text and its activation's (plain), and the activation's plan → { skills, modifier, duration, degree? } or null.
export function skillPickOf(itemText, activationText, plan) {
    const contract = CONTRACT.exec(String(activationText ?? ""));
    if (contract) return { skills: [...SKILLS], modifier: { value: Number(contract[3]), type: contract[4].toLowerCase() }, duration: { mode: "fixed", value: Number(contract[1]), unit: contract[2].toLowerCase().replace(/s?$/, "s"), expiry: "turn-start" }, any: true };
    const choice = CHOICE.exec(String(itemText ?? ""));
    if (!choice || !ASSOCIATED.test(String(activationText ?? ""))) return null;
    const skills = [...choice[1].matchAll(/\((\w+)\)/g)].map((match) => match[1].toLowerCase()).filter((skill) => SKILLS.includes(skill));
    const [base] = plan?.resolution?.outcomes?.success?.modifiers ?? [];
    if (skills.length < 2 || !base || !SKILLS.includes(base.selector)) return null;
    const degree = DEGREE.exec(String(activationText ?? ""));
    return { skills, modifier: { value: base.value, type: base.type }, duration: base.duration ?? null, ...(degree && SKILLS.includes(degree[1].toLowerCase()) ? { degree: { selectors: [degree[1].toLowerCase()], adjustment: { criticalFailure: "one-degree-better" } } } : {}) };
}

// The sentences it reads, off the plan's unread list.
export const pickedSentence = (sentence) => ASSOCIATED.test(sentence) || DEGREE.test(sentence) || CONTRACT.test(sentence);

// Its Effect's rules for the skill picked: the bonus on that skill, the better degree on it and on the activation's own skill.
// (Only for one action, Possibility Tome's Recall Knowledge: pick.predicate on each rule; "lore", one of its user's Lores — PF2e's lore-skill-check,
// every Lore of its user's, the card's line saying which one counts — 2026-10-27.)
const selectorOf = (skill) => (skill === "lore" ? "lore-skill-check" : skill);
export function skillPickRules(pick, index = 0, label = null) {
    const skill = pick.skills[index] ?? pick.skills[0];
    const only = pick.predicate?.length ? { predicate: [...pick.predicate] } : {};
    return [
        { key: "FlatModifier", selector: selectorOf(skill), type: pick.modifier.type, value: pick.modifier.value, ...only, ...(label ? { label } : {}) },
        ...(pick.degree ? [...pick.degree.selectors, skill].map((selector) => ({ key: "AdjustDegreeOfSuccess", selector: selectorOf(selector), adjustment: pick.degree.adjustment, ...only, ...(label ? { label } : {}) })) : [])
    ];
}

// (Possibility Tome's Skim, "Choose one skill: Arcana, Crafting, Medicine, Nature, Occultism, Religion, Society, or a single subcategory of Lore … you can
// spend an Interact action perusing the book just before attempting a check to Recall Knowledge with the chosen skill …" — its +3 item bonus there,
// a critical failure on it a failure — the skills listed and "lore", the bonus and the better degree only to Recall
// Knowledge, for the 24 hours: { skills, modifier, duration, predicate, only, degree } or null. 2026-10-27.)
const LISTED = /^Choose one skill: ((?:[A-Z][a-z]+, )+)or a single subcategory of Lore\.$/;
const PERUSE = /^While the pages are full, you can spend an Interact action perusing the book just before attempting a check to (Recall Knowledge) with the chosen skill\.$/i;
// (\s+ where the text has one space: the same match, in words of its own — 2026-10-27.)
const GRANTS = /^This grants you an? \+(\d+) (item|status|circumstance) bonus to the\s+check, and if you roll a critical failure, you get a failure instead\.$/i;
const GONE = /^The information within the book disappears after (\d+) (hours?|minutes?) or when the tome is activated again\.$/i;
export function listedSkillPick(sentences) {
    const at = sentences.findIndex((sentence) => LISTED.test(sentence));
    if (at < 0) return null;
    const [peruse, grants, gone] = [sentences.find((sentence) => PERUSE.test(sentence)), sentences.find((sentence) => GRANTS.test(sentence)), sentences.find((sentence) => GONE.test(sentence))];
    if (!peruse || !grants || !gone) return null;
    const skills = LISTED.exec(sentences[at])[1].split(/,\s*/).filter(Boolean).map((skill) => skill.toLowerCase());
    if (!skills.every((skill) => SKILLS.includes(skill))) return null;
    const [, value, type] = GRANTS.exec(grants);
    const [, time, unit] = GONE.exec(gone);
    const action = PERUSE.exec(peruse)[1];
    return { skills: [...skills, "lore"], modifier: { value: Number(value), type: type.toLowerCase() }, duration: { mode: "fixed", value: Number(time), unit: unit.toLowerCase().replace(/s?$/, "s"), expiry: "turn-start" }, predicate: [`action:${action.toLowerCase().replace(/\s+/g, "-")}`], only: action, degree: { selectors: [], adjustment: { criticalFailure: "one-degree-better" } }, said: [sentences[at], peruse, grants, gone] };
}
