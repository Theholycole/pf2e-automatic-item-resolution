// A bonus an item gives its user for a moment — the roll that triggered it or the rest of the turn: Eclipse's "You gain a
// +2 status bonus to the Stealth check", Empathy Charm's "a +1 circumstance bonus against the triggering save",
// Shacklebreaker's "+2 circumstance bonus to your Fortitude DC against the triggering Grapple", Sparkwarden's "Until the
// end of the current turn, against the triggering effect, you gain a +1 status bonus to AC and saving throws and gain
// resistance 2 to damage", Scale of Igroon's "Until the start of your next turn, you gain a +4 item bonus to Stealth
// checks to Hide and Sneak". The plan is the item module's builtin "readied-bonus": live play gives the user an Effect
// with PF2e's own FlatModifier (and Resistance) rules for that long, and one for a single roll goes after that roll
// (src/live/fortune-card.js). Pure.

// A sentence that says a rule (a note), not flavor ("This green fulu depicts venomous creatures and vermin").
// (And what a miss does, Bismuth Armor's "If the attack misses, … who becomes Dazzled for 1 round".)
// (And a move, a Hardness, a flat check, what ends it or can't be done — Skitter Knot's "The roots carry you up to 15 feet and have Hardness 10",
// Thrice-Fried Mudwings' "After the second time, … ending the effect", 2026-10-27: dropped unread before.)
const RULE_SENTENCE = /\b(?:checks?|saves?|saving throws?|bonus|penalty|damage|conditions?|Strikes?|actions?|resistance|Speeds?|Hit Points|critical (?:success|failure)|failure|success|instead|increases?|DC|misses|Dazzled|Blinded|Frightened|Off-Guard|Prone|Sickened|Stunned|Slowed|\d+ feet|Hardness|flat check|ending|ends?|can't|cannot|the (?:first|second) time)\b/i;

// The text's trigger: to its Requirements or Effect, or (a talisman's, with no "Effect" after it) to its sentence's end.
const triggerOf = (plain) => /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|\.(?=\s|$)|$)/s.exec(plain)?.[1] ?? null;

const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "You gain a +2 status bonus to …", "giving you a +4 status bonus to your AC and saves against the effect", "you gain a
// +1 circumstance bonus against the triggering save".
// (And "you draw strength from your adoring crowd and gain a +1 status bonus to the triggering check", Champion's Laurels.)
const GAIN = /\b(?:you gain|you receive|giving you|you get|granting you|grants? you|gaining|(?<=\byou [a-z]+ [^.]*?)(?:and|to) gain) an? \+(\d+) (circumstance|status|item) bonus (to|against|on) ([^.]+?)(?=\.|$| and (?:gain|you) )/i;
// (Another creature's, the one its trigger is about: Resonant Guitar's "The target gains a +2 status bonus to AC against the
// triggering attack" — bonus.recipient "target", the creature the presser targets.)
const TARGET_GAIN = /\bThe target gains an? \+(\d+) (circumstance|status|item) bonus (to|against|on) ([^.]+?)(?=\.|$)/;
const RESIST_AND_BONUS = /\b(?:granting you|you gain) resistance (\d+) (?:against|to) (acid|cold|electricity|fire|sonic|force|mental|poison|spirit|vitality|void) and an? \+(\d+) (circumstance|status|item) bonus (?:on|to) (?:your )?([^;.]+?) against the [\w ]*?effect\b/i;
// (Its type first: Pyrefeather Cloak's "You gain fire resistance 5 and a +1 circumstance bonus to saving throws against the triggering
// effect" — the same groups.)
const TYPE_RESIST_AND_BONUS = /\b(?:granting you|you gain) (acid|cold|electricity|fire|sonic|force|mental|poison|spirit|vitality|void) resistance (\d+) and an? \+(\d+) (circumstance|status|item) bonus (?:on|to) (?:your )?([^;.]+?) against the [\w ]*?effect\b/i;
const resistAndBonus = (sentence) => {
    const plain = RESIST_AND_BONUS.exec(sentence);
    if (plain) return plain;
    const typed = TYPE_RESIST_AND_BONUS.exec(sentence);
    return typed ? [typed[0], typed[2], typed[1], typed[3], typed[4], typed[5]] : null;
};
// ("… and gain resistance 2 to damage", Sparkwarden; "… resistance 2 to the triggering damage", Warding Tattoo.)
const RESIST = /\b(?:and )?(?:gain )?resistance (\d+) to (?:all |the triggering )?damage\b/i;

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
    // (Any check: Calamity's Bane Tattoo's "the check associated with the triggering action".)
    if (!selectors.length && /\bthe check associated with the triggering action\b/.test(lower)) selectors.push("check");
    return [...new Set(selectors)];
}

// The roll an action its trigger names is made with, when "the check" says no more: Savior Spike's "Trigger You attempt to Grab an Edge"
// — PF2e's Grab an Edge is a Reflex save or an Acrobatics check: any check, its action option the predicate.
const TRIGGER_ROLLS = [[/\bGrab an Edge\b/i, ["check"]]];
const triggerRolls = (triggered) => TRIGGER_ROLLS.find(([pattern]) => pattern.test(String(triggered ?? "")))?.[1] ?? [];

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
// (Once within a time, a bonus to one roll its user picks, a third-party sandwich's: the card's Apply readies it for the roll picked —
// the next of those kinds this turn — the time and the immunity after it notes.)
const ROLL_KINDS = { "saving throw": "saving-throw", "skill check": "skill-check", "attack roll": "attack-roll", "perception check": "perception" };
const PICKED_ROLL = /\bOnce (?:during|within) the next (?:\d+ )?(?:hours?|minutes?|rounds?)\b[^.]*?\bgain an? \+(\d+) (status|circumstance|item) bonus to a single ((?:saving throw|skill check|attack roll|Perception check)(?:,? (?:or )?(?:saving throw|skill check|attack roll|Perception check))*) of your choice\b/i;
function pickedRoll(sentences) {
    for (const sentence of sentences) {
        const picked = PICKED_ROLL.exec(sentence);
        if (!picked) continue;
        const selectors = [...picked[3].toLowerCase().matchAll(/saving throw|skill check|attack roll|perception check/g)].map(([kind]) => ROLL_KINDS[kind]);
        const notes = [`Press Apply just before the roll you pick: ${sentence}`, ...sentences.filter((other) => other !== sentence && /\bimmune\b/i.test(other))];
        return { modifiers: selectors.map((selector) => ({ selector, type: picked[2].toLowerCase(), value: Number(picked[1]) })), resistance: null, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: selectors, notes };
    }
    return null;
}

// (The next save against one trait's effects, whenever it comes: Psychic Warding Bracelet's "You gain a +2 item bonus to your next save
// against a mental effect" — kept until then (bonus.lasting), spent by that save alone, its trait the modifier's predicate.)
const NEXT_SAVE = /\bYou gain an? \+(\d+) (item|status|circumstance) bonus to your next (?:save|saving throw) against an? (mental|fear|emotion|poison|disease|curse|death|illusion|visual|auditory) effect\b[^.]*\./i;
function nextSave(plain) {
    const next = NEXT_SAVE.exec(plain);
    if (!next) return null;
    const notes = plain.replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !sentence.includes(next[0].trim()) && /\b(?:save|bonus|penalty|Interact|minutes?)\b/i.test(sentence));
    return { modifiers: [{ selector: "saving-throw", type: next[2].toLowerCase(), value: Number(next[1]), predicate: [`item:trait:${next[3].toLowerCase()}`] }], resistance: null, duration: null, spend: ["saving-throw"], lasting: true, notes };
}

export function readReadiedBonus(text, { trigger = null } = {}) {
    const plain = String(text ?? "");
    // (Half the triggering attack's damage, Laurel of the Empath's "You take half damage from the triggering attack": bonus.halfDamage, the
    // damage halved as PF2e applies it — scripts/half-damage.js —, spent by it. 2026-10-27.)
    const half = /\bYou take half damage from the triggering (?:attack|Strike)\./i.exec(plain.replace(/^.*?\bEffect\b\s*/s, ""));
    if (half) return { modifiers: [], resistance: null, halfDamage: true, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], notes: [`Only against what triggered it: ${half[0]}`] };
    const next = trigger ? null : nextSave(plain);
    if (next) return next;
    const picked = trigger ? null : pickedRoll(plain.replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()));
    if (picked) return picked;
    const triggered = trigger ?? triggerOf(plain);
    if ((triggered && AFTER_ROLL.test(triggered)) || TURNS_ROLL.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    // (A parenthesis its own sentence: Sparkshade Parasol's "… effect. (This applies only to any damage the effect deals.) For the next
    // 1 minute, …".)
    const sentences = body.split(/(?<=[.!?]\)?)\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
    // (A resistance and a bonus together, against the effect that triggered it: Ring of Torag's "granting you resistance 5 against
    // fire and a +1 status bonus on your AC or saving throw against the fire effect targeting you" — both, for this turn.)
    const both = triggered ? sentences.map((sentence) => [sentence, resistAndBonus(sentence)]).find(([, match]) => match) : null;
    if (both) {
        const [sentence, match] = both;
        const selectors = selectorsOf(match[5]);
        if (selectors.length) return { modifiers: selectors.map((selector) => ({ selector, type: match[4].toLowerCase(), value: Number(match[3]) })), resistance: { type: match[2].toLowerCase(), value: Number(match[1]) }, duration: durationOf(sentence), spend: [], notes: [`Only against what triggered it: ${sentence}`, ...sentences.filter((other) => other !== sentence && !/^(?:Activate|Trigger|Prerequisites?|Requirements?)\b/.test(other) && RULE_SENTENCE.test(other))] };
    }
    for (const [index, sentence] of sentences.entries()) {
        const other = triggered ? TARGET_GAIN.exec(sentence) : null;
        const match = GAIN.exec(sentence) ?? other;
        if (!match) continue;
        // (Its user's own: not an ally's, an area's, nor under a condition of its own.)
        // ("When activated, …", "When you activate the coin, you gain …": the use itself, not a condition.)
        const own = sentence.replace(/^When (?:it's |it is )?(?:you )?activat\w*(?: (?:it|the [\w' -]+?))?,\s*/i, "");
        if (/\b(?:all(?:ies|y)|each creature|creatures? (?:in|within)|emanation|aura)\b/i.test(sentence) || /^(?:If|While|When|Whenever)\b/.test(own)) continue;
        const [, value, type, , words] = match;
        // ("the triggering check" alone: the trigger's rolls — Mask of Allure's "You attempt a Deception, Diplomacy, Intimidation,
        // or Performance check", Whisperer of Souls' "an Occultism check to Decipher Writing, … or Recall Knowledge".)
        const fromTrigger = !selectorsOf(words).length && (/\bthe triggering (?:check|roll|skill check)\b/i.test(words) || (/^the (?:check|roll|save|saving throw)$/i.test(words.trim()) && triggerRolls(triggered).length)) && triggered;
        const selectors = fromTrigger ? (selectorsOf(triggered).length ? selectorsOf(triggered) : triggerRolls(triggered)) : selectorsOf(words);
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
        // (Another sentence's time — "If you succeed at the saving throw, you become Quickened for 1 minute", "you become temporarily
        // immune … for 1 hour" — isn't the bonus's.)
        if (!(triggered || SHORT.test(sentence) || spend.length) || sentences.some((other, at) => LASTING.test(other) && (at === index || !(/^(?:If|Whenever)\b|^When (?!(?:it's |you )?activat)/i.test(other) || /\bimmune\b/i.test(other))))) return null;
        const notes = [
            ...(/\bagainst the (?:triggering|effect)\b|\bagainst (?:any )?(?:the )?(?:triggering )?[A-Z]\w+\b/.test(`${sentence}`) && !spend.length ? [`Only against what triggered it: ${sentence}`] : []),
            // (A bonus that says more: Conrasu Coin's "…, which increases to a +3 circumstance bonus to make-an-impression on a creature …".)
            ...(spend.length && /,? (?:which|but|unless|if)\b/i.test(words) ? [sentence] : []),
            // (Its other rule sentences, not its flavor nor its Usage, Activate or Trigger lines.)
            ...sentences.filter((_, at) => at !== index).filter((other) => !/^This is a fortune effect\.?$/i.test(other) && !/^(?:Usage|Activate|Trigger|Prerequisites?|Requirements?)\b/.test(other) && RULE_SENTENCE.test(other))
        ];
        return { modifiers, resistance: resist ? { type: "all-damage", value: Number(resist[1]) } : null, duration: durationOf(sentence), spend, notes, ...(other && !GAIN.exec(sentence) ? { recipient: "target" } : {}) };
    }
    // (Only an item used one way: Toadskin Salve's two reactions, Thrice-Fried Mudwings' meal and its reaction aren't one card.)
    return (plain.match(/\bActivate\b/g) ?? []).length <= 1 ? onlyCritExtra(readResistMoment(sentences, triggered), sentences) : null;
}

// Resistance against the hit that triggered it, and nothing else: Deflecting Parry's "You gain resistance 5 to physical
// damage against the triggering Strike", Ferrofluid Urchin's "You gain resistance 3 to the triggering damage" (the
// trigger's type: "You take physical damage"), Third Blessing's "You gain resistance 3 against that spirit damage",
// Thrice-Fried Mudwings' "resistance 15 against physical damage for the triggering attack only". For the rest of the turn,
// with a note that it's only that hit's. Not a lasting one ("that lasts for 10 minutes"), nor another's ("grants the target").
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "holy", "unholy", "physical"];
const TYPE_WORDS = String.raw`(?:${DAMAGE_TYPES.join("|")})`;
// (And another's: Hallajin Key's "Lumna grants the target resistance 10 to the triggering damage" — recipient "target".)
const TARGET_RESIST = /\bgrants? the target resistance (\d+) to the triggering damage\b/i;
const RESIST_MOMENT = new RegExp(String.raw`\b(?:you gain|granting you|gaining) resistance (\d+) (?:(?:to|against) (?:(${TYPE_WORDS}(?:(?:,|, and| and| or|, or) ${TYPE_WORDS})*) )?damage (?:against|for|from) (?:the triggering|that) (?:attack|Strike|hit|damage)(?: only)?|to the triggering damage(?: type)?|against that (${TYPE_WORDS}) damage)\b`, "i");
// ("You gain 20 resistance to all damage against the triggering damage", Scapular of Shields; "you reduce the damage taken by
// 10", Mantle of Amazing Health; "you reduce the damage from the triggering critical hit by 10", Indomitable Keepsake.)
const RESIST_NUMBER_FIRST = new RegExp(String.raw`\byou (?:gain|have) (\d+) resistance to (?:all|(${TYPE_WORDS}(?:(?:,|, and| and| or|, or) ${TYPE_WORDS})*)) damage (?:against|for|from) (?:the triggering|that) (?:attack|Strike|hit|damage)\b`, "i");
const REDUCE_DAMAGE = /\b(?:you )?reduce the damage (?:(?:you )?take|taken|(?:from|of) the triggering [\w ]+?) by (\d+)\b/i;
const RAISED = new RegExp(String.raw`\bIncrease your (${TYPE_WORDS}) resistance from the [\w' -]+? from (\d+) to (\d+)\b`, "i");
// (Its type first: Sparkshade Parasol's "gaining fire resistance 20 against the triggering effect".)
const TYPE_FIRST = new RegExp(String.raw`\b(?:you gain|granting you|gaining) (${TYPE_WORDS}) resistance (\d+) against the triggering (?:effect|attack|Strike|hit|damage)\b`, "i");
// (No damage at all from it: Worldscale Shield's blow absorbed, in this module's words "You gain immunity to physical damage against the
// triggering attack" — PF2e's Immunity for the turn, the same note.)
const IMMUNE_MOMENT = new RegExp(String.raw`\byou gain immunity to (${TYPE_WORDS}) damage (?:against|for|from) (?:the triggering|that) (?:attack|Strike|hit|damage)\b`, "i");
// (The item broken by it, or destroyed if it was already: Worldscale Shield's "The worldscale shield breaks. If it was already broken,
// it is destroyed." — scripts/fortune.js.)
const BREAKS = /\bThe [\w' -]+? breaks\. If it was already broken, it is destroyed\./i;
// (Only the critical hit's extra damage, Indomitable Keepsake's "This effect only reduces the additional damage from a critical hit; it can't reduce
// the damage below the amount it would deal on a normal hit": not resistance — once off the hit's damage, at most its doubling's half —
// bonus.reduceCrit { value }, scripts/half-damage.js, 2026-10-27.)
const CRIT_EXTRA = /^This effect only reduces the additional damage from a critical hit; it can't reduce the damage below the amount it would deal on a normal hit\.$/i;
// (Its grade's own amount, Indomitable Keepsake (Greater)'s "When you activate a greater indomitable keepsake, you reduce the damage from a firearm
// critical hit by 20 instead of reducing it by 10".)
const GRADE_INSTEAD = /^When you activate an? [\w' -]+?, you reduce the damage from an? [\w ]+? critical hit by (\d+) instead of reducing it by \d+\.$/i;
function onlyCritExtra(read, sentences) {
    const said = sentences.find((sentence) => CRIT_EXTRA.test(sentence.trim()));
    if (!read?.resistance || read.resistance.type !== "all-damage" || !said || !/\bcritical hit\b/i.test(read.notes?.[0] ?? "")) return read;
    const grade = sentences.map((sentence) => [sentence, GRADE_INSTEAD.exec(sentence.trim())]).find(([, match]) => match);
    const notes = read.notes.filter((note) => note.trim() !== said.trim() && (!grade || note.trim() !== grade[0].trim()));
    return { ...read, resistance: null, reduceCrit: { value: grade ? Number(grade[1][1]) : read.resistance.value }, notes };
}
function readResistMoment(sentences, triggered) {
    if (!triggered) return null;
    const breaks = sentences.some((sentence) => BREAKS.test(sentence) || /^If it was already broken, it is destroyed\.$/i.test(sentence.trim()));
    for (const [index, sentence] of sentences.entries()) {
        const immune = IMMUNE_MOMENT.exec(sentence);
        if (immune && !sentences.some((other) => LASTING.test(other))) {
            const notes = [`Only against what triggered it: ${sentence}`, ...sentences.filter((other, at) => at !== index && !/^(?:Activate|Trigger|Prerequisites?|Requirements?|Spend)\b/.test(other) && !BREAKS.test(other) && !/\bbreaks\.$|^If it was already broken\b/i.test(other.trim()) && RULE_SENTENCE.test(other))];
            return { modifiers: [], resistance: null, immunity: { type: immune[1].toLowerCase() }, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], notes, ...(breaks ? { breaks: true } : {}) };
        }
        const target = TARGET_RESIST.exec(sentence);
        const found = RESIST_MOMENT.exec(sentence) ?? (target ? [target[0], target[1], null, null] : null);
        const first = found ? null : RESIST_NUMBER_FIRST.exec(sentence);
        const reduced = found || first ? null : REDUCE_DAMAGE.exec(sentence);
        // (Crown of the Fire Eater's "Increase your fire resistance from the crown from 5 to 15": that much for the triggering damage —
        // PF2e takes the higher of two resistances to a type.)
        const raised = found || first || reduced ? null : RAISED.exec(sentence);
        const typed = found || first || reduced || raised ? null : TYPE_FIRST.exec(sentence);
        const match = found ?? (first ? [first[0], first[1], first[2] ?? (/\ball damage\b/i.test(first[0]) ? "all" : null), null] : reduced ? [reduced[0], reduced[1], "all", null] : raised ? [raised[0], raised[3], raised[1], null] : typed ? [typed[0], typed[2], typed[1], null] : null);
        // (A lasting one isn't a moment's — the time in its own sentence, or a sentence about the resistance; not one about something
        // else the item lets its user do for a minute, Sparkshade Parasol's "For the next 1 minute, flames dance …, letting you use …".)
        const lasting = (other, at) => LASTING.test(other) && (at === index || /\bresistance\b/i.test(other) || !/\bletting you use\b/i.test(other));
        if (!match || /^(?:If|While|When|Whenever)\b/.test(sentence.replace(/^When (?:it's |it is )?(?:you )?activat\w*(?: (?:it|the [\w' -]+?))?,\s*/i, "")) || sentences.some(lasting)) continue;
        // (Its types: the sentence's, else the trigger's "You take physical damage", "mental, poison, or spirit damage" — one of
        // those, the one that hit — else all damage; "all" is all.)
        if (match[2] === "all") match[2] = null;
        const all = Boolean(first || reduced) && !match[2];
        const named = match[2] ?? match[3] ?? null;
        const fromTrigger = new RegExp(String.raw`\b(${TYPE_WORDS}(?:(?:,|, and| and| or|, or) ${TYPE_WORDS})*) (?:damage|attack)\b`, "i").exec(triggered)?.[1] ?? null;
        const words = all ? [] : (named ?? fromTrigger ?? "").toLowerCase().split(/,? (?:and|or) |, /).map((word) => word.trim()).filter(Boolean);
        const type = !words.length ? "all-damage" : words.length === 1 ? words[0] : words;
        // (Its other rule sentences, not its flavor: "This spiky glob of magnetic liquid attaches …".)
        const notes = [`Only against what triggered it: ${sentence}`, ...sentences.filter((_, at) => at !== index).filter((other) => !/^(?:Activate|Trigger|Prerequisites?|Requirements?)\b/.test(other) && /\b(?:checks?|saves?|bonus|penalty|damage|conditions?|Strikes?|actions?|resistance|Speeds?|Hit Points)\b/i.test(other))];
        return { modifiers: [], resistance: { type, value: Number(match[1]) }, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], notes, ...(target && !RESIST_MOMENT.test(sentence) ? { recipient: "target" } : {}) };
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
const ACTION_SKILLS = { Request: "diplomacy", "Make an Impression": "diplomacy", "Gather Information": "diplomacy", Coerce: "intimidation", Demoralize: "intimidation", Feint: "deception", Lie: "deception", "Create a Diversion": "deception" };
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
    // (Or the action it makes, by that action's skill: Cloak of Repute's "make a Request of a creature" — Diplomacy.)
    const made = new RegExp(String.raw`\b(?:make|attempt|use) an? (${Object.keys(ACTION_SKILLS).join("|")})\b`).exec(plain);
    const selectors = [named, triggered ?? "", attempt?.[0] ?? ""].map((words) => selectorsOf(words)).find((found) => found.length) ?? (made ? [ACTION_SKILLS[made[1]]] : triggerRolls(triggered).length ? triggerRolls(triggered) : []);
    if (selectors.length !== 1) return null;
    const actions = /\bto ((?:[A-Z][a-z']+)(?: (?:a|an|the|or) [A-Z][a-z']+| [A-Z][a-z']+)*)\b/.exec(`${triggered ?? ""} ${attempt?.[0] ?? ""}`);
    const predicate = actions ? [{ or: actions[1].split(/\s+or\s+|,\s*/).map((name) => `action:${slug(name)}`) }] : made ? [`action:${slug(made[1])}`] : null;
    return { selector: selectors[0], adjustment, ...(predicate ? { predicate } : {}) };
}

// The builtin: { builtin: "readied-bonus", bonus: { modifiers, resistance, duration, spend, degree? }, notes }.
const CRITICAL_TEMP = /^If you critically succeed at the (?:check|roll|save|saving throw|triggering check), you gain (\d+) temporary Hit Points that last (?:for )?(\d+) (minutes?|rounds?|hours?)\.$/i;
const MISS_CONDITION = /^If the (?:attack|Strike) misses, [^.]*?\bwho becomes (Dazzled|Frightened|Off-Guard|Sickened|Stupefied|Clumsy|Enfeebled|Blinded|Deafened|Stunned|Slowed)(?: (\d+))? for (\d+) rounds?\.$/i;
const HIT_DAMAGE = /^If the (?:attack|Strike) still hits, [^.]*?\bdealing (\d+d\d+(?:\+\d+)?) (acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void) damage to the attacker\.$/i;

export function readiedBonusPlan(text, base, { trigger = null } = {}) {
    const degree = readDegreeAdjust(text, { trigger });
    const read = readReadiedBonus(text, { trigger }) ?? (degree ? { modifiers: [], resistance: null, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [degree.selector], notes: degreeNotes(text) } : null);
    if (!read) return null;
    if (degree) read.degree = degree;
    // (The degree's own sentences, read now, aren't notes too.)
    if (degree) read.notes = (read.notes ?? []).filter((note) => !UPGRADES.some(([pattern]) => pattern.test(note)) && !/^If you roll a critical failure, you get a failure instead\.$/i.test(String(note).trim()));
    // (The check it's for, its user's own PF2e roll: Mesmerizing Opal's "When you activate it, attempt a Deception check to Feint", the degree
    // predicated on that action — the card's line, plan.then.)
    const checkFor = degree ? (read.notes ?? []).find((note) => { const named = /^When you activate it, attempt an? (\w+) check to (\w+(?: \w+)?)\.$/i.exec(String(note).trim()); return named && named[1].toLowerCase() === String(degree.selector) && JSON.stringify(degree.predicate ?? []).includes(`action:${named[2].toLowerCase().replace(/ /g, "-")}`); }) : null;
    if (checkFor) read.notes = read.notes.filter((note) => note !== checkFor);
    const { notes: read_notes, ...bonus } = read;
    // (Only against what triggered it: that attack, check, save or damage alone — bonus.against, the Effect spent by it
    // (scripts/fortune.js), its turn's end still the latest. The note goes, unless its sentence says more than the bonus: Broken Tusk
    // Pendant's "… or a +2 item bonus if the animal is the specific kind …".)
    const ONLY = /^Only against what triggered it: /;
    const only = (read_notes ?? []).filter((note) => ONLY.test(note));
    if (only.length) bonus.against = true;
    // (Its restatement goes too: Sparkshade Parasol's "(This applies only to any damage the effect deals.)".)
    // (And what the triggering attack's result does to the attacker, bonus.onAttack { miss?, hit? }, applied by its degree: Bismuth Armor's
    // "If the attack misses, the spell reflects toward the caster, who becomes Dazzled for 1 round", Resonant Guitar's "If the Strike still
    // hits, the barrier breaks, dealing 3d10 sonic damage to the attacker".)
    const onAttack = {};
    for (const note of only.length ? read_notes : []) {
        const miss = MISS_CONDITION.exec(String(note).trim());
        if (miss) onAttack.miss = { note, condition: { slug: miss[1].toLowerCase(), value: miss[2] ? Number(miss[2]) : null, duration: { mode: "fixed", value: Number(miss[3]), unit: "rounds", expiry: "turn-start", anchor: "effect-start" } } };
        const hit = HIT_DAMAGE.exec(String(note).trim());
        if (hit) onAttack.hit = { note, damage: { formula: hit[1], type: hit[2].toLowerCase() } };
    }
    if (onAttack.miss || onAttack.hit) bonus.onAttack = Object.fromEntries(Object.entries(onAttack).map(([key, { note, ...rest }]) => [key, rest]));
    // (What a critical success at the roll it's for gives too: Champion's Laurels' "If you critically succeed at the check, you gain 2
    // temporary Hit Points that last for 1 minute" — bonus.onCritical, given when that roll spends it.)
    const critical = bonus.spend?.length ? (read_notes ?? []).map((note) => [note, CRITICAL_TEMP.exec(String(note).trim())]).find(([, match]) => match) : null;
    if (critical) {
        const [, value, count, unit] = critical[1];
        bonus.onCritical = { tempHP: Number(value), duration: { mode: "fixed", value: Number(count), unit: /^min/i.test(unit) ? "minutes" : /^hour/i.test(unit) ? "hours" : "rounds", expiry: "turn-start", anchor: "effect-start" } };
    }
    // (A higher resistance against some sources, a warding tattoo's "Your resistance to damage from fiends and magical attacks by fiends becomes
    // resistance 5": a second Resistance rule on the Effect, predicated as PF2e's own rules for the tattoo are — origin:trait:fiend; hazardous
    // terrain and environmental hazards, origin:trait:environmental or terrain.)
    const SOURCES = [[/^fiends and magical attacks by fiends$/i, ["origin:trait:fiend"]], [/^hazardous terrain and environmental hazards$/i, [{ or: ["origin:trait:environmental", "origin:trait:terrain"] }]]];
    const higher = bonus.resistance ? (read_notes ?? []).map((note) => [note, /^Your resistance to damage from (.+?) becomes resistance (\d+)\.$/i.exec(String(note).trim())]).find(([, match]) => match && SOURCES.some(([words]) => words.test(match[1]))) : null;
    if (higher) bonus.resistanceAlso = [{ type: bonus.resistance.type, value: Number(higher[1][2]), predicate: SOURCES.find(([words]) => words.test(higher[1][1]))[1], from: higher[1][1] }];
    // (What a success at that roll gives, Boots of the Blight's "If you succeed at the saving throw, you become Quickened for 1 minute, but can
    // use the additional action only to Stride": bonus.onSuccess, given when that roll spends it — scripts/fortune.js; the action it's for a line.)
    const succeeded = bonus.spend?.length ? (read_notes ?? []).map((note) => [note, /^If you succeed at the (?:saving throw|save|check), you become (Quickened) for (\d+) (minutes?|rounds?), but can use the additional action only to (Stride|Step|Strike|Sustain)\.$/i.exec(String(note).trim())]).find(([, match]) => match) : null;
    if (succeeded) {
        const [, slug, count, unit, action] = succeeded[1];
        bonus.onSuccess = { condition: { slug: slug.toLowerCase(), value: null, duration: { mode: "fixed", value: Number(count), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" } }, only: action };
    }
    // (A Speed its first use lowers and its second ends, Thrice-Fried Mudwings' "The first time you use this Activation, your fly Speed becomes
    // 15 feet, or half your Speed, whichever is lower, for the duration. After the second time, your mudwings are shattered entirely, ending the
    // effect": bonus.speedSteps — the item's Speed Effect on its user changed, then ended, as the reaction is used (scripts/fortune.js).)
    const stepNote = (read_notes ?? []).map((note) => [note, /^The first time you use this Activation, your (fly|swim|climb|burrow) Speed becomes (\d+) feet, or half your Speed, whichever is lower, for the duration\.$/i.exec(String(note).trim())]).find(([, match]) => match);
    if (stepNote) bonus.speedSteps = { type: stepNote[1][1].toLowerCase(), feet: Number(stepNote[1][2]), first: `min(${stepNote[1][2]},floor(@actor.system.movement.speeds.land.value/2))`, secondEnds: /\bAfter the second time, [^.]*\bending the effect\./i.test(String(text ?? "")) };
    // (A flat check to end a persistent damage at once, Pyrefeather Cloak's "If you are taking persistent fire damage, you can immediately attempt
    // a flat check to end the persistent damage": bonus.recovery, PF2e's own recovery check as the card's applied — scripts/fortune.js.)
    const recoveryNote = (read_notes ?? []).map((note) => [note, /^If you are taking persistent (\w+) damage, you can immediately attempt a flat check to end the persistent damage\.$/i.exec(String(note).trim())]).find(([, match]) => match);
    if (recoveryNote) bonus.recovery = { types: [recoveryNote[1][1].toLowerCase()] };
    // (More for an expert, Warrior's Training Ring's "If you are an expert in any weapon, you instead gain a +4 circumstance bonus to the attack
    // roll": the modifier's ifExpert, its user's proficiencies looked at when the card's applied — scripts/fortune.js.)
    const expertNote = bonus.modifiers.length === 1 ? (read_notes ?? []).map((note) => [note, /^If you are an expert in any weapon, you instead gain an? \+(\d+) (circumstance|status|item) bonus to the attack roll\.$/i.exec(String(note).trim())]).find(([, match]) => match && match[2].toLowerCase() === bonus.modifiers[0].type) : null;
    if (expertNote) bonus.modifiers = [{ ...bonus.modifiers[0], ifExpert: Number(expertNote[1][1]) }];
    // (A shield that keeps some of the damage off, Resolute Shield's "You and the shield each take any remaining damage": the shield takes
    // what its user took — bonus.shieldShare, scripts/shield-share.js.)
    const shared = bonus.resistance && (base?.item?.type ?? base?.source?.type) === "shield" ? (read_notes ?? []).find((note) => /^You and the shield each take any remaining damage\.$/i.test(String(note).trim())) : null;
    if (shared) bonus.shieldShare = true;
    const read_ = new Set([...Object.values(onAttack).map((entry) => entry.note), ...(critical ? [critical[0]] : []), ...(higher ? [higher[0]] : []), ...(shared ? [shared] : []), ...(expertNote ? [expertNote[0]] : []), ...(succeeded ? [succeeded[0]] : []), ...(stepNote ? [stepNote[0]] : []), ...(recoveryNote ? [recoveryNote[0]] : [])]);
    // (The miss's own words, Deflecting Branch's "If the attack misses, you have knocked it away": the state its other activation's trigger
    // names, no rule here.)
    const notes = (read_notes ?? []).filter((note) => !/^If the attack misses, you have knocked it away\.$/i.test(String(note).trim()) && !read_.has(note) && !(only.length && /^\(This applies only to (?:any )?(?:the )?damage the (?:effect|attack) deals\.\)$/i.test(String(note).trim())) && (!ONLY.test(note) || /\bor an? \+\d|\bif\b|\bunless\b|\binstead\b/i.test(note.replace(ONLY, ""))));
    // (Another creature's: the one the presser targets, within the distance its trigger names.)
    const within = /\bwithin (\d+) feet\b/i.exec(trigger ?? triggerOf(String(text ?? "")) ?? "")?.[1];
    const targeting = bonus.recipient === "target" ? { target: "1 creature", range: within ? `${within} feet` : null, area: null } : { target: "the user", range: null, area: null };
    // (A higher bonus at one kind of creature, Conrasu Coin (Arbiter)'s "you gain a +2 circumstance bonus on the Diplomacy check, which increases
    // to a +3 circumstance bonus to make-an-impression on a creature with the aeon trait": a second modifier of the same type predicated on the
    // target's trait — PF2e keeps the higher of the two.)
    const TRAIT_MORE = /^When you activate the [\w' -]+?, you gain an? \+(\d+) (circumstance|item|status) bonus on the (\w+) check, which increases to an? \+(\d+) \2 bonus to [\w -]+? on a creature with the (\w+) trait\.$/i;
    const traitMore = (notes ?? []).map((note) => [note, TRAIT_MORE.exec(String(note).trim())]).find(([, match]) => match && bonus.modifiers.some((modifier) => modifier.selector === match[3].toLowerCase() && modifier.value === Number(match[1])));
    if (traitMore) {
        const [note, match] = traitMore;
        const base_modifier = bonus.modifiers.find((modifier) => modifier.selector === match[3].toLowerCase());
        bonus.modifiers = [...bonus.modifiers, { ...base_modifier, value: Number(match[4]), predicate: [...(base_modifier.predicate ?? []), `target:trait:${match[5].toLowerCase()}`] }];
        notes.splice(notes.indexOf(note), 1);
    }
    // (A higher bonus against one kind of attacker, Broken Tusk Pendant's "You gain a +1 item bonus to AC against the triggering attack, or a +2
    // item bonus if the animal is the specific kind depicted by the pendant": the ways card's two buttons, its user's pick — the pendant's
    // animal known to them.)
    const ANIMAL = /^Only against what triggered it: You gain an? \+(\d+) (item|circumstance|status) bonus to AC against the triggering attack, or an? \+(\d+) \2 bonus if the animal is the specific kind depicted by the pendant\.$/i;
    const animal = notes.map((note) => ANIMAL.exec(String(note).trim())).find(Boolean);
    // (When it can't be used, Deflecting Branch's "You can't use this ability to deflect unusually massive ranged projectiles": its trigger's,
    // a line of the card for its user to keep to — bonus.limits.)
    const LIMIT = /^You can't use this (?:ability|activation|reaction|item)\b[^.]*\.$/i;
    // (And its user's longer move with a feat, Conrasu Coin (Bythos)'s "If you have the Nimble Roll feat and the attack misses, you can Stride up to
    // 20 feet instead": a line of the card, its own move, 2026-10-27.)
    const FEAT_MOVE = /^If you have the ([\w' -]+?) feat and the attack misses, you can Stride up to (\d+) feet instead\.$/i;
    // (Healing just after the damage, Crown of the Fire Eater's "Just after taking any remaining fire damage, you regain a number of Hit Points equal
    // to 15 or the fire damage dealt by the triggering attack before damage resistance, whichever is less": bonus.healAfter { type, max } —
    // scripts/heal-after.js, from the damage as PF2e applies it, 2026-10-27.)
    const HEAL_AFTER = /^Just after taking any remaining (\w+) damage, you regain a number of Hit Points equal to (\d+) or the \1 damage dealt by the triggering attack before damage resistance, whichever is less\.$/i;
    const healAfter = notes.map((note) => [note, HEAL_AFTER.exec(String(note).trim())]).find(([, match]) => match);
    if (healAfter && bonus.against) {
        bonus.healAfter = { type: healAfter[1][1].toLowerCase(), max: Number(healAfter[1][2]) };
        notes.splice(notes.indexOf(healAfter[0]), 1);
    }
    // (Ended early by its user's own doing, Scale of Igroon's "This bonus ends if you Activate another ability or use the Shield Block reaction":
    // bonus.endsOn { activate, shieldBlock } — scripts/ends-on.js, at its user's next item activation or Shield Block, 2026-10-27.)
    const ENDS_ON = /^This bonus ends if you Activate another ability or use the Shield Block reaction\.$/i;
    const endsOn = notes.find((note) => ENDS_ON.test(String(note).trim()));
    if (endsOn) {
        bonus.endsOn = { activate: true, shieldBlock: true };
        notes.splice(notes.indexOf(endsOn), 1);
    }
    const limits = notes.filter((note) => LIMIT.test(String(note).trim()) || FEAT_MOVE.test(String(note).trim()));
    if (limits.length) bonus.limits = limits.map((note) => String(note).trim()).map((note) => (FEAT_MOVE.test(note) ? note.replace(FEAT_MOVE, "With the $1 feat, if the attack misses, it can Stride up to $2 feet instead (its own move).") : note));
    const kept = (animal ? notes.filter((note) => !ANIMAL.test(String(note).trim())) : notes).filter((note) => !limits.includes(note));
    const plan = { ...base, builtin: "readied-bonus", automation: { level: kept.length ? "guided" : "automatic" }, targeting, trigger: { event: "use" }, bonus, ...(checkFor ? { then: `${checkFor.replace(/^When you activate it, a/i, "A").replace(/\.$/, "")} (PF2e's own, its degree improved)` } : {}), notes: kept, ...(kept.length ? { partial: true } : {}) };
    if (!animal || bonus.modifiers.length !== 1 || bonus.modifiers[0].selector !== "ac") return plan;
    const valued = (value) => ({ ...plan, bonus: { ...bonus, modifiers: [{ ...bonus.modifiers[0], value }] } });
    return {
        ...base,
        builtin: "ways",
        automation: plan.automation,
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        ways: [
            { name: `+${animal[1]} ${animal[2].toLowerCase()} to AC against the attack`, html: "", plan: valued(Number(animal[1])) },
            { name: `+${animal[3]} ${animal[2].toLowerCase()} to AC: the attacker is the pendant's animal`, html: "", plan: valued(Number(animal[3])) }
        ],
        once: true,
        ...(kept.length ? { notes: kept, partial: true } : {})
    };
}

// The plan to keep: the bonus over nothing, a note alone or the GM's fallback — and over the ability compiler's "ac-reaction", which
// its live cards offer only for a monster's own reactions (Deflecting Branch's "+4 circumstance bonus to AC against the triggering
// attack": the user's Effect for it, as Sparkwarden's).
export function readiedBonusOver(plan, bonus) {
    if (!bonus) return plan;
    // (And over the ability compiler's "save-bonus", a monster's own standing bonus: Psychic Warding Bracelet's next save.)
    return !plan || plan.noteOnly || plan.builtin === "no-effect" || plan.builtin === "ac-reaction" || (plan.builtin === "save-bonus" && bonus.bonus?.lasting) ? bonus : plan;
}

// What a degree's change alone leaves to the table: the text's other rule sentences.
function degreeNotes(text) {
    const body = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    return body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !UPGRADES.some(([pattern]) => pattern.test(sentence)) && /\b(?:check|save|bonus|penalty|damage|condition|Strike|action)\b/i.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?)\b/.test(sentence));
}


// A readied bonus that climbs with each try at the same target (2026-10-27, docs/needs.md): Metronomic Hammer's "you gain a +1 item bonus to your
// Athletics check to Trip the target. This item bonus increases by 1 with every subsequent Trip attempt you make with the metronomic hammer
// against the same target this turn, to a maximum of +3 on your third Trip. The bonus resets to +1 if you successfully Trip the target, if you
// critically fail to Trip the target, or if your turn ends." → bonus.escalate { by, max, base, resetOn, sameTarget }: its Effect kept for the
// turn, its bonus raised after each such roll that isn't one of those (scripts/fortune.js), back to its first after one, or at another target.
const ESCALATE = /^This item bonus increases by (\d+) with every subsequent (\w+) attempt you make with the [\w' -]+? against the same target this turn, to a maximum of \+(\d+) on your \w+ \2\.$/i;
const RESETS = /^The bonus resets to \+(\d+) if you successfully (\w+) the target, if you critically fail to \2 the target, or if your turn ends\.$/i;
export function withEscalatingBonus(plan) {
    if (plan?.builtin !== "readied-bonus" || !plan.bonus) return plan;
    const notes = (plan.notes ?? []).map((note) => String(note).trim());
    const up = notes.map((note) => ESCALATE.exec(note)).find(Boolean);
    const reset = notes.map((note) => RESETS.exec(note)).find(Boolean);
    if (!up || !reset) return plan;
    const left = (plan.notes ?? []).filter((note) => !ESCALATE.test(String(note).trim()) && !RESETS.test(String(note).trim()));
    const escalate = { by: Number(up[1]), max: Number(up[3]), base: Number(reset[1]), action: up[2].toLowerCase(), resetOn: ["success", "criticalSuccess", "criticalFailure"], sameTarget: true };
    const { notes: _, ...rest } = plan;
    return { ...rest, ...(left.length ? { notes: left } : {}), bonus: { ...plan.bonus, escalate }, ...(plan.partial && !left.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// (Roots that carry and shield their dying user, Skitter Knot's "After moving, the roots continue protecting you; this counts as Raising a
// Shield, giving you a +1 circumstance bonus to AC until the beginning of your next turn. The roots use the Shield Block reaction against the first
// physical attack against you, after which the roots crumble. The roots carry you up to 10 feet and have Hardness 5." The Shield Block its
// Hardness as resistance to physical damage on the same Effect as the AC bonus, both spent by the first attack against it (bonus.against —
// the roots crumble); the carrying a line of its card, its user's token moved. 2026-10-27.)
const ROOTS = /^The roots carry you up to (\d+) feet and have Hardness (\d+)\.$/i;
export function withRootsShield(plan, text) {
    if (plan?.builtin !== "readied-bonus" || !plan.bonus || plan.bonus.resistance) return plan;
    const note = (plan.notes ?? []).find((entry) => ROOTS.test(String(entry).trim()));
    if (!note || !/\buse the Shield Block reaction against the first physical attack against you, after which the roots crumble\b/i.test(String(text ?? ""))) return plan;
    const [, feet, hardness] = ROOTS.exec(String(note).trim());
    const notes = plan.notes.filter((entry) => entry !== note);
    const { notes: _, ...rest } = plan;
    const line = `First the roots Stride with it up to ${feet} feet, away from harm (move its token; an ally who speaks Arboreal can pick where as a reaction).`;
    return {
        ...rest,
        ...(notes.length ? { notes } : {}),
        bonus: { ...plan.bonus, resistance: { type: "physical", value: Number(hardness) }, against: true, limits: [...(plan.bonus.limits ?? []), line] },
        ...(plan.partial && !notes.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
