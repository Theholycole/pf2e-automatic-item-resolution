// A bonus an item gives its user for a moment — the roll that triggered it or the rest of the turn: Eclipse's "You gain a
// +2 status bonus to the Stealth check", Empathy Charm's "a +1 circumstance bonus against the triggering save",
// Shacklebreaker's "+2 circumstance bonus to your Fortitude DC against the triggering Grapple", Sparkwarden's "Until the
// end of the current turn, against the triggering effect, you gain a +1 status bonus to AC and saving throws and gain
// resistance 2 to damage", Scale of Igroon's "Until the start of your next turn, you gain a +4 item bonus to Stealth
// checks to Hide and Sneak". The plan is the item module's builtin "readied-bonus": live play gives the user an Effect
// with PF2e's own FlatModifier (and Resistance) rules for that long, and one for a single roll goes after that roll
// (src/live/fortune-card.js). Pure.

// A sentence that says a rule (a note), not flavor ("This green fulu depicts venomous creatures and vermin").
const RULE_SENTENCE = /\b(?:checks?|saves?|saving throws?|bonus|penalty|damage|conditions?|Strikes?|actions?|resistance|Speeds?|Hit Points|critical (?:success|failure)|failure|success|instead|increases?|DC)\b/i;

// The text's trigger: to its Requirements or Effect, or (a talisman's, with no "Effect" after it) to its sentence's end.
const triggerOf = (plain) => /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|\.(?=\s|$)|$)/s.exec(plain)?.[1] ?? null;

const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "You gain a +2 status bonus to …", "giving you a +4 status bonus to your AC and saves against the effect", "you gain a
// +1 circumstance bonus against the triggering save".
const GAIN = /\b(?:you gain|giving you|you get|granting you|grants? you|gaining) an? \+(\d+) (circumstance|status|item) bonus (to|against|on) ([^.]+?)(?=\.|$| and (?:gain|you) )/i;
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
const LASTING = /\bThe duration is\b|\bfor (?:\d+|one|a|an) (?:minutes?|hours?|days?|weeks?)\b|\bfor the next (?:\d+ )?(?:minutes?|hours?|days?)\b|\blasts? (?:for|until)\b|\buntil you (?:Activate|make your next daily preparations)\b|\b24 hours\b|\bdaily preparations\b/i;

// The text (plain) → { modifiers: [{ selector, type, value, predicate? }], resistance, duration, spend, notes } or null.
// spend: the selectors whose next roll ends it ("the Stealth check", "the triggering save", "your next skill action").
// trigger: the activation's trigger, when it has one.
export function readReadiedBonus(text, { trigger = null } = {}) {
    const plain = String(text ?? "");
    const triggered = trigger ?? triggerOf(plain);
    if ((triggered && AFTER_ROLL.test(triggered)) || TURNS_ROLL.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = GAIN.exec(sentence);
        if (!match) continue;
        // (Its user's own: not an ally's, an area's, nor under a condition of its own.)
        // ("When activated, …", "When you activate the coin, you gain …": the use itself, not a condition.)
        const own = sentence.replace(/^When (?:it's |it is )?(?:you )?activat\w*(?: (?:it|the [\w' -]+?))?,\s*/i, "");
        if (/\b(?:all(?:ies|y)|each creature|creatures? (?:in|within)|emanation|aura)\b/i.test(sentence) || /^(?:If|While|When|Whenever)\b/.test(own)) continue;
        const [, value, type, , words] = match;
        // ("the triggering check" alone: the trigger's rolls — Mask of Allure's "You attempt a Deception, Diplomacy, Intimidation,
        // or Performance check", Whisperer of Souls' "an Occultism check to Decipher Writing, … or Recall Knowledge".)
        const fromTrigger = !selectorsOf(words).length && /\bthe triggering (?:check|roll|skill check)\b/i.test(words) && triggered;
        const selectors = selectorsOf(fromTrigger ? triggered : words);
        if (!selectors.length) continue;
        // ("to Hide and Sneak", "to Trip the target", "checks made to Escape your grapple": only for those actions.)
        // (A name of several words too: "to Recall Knowledge", "to Make an Impression"; a list: "to Decipher Writing, Identify
        // Magic, Learn a Spell, or Recall Knowledge".)
        const NAME = String.raw`[A-Z][a-z']+(?: (?:a|an|the|of) [A-Z][a-z']+| [A-Z][a-z']+)*`;
        const actions = new RegExp(String.raw`\b(?:checks? )?(?:made )?to (${NAME}(?:(?:,|,? (?:and|or)) ${NAME})*)\b`).exec(fromTrigger ? triggered : words);
        const predicate = actions ? [{ or: actions[1].split(/,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/).map((name) => `action:${slug(name)}`) }] : null;
        const modifiers = selectors.map((selector) => ({ selector, type: type.toLowerCase(), value: Number(value), ...(predicate && !selector.endsWith("-dc") ? { predicate } : {}) }));
        const resist = RESIST.exec(sentence);
        // (One roll: "the Stealth check", "the triggering save", "your next skill action" — that roll ends it.)
        // ("your Fortitude save against the initial exposure": that one save too.)
        const single = /\b(?:the triggering|your next|the next|this|the|your) (?:[\w ]{0,20}?)(?:check|save|saving throw|roll|attack roll|skill action|action)\b/i.test(words) && !/\b(?:checks|saves|saving throws|rolls)\b/i.test(words);
        const spend = single ? selectors.filter((selector) => !selector.endsWith("-dc") && selector !== "ac") : [];
        // (A moment only, as above.)
        if (!(triggered || SHORT.test(sentence) || spend.length) || sentences.some((other) => LASTING.test(other))) return null;
        const notes = [
            ...(/\bagainst the (?:triggering|effect)\b|\bagainst (?:any )?(?:the )?(?:triggering )?[A-Z]\w+\b/.test(`${sentence}`) && !spend.length ? [`Only against what triggered it: ${sentence}`] : []),
            // (A bonus that says more: Conrasu Coin's "…, which increases to a +3 circumstance bonus to make-an-impression on a creature …".)
            ...(spend.length && /,? (?:which|but|unless|if)\b/i.test(words) ? [sentence] : []),
            // (Its other rule sentences, not its flavor nor its Usage, Activate or Trigger lines.)
            ...sentences.filter((_, at) => at !== index).filter((other) => !/^This is a fortune effect\.?$/i.test(other) && !/^(?:Usage|Activate|Trigger|Prerequisites?|Requirements?)\b/.test(other) && RULE_SENTENCE.test(other))
        ];
        return { modifiers, resistance: resist ? { type: "all-damage", value: Number(resist[1]) } : null, duration: durationOf(sentence), spend, notes };
    }
    // (Only an item used one way: Toadskin Salve's two reactions, Thrice-Fried Mudwings' meal and its reaction aren't one card.)
    return (plain.match(/\bActivate\b/g) ?? []).length <= 1 ? readResistMoment(sentences, triggered) : null;
}

// Resistance against the hit that triggered it, and nothing else: Deflecting Parry's "You gain resistance 5 to physical
// damage against the triggering Strike", Ferrofluid Urchin's "You gain resistance 3 to the triggering damage" (the
// trigger's type: "You take physical damage"), Third Blessing's "You gain resistance 3 against that spirit damage",
// Thrice-Fried Mudwings' "resistance 15 against physical damage for the triggering attack only". For the rest of the turn,
// with a note that it's only that hit's. Not a lasting one ("that lasts for 10 minutes"), nor another's ("grants the target").
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "holy", "unholy", "physical"];
const TYPE_WORDS = String.raw`(?:${DAMAGE_TYPES.join("|")})`;
const RESIST_MOMENT = new RegExp(String.raw`\b(?:you gain|granting you|gaining) resistance (\d+) (?:(?:to|against) (?:(${TYPE_WORDS}(?:(?:,|, and| and| or|, or) ${TYPE_WORDS})*) )?damage (?:against|for|from) (?:the triggering|that) (?:attack|Strike|hit|damage)(?: only)?|to the triggering damage(?: type)?|against that (${TYPE_WORDS}) damage)\b`, "i");
function readResistMoment(sentences, triggered) {
    if (!triggered) return null;
    for (const [index, sentence] of sentences.entries()) {
        const match = RESIST_MOMENT.exec(sentence);
        if (!match || /^(?:If|While|When|Whenever)\b/.test(sentence) || sentences.some((other) => LASTING.test(other))) continue;
        // (Its types: the sentence's, else the trigger's "You take physical damage", "mental, poison, or spirit damage" — one of
        // those, the one that hit — else all damage.)
        const named = match[2] ?? match[3] ?? null;
        const fromTrigger = new RegExp(String.raw`\b(${TYPE_WORDS}(?:(?:,|, and| and| or|, or) ${TYPE_WORDS})*) (?:damage|attack)\b`, "i").exec(triggered)?.[1] ?? null;
        const words = (named ?? fromTrigger ?? "").toLowerCase().split(/,? (?:and|or) |, /).map((word) => word.trim()).filter(Boolean);
        const type = !words.length ? "all-damage" : words.length === 1 ? words[0] : words;
        // (Its other rule sentences, not its flavor: "This spiky glob of magnetic liquid attaches …".)
        const notes = [`Only against what triggered it: ${sentence}`, ...sentences.filter((_, at) => at !== index).filter((other) => !/^(?:Activate|Trigger|Prerequisites?|Requirements?)\b/.test(other) && /\b(?:checks?|saves?|bonus|penalty|damage|conditions?|Strikes?|actions?|resistance|Speeds?|Hit Points)\b/i.test(other))];
        return { modifiers: [], resistance: { type, value: Number(match[1]) }, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], notes };
    }
    return null;
}

// A better degree for the one roll that triggered it (Singing Muse's "If you roll a success on your triggering check, you get
// a critical success instead"; Mesmerizing Opal's "… you get a failure instead" for a critical failure; "Your outcome is one
// degree of success better than what you rolled"): PF2e's AdjustDegreeOfSuccess, { selector, adjustment, predicate? },
// for the roll the text or its trigger names; spent by that roll. Not a lasting one ("during that time").
const UPGRADES = [
    [/\bIf (?:you roll|the (?:outcome|result) is) a success\b[^.]*?,\s*you get a critical success instead\b/i, { success: "one-degree-better" }],
    [/\bIf (?:you roll|the (?:outcome|result) is) a critical failure\b[^.]*?,\s*you get a failure instead\b/i, { criticalFailure: "one-degree-better" }],
    [/\b(?:your|the) outcome is one degree of success better than (?:what you rolled|you rolled|it would otherwise be)\b/i, { all: "one-degree-better" }],
    // (Robe of the Archmagi's "You automatically succeed at your save against the triggering arcane spell", before the roll.)
    [/^(?:Effect )?You automatically succeed at your (?:save|saving throw|[\w ]+? check)\b/i, { failure: "to-success", criticalFailure: "to-success" }]
];
export function readDegreeAdjust(text, { trigger = null } = {}) {
    const plain = String(text ?? "");
    const triggered = trigger ?? triggerOf(plain);
    if ((triggered && AFTER_ROLL.test(triggered)) || /\bduring (?:that|this) time\b/i.test(plain) || LASTING.test(plain)) return null;
    const adjustment = {};
    let named = "";
    const effect = plain.replace(/^.*?\bEffect\b\s*/s, "");
    for (const [pattern, change] of UPGRADES) {
        const match = pattern.exec(plain) ?? pattern.exec(effect);
        if (!match) continue;
        Object.assign(adjustment, change);
        named += ` ${match[0]}`;
    }
    if (!Object.keys(adjustment).length) return null;
    // (The roll: the sentence's own words, the trigger's, else "attempt a Deception check to Feint" in the text.)
    const attempt = /\battempt (?:an? )?([A-Z]\w+) check(?: to ((?:[A-Z][a-z']+)(?: (?:a|an|the|or) [A-Z][a-z']+| [A-Z][a-z']+)*))?/.exec(plain);
    const selectors = [named, triggered ?? "", attempt?.[0] ?? ""].map((words) => selectorsOf(words)).find((found) => found.length) ?? [];
    if (selectors.length !== 1) return null;
    const actions = /\bto ((?:[A-Z][a-z']+)(?: (?:a|an|the|or) [A-Z][a-z']+| [A-Z][a-z']+)*)\b/.exec(`${triggered ?? ""} ${attempt?.[0] ?? ""}`);
    const predicate = actions ? [{ or: actions[1].split(/\s+or\s+|,\s*/).map((name) => `action:${slug(name)}`) }] : null;
    return { selector: selectors[0], adjustment, ...(predicate ? { predicate } : {}) };
}

// The builtin: { builtin: "readied-bonus", bonus: { modifiers, resistance, duration, spend, degree? }, notes }.
export function readiedBonusPlan(text, base, { trigger = null } = {}) {
    const degree = readDegreeAdjust(text, { trigger });
    const read = readReadiedBonus(text, { trigger }) ?? (degree ? { modifiers: [], resistance: null, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [degree.selector], notes: degreeNotes(text) } : null);
    if (!read) return null;
    if (degree) read.degree = degree;
    const { notes, ...bonus } = read;
    return { ...base, builtin: "readied-bonus", automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: "the user", range: null, area: null }, trigger: { event: "use" }, bonus, notes, ...(notes.length ? { partial: true } : {}) };
}

// The plan to keep: the bonus over nothing, a note alone or the GM's fallback.
export function readiedBonusOver(plan, bonus) {
    if (!bonus) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? bonus : plan;
}

// What a degree's change alone leaves to the table: the text's other rule sentences.
function degreeNotes(text) {
    const body = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    return body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !UPGRADES.some(([pattern]) => pattern.test(sentence)) && /\b(?:check|save|bonus|penalty|damage|condition|Strike|action)\b/i.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?)\b/.test(sentence));
}

