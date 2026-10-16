// An item that has its user roll their next roll of a kind twice, keeping the better (a fortune effect) — Sunweave's
// "Trigger You're about to attempt a Perception check for initiative Effect You roll the check twice and take the better
// result", Kinetic Wraps of Strength's "Trigger You attempt an Athletics check to Force Open, Reposition, or Shove Effect
// You roll the skill check twice and take the better result", Energy Shield Tunic's "Roll the triggering saving throw
// twice", Gorum's Tear's "you roll your next attack roll twice". The roll is the text's, or its trigger's. The plan is the
// item module's builtin "roll-twice": live play gives the user an Effect with PF2e's own RollTwice rule, which PF2e uses
// on that roll and removes after it (src/live/fortune-card.js). Pure.

const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const SAVES = { fortitude: "fortitude", reflex: "reflex", will: "will" };
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "You roll the check twice and take the better result", "roll Perception twice and use the higher result", "Roll the
// triggering saving throw twice", "you roll your next attack roll twice", "rolling the attack roll twice and taking the
// better result". Its user's own roll: not "The caster must roll …", "the creature must roll twice and take the worse".
const ROLL_TWICE = /(?:^|[.;]\s+|\bEffect\s+|,\s+)(?:(?:When you activate (?:it|the [\w' -]+?|this talisman),\s+)?[Yy]ou (?:can )?)?(?:R|r)oll(?:ing)? (?:the |your |that )?(?:next |triggering )?([\w ]{0,40}?) ?twice and (?:take|use|taking|using) the (better|higher|worse|lower) (?:result|roll)\b/;

// The roll a phrase names, or the trigger's: { selector, predicate } or null.
function rollOf(phrase, trigger) {
    const said = `${phrase ?? ""}`.toLowerCase().trim();
    // (A damage or healing roll rolled twice isn't a check PF2e's RollTwice takes.)
    if (/\b(?:damage|healing|hit points)\b/.test(said)) return null;
    const from = (text) => {
        const lower = String(text ?? "").toLowerCase();
        if (/\binitiative\b/.test(lower)) return { selector: "initiative" };
        if (/\battack roll|\bstrike\b|\battack\b/.test(lower)) return { selector: "attack-roll" };
        const save = /\b(fortitude|reflex|will)\b(?: save| saving throw)/.exec(lower);
        if (save) return { selector: SAVES[save[1]] };
        if (/\bsaving throw|\bsave\b/.test(lower)) return { selector: "saving-throw" };
        const skill = SKILLS.find((name) => new RegExp(String.raw`\b${name}\b`).test(lower));
        if (skill) return { selector: skill };
        if (/\bperception\b/.test(lower)) return { selector: "perception" };
        if (/\bskill check\b/.test(lower)) return { selector: "skill-check" };
        return null;
    };
    // (The text's own words first — "the skill check", "Perception" — narrowed by the trigger's: an initiative roll.)
    const own = said && !/^(?:the )?(?:check|roll|skill check|triggering (?:check|roll|saving throw))$/.test(said) ? from(said) : null;
    const triggered = from(trigger);
    const roll = own && triggered?.selector === "initiative" && own.selector === "perception" ? triggered : own ?? triggered;
    if (!roll) return null;
    // ("You attempt an Athletics check to Force Open, Reposition, or Shove": only for those actions.)
    const actions = /\bto ((?:[A-Z][\w']*(?: (?:a|an|the|of) [A-Z][\w']*| [A-Z][\w']*)*)(?:,? (?:or )?[A-Z][\w']*(?: (?:a|an|the|of) [A-Z][\w']*| [A-Z][\w']*)*)*)/.exec(String(trigger ?? ""));
    const names = actions ? actions[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((name) => name.trim()).filter(Boolean) : [];
    return { ...roll, ...(names.length && roll.selector !== "initiative" ? { predicate: [{ or: names.map((name) => `action:${slug(name)}`) }] } : {}) };
}

// The text's (an activation's block or a consumable's description, plain) fortune: { selector, keep, predicate?, notes } or null.
export function readRollTwice(text, { trigger = null } = {}) {
    const plain = String(text ?? "");
    const match = ROLL_TWICE.exec(plain);
    if (!match) return null;
    const keep = /better|higher/i.test(match[2]) ? "higher" : "lower";
    // (Only a fortune for its user: "lower" is someone else's misfortune, and needs its own target.)
    if (keep !== "higher") return null;
    const triggerText = trigger ?? /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/.exec(plain)?.[1] ?? null;
    const roll = rollOf(match[1], triggerText);
    if (!roll) return null;
    // (What else the text says: notes — "ignoring any circumstance penalties", "You then become Off-Guard …".)
    const effect = plain.slice(match.index + match[0].length);
    const notes = effect.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !/^\.?$/.test(sentence) && !/^(?:This is a fortune effect|\(this is a fortune effect\))\.?$/i.test(sentence) && !/^Craft Requirements\b/.test(sentence));
    return { ...roll, keep, notes: notes.map((note) => note.replace(/^[,.]\s*/, "")).filter(Boolean) };
}

// The builtin the item's card plays: { builtin: "roll-twice", rollTwice: { selector, keep, predicate? }, notes }.
export function rollTwicePlan(text, base, { trigger = null } = {}) {
    const read = readRollTwice(text, { trigger });
    if (!read) return null;
    const { notes, ...rollTwice } = read;
    return { ...base, builtin: "roll-twice", automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: "the user", range: null, area: null }, trigger: { event: "use" }, rollTwice, notes, ...(notes.length ? { partial: true } : {}) };
}

// The plan to keep: the fortune over nothing, a note alone or the GM's fallback.
export function rollTwiceOver(plan, fortune) {
    if (!fortune) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? fortune : plan;
}
