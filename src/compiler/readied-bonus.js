// A bonus an item gives its user for a moment — the roll that triggered it or the rest of the turn: Eclipse's "You gain a
// +2 status bonus to the Stealth check", Empathy Charm's "a +1 circumstance bonus against the triggering save",
// Shacklebreaker's "+2 circumstance bonus to your Fortitude DC against the triggering Grapple", Sparkwarden's "Until the
// end of the current turn, against the triggering effect, you gain a +1 status bonus to AC and saving throws and gain
// resistance 2 to damage", Scale of Igroon's "Until the start of your next turn, you gain a +4 item bonus to Stealth
// checks to Hide and Sneak". The plan is the item module's builtin "readied-bonus": live play gives the user an Effect
// with PF2e's own FlatModifier (and Resistance) rules for that long, and one for a single roll goes after that roll
// (src/live/fortune-card.js). Pure.

const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "You gain a +2 status bonus to …", "giving you a +4 status bonus to your AC and saves against the effect", "you gain a
// +1 circumstance bonus against the triggering save".
const GAIN = /\b(?:you gain|giving you|you get|granting you|gaining) an? \+(\d+) (circumstance|status|item) bonus (to|against|on) ([^.]+?)(?=\.|$| and (?:gain|you) )/i;
const RESIST = /\b(?:and )?(?:gain )?resistance (\d+) to (?:all )?damage\b/i;

// The selectors for the words a bonus names: "AC and saving throws" → ac, saving-throw; "your Fortitude DC" → fortitude-dc;
// "Stealth checks to Hide and Sneak" → stealth, for those actions; "the triggering save" → saving-throw.
function selectorsOf(words) {
    const lower = words.toLowerCase();
    const selectors = [];
    const dc = /\b(fortitude|reflex|will|perception|athletics|acrobatics|deception|diplomacy|intimidation|stealth)\s+dc\b/.exec(lower);
    if (dc) selectors.push(`${dc[1]}-dc`);
    if (/\bac\b|armor class/.test(lower)) selectors.push("ac");
    const save = /\b(fortitude|reflex|will)\s+(?:saves?|saving throws?)\b/.exec(lower);
    if (save) selectors.push(save[1]);
    else if (/\b(?:saves|saving throws?|save)\b/.test(lower)) selectors.push("saving-throw");
    if (/\battack rolls?\b/.test(lower)) selectors.push("attack-roll");
    if (/\binitiative\b/.test(lower)) selectors.push("initiative");
    else if (/\bperception\b/.test(lower) && !dc) selectors.push("perception");
    if (!dc) for (const skill of SKILLS) if (new RegExp(String.raw`\b${skill}\b`).test(lower)) selectors.push(skill);
    if (/\bskill (?:checks?|actions?)\b/.test(lower)) selectors.push("skill-check");
    return [...new Set(selectors)];
}

// How long: "until the end of the current turn" / "this turn" (the default), "until the start of your next turn",
// "until the end of your next turn", "for 1 minute".
function durationOf(text) {
    if (/\buntil the (?:start|beginning) of your next turn\b/i.test(text)) return { value: 1, unit: "rounds", expiry: "turn-start" };
    if (/\buntil the end of your next turn\b/i.test(text)) return { value: 1, unit: "rounds", expiry: "turn-end" };
    const minutes = /\bfor (\d+|one|a) minutes?\b/i.exec(text);
    if (minutes) return { value: Number(minutes[1]) || 1, unit: "minutes", expiry: "turn-start" };
    return { value: 0, unit: "rounds", expiry: "turn-end" };
}

// A moment's bonus only: a trigger before the roll, a short time in its sentence, or one roll. Not after the roll ("You
// would miss with an attack": the roll's already made), nor a lasting one ("The duration is 1 hour", "for 10 minutes",
// "until you Activate the item again").
const SHORT = /\buntil the (?:end|start|beginning) of (?:the current|your|your next) turn\b|\bthis turn\b/i;
const AFTER_ROLL = /\bwould (?:miss|fail|be hit|be critically hit)\b|\byou (?:miss|fail|critically fail|roll a (?:critical )?failure)\b|\bfailed\b|\b(?:successfully Strikes|hits|critically hits|damages) you\b/i;
// (A bonus that might turn the roll already made: \"If this causes the Strike to miss\", \"possibly turning a miss into a hit\".)
const TURNS_ROLL = /\bIf this causes\b[^.]*\bto (?:miss|hit|succeed|fail)\b|\bturning a miss into a hit\b|\bmight improve\b/i;
const LASTING = /\bThe duration is\b|\bfor (?:\d+|one|a|an) (?:minutes?|hours?|days?|weeks?)\b|\blasts? (?:for|until)\b|\buntil you (?:Activate|make your next daily preparations)\b|\b24 hours\b|\bdaily preparations\b/i;

// The text (plain) → { modifiers: [{ selector, type, value, predicate? }], resistance, duration, spend, notes } or null.
// spend: the selectors whose next roll ends it ("the Stealth check", "the triggering save", "your next skill action").
// trigger: the activation's trigger, when it has one.
export function readReadiedBonus(text, { trigger = null } = {}) {
    const plain = String(text ?? "");
    const triggered = trigger ?? /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(plain)?.[1] ?? null;
    if ((triggered && AFTER_ROLL.test(triggered)) || TURNS_ROLL.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = GAIN.exec(sentence);
        if (!match) continue;
        // (Its user's own: not an ally's, an area's, nor under a condition of its own.)
        if (/\b(?:all(?:ies|y)|each creature|creatures? (?:in|within)|emanation|aura)\b/i.test(sentence) || /^(?:If|While|When|Whenever)\b/.test(sentence)) continue;
        const [, value, type, , words] = match;
        const selectors = selectorsOf(words);
        if (!selectors.length) continue;
        // ("to Hide and Sneak", "to Trip the target", "checks made to Escape your grapple": only for those actions.)
        const actions = /\b(?:checks? )?(?:made )?to ((?:[A-Z][a-z']+)(?: (?:and|or) [A-Z][a-z']+)*)\b/.exec(words);
        const predicate = actions ? [{ or: actions[1].split(/\s+(?:and|or)\s+/).map((name) => `action:${slug(name)}`) }] : null;
        const modifiers = selectors.map((selector) => ({ selector, type: type.toLowerCase(), value: Number(value), ...(predicate && !selector.endsWith("-dc") ? { predicate } : {}) }));
        const resist = RESIST.exec(sentence);
        // (One roll: "the Stealth check", "the triggering save", "your next skill action" — that roll ends it.)
        const single = /\b(?:the triggering|your next|the next|this|the) (?:[\w ]{0,20}?)(?:check|save|saving throw|roll|attack roll|skill action|action)\b/i.test(words) && !/\b(?:checks|saves|saving throws|rolls)\b/i.test(words);
        const spend = single ? selectors.filter((selector) => !selector.endsWith("-dc") && selector !== "ac") : [];
        // (A moment only, as above.)
        if (!(triggered || SHORT.test(sentence) || spend.length) || sentences.some((other) => LASTING.test(other))) return null;
        const notes = [
            ...(/\bagainst the (?:triggering|effect)\b|\bagainst (?:any )?(?:the )?(?:triggering )?[A-Z]\w+\b/.test(`${sentence}`) && !spend.length ? [`Only against what triggered it: ${sentence}`] : []),
            ...sentences.filter((_, at) => at !== index).filter((other) => !/^This is a fortune effect\.?$/i.test(other) && !/^Activate\b/.test(other))
        ];
        return { modifiers, resistance: resist ? { type: "all-damage", value: Number(resist[1]) } : null, duration: durationOf(sentence), spend, notes };
    }
    return null;
}

// The builtin: { builtin: "readied-bonus", bonus: { modifiers, resistance, duration, spend }, notes }.
export function readiedBonusPlan(text, base, { trigger = null } = {}) {
    const read = readReadiedBonus(text, { trigger });
    if (!read) return null;
    const { notes, ...bonus } = read;
    return { ...base, builtin: "readied-bonus", automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: "the user", range: null, area: null }, trigger: { event: "use" }, bonus, notes, ...(notes.length ? { partial: true } : {}) };
}

// The plan to keep: the bonus over nothing, a note alone or the GM's fallback.
export function readiedBonusOver(plan, bonus) {
    if (!bonus) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? bonus : plan;
}
