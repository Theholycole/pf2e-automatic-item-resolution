// What a consumable's text does to the creature who takes it, when it links no
// PF2e Effect: as the core's check family's automatic row (no roll; the
// drinker gets the success row). Pure.
//
//   "making you {Concealed} for 5 minutes", "rendering you {Immobilized} for 1 minute" → a timed condition
//   "you gain 10 temporary Hit Points for 1 minute"                                 → temporary Hit Points
//   "you regain 4d8+20 Hit Points" (no PF2e healing data)                            → healing
//   "you gain a +1 item bonus to Fortitude saves", "you take a –2 penalty to Will saves" → modifiers
//
// A bonus or penalty only when every one of its targets is a plain PF2e selector: "+1 to Acrobatics checks to
// Balance" or "saving throws against diseases" is narrower than any selector, so it's left out rather than given
// too widely (the user's rule: never apply a rule wrongly; a note says it instead).

import { inlineTags, readableText } from "../../../pf2e-automatic-ability-resolution/src/compiler/inline.js";

const CONDITIONS = ["blinded", "clumsy", "concealed", "confused", "controlled", "dazzled", "deafened", "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened", "grabbed", "hidden", "immobilized", "invisible", "off-guard", "paralyzed", "petrified", "prone", "quickened", "restrained", "sickened", "slowed", "stunned", "stupefied", "unconscious", "undetected"];
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, an: 1, a: 1 };
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };

// The text with links as their labels and inline rolls as their formulas, in plain words.
// "@Damage[1d4[persistent,fire]]" → "1d4 persistent fire", "@Damage[(3[splash])[cold]]{3 cold splash damage}" → its label:
// the ability module's words for it (its nested brackets too). Healing is its amount alone ("you regain 3d10 Hit
// Points"), and an unlabelled splash "3 cold splash".
function damageWords(html) {
    let text = String(html ?? "");
    for (const raw of inlineTags(text, "Damage")) {
        const words = (tag) => (/^\(?[^[]*\)?\[[^\]]*\bhealing\b/.test(raw) && !/\{/.test(tag) ? readableText(tag).replace(/\s+(?:healing|vitality|void)\b/g, "") : readableText(tag).replace(/(\S+)\[splash\] (\w+)/g, "$1 $2 splash"));
        text = text.replace(new RegExp(String.raw`@Damage\[${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\](?:\{[^}]*\})?`), words);
    }
    return text;
}

export function plainText(html) {
    return damageWords(html)
        .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
        // (An area as its words: "@Template[burst|distance:10]{10 feet}" → "10 feet", unlabelled → "10-foot burst".)
        .replace(/@Template\[[^\]]*\]\{([^}]*)\}/g, "$1")
        .replace(/@Template\[(?:type:)?(\w+)\|distance:(\d+)[^\]]*\]/g, "$2-foot $1")
        .replace(/\[\[\/\w+ ([^\]#]+?)(?:\s*#[^\]]*)?\]\](?:\{([^}]*)\})?/g, (whole, formula, label) => label ?? formula)
        .replace(/<span class="action-glyph">[^<]*<\/span>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/[–—]/g, (dash) => (dash === "–" ? "-" : " - "))
        .replace(/\s+/g, " ")
        .trim();
}

// The item's own time: "Duration 1 minute", "The duration is 1 hour", "with a duration of 10 minutes", else the first
// "for N minutes" or "for 2d4 rounds" (rolled: its average, rounded down, with valueRoll); null when it has none.
// (Or weeks and years when it's stated, Vaccine's "Duration 1 week" — in days, PF2e's longest unit; not a "for 1 week" that may be
// something else's, Cayden's Tankard's "that item can't produce the effect for 1 week".)
const UNIT_WORD = String.raw`(rounds?|minutes?|hours?|days?)`;
const STATED_UNIT = String.raw`(rounds?|minutes?|hours?|days?|weeks?|years?)`;
const IN_DAYS = { week: 7, weeks: 7, year: 365, years: 365 };
export function itemDuration(text) {
    // ("The next time you would die from damage within 8 hours after you drink the ambrosia": its time, before the
    // "immune … for 24 hours" that follows.)
    // ("These effects expire 24 hours after you eat the roll", "This bonus expires after 24 hours": the same.)
    const stated = new RegExp(String.raw`\b(?:Duration|The duration is|with a duration of|lasts? for|expires? after) (\d+|one|an?) ${STATED_UNIT}\b|\b(?:within|expires?) (\d+|one|an?) ${UNIT_WORD} after (?:you )?(?:drink|consum|eat|imbib|apply|applied|activat)`, "i").exec(text)
        ?? new RegExp(String.raw`\bfor (?:the next )?(\d+|one|an?) ${UNIT_WORD}\b`, "i").exec(text);
    const rolled = new RegExp(String.raw`\b(?:for|Duration|The duration is) (\d+)d(\d+) ${UNIT_WORD}\b`, "i").exec(text);
    if (rolled && (!stated || rolled.index < stated.index)) {
        const [, count, sides, unit] = rolled;
        return { mode: "fixed", value: Math.floor((Number(count) * (Number(sides) + 1)) / 2), valueRoll: `${count}d${sides}`, unit: UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" };
    }
    const next = !stated ? /\bfor the next (round|minute|hour|day)\b/i.exec(text) : null;
    if (!stated && !next) return null;
    const [count, unit] = stated ? [stated[1] ?? stated[3], stated[2] ?? stated[4]] : ["1", next[1]];
    const value = WORD_NUMBERS[count.toLowerCase()] ?? Number(count);
    const days = IN_DAYS[unit.toLowerCase()];
    return { mode: "fixed", value: days ? value * days : value, unit: days ? "days" : UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" };
}

// Healing that brings its creature back from dying without raising Wounded: Magical Medal (Phoenix's Fire)'s "You lose the dying
// condition and regain 1 Hit Point. Your Wounded value does not increase." — plan.item.keepWounded, the core's recoverFromDying
// keepWounded in live play.
// (Or never knocked out, Guardian Rose's "you avoid being knocked out and regain 2d8+5 Hit Points": the Dying PF2e gave it at 0 Hit Points ended
// on the healing, no Wounded for it — unless the text raises it, "and your Wounded condition increases by 1".)
export const keepsWounded = (text) => /\b(?:Your|their|its|his|her) Wounded (?:value|condition) does(?:n't| not) increase\b|\bdoes(?:n't| not) increase (?:their|your|its) Wounded (?:value|condition)\b/i.test(String(text ?? "")) || (AVOIDS_KNOCKOUT.test(String(text ?? "")) && !/\bWounded condition increases\b/i.test(String(text ?? "")));
// (Left at 1 Hit Point instead of 0, The Survivor's "Instead of being reduced to 0 Hit Points, you drop to 1 Hit Point instead and immediately
// restore an additional 4d8+16 Hit Points", Immortal Bastion's "You drop to 1 Hit Point instead of being reduced to 0 HP or dying, and you gain
// 100 temporary Hit Points …": item.dropToOne — the card sets its user's Hit Points to 1 and ends the Dying PF2e gave it, no Wounded for it,
// before the healing or temporary Hit Points.)
const DROPS_TO_ONE = /\bInstead of being reduced to 0 Hit Points, you drop to 1 Hit Point instead and\b|\bYou drop to 1 Hit Point instead of being reduced to 0 HP or dying, and\b/i;
export const dropsToOne = (text) => DROPS_TO_ONE.test(String(text ?? ""));
const AVOIDS_KNOCKOUT = /\bWhen you activate (?:it|an? [\w' -]+?|the [\w' -]+?)\s*, you avoid being knocked out and regain\b/i;

// A sentence's own time, else the item's.
export function durationIn(sentence, fallback) {
    const own = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?|days?)\b/i.exec(sentence);
    return own ? { mode: "fixed", value: WORD_NUMBERS[own[1].toLowerCase()] ?? Number(own[1]), unit: UNITS[own[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : fallback;
}

// The same, with a turn's end or start in words: "until the end of your next turn", "until the start of your next turn" (that
// next turn's), "until the end of your turn", "this turn", "the current turn" — and "during those Stride actions", "for this
// movement", the movement the same activation makes this turn (this turn's end: 0 rounds, as PF2e's own Effects say it).
const UNTIL_TURN = /\buntil the (end|start|beginning) of (your next|your|this|the current) turn\b/i;
const THIS_MOVE = /\b(?:during (?:those|these|the|that|this) (?:\w+ )?(?:actions?|movement|Strides?)|for (?:this|that|the) (?:movement|move|Stride))\b/i;
export function timeIn(sentence, fallback) {
    const until = UNTIL_TURN.exec(sentence);
    const next = until && /\bnext\b/i.test(until[2]);
    if (until && (next || /^end$/i.test(until[1]))) return { mode: "fixed", value: next ? 1 : 0, unit: "rounds", expiry: /^end$/i.test(until[1]) ? "turn-end" : "turn-start", anchor: "source-turn" };
    if (!until && THIS_MOVE.test(sentence)) return { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
    return durationIn(sentence, fallback);
}

// The text's sentences, without its "Activate" line ("Activate (manipulate)", "Activate Interact", "Activate 1 minute (Interact)").
const ACTIVATE_LINE = /^Activat(?:e|ion)\b(?:\s*-\s*[^(]*?)?\s*(?:\d+ (?:rounds?|minutes?|hours?)\s*)?(?:\([^)]*\)|Interact|Strike|Cast a Spell|command|envision)?(?:\s*\([^)]*\))?\s*/i;
const sentencesOf = (text) => text.replace(ACTIVATE_LINE, "").split(/(?<=[.!?])\s+(?=[A-Z])/);

// Conditions the item puts on "you", with their own time in the same sentence: "making you concealed for 5
// minutes", "rendering you immobilized for 1 minute", "you are enfeebled 1 until the end of your next turn".
// Not one in a sentence that says when or if ("After a successful Strike …, you are quickened", "if you
// critically fail …, you become stupefied"), nor one with no time of its own ("Throughout this time, you are
// clumsy 2"): those are the GM's to apply.
const UNTIL_NEXT_TURN = /\buntil the (?:end|start|beginning) of your next turn\b/i;
function selfConditions(sentences, used = new Set()) {
    const effects = [];
    const names = CONDITIONS.join("|");
    // (And "You Stride and turn partially invisible, becoming Concealed …": the sentence's own "you"; Propulsive Boots' "You
    // stomp three times and gain the Quickened condition for 1 minute".)
    const pattern = new RegExp(String.raw`\b(?:making|leaving|rendering|render|makes|leaves|renders) you (${names})(?: (\d+))?\b|\byou(?:'re| are| become| also become| are also| remain)(?: (?:both|also|now))? (${names})(?: (\d+))?\b|\bYou\b[^.]*?,\s*becoming (${names})(?: (\d+))?\b|\b(?:you|You\b[^.,]*? and) gain the (${names})(?: (\d+))? condition\b`, "gi");
    for (const [index, sentence] of sentences.entries()) {
        // (Not what a quickened condition's extra action is for, after it: Mariner's Mien's "…, and can use the extra action to Take
        // Control of the vehicle or, if you're already piloting it, Drive" — the note's.)
        const judged = sentence.replace(/^\s*(?:When|Upon|After) (?:you )?(?:drink|consum|eat|imbib|swallow|activat)\w*\b[^,]*,/i, "").replace(/,? and (?:you )?can use the (?:extra|additional) action\b.*$/i, "");
        if (/\b(?:if|when|whenever|unless|while|after|once|each time|throughout|instead of|can't|cannot|don't|aren't|isn't|no longer|could|would|against|next time)\b/i.test(judged)) continue;
        // ("until you Dismiss the Activation": until it's removed.)
        const stated = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?|days?)\b/i.test(sentence) || UNTIL_NEXT_TURN.test(sentence);
        const dismissed = !stated && /\buntil you Dismiss\b/i.test(sentence);
        const timed = stated || dismissed;
        if (!timed) continue;
        const until = UNTIL_NEXT_TURN.exec(sentence);
        const duration = until ? { mode: "fixed", value: 1, unit: "rounds", expiry: /\bend\b/i.test(until[0]) ? "turn-end" : "turn-start", anchor: "source-turn" } : durationIn(sentence, null);
        for (const match of sentence.matchAll(pattern)) {
            // (The "becoming" form only after a capital "You": the sentence's subject.)
            if (match[5] && !match[0].startsWith("You")) continue;
            const slug = (match[1] ?? match[3] ?? match[5] ?? match[7]).toLowerCase();
            const value = match[2] ?? match[4] ?? match[6] ?? match[8];
            if (effects.some((effect) => effect.slug === slug)) continue;
            // (Only to some: "invisible to scrying magic", "Invisible to creatures with the fiend … trait" — not the condition.)
            if (/^\s*(?:to|from|against)\b/i.test(sentence.slice(match.index + match[0].length))) continue;
            // (Another way it ends, "or until you use a hostile action, whichever comes first", stays on the note.)
            // ("or until you Dismiss the activation" is removing it: not another way.)
            // (Nor what its extra action is for: the note keeps it.)
            if (!/\bor until (?!you Dismiss)/i.test(sentence) && !/\bcan use the (?:extra|additional) action\b/i.test(sentence)) used.add(index);
            effects.push({ kind: "condition", slug, value: value ? Number(value) : null, duration: slug === "prone" || dismissed ? null : duration });
        }
    }
    // (Prone, which has no time: Possum's Play's "When you activate the talisman, the triggering attack gains the nonlethal
    // trait, and you fall Prone, feigning death" — the sentence a note for the rest.)
    for (const sentence of sentences) {
        const own = sentence.replace(/^\s*When you activate (?:it|the [\w' -]+?),\s*/i, "");
        if (!effects.some((effect) => effect.slug === "prone") && /\byou (?:fall|drop) Prone\b/i.test(own) && !/\b(?:if|when|whenever|unless|would|instead of)\b/i.test(own)) effects.push({ kind: "condition", slug: "prone", value: null, duration: null });
    }
    return effects;
}

const AMOUNT = String.raw`(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)`;

// ("You also gain 15 temporary Hit Points", Bangles of Crowns; another's, Razmiri Wayfinder's "You touch an adjacent creature,
// granting them 3d8 temporary Hit Points for 1 hour" — chosen on the card, as healing another is.)
function tempHitPoints(sentences, duration, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        // (And an oil that "grants you" them, for its time.)
        const own = new RegExp(String.raw`\byou (?:also )?gain ${AMOUNT} temporary Hit Points\b|\bgrants you ${AMOUNT} temporary Hit Points\b`, "i").exec(sentence);
        const other = own ? null : new RegExp(String.raw`^You touch an? (?:adjacent |willing |living )*(?:creature|ally), granting (?:them|it) ${AMOUNT} temporary Hit Points\b`, "i").exec(sentence.trim());
        const match = own ?? other;
        if (match && (other || !/\b(?:if|when|whenever|each time|the next time)\b/i.test(sentence.slice(0, match.index)))) {
            // (Its other half stays unread, for the note: "You drop to 1 Hit Point instead of being reduced to 0 HP or dying,
            // and you gain 100 temporary Hit Points" — the 1 HP the GM sets.)
            // (And "you avoid being knocked out", or "and deal the same amount of bludgeoning damage to the swarm": the GM's, on the note.)
            if (!/\binstead\b|\bavoid being knocked out\b|\band deals? (?:the same|an equal)\b/i.test(sentence.replace(DROPS_TO_ONE, ""))) used.add(index);
            const amount = (match[1] ?? match[2]).replace(/\s+/g, "");
            // (Their time in a sentence of their own after: "You lose any remaining temporary Hit Points after 1 minute", "These
            // temporary Hit Points last for 1 hour" — before the item's.)
            const later = sentences.slice(index + 1, index + 3).findIndex((next) => /\btemporary Hit Points\b[^.]*\b(?:after|for) (?:\d+|one|an?) (?:rounds?|minutes?|hours?|days?)\b/i.test(next) && !/\b(?:if|when|whenever)\b/i.test(next));
            // ("that last until the start of your next turn", Immortal Bastion's: that turn's start or end.)
            const own = durationIn(sentence, null) ?? (/\btemporary Hit Points that last until the (?:start|beginning|end) of your next turn\b/i.test(sentence) ? timeIn(sentence, null) : null);
            const time = own ?? (later >= 0 ? durationIn(sentences[index + 1 + later].replace(/\bafter (?=\d|one|an?\b)/i, "for "), null) : null);
            if (!own && later >= 0) used.add(index + 1 + later);
            return { kind: "temp-hp", ...(/d/.test(amount) ? { formula: amount } : { amount: Number(amount) }), duration: time ?? duration, ...(other ? { other: true } : {}) };
        }
    }
    return null;
}

// Temporary Hit Points from another creature's level: Bloodthirsty's "You gain a number of temporary Hit Points equal to twice the
// creature's level" (the one reduced to 0 Hit Points) → [{ multiplier, duration }], the item card's: the creature its presser targets.
// (Or Hit Points regained, Holy's "You regain HP equal to double the unholy creature's level" → [{ multiplier, heal: true }].)
const TIMES = { half: 0.5, twice: 2, double: 2, "three times": 3, "four times": 4 };
// (Or from an amount its trigger gave, typed on the card: Bloodknuckles' "You gain temporary Hit Points equal to the value of the
// triggering bleed damage, up to a maximum of 10 temporary HP", Reaper's Toll's "If your Strike hits, you gain temporary Hit Points equal
// to half the damage dealt", Assassin's Skin's "instead regain Hit Points equal to the bleed damage" → [{ from: "amount", of, multiplier,
// max?, heal?, duration }].)
const AMOUNT_TEMP = /\b(?:you|and(?: instead)?) (gain|regain) (?:a number of )?(temporary Hit Points|Hit Points|HP) equal to (?:(half|twice|double|three times|four times) )?(?:the value of )?(the (?![\w ]*?'s level\b)[^,.]+?)(?:,? up to a maximum of (\d+)(?: temporary (?:HP|Hit Points))?)?(?=,|\.|$| until\b| for\b| which\b)/i;
function amountTempOf(sentence, index, sentences, duration, used) {
    const own = sentence.replace(/^\s*If (?:your|the) Strike hits,\s*/i, "");
    if (/^\s*(?:If|When|Whenever|Each time)\b/i.test(own)) return null;
    const match = AMOUNT_TEMP.exec(own);
    if (!match) return null;
    // (Not a sentence that says more after it, Grisly Scythe's "…, and the creature struck becomes Sickened 1 from the agony": that stays.)
    if (!/,\s*and\b/i.test(own.slice(match.index + match[0].length))) used.add(index);
    const heal = !/^temporary/i.test(match[2]);
    const later = heal ? null : sentences.slice(index + 1, index + 3).find((next) => /\b(?:temporary )?Hit Points (?:remain|last)\b|\blose any remaining temporary Hit Points after\b/i.test(next));
    if (later) used.add(sentences.indexOf(later));
    // ("until your next turn": until its start.)
    const time = heal ? null : timeIn(own.replace(/\buntil your next turn\b/i, "until the start of your next turn"), null) ?? (later ? durationIn(later.replace(/\bafter (?=\d|one|an?\b)/i, "for "), null) : null) ?? duration;
    return { from: "amount", of: match[4].replace(/\s*\([^)]*\)/g, "").trim(), multiplier: TIMES[match[3]?.toLowerCase()] ?? 1, ...(match[5] ? { max: Number(match[5]) } : {}), ...(heal ? { heal: true } : {}), duration: time };
}
function levelTempOf(sentences, duration, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        const amount = amountTempOf(sentence, index, sentences, duration, used);
        if (amount) return [amount];
        if (/^\s*(?:If|When|Whenever|Each time)\b/i.test(sentence)) continue;
        const match = /\byou gain (?:a number of )?temporary Hit Points equal to (?:(half|twice|three times|four times) )?the (?:triggering |target |reduced )?(?:creature|foe|enemy|target)'s level\b/i.exec(sentence);
        const regain = match ? null : /\byou regain (?:HP|Hit Points) equal to (?:(half|twice|double|three times|four times) )?the (?:triggering |target |reduced |[a-z]+ )?(?:creature|foe|enemy|target)'s level\b/i.exec(sentence);
        if (regain) {
            used.add(index);
            return [{ multiplier: TIMES[regain[1]?.toLowerCase()] ?? 1, heal: true, duration: null }];
        }
        if (!match) continue;
        used.add(index);
        // (Their time in a sentence of their own after: "These Hit Points remain for 1 minute".)
        const later = sentences.slice(index + 1, index + 3).find((next) => /\b(?:temporary )?Hit Points (?:remain|last)\b/i.test(next));
        if (later) used.add(sentences.indexOf(later));
        return [{ multiplier: TIMES[match[1]?.toLowerCase()] ?? 1, duration: durationIn(sentence, null) ?? (later ? durationIn(later, null) : null) ?? duration }];
    }
    return [];
}

// "you regain 3d10 Hit Points"; or another creature's, "restoring 4d6+15 Hit Points to it" (a willing, adjacent creature:
// other, so the card offers the user and the creatures next to them).
const AMOUNT_PARENS = String.raw`\(?(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\)?`;
function textHealing(sentences, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        // ("you regain 3d10 Hit Points", "you regain an additional 4d6 Hit Points", "You restore 8d10+15 Hit Points", "healing you
        // for 3d8 Hit Points", "healing the wielder for 10 Hit Points".)
        // (The Survivor's "you drop to 1 Hit Point instead and immediately restore an additional 4d8+16 Hit Points".)
        // (And Guardian Rose's "you avoid being knocked out and regain 2d8+5 Hit Points": the same "you".)
        // (And one Hit Point, Magical Medal (Phoenix's Fire)'s "regain 1 Hit Point".)
        // (And Swarmeater's Clasp's "You recover 3d10+8 Hit Points".)
        const self = new RegExp(String.raw`\b(?:you|you [a-z ]{1,40}? and) (?:immediately )?(?:regain|recover) (?:an additional )?${AMOUNT_PARENS} Hit Points?\b|\bYou restore ${AMOUNT_PARENS} Hit Points\b(?! to)|\bhealing (?:you|the wielder|the wearer) for ${AMOUNT_PARENS} Hit Points\b|\band (?:immediately )?restore an additional ${AMOUNT_PARENS} Hit Points\b(?! to)`, "i").exec(sentence);
        // (And another's own words: "Your ally regains 2d8 hit points", The Midwife's "restore to the target 6d8+24 Hit Points", Banner of
        // the Rising Star's "An ally within the banner's aura with the Dying condition regains 30 Hit Points".)
        // (Or the creatures in an area, a Magic+ scepter's healing wave in a cone: each one the presser targets.)
        const other = new RegExp(String.raw`\brestor(?:e|es|ing) ${AMOUNT_PARENS} Hit Points to (?:it|them|the (?:target|creature)|that creature|an? (?:willing,? |living,? |adjacent,? )*(?:creature|ally)|all creatures within an? \d+-foot (?:cone|burst|emanation|line))\b|\bYour ally regains ${AMOUNT_PARENS} Hit Points\b|\b(?:An?|One|That) ally\b[^.]*?\bregains ${AMOUNT_PARENS} Hit Points?\b|\brestor(?:e|es|ing) to (?:it|the (?:target|creature)|that creature) ${AMOUNT_PARENS} Hit Points\b`, "i").exec(sentence);
        const match = self ?? other;
        // (Tallowheart Mass's "If you consume a portion, you regain …": the eating is the activation, not a condition.)
        // (Nor Lover's Knot's "When you activate a lover's knot, you regain 2d6 Hit Points": the activation itself.)
        const lead = sentence.slice(0, match?.index ?? 0).replace(/^\s*If you (?:consume|eat|drink) (?:a portion|it|one)[^,]*,\s*/i, "").replace(/^\s*When you activate (?:it|the [\w' -]+?|an? [\w' -]+?),\s*/i, "");
        if (match && !/\b(?:if|when|whenever|each time|the next time|at the (?:start|end))\b/i.test(lead)) {
            // (What it does "instead" — "you drop to 1 Hit Point instead" — stays on the note for the GM.)
            // (And "you avoid being knocked out", or "and deal the same amount of bludgeoning damage to the swarm": the GM's, on the note.)
            if (!/\binstead\b|\band deals? (?:the same|an equal)\b/i.test(sentence.replace(DROPS_TO_ONE, "")) && (!/\bavoid being knocked out\b/i.test(sentence) || keepsWounded(sentence))) used.add(index);
            const amount = match.slice(1).find((group) => group !== undefined).replace(/\s+/g, "");
            return { kind: "heal", ...(/d/.test(amount) ? { formula: amount } : { amount: Number(amount) }), ...(other && !self ? { other: true } : {}) };
        }
    }
    return null;
}

// PF2e's FlatModifier selectors for what a bonus or penalty applies to ("Fortitude saves", "Perception checks").
const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const SELECTORS = [
    [/^(?:saves|saving throws)$/i, "saving-throw"], [/^fortitude(?: saves?| saving throws?)?$/i, "fortitude"], [/^reflex(?: saves?| saving throws?)?$/i, "reflex"],
    [/^will(?: saves?| saving throws?)?$/i, "will"], [/^perception(?: checks?)?$/i, "perception"], [/^(?:ac|armor class)$/i, "ac"],
    [/^attack rolls?$/i, "attack-roll"], [/^checks$/i, "check"], [/^damage rolls?$/i, "damage"], [/^initiative(?: rolls?| checks?)?$/i, "initiative"], [/^skill checks$/i, "skill-check"],
    ...SKILLS.map((skill) => [new RegExp(`^${skill}(?: checks?)?$`, "i"), skill]),
    // (A DC: "your Deception DC", "Fortitude DC" — PF2e's "{statistic}-dc" domain.)
    ...[...SKILLS, "fortitude", "reflex", "will", "perception"].map((statistic) => [new RegExp(`^(?:your )?${statistic} DC$`, "i"), `${statistic}-dc`]),
    // ("Intelligence-based skill checks": PF2e's int-based domain.)
    [/^strength-based (?:skill )?checks?$/i, "str-based"], [/^dexterity-based (?:skill )?checks?$/i, "dex-based"], [/^constitution-based (?:skill )?checks?$/i, "con-based"],
    [/^intelligence-based (?:skill )?checks?$/i, "int-based"], [/^wisdom-based (?:skill )?checks?$/i, "wis-based"], [/^charisma-based (?:skill )?checks?$/i, "cha-based"]
];

export function selectorsOf(list) {
    // "Arcana, Crafting, and Society checks": the last word belongs to each.
    const names = list.replace(/,? (?:as well as|and) /g, ", ").split(/,\s*/).map((name) => name.trim()).filter(Boolean);
    const tail = /\b(checks|saves|saving throws|rolls)$/i.exec(names.at(-1) ?? "")?.[1] ?? "";
    const selectors = [];
    for (const name of names) {
        const full = tail && !new RegExp(`\\b${tail}$`, "i").test(name) ? `${name} ${tail}` : name;
        const entry = SELECTORS.find(([pattern]) => pattern.test(full)) ?? SELECTORS.find(([pattern]) => pattern.test(name));
        if (!entry) return null;
        selectors.push(entry[1]);
    }
    return selectors.length ? [...new Set(selectors)] : null;
}

// A scope PF2e has a roll option for, as the modifier's predicate: "saves against diseases and poisons" → item:trait:disease
// or item:trait:poison; "Athletics checks to Climb" → action:climb. Anything else narrower than a selector stays out.
const TRAITS = { poisons: "poison", poison: "poison", diseases: "disease", disease: "disease", fear: "fear", mental: "mental", emotion: "emotion", auditory: "auditory", visual: "visual", olfactory: "olfactory", inhaled: "inhaled", curses: "curse", curse: "curse", illusions: "illusion", illusion: "illusion", sleep: "sleep", death: "death", possession: "possession", polymorph: "polymorph" };
const ACTIONS = { repair: "repair", reposition: "reposition", climb: "climb", swim: "swim", "high jump": "high-jump", "long jump": "long-jump", leap: "leap", balance: "balance", "tumble through": "tumble-through", escape: "escape", hide: "hide", sneak: "sneak", seek: "seek", "sense motive": "sense-motive", "sense direction": "sense-direction", track: "track", demoralize: "demoralize", feint: "feint", grapple: "grapple", trip: "trip", shove: "shove", disarm: "disarm", "recall knowledge": "recall-knowledge", "treat wounds": "treat-wounds", "administer first aid": "administer-first-aid", "pick a lock": "pick-a-lock", "disable a device": "disable-a-device", squeeze: "squeeze", impersonate: "impersonate", lie: "lie", "make an impression": "make-an-impression", request: "request", coerce: "coerce", perform: "perform", "decipher writing": "decipher-writing", "identify magic": "identify-magic", "identify alchemy": "identify-alchemy", "learn a spell": "learn-a-spell", "create a diversion": "create-a-diversion", "create forgery": "create-forgery", "palm an object": "palm-an-object", steal: "steal", subsist: "subsist", "gather information": "gather-information" };
// Creatures PF2e's origin roll options name ("against effects created by devils" → origin:trait:devil).
const CREATURES = { aberrations: "aberration", animals: "animal", beasts: "beast", celestials: "celestial", constructs: "construct", daemons: "daemon", demons: "demon", devils: "devil", dragons: "dragon", elementals: "elemental", fey: "fey", fiends: "fiend", fungi: "fungus", giants: "giant", hags: "hag", haunts: "haunt", oozes: "ooze", plants: "plant", spirits: "spirit", swarms: "swarm", undead: "undead" };
const CONDITION_WORDS = { fatigue: "fatigued", fatigued: "fatigued", petrify: "petrified", petrified: "petrified", paralyze: "paralyzed", paralyzed: "paralyzed", frighten: "frightened", frightened: "frightened", sicken: "sickened", sickened: "sickened", stun: "stunned", stunned: "stunned", confuse: "confused", confused: "confused", slow: "slowed", slowed: "slowed" };
// One thing a save is against, as a roll option: a trait ("poisons"), "afflictions", "being petrified", "forced movement".
function againstTerm(word) {
    const lower = word.toLowerCase().trim();
    if (TRAITS[lower]) return `item:trait:${TRAITS[lower]}`;
    if (/^afflictions?$/.test(lower)) return { or: ["item:trait:curse", "item:trait:disease", "item:trait:poison"] };
    if (/^forced movement$/.test(lower)) return "forced-movement";
    const being = /^being (\w+)$/.exec(lower);
    if (being && CONDITION_WORDS[being[1]]) return `inflicts:${CONDITION_WORDS[being[1]]}`;
    return null;
}
// (A creature's trait on an attack or its damage is the target's, "+2 item bonus on attack rolls … against undead": target:trait, not the origin
// a save's effect comes from.)
const ATTACKS = /^(?:attack-roll|attack|strike-attack-roll|spell-attack-roll|damage|strike-damage)$/;
const aimedAt = (predicate, selector) => (ATTACKS.test(selector) ? JSON.parse(JSON.stringify(predicate).replace(/"origin:trait:/g, '"target:trait:')) : predicate);
function scopeOf(scope) {
    // ("against effects created by devils and divine spells cast by devils", "against undead", "against creatures with the
    // fey trait": what the creature makes, by its origin's trait.)
    const origin = /^against (?:(?:the )?(?:effects|attacks|abilities|spells)(?: and (?:effects|abilities|spells))? (?:created by|from|of) )?(?:creatures with the (\w+) trait|(\w+)(?: creatures)?)(?: and (?:[\w ]+ )?(?:cast|created) by (?:\w+))?$/i.exec(scope);
    const creature = origin ? (origin[1] ? Object.values(CREATURES).find((trait) => trait === origin[1].toLowerCase()) : CREATURES[origin[2].toLowerCase()]) : null;
    if (creature) return [`origin:trait:${creature}`];
    // ("against effects that could render you Fatigued", "against effects that would fatigue you": what the effect gives.)
    const inflicts = /^against effects that (?:could|would|might) (?:render you|make you|leave you|cause you to (?:be|become))? ?(\w+)(?: you)?$/i.exec(scope);
    if (inflicts && CONDITION_WORDS[inflicts[1].toLowerCase()]) return [`inflicts:${CONDITION_WORDS[inflicts[1].toLowerCase()]}`];
    // ("AC against ranged attacks", "against physical ranged attacks": the attack's own options.)
    const attacks = /^against (physical )?(ranged|melee) attacks$/i.exec(scope);
    if (attacks) return [...(attacks[1] ? ["item:damage:category:physical"] : []), `item:${attacks[2].toLowerCase()}`];
    const against = /^against ((?:[\w-]+(?: movement)?(?:,? (?:and|or) |, )?)+?)(?: effects| spells| abilities| threats)?$/i.exec(scope);
    if (against) {
        const terms = against[1].split(/,? (?:and|or) |, /).map(againstTerm);
        if (!terms.length || terms.some((term) => !term)) return null;
        const flat = terms.flatMap((term) => (typeof term === "string" ? [term] : term.or));
        return [flat.length === 1 ? flat[0] : { or: [...new Set(flat)] }];
    }
    // ("skill checks for auditory actions, except Deception and Diplomacy checks", Megaphone Mutagen as src/compiler/item-data.js words it:
    // the actions' trait, PF2e's item:trait option as Deafened's own rule has it, the skills left out by their check:statistic.)
    const traitActions = /^for (auditory|visual|linguistic|olfactory) actions(?:,? except ((?:[A-Z]\w+)(?:(?:,? and|,) [A-Z]\w+)*) checks)?$/.exec(scope);
    if (traitActions) return [`item:trait:${traitActions[1]}`, ...(traitActions[2] ? [{ nor: traitActions[2].split(/,? and |, /).map((skill) => `check:statistic:${skill.toLowerCase()}`) }] : [])];
    const to = /^to ((?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?)(?:(?:,? (?:and|or) |, )(?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?))*)$/.exec(scope)
        // (In lower case too, when every name is an action's: "to disarm, grapple, reposition, shove, and trip", "to sense-motive".)
        ?? /^to ([a-z][a-z -]*(?:(?:,|,? and|,? or) [a-z][a-z -]*)*)$/.exec(scope);
    if (to) {
        const actions = to[1].split(/,? (?:and|or) |, /).map((words) => ACTIONS[words.toLowerCase().replace(/-/g, " ")]);
        if (!actions.length || actions.some((action) => !action)) return null;
        return [actions.length === 1 ? `action:${actions[0]}` : { or: actions.map((action) => `action:${action}`) }];
    }
    return null;
}

// "+1 item bonus to Fortitude saves" / "–2 penalty to Will saves, Perception checks and initiative rolls" / "+1 item bonus to
// saving throws against diseases and poisons" / "+2 status bonus to Athletics checks to Climb" / "+10-foot status bonus to
// your Speed".
function modifiersOf(sentences, duration, used = new Set()) {
    const modifiers = [];
    const pattern = /\b(?:you (?:gain|get|have|receive|take|suffer)|grants? you|granting you)(?: an?)? ([+-])(\d+)(-foot)? (?:(item|status|circumstance) )?(bonus|penalty) (?:to|on) ([^.;]+?)(?=(?: for (?:\d+|one|an?) \w+| until\b| while\b| during (?:those|these|the|that|this)\b| for (?:this|that|the) (?:movement|move|Stride)\b|,? (?:but|which|though|unless|if)\b|,? and (?:you|your)\b| as long as\b|;|\.|$))/gi;
    for (const [index, whole] of sentences.entries()) {
        // ("When you Activate this fulu, you gain …", "Upon drinking …,": the use itself, not a condition.)
        // (A candy's time, said as while it's chewed "for up to" a time: its most.)
        const sentence = whole.replace(/^\s*(?:When|After|Upon|Once) (?:you )?(?:activate|drink|consume|eat|imbibe|apply|use|chew|inhale)\w*\b[^,]*,\s*/i, "")
            .replace(/^\s*While you're (?:chewing|sucking on) [^,]+,\s*/i, "")
            .replace(/\bfor up to (\d+|one|an?) (rounds?|minutes?|hours?)\b/gi, "for $1 $2");
        // ("While the effect lasts, you gain …", "During this time, …": its time, not a condition.)
        const said = sentence.replace(/^\s*(?:While (?:the|this|its) (?:effect|elixir|potion|benefit)s? lasts?|While (?:it's |it is )?activated|While this effect is active|During this time|For the duration),\s*/i, "")
            // ("You Stride twice and gain a +10-foot item bonus to your Speed …", Quick Runner's Shirt: the same "you".)
            .replace(/^(\s*You [A-Za-z]+\b[^.,;]*?) and (gain|receive) (an? [+-]\d)/, "$1, and you $2 $3")
            // ("you gain resistance 5 … but take a -5-foot status penalty to all Speeds": the same "you".)
            .replace(/(\byou (?:gain|get|have)\b[^.;]*?),? (but|and) (take|suffer)\b/i, "$1, $2 you $3")
            // ("a +1 status bonus against fear effects": saves against them, as PF2e's own Effects read it.)
            .replace(/\b(bonus|penalty) against (?=[\w -]+? effects\b)/gi, "$1 to saving throws against ")
            // (A penalty "imposed" on you: Aeon Stone (Olivine Pendeloque)'s "the calming urges impose a -1 status penalty to your
            // attack rolls".)
            .replace(/\b(?:imposes?|imposing) an? ([-–−]\d+ (?:item |status |circumstance )?penalty (?:to|on) your)\b/gi, "you take a $1")
            // ("a +2 item bonus to attempts to Decipher Writing, Disable a Device, …, or Sense Motive", Eye of the Wise: checks for those
            // actions.)
            .replace(/\b(bonus|penalty) to attempts to (?=[A-Z])/g, "$1 to checks to ")
            // ("a +3 item bonus on Perception checks you make to use Sense Motive against that creature", Spectacles of Inquiry: the
            // action's checks, the one creature a note.)
            .replace(/\b(checks) you make to use ([A-Z][\w ]+?) against (?:that|the) (?:creature|target)\b/g, "$1 to $2")
            // (A skill its user picked, after the list: Words of Wisdom's "+1 item bonus to Diplomacy checks and checks of the skill
            // associated with your phrase" — Diplomacy read, the rest a note.)
            .replace(/(\bbonus to [\w -]+? checks) and checks of the skill associated with [^.;]+/gi, "$1; ");
        // (What the sentence says before or after the part read — "The stone suppresses the triggering effect for 1 minute, but …" —
        // stays on the note.)
        const partly = said !== sentence && (/\bchecks of the skill associated with\b/i.test(sentence) || /\bchecks you make to use [A-Z][\w ]+? against (?:that|the) (?:creature|target)\b/.test(sentence) || (/\b(?:imposes?|imposing) an?\b/i.test(sentence) && /,\s*but\b[^,]*\byou take\b/i.test(said)));
        if (/^\s*(?:If|When|Whenever|While|Each time)\b/i.test(said)) continue;
        // (An aeon stone's resonant power is the wayfinder's, not the activation's: "The resonant power grants you a +1 circumstance bonus
        // to initiative rolls".)
        if (/^\s*The resonant power\b/i.test(said)) continue;
        for (const match of said.matchAll(pattern)) {
            const [, sign, number, feet, type, kind, list] = match;
            if ((kind.toLowerCase() === "bonus") !== (sign === "+")) continue;
            const value = (sign === "+" ? 1 : -1) * Number(number);
            const timed = { type: type?.toLowerCase() ?? "untyped", duration: timeIn(sentence, duration) };
            // ("+10-foot status bonus to your Speed": the land Speed; "to your Speeds": all of them.)
            if (feet) {
                // ("to your Speed and fly Speed", Cape of the Open Sky: each one's.)
                const both = /^(?:your )?(?:land )?Speed and (?:your )?(fly|climb|swim|burrow) Speed$/i.exec(list.trim());
                const speeds = /^(?:your |its |all (?:of )?(?:your )?)?(?:land )?(Speeds?)$/i.exec(list.trim());
                if (!speeds && !both) continue;
                used.add(index);
                if (both) modifiers.push({ selector: "land-speed", value, ...timed }, { selector: `${both[1].toLowerCase()}-speed`, value, ...timed });
                else modifiers.push({ selector: /s$/i.test(speeds[1]) ? "all-speeds" : "land-speed", value, ...timed });
                continue;
            }
            // (A bonus to damage with one kind of weapon, "damage rolls with melee weapons": its Strikes' damage, by PF2e's item option.)
            const weaponDamage = /^(?:your )?damage rolls with (melee|ranged) weapons$/i.exec(list.trim());
            if (weaponDamage) {
                used.add(index);
                modifiers.push({ selector: "strike-damage", value, ...timed, predicate: [`item:${weaponDamage[1].toLowerCase()}`] });
                continue;
            }
            // A scope after the list ("… against diseases", "… to Climb"): a predicate when PF2e has one, else left out.
            const scoped = /^(.+?) ((?:against|to) .+)$/.exec(list) ?? /^(.+?) (for (?:auditory|visual|linguistic|olfactory) actions\b.*)$/.exec(list);
            const predicate = scoped ? scopeOf(scoped[2]) : null;
            const names = predicate ? scoped[1] : list;
            if (scoped && !predicate) continue;
            if (/\b(?:against|to|made|when|if|that|for|as part of|while|with|using|from|of|in)\b/i.test(names)) continue;
            // (An action's scope after a list is the last one's: "Will saves, Intelligence-based skill checks, and skill checks to
            // sense-motive" — only the skill checks are to Sense Motive.)
            const parts = names.split(/,? (?:as well as|and) |, /).map((part) => part.trim()).filter(Boolean);
            const lastOnly = predicate && /^to\b/i.test(scoped[2]) && parts.length > 1;
            const selectors = lastOnly ? selectorsOf(parts.slice(0, -1).join(", ").replace(/^(?:all|your) /i, "")) : selectorsOf(names.replace(/^(?:all|your) /i, ""));
            const scopedSelectors = lastOnly ? selectorsOf(parts.at(-1).replace(/^(?:all|your) /i, "")) : null;
            if (!selectors || (lastOnly && !scopedSelectors)) continue;
            // (A sentence that goes on — "…, and your melee Strikes deal 1 additional precision damage to Off-Guard creatures" —
            // stays a note too.)
            const tail = said.slice(match.index + match[0].length);
            // (Nor one only while something else lasts — "… to skill checks to Recall Knowledge while Investigating": that stays on the note.)
            // (Unless what goes on is the Strikes' extra damage the strike-damage reader takes, Martial Mayhem Mutagen's: all of it read.)
            const strikeTail = /^,? and (your (?:melee |ranged |unarmed )?Strikes\b[^.;]*)\.?\s*$/i.exec(tail);
            const readTail = strikeTail && new RegExp(`^${STRIKE_EXTRA.source}$`, "i").test(strikeTail[1].trim());
            if ((!/^,? and (?:you|your)\b/i.test(tail) || !MECHANICAL.test(tail) || readTail) && !partly && !/^,? while\b/i.test(tail)) used.add(index);
            for (const selector of selectors) modifiers.push({ selector, value, ...timed, ...(predicate && !lastOnly ? { predicate: aimedAt(predicate, selector) } : {}) });
            // (Sense Motive is a Perception check in PF2e: "skill checks to sense-motive" are Perception's.)
            const perceptionOnly = JSON.stringify(predicate ?? []) === JSON.stringify(["action:sense-motive"]);
            for (const selector of scopedSelectors ?? []) modifiers.push({ selector: perceptionOnly && selector === "skill-check" ? "perception" : selector, value, ...timed, predicate });
        }
    }
    return modifiers;
}

// Its user's own resistance for the item's time: "you gain resistance 5 to slashing and piercing damage", "you have
// resistance 10 to electricity", "you gain resistance 5 to all damage" → [{ type, value, duration }] (PF2e's Resistance
// rule, the item card's Effect). Not against one hit ("against the triggering attack", src/compiler/readied-bonus.js), nor
// one with exceptions, a type to choose, or another's.
const RESIST_TYPES = new Set(["acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "bleed", "holy", "unholy", "physical", "energy"]);
// Resistance to damage some creatures deal, a third-party food's resistance to two damage types from unholy creatures, or
// to all their damage beside a tradition's spells → { type: "custom", value, from: [traits], damage: [types], label, duration }:
// PF2e's custom resistance, its definition the damage's types and its source's traits (a rule's own predicate is tested on the
// creature itself, and never matches the source).
const SINGULAR = { fey: "fey", undead: "undead", elementals: "elemental", animals: "animal", fiends: "fiend", dragons: "dragon", giants: "giant", beasts: "beast", plants: "plant", fungi: "fungus", constructs: "construct", aberrations: "aberration", celestials: "celestial", monitors: "monitor", spirits: "spirit", oozes: "ooze" };
const CREATURE_TRAITS = /^(?:holy|unholy|fey|undead|elementals?|animals?|fiends?|dragons?|giants?|beasts?|plants?|fungi|constructs?|aberrations?|celestials?|monitors?|spirits?|oozes?)$/;
const traitOf = (word) => SINGULAR[word] ?? word.replace(/s$/, "");
const listOf = (words, joiner) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1)}` : words[0]);
function sourcedResistances(sentences, duration, used) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|Whenever|Each time)\b/i.test(sentence)) continue;
        // ("… to fire and cold damage dealt by fiend creatures", say.)
        const typed = /\byou gain (?:resistance (\d+)|(\d+) resistance) to ([a-z]+(?:(?:, and|,| and) [a-z]+)*) damage (?:dealt by|from) ([a-z]+(?:(?:, or|,| or) [a-z]+)*) creatures\b/i.exec(sentence);
        // ("… to primal spells, and to damage" from animals, elementals or fey.)
        const spells = typed ? null : /\byou gain (?:resistance (\d+)|(\d+) resistance) to (arcane|divine|occult|primal) spells,? and (?:to )?(?:all )?damage (?:from|dealt by) ([a-z]+(?:(?:, or|,| or) [a-z]+)*)/i.exec(sentence);
        const match = typed ?? spells;
        if (!match) continue;
        const traits = match[4].toLowerCase().split(/,? or |, /).map((word) => word.trim()).filter(Boolean);
        if (!traits.every((word) => CREATURE_TRAITS.test(word))) continue;
        const damage = typed ? match[3].toLowerCase().split(/,? and |, /).map((word) => word.trim()) : [];
        if (!damage.every((type) => RESIST_TYPES.has(type))) continue;
        const value = Number(match[1] ?? match[2]);
        const from = traits.map(traitOf);
        const time = durationIn(sentence, duration);
        if (spells) found.push({ type: match[3].toLowerCase(), value, duration: time });
        const label = `${damage.length ? `${listOf(damage, "and")} damage` : "damage"} from ${listOf(traits, "or")}${typed ? " creatures" : ""}`;
        found.push({ type: "custom", value, from, damage, label: label.charAt(0).toUpperCase() + label.slice(1), duration: time });
        used.add(index);
    }
    return found;
}

// Resistance to all damage but some, Silhouette Cloak's "You gain resistance 20 to all damage except force damage, damage from effects with
// the light trait, and damage from Strikes with the ghost touch property rune. This increases to resistance 40 against nonmagical damage."
// → [{ type: "all-damage", value, exceptions, doubleVs?, duration }] (PF2e's Resistance with exceptions and doubleVs; an exception PF2e
// has no word for — the light trait's — stays a note).
const ALL_BUT = /\byou gain resistance (\d+) to all damage except ([^.]+)\./i;
const DOUBLED = /^\s*This increases to resistance (\d+) against nonmagical damage\.\s*$/i;
const EXCEPTION_WORDS = [[/^force(?: damage)?$/i, "force"], [/^spirit(?: damage)?$/i, "spirit"], [/^damage (?:caused by|from Strikes with) (?:a |the )?ghost touch(?: property)? rune$/i, "ghost-touch"]];
// (Or its exceptions in parentheses, Phase Spike's "You also gain resistance 10 to all damage during this Stride (except force or spirit damage
// and damage caused by a ghost touch rune); double this resistance against non-magical damage" — for this movement.)
const ALL_BUT_PARENS = /\byou (?:also )?gain resistance (\d+) to all damage((?: during this Stride)?) \(except ([^)]+)\); double this resistance against non-magical damage\./i;
function allButResistance(sentences, duration, used) {
    for (const [index, sentence] of sentences.entries()) {
        const parens = ALL_BUT_PARENS.exec(sentence);
        if (parens) {
            const words = parens[3].split(/,\s*(?:and\s+)?|\s+(?:and|or)\s+/).map((word) => word.trim()).filter(Boolean).map((word) => (/^\w+$/.test(word) ? `${word} damage` : word));
            const exceptions = words.map((word) => EXCEPTION_WORDS.find(([pattern]) => pattern.test(word))?.[1]).filter(Boolean);
            if (exceptions.length !== words.length) return [];
            used.add(index);
            return [{ type: "all-damage", value: Number(parens[1]), exceptions, doubleVs: ["non-magical"], duration: timeIn(parens[2] ? "for this movement" : sentence, duration) }];
        }
        const match = ALL_BUT.exec(sentence);
        if (!match) continue;
        const words = match[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map((word) => word.trim()).filter(Boolean);
        const exceptions = words.map((word) => EXCEPTION_WORDS.find(([pattern]) => pattern.test(word))?.[1]).filter(Boolean);
        if (!exceptions.length) return [];
        const value = Number(match[1]);
        const doubled = DOUBLED.exec(sentences[index + 1] ?? "");
        if (doubled && Number(doubled[1]) === value * 2) used.add(index + 1);
        if (exceptions.length === words.length) used.add(index);
        return [{ type: "all-damage", value, exceptions, ...(doubled && Number(doubled[1]) === value * 2 ? { doubleVs: ["non-magical"] } : {}), duration: timeIn(sentence, duration) }];
    }
    return [];
}

function resistancesOf(sentences, duration, used = new Set()) {
    const sourced = sourcedResistances(sentences, duration, used);
    if (sourced.length) return sourced;
    const allBut = allButResistance(sentences, duration, used);
    if (allBut.length) return allBut;
    const found = [];
    // ("you gain resistance 5 to fire", "that creature gains 3 resistance to acid", "resistance 3 to area damage and splash damage".)
    const pattern = /\b(?:you (?:gain|get|have)|(?:that|the) creature (?:gains|has)) (?:resistance (\d+)|(\d+) resistance) to ((?:all|[a-z]+)(?: damage)?(?:(?:,|, and| and) [a-z]+(?: damage)?)*)(?: damage)?(?=[.;]|,? (?:but|and)\b| for\b| until\b|$)/gi;
    for (const [index, whole] of sentences.entries()) {
        const sentence = whole.replace(/^\s*(?:When|After|Upon|Once) (?:you )?(?:activate|drink|consume|eat|imbibe|apply|use|chew|inhale)\w*\b[^,]*,\s*/i, "").replace(/^\s*(?:Additionally|In addition|Also),\s*/i, "");
        // ("When smeared over a creature, that creature gains …": the one it's on, the drinker.)
        const own = sentence.replace(/^\s*When (?:smeared|applied|rubbed|spread) (?:over|on|onto|to) (?:a|an|the) (?:willing )?creature,\s*/i, "");
        if (/^\s*(?:If|When|Whenever|While|Each time)\b/i.test(own) || /\b(?:triggering|except|double|instead|chosen|choose|attuned|one type|all(?:y|ies)|creatures|emanation|aura|against (?:the|that|one))\b/i.test(own) || /\bcreature\b(?! (?:gains|has) )/i.test(own.replace(/\b(?:that|the) creature (?:gains|has)\b/i, ""))) continue;
        // (Or its type first, Dragon's Eye Charm's "You gain fire resistance 5 for 10 minutes", Witch's Finger's "you have cold resistance 3",
        // Injigo's Loving Embrace's "granting you mental resistance 5 and …": the same, as "resistance 5 to fire".)
        const typeFirst = [...own.matchAll(/\b(?:you (?:gain|get|have)|granting you|(?:that|the) creature (?:gains|has)) ([a-z]+(?:(?:,|, and| and) [a-z]+)*) resistance (\d+)\b(?! to\b)(?=[.;]|,? (?:but|and)\b| for\b| until\b|$)/gi)].filter((match) => match[1].toLowerCase().split(/,? and |, /).every((word) => RESIST_TYPES.has(word.trim())));
        for (const match of typeFirst) {
            const more = /^,? (?:and|but)\b/i.test(own.slice(match.index + match[0].length));
            if (!more) used.add(index);
            for (const type of match[1].toLowerCase().split(/,? and |, /).map((word) => word.trim())) found.push({ type, value: Number(match[2]), duration: durationIn(own, duration) });
        }
        for (const match of own.matchAll(pattern)) {
            const words = match[3].toLowerCase().split(/,? and |, /).map((word) => word.trim().replace(/ damage$/, ""));
            // (Splash and area damage: PF2e's splash-damage and area-damage.)
            const types = words.length === 1 && words[0] === "all" ? ["all-damage"] : words.map((word) => (word === "splash" || word === "area" ? `${word}-damage` : word));
            if (!types.every((type) => type === "all-damage" || type === "splash-damage" || type === "area-damage" || RESIST_TYPES.has(type))) continue;
            // (A sentence that says more after it — "… and ignore difficult terrain" — stays a note too, unless that's read.)
            const more = /^,? (?:and|but)\b/i.test(own.slice(match.index + match[0].length));
            if (!more) used.add(index);
            for (const type of types) found.push({ type, value: Number(match[1] ?? match[2]), duration: durationIn(own, duration) });
        }
    }
    return found.length ? found : chosenResistance(sentences, duration, used);
}

// Resistance to a type it makes its user choose, of those the text lists: Potion of Resistance's "grants 5 resistance against a
// single damage type for 1 hour. Each potion … defend against acid, cold, electricity, fire, or sonic damage", Mutagenic
// Renovator's "resistance 5 to one type of energy damage. … choose either acid, cold, electricity, fire, or sonic damage",
// Energy Ointment's "attuned to one of four energy types (acid, cold, electricity, or fire) … resistance 5 to the attuned energy
// type", Chromatic Robe's "Choose acid, cold, electricity, or fire. The robe grants resistance 15 to the chosen damage type" →
// [{ type: null, choose: [types], value, duration }]: the item card's picker. Not without the list.
// (And one its trigger names, Safeguarding's "Trigger You would take mental, poison, or spirit damage Effect You gain resistance 5
// to the triggering damage type": the card's pick of those.)
const CHOSEN = /\b(?:grants? (?:you )?|You gain )(?:(\d+) resistance against a single damage type|resistance (\d+) to (?:one type of energy damage|the attuned energy type|the chosen damage type|the triggering damage type))/i;
const TYPE_LIST = /\b(?:defend against |choose (?:either )?|energy types \(|Choose |Trigger You would take )((?:acid|cold|electricity|fire|sonic|force|vitality|void|mental|poison|spirit)(?:(?:,|, or| or) (?:acid|cold|electricity|fire|sonic|force|vitality|void|mental|poison|spirit))+)/i;
function chosenResistance(sentences, duration, used) {
    const list = TYPE_LIST.exec(sentences.join(" "));
    if (!list) return [];
    const choose = list[1].toLowerCase().split(/,? or |, /).map((word) => word.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = CHOSEN.exec(sentence);
        if (!match || /\b(?:all(?:y|ies)|creatures? (?:in|within)|emanation)\b/i.test(sentence)) continue;
        // (Anything else in it stays a note — but Energy Ointment's "and reduces the DC for the flat check to end persistent damage of the
        // attuned energy type by 3", read: recoveryDC, PF2e's ItemAlteration on the persistent damage of the type picked.)
        const after = sentence.slice(match.index + match[0].length);
        const lower = /^ and reduces the DC for the flat check to end persistent damage of the (?:attuned energy|chosen damage) type by (\d+)\.?$/i.exec(after.trim() ? ` ${after.trim()}` : "");
        if (!/\band (?:reduces|lowers|you)\b/i.test(after) || lower) used.add(index);
        // (The list's own sentence, "Each potion … is created to defend against acid, cold, … damage", is read with it.)
        const listed = sentences.findIndex((other) => TYPE_LIST.test(other));
        if (listed >= 0 && listed !== index && !/\b(?:Each time|whenever|instead|but no)\b/i.test(sentences[listed])) used.add(listed);
        return [{ type: null, choose, value: Number(match[1] ?? match[2]), ...(lower ? { recoveryDC: Number(lower[1]) } : {}), duration: durationIn(sentence, duration) }];
    }
    return [];
}

// A Speed of a new kind for its user, for the item's time: "You gain a fly Speed equal to your Speed until the end of your
// next turn" (Umbral Wings), "a swim Speed equal to half your land Speed" (Buoyant Buckle), "a fly Speed equal to either
// your land Speed or 20 feet, whichever is greater" (Soaring Wings), "a fly Speed of 30 feet or your Speed, whichever is
// lower" (Thrice-Fried Mudwings) → [{ type, value, duration }], value a number or PF2e's formula on the land Speed (PF2e's
// BaseSpeed rule, the item card's Effect). Not under a condition ("If you don't have a fly Speed, …"), nor another's.
const LAND = "@actor.system.movement.speeds.land.value";
function speedsOf(sentences, duration, used = new Set()) {
    const found = [];
    // (And a companion's, the creature the presser targets: Waverider Barding's "granting your companion a swim Speed of 30 feet".)
    // (And Gecko Pads' "The pads give you a climb Speed equal to your Speed".)
    const pattern = /\b(?:you (?:gain|have|get)|grants? you|granting you|that grant you|gives? you|granting your (?:animal )?(?:companion|familiar|mount|eidolon)) an? (?:(\d+)-foot )?(fly|climb|swim|burrow) Speed(?: (?:equal to (?:either )?(half )?your (?:land )?Speed(?: or (\d+) feet, whichever is (greater|higher|lower|slower|less))?|of (\d+) feet(?: or your (?:land )?Speed, whichever is (greater|higher|lower|slower|less))?))?/gi;
    for (const [index, whole] of sentences.entries()) {
        const sentence = whole.replace(/^\s*(?:During this time|While (?:the|this|its) (?:effect|elixir|potion|benefit)s? lasts?|For the duration),\s*/i, "");
        // ("When you Activate the pin, … granting you a fly Speed of 50 feet": the use itself, Dragonscale Cameo's.)
        if (/^\s*(?:If|When(?!ever you consume| you (?:consume|drink|eat|activate))|Whenever|While|Each time|Unless)\b/i.test(sentence) || /\b(?:all(?:y|ies)|creatures? (?:in|within)|emanation|as if you had)\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(pattern)) {
            const [, feetFirst, type, half, orFeet, orWay, ofFeet, ofWay] = match;
            const larger = (way) => /greater|higher/i.test(way);
            let value = null;
            if (feetFirst) value = Number(feetFirst);
            else if (ofFeet) value = ofWay ? `${larger(ofWay) ? "max" : "min"}(${ofFeet},${LAND})` : Number(ofFeet);
            else if (/equal to/i.test(match[0])) {
                const land = half ? `floor(${LAND}*0.5)` : LAND;
                value = orFeet ? `${larger(orWay) ? "max" : "min"}(${orFeet},${land})` : land;
            }
            if (value === null) continue;
            // (Its own time: "until the end of your next turn", "for 10 minutes", "until you Dismiss" — removed by hand —, else the item's.)
            const until = UNTIL_NEXT_TURN.exec(sentence);
            const time = until ? { mode: "fixed", value: 1, unit: "rounds", expiry: /\bend\b/i.test(until[0]) ? "turn-end" : "turn-start", anchor: "source-turn" } : durationIn(sentence, duration);
            const more = sentence.slice(match.index + match[0].length).replace(/^,? (?:for (?:\d+|one|an?) \w+|until the (?:end|start|beginning) of your next turn)/i, "");
            if (!/^[\s.,]*$/.test(more) && !/^,? (?:as|so|and)\b/i.test(more)) continue;
            used.add(index);
            found.push({ type, value, duration: time });
        }
    }
    return found;
}

// Fast healing its user gains for a while, PF2e's FastHealing rule: Infernal Health's "For 6 rounds, at the start of your turn each round,
// you recover 25 Hit Points unless you took spirit damage since the start of your previous turn" (its "unless" a note), "you gain fast
// healing 5 for 1 minute" → [{ value, duration }].
function fastHealingOf(sentences, duration, used = new Set()) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        const match = /\bat the start of your turn each round, you recover (\d+) Hit Points\b/i.exec(sentence) ?? /\byou (?:gain|have) fast healing (\d+)\b/i.exec(sentence);
        if (!match) continue;
        found.push({ value: Number(match[1]), duration: timeIn(sentence, duration) });
        if (!/\bunless\b/i.test(sentence)) used.add(index);
    }
    return found;
}

// An unarmed attack its user gains for a while, PF2e's Strike rule: Ring of the Tiger's "granting you an agile claw unarmed attack that
// inflicts 1d6 slashing damage, and you Strike with the claw. Then the claw turns back to normal" (until the end of the turn), Tentacle
// Potion (Greater)'s "You can also use the limb to make an unarmed attack that deals 1d6 bludgeoning damage and has the sweep trait" (for
// the limb's 24 hours) → [{ name, dice, die, type, traits, duration }].
const UNARMED_NAMES = ["claw", "jaws", "fist", "horn", "tail", "tentacle", "foot", "fangs", "tusk"];
function attacksOf(sentences, duration, used = new Set()) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        const granted = /\bgranting you an? (agile )?(\w+) unarmed attack that (?:inflicts|deals) (\d+)d(\d+) (bludgeoning|piercing|slashing) damage\b/i.exec(sentence);
        const limb = granted ? null : /\buse the limb to make an unarmed attack that deals (\d+)d(\d+) (bludgeoning|piercing|slashing) damage(?: and has the (\w+) trait)?/i.exec(sentence);
        if (!granted && !limb) continue;
        const name = granted ? granted[2].toLowerCase() : "tentacle";
        if (!UNARMED_NAMES.includes(name)) continue;
        // (One Strike, "Then the claw turns back to normal": until the end of the turn.)
        const once = sentences.slice(index + 1).some((other) => /^Then the \w+ turns back to normal\b/i.test(other));
        // (Or the limb's own time, "The limb lasts 24 hours".)
        const lasts = sentences.map((other) => /^The (?:limb|claw|tentacle) lasts (\d+) (hours?|minutes?)\b/i.exec(other)).find(Boolean);
        const time = once ? { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end" } : lasts ? { mode: "fixed", value: Number(lasts[1]), unit: lasts[2].toLowerCase().replace(/s?$/, "s"), expiry: "turn-start" } : timeIn(sentence, duration);
        found.push(granted
            ? { name, dice: Number(granted[3]), die: `d${granted[4]}`, type: granted[5].toLowerCase(), traits: ["unarmed", ...(granted[1] ? ["agile"] : [])], duration: time }
            : { name, dice: Number(limb[1]), die: `d${limb[2]}`, type: limb[3].toLowerCase(), traits: ["unarmed", ...(limb[4] ? [limb[4].toLowerCase()] : [])], duration: time });
        used.add(index);
        if (once) used.add(sentences.findIndex((other, at) => at > index && /^Then the \w+ turns back to normal\b/i.test(other)));
    }
    return found;
}

// A change to its user's weapon for a while, PF2e's AdjustStrike: Magnifying Scope's "You increase the range increment of the weapon
// to which the scope is attached by 20 feet until the beginning of your next turn" (its ranged weapons' range increment), Dragonbone
// Arrowhead's "until the end of the current turn, the affixed weapon gains the thrown 20 feet weapon trait" (its melee weapons') →
// [{ property, value, definition, duration }]. What else the sentence says ("or until you're no longer wielding the weapon",
// "it flies back to your hand") stays on the note.
function weaponAdjustOf(sentences, duration, used = new Set()) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        const range = /\bYou increase the range increment of the (?:weapon|firearm|crossbow|bow)(?: to which [\w' ]+? is attached)? by (\d+) feet\b/i.exec(sentence);
        const thrown = /\bthe affixed weapon gains the thrown (\d+) feet weapon trait\b/i.exec(sentence);
        // (The item's own weapon losing a trait for a while, "For 1 round, the weapon loses the nonlethal trait": that weapon, by its id.)
        const loses = /\bthe weapon loses the (\w+) trait\b/i.exec(sentence);
        // (Or gaining one for a while, Chain of Command's "The chain of command gains the nonlethal trait for 1 minute": a weapon trait, on that
        // weapon — not an attack's, Possum's Play's "the triggering attack gains the nonlethal trait".)
        const gains = /\bThe (?!target\b|triggering\b)[a-z][\w' -]*? gains the (nonlethal|agile|finesse|forceful|reach|sweep|trip|shove|disarm|grapple|backstab) trait for \d+ (?:rounds?|minutes?|hours?)\b/i.exec(sentence);
        if (range) found.push({ property: "range-increment", value: Number(range[1]), definition: ["item:ranged"], duration: timeIn(sentence, duration) });
        else if (thrown) found.push({ property: "weapon-traits", value: `thrown-${thrown[1]}`, definition: ["item:melee"], duration: timeIn(sentence, duration) });
        else if (loses) found.push({ property: "weapon-traits", value: loses[1].toLowerCase(), mode: "remove", own: true, definition: [], duration: timeIn(sentence, duration) });
        else if (gains) found.push({ property: "weapon-traits", value: gains[1].toLowerCase(), mode: "add", own: true, definition: [], duration: timeIn(sentence, duration) });
        else continue;
        // ("or until you're no longer wielding the weapon, whichever comes first" is the same in practice; ", and when you make a thrown
        // Strike with it, it flies back …" says more.)
        // (But its coming back after a thrown Strike, Dragonbone Arrowhead's ", and when you make a thrown Strike with it, it flies back to your hand
        // after the Strike completes": the weapon's way home, which stays in its user's inventory — no rule.)
        const after = sentence.slice((range ?? thrown ?? loses ?? gains).index + (range ?? thrown ?? loses ?? gains)[0].length);
        if (!/,\s*and\b/i.test(after) || /^[^,]*,\s*and when you make a thrown Strike with it, it flies back to your hand after the Strike completes\.$/i.test(after.trim())) used.add(index);
    }
    return found;
}

// Extra damage on its user's Strikes for a while, PF2e's DamageDice (a FlatModifier for a number): Martial Mayhem Mutagen's "your
// melee Strikes deal 1d4 additional precision damage to Off-Guard creatures" → [{ diceNumber, dieSize } | { value }, category,
// damageType, predicate, duration]. Its sentence stays on the note (what else it says, the GM's).
// (Or the item's own weapon's, "your Strikes with the weapon deal 1d4 additional persistent bleed damage": that weapon, by its id.)
const STRIKE_TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed";
const STRIKE_EXTRA = new RegExp(String.raw`\byour (melee |ranged |unarmed )?Strikes( with the weapon)? deal (?:(\d+)d(\d+)|(\d+)) additional (?:(precision|persistent|splash) )?(?:(${STRIKE_TYPES}) )?damage(?: to (off-guard|frightened|prone|grabbed|flat-footed) creatures)?`, "i");
function strikeDamageOf(sentences, duration, used = new Set()) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|When|Whenever)\b/i.test(sentence)) continue;
        const match = STRIKE_EXTRA.exec(sentence);
        if (!match) continue;
        const [, range, own, count, faces, flat, category, type, condition] = match;
        const predicate = [...(range ? [`item:${range.trim().toLowerCase() === "unarmed" ? "category:unarmed" : range.trim().toLowerCase()}`] : []), ...(condition ? [`target:condition:${condition.toLowerCase() === "flat-footed" ? "off-guard" : condition.toLowerCase()}`] : [])];
        // (Bleed is always persistent.)
        const kind = type?.toLowerCase() === "bleed" ? "persistent" : category?.toLowerCase() ?? null;
        found.push({ ...(count ? { diceNumber: Number(count), dieSize: `d${faces}` } : { value: Number(flat) }), category: kind, damageType: type?.toLowerCase() ?? null, predicate, ...(own ? { own: true } : {}), duration: timeIn(sentence, duration) });
        // (The weapon's own, a sentence of just that: read.)
        if (own && /^\s*For (?:\d+|one|an?) \w+, your Strikes with the weapon deal [^,;]+ damage\.\s*$/i.test(sentence)) used.add(index);
    }
    return found;
}

// A condition's penalty its user ignores for a while, PF2e's AdjustModifier suppressing that condition's modifier: Chilled Fire Noodles'
// "you temporarily ignore the -1 status penalty to AC and saving throws caused by the Fatigued condition for 1 hour", Ring of the Weary
// Traveler's "For 10 minutes, you can ignore the penalties from the fatigued condition" → [{ slug, selectors, duration }] (the
// condition's own modifier slug, and the selectors it has in PF2e unless the sentence names them). The condition stays.
const CONDITION_SELECTORS = { fatigued: ["ac", "saving-throw"] };
function suppressOf(sentences, duration, used = new Set()) {
    const found = [];
    const pattern = /\b(?:temporarily |can )?ignore the (?:[-–−]\d+ (?:status |circumstance )?penalty to ([A-Za-z ]+?) caused by|penalties from) the (\w+) condition\b/i;
    for (const [index, sentence] of sentences.entries()) {
        const match = pattern.exec(sentence);
        if (!match) continue;
        const slug = match[2].toLowerCase();
        const named = match[1] ? match[1].split(/\s*(?:,|\band\b)\s*/).map((word) => ({ ac: "ac", "saving throws": "saving-throw", saves: "saving-throw" })[word.trim().toLowerCase()]).filter(Boolean) : [];
        const selectors = named.length ? named : CONDITION_SELECTORS[slug];
        if (!selectors) continue;
        used.add(index);
        // ("This does not remove the condition, it merely suppresses the penalties": said by it.)
        sentences.forEach((other, at) => { if (/\bdoes not remove the condition\b/i.test(other)) used.add(at); });
        found.push({ slug, selectors, duration: durationIn(sentence, duration) });
    }
    return found;
}

// A vision for its user: "you gain darkvision until you deactivate it" (Obsidian Goggles), "You gain greater darkvision until
// the beginning of your next turn" (Darkvision Scope) → [{ selector, duration }] (PF2e's Sense rule, the item card's
// Effect). Another way it ends ("as long as you continue to look through the scope", "or the item is no longer invested by
// you") stays on the note.
const SENSES = { "greater darkvision": "greater-darkvision", darkvision: "darkvision", "low-light vision": "low-light-vision" };
function sensesOf(sentences, duration, used = new Set()) {
    const found = [];
    const pattern = /\b(?:you (?:gain|have|get)|grants? you|granting you)(?: the)? (greater darkvision|darkvision|low-light vision)\b/gi;
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|When|Whenever|While|Each time|Unless)\b/i.test(sentence) || /\b(?:all(?:y|ies)|creatures? (?:in|within)|emanation|as if you had)\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(pattern)) {
            const selector = SENSES[match[1].toLowerCase()];
            if (found.some((entry) => entry.selector === selector)) continue;
            const until = UNTIL_NEXT_TURN.exec(sentence);
            const time = until ? { mode: "fixed", value: 1, unit: "rounds", expiry: /\bend\b/i.test(until[0]) ? "turn-end" : "turn-start", anchor: "source-turn" } : /\buntil you (?:deactivate|Dismiss)\b/i.test(sentence) ? null : durationIn(sentence, duration);
            // (Until its user ends it, or until the item isn't invested: Obsidian Goggles' "until you deactivate it as an Interact action or
            // the item is no longer invested by you, whichever comes first" — toggle, the item's next activation ends it, and invested, its
            // uninvesting does (scripts/live.js).)
            const deactivate = /\buntil you deactivate it(?: as an Interact action)?(?: or the item is no longer invested by you, whichever comes first)?[.,]?$/i.exec(sentence.trim());
            // (Its user's own doing that keeps it, beside a time of its own — Darkvision Scope's "until the beginning of your next turn, as long as
            // you continue to look through the scope": on the Effect's words, its user's to keep doing, 2026-10-25.)
            const keeps = until ? /,\s*(as long as you continue to look through (?:the|this|your) [\w' -]+?)\.?$/i.exec(sentence.trim()) : null;
            if (deactivate || keeps || !/\bas long as\b|\bwhichever comes first\b|\bor (?:until|the item)\b/i.test(sentence)) used.add(index);
            found.push({ selector, duration: time, ...(deactivate ? { toggle: true, ...(/\bno longer invested\b/i.test(deactivate[0]) ? { invested: true } : {}) } : {}), ...(keeps ? { keeps: keeps[1] } : {}) });
        }
    }
    // (Other senses with their acuity and range: Nosoi Charm's "You gain lifesense as an imprecise sense with a range of 30 feet for 1
    // hour", Arbor Wine's "you have tremorsense at a range of 30 feet", Blood Sight Elixir's "You gain blood sight as an imprecise sense
    // with a duration of 10 minutes. Blood sight has a range of 60 feet" — PF2e's Sense rule with them.)
    const other = /\b(?:you (?:gain|have|get)|grants? you|granting you) (?:(precise|imprecise) )?(blood sight|bloodsense|tremorsense|scent|lifesense|echolocation|wavesense|thoughtsense|motion sense)\b([^.]*)\./gi;
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|When|Whenever|While|Each time|Unless|In animal form|Armor)\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(other)) {
            const selector = OTHER_SENSES[match[2].toLowerCase()];
            if (found.some((entry) => entry.selector === selector)) continue;
            const rest = match[3];
            const acuity = (match[1] ?? /\bas an? (precise|imprecise) sense\b/i.exec(rest)?.[1] ?? "imprecise").toLowerCase();
            // (Its range in the sentence, or a sentence of its own after: "Blood sight has a range of 60 feet".)
            const said = /\b(?:with a range of|at a range of|a range of|out to(?: a range of)?|to a range of)\s*(\d+) feet\b|\((\d+) feet\)/i.exec(rest);
            const next = said ? null : sentences.slice(index + 1, index + 3).find((later) => new RegExp(String.raw`\b${match[2]}\b[^.]*\bhas a range of (\d+) feet\b`, "i").test(later));
            // (That sentence read too when it says only the range and what the sense detects, Blood Sight Elixir's "Blood sight has a range of 60
            // feet and allows you to detect living creatures who are taking persistent bleed damage or who have the dying or wounded
            // conditions": the sense's own meaning, which its Sense rule carries to the GM's table as any sense does.)
            if (next && new RegExp(String.raw`^${match[2]} has a range of \d+ feet(?: and allows you to detect [^.]+)?\.$`, "i").test(next.trim())) used.add(sentences.indexOf(next));
            const range = Number(said?.[1] ?? said?.[2] ?? (next ? /\brange of (\d+) feet\b/i.exec(next)[1] : NaN));
            const lasting = /\bwith a duration of ((?:\d+|one|an?) (?:rounds?|minutes?|hours?))\b/i.exec(rest);
            const time = lasting ? durationIn(`for ${lasting[1]}`, null) : durationIn(sentence, duration);
            if (!/\bas long as\b/i.test(sentence)) used.add(index);
            found.push({ selector, acuity, ...(Number.isFinite(range) ? { range } : {}), duration: time });
        }
    }
    return found;
}
const OTHER_SENSES = { "blood sight": "bloodsense", bloodsense: "bloodsense", tremorsense: "tremorsense", scent: "scent", lifesense: "lifesense", echolocation: "echolocation", wavesense: "wavesense", thoughtsense: "thoughtsense", "motion sense": "motion-sense" };

// A light its user sheds: Sprite Apple's "you shed bright light in a 20-foot emanation (and dim light for the next 20 feet)",
// Silver Crescent's "you shed cool, white light like a torch" → [{ bright, dim, duration }] in feet from its user (PF2e's
// TokenLight rule, the item card's Effect: dim the whole radius, as Foundry's light takes it). A torch's: 20 feet bright, 20 more dim.
// (Or the item its user holds or wears: Candlecap's "The candlecap sheds dim light in a 20-foot radius", a weapon that "glows as bright
// as a torch", Eclipse's "causing it to shed light as a torch", Shining Hackle's "shedding bright light in a 20-foot radius", Oathlamp
// of Accord's light that works "as normal for a hooded lantern" — not an object it touches, Lance of Sun's Radiance's "that object".)
// (Its "shedding" only after its user's item glows, Shining Hackle's "Your shining hackle glows even brighter, shedding": not a weapon a
// gem is applied to, nor a planted toadstool's own glow.)
const SHEDS = String.raw`(?:\byou (?:also )?shed|\b(?:it|that|the [\w' -]+?|an? [\w' -]+?) (?:also )?sheds|\b(?:it|the [\w' -]+?) to shed|\bYour [\w' -]+? glows?[^.,]*?, shedding)`;
const TORCH = new RegExp(String.raw`${SHEDS} (?:[\w,]+ ){0,3}light (?:like|as) a torch\b|\bglows as bright as a torch\b`, "i");
const BRIGHT = new RegExp(String.raw`${SHEDS} bright light in an? (\d+)[-‐]foot (?:radius|burst|emanation)\b`, "i");
const DIM = new RegExp(String.raw`${SHEDS} dim light in an? (\d+)[-‐]foot (?:radius|burst|emanation)\b`, "i");
const HOODED = /\bsheds light\b[^.]*\.(?:[^.]*\.)?[^.]*\bwork as normal for a hooded lantern\b/i;
// (Its time when it says one, "for 8 hours", or a sentence after it, One-Hour Flower's "At the end of an hour, the plant
// disintegrates"; out until its user puts it out — "until you deactivate it", "until you Dismiss it", activating it again — when it
// doesn't: no time. Its radius shrinking as it goes, the flower's, a note on it.)
const ENDS = /^\s*At the end of (an|one|\d+) (hours?|minutes?)\b/i;
const SHRINKS = /^\s*The radius of this light shrinks by (\d+) feet every (\d+) (minutes?|hours?)\./i;
function lightOf(sentences, duration, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|Whenever|Each time|Unless)\b/i.test(sentence)) continue;
        const hooded = HOODED.test(sentences.slice(index, index + 3).join(" ")) && /\bsheds light\b/i.test(sentence);
        const torch = !hooded && TORCH.test(sentence);
        const bright = hooded || torch ? null : BRIGHT.exec(sentence);
        const dimOnly = hooded || bright || torch ? null : DIM.exec(sentence);
        if (!hooded && !torch && !bright && !dimOnly) continue;
        const more = bright ? /\bdim light (?:for|to) (?:the next )?(\d+) (?:feet|more feet)\b/i.exec(sentence.slice(bright.index)) : null;
        const light = hooded ? { bright: 30, dim: 60 } : torch ? { bright: 20, dim: 40 } : bright ? { bright: Number(bright[1]), dim: Number(bright[1]) + (more ? Number(more[1]) : 0) } : { bright: 0, dim: Number(dimOnly[1]) };
        if (!/\bas long as\b|\bor until\b/i.test(sentence)) used.add(index);
        if (hooded) used.add(sentences.findIndex((later, at) => at > index && /\bwork as normal for a hooded lantern\b/i.test(later)));
        const later = sentences.slice(index + 1, index + 3);
        const ends = later.map((one) => ENDS.exec(one)).find(Boolean);
        const shrinks = later.map((one) => SHRINKS.exec(one)).find(Boolean);
        const time = durationIn(sentence, null) ?? (ends ? { mode: "fixed", value: /^\d+$/.test(ends[1]) ? Number(ends[1]) : 1, unit: UNITS[ends[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : null) ?? duration;
        return [{ ...light, duration: time, ...(shrinks ? { note: `its radius shrinks by ${shrinks[1]} feet every ${shrinks[2]} ${shrinks[3]} (by hand)` } : {}) }];
    }
    return [];
}

// What it gives its user and allies in an area, or allies alone: Knight Captain's Lance's "Allies within 30 feet that can see
// you receive a +1 status bonus to their attack rolls and damage rolls for 1 round", Snare of Speed's "You and all allies
// within a 30-foot emanation gain the Quickened condition until the end of your next turn", Viridian Crown's "… in a 60-foot
// emanation. You and all allies in this area gain a +3 status bonus to saving throws against mental effects", Blakenshipper's
// "… gain 15 temporary Hit Points that last for 1 round" → { row: { effects, modifiers }, radius, self, notes } or null:
// the sentence read as its user's own ("you gain …") for each creature the presser targets. The rest of the text is notes.
// (Or a condition they're in: a third-party scepter quickens its user and the allies near them, "are Quickened".)
const ALLIES = /^(You and (?:your )?)?(?:all )?(?:your )?allies (?:(?:within|in) (?:a |an )?(\d+)[- ](?:foot|feet)(?: emanation| radius| of you)?|in this area)(?: (?:that|who) can (?:see|hear) you)?,? (gain|receive|are|become)\b/i;
export function allyAreaRow(text, duration = null) {
    // (Its activation's lines without an Effect heading — a frequency and a cost in spell slots, then the allies' sentence: read from the
    // allies on.)
    const sentences = sentencesOf(String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/^.*?\b(?:Cost|Frequency|Requirements?)\b[^.]*?\s(?=You and (?:your )?(?:all )?allies\b)/s, ""));
    const index = sentences.findIndex((sentence) => ALLIES.test(sentence.trim()));
    if (index < 0) return null;
    const sentence = sentences[index].trim();
    const match = ALLIES.exec(sentence);
    const radius = Number(match[2] ?? /(\d+)-foot (?:emanation|radius|aura)/i.exec(sentences.slice(0, index).join(" "))?.[1]);
    if (!radius) return null;
    // ("their attack rolls", "the Quickened condition": as its user's own words.)
    const own = sentence.replace(match[0], /^(?:are|become)$/i.test(match[3]) ? `You ${match[3].toLowerCase()}` : "You gain").replace(/\btheir\b/gi, "your").replace(/\bgain the (\w+) condition\b/i, "become $1");
    // (Sustained "for up to 1 minute": that long at most, the Sustain on the note.)
    const sustained = /\bSustain [^.]*?\bfor up to (\d+|one|a) (rounds?|minutes?)\b/i.exec(text);
    const time = durationIn(own, duration ?? itemDuration(text) ?? (sustained ? { mode: "fixed", value: WORD_NUMBERS[sustained[1].toLowerCase()] ?? Number(sustained[1]), unit: UNITS[sustained[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : null));
    const used = new Set();
    const effects = [...selfConditions([own], used)];
    const temp = tempHitPoints([own.replace(/\bthat last for\b/i, "for")], time, used);
    if (temp) effects.push(temp);
    const modifiers = modifiersOf([own], time, used);
    if (!effects.length && !modifiers.length) return null;
    const notes = sentences.filter((other, at) => at !== index && (MECHANICAL.test(other) || /\bSustain\b/.test(other))).map((other) => other.trim());
    // (What its sentence says more: "… and can use the extra action each round for only Step and Stride actions".)
    const more = /\band can\b|\bonly\b|\bexcept\b/i.test(sentence);
    return { row: { effects, modifiers }, radius, self: Boolean(match[1]), notes: used.size && !more ? notes : [sentence, ...notes] };
}

// Items whose text isn't one use with one result: activated on a trigger, an affliction's stages, a second
// effect, a choice of ways to use it ("may be applied to armor, a weapon, or mixed into an elixir"), or one
// that links PF2e Effects (those Effects hold its rules).
const NOT_ONE_RESULT = /\bStage 1\b|\broll (?:a |an )?(?:d\d+|\d+d\d+)\b[^.]*\btable\b|\bon the (?:following )?table\b|\b(?:may|can) be (?:applied|used|mixed|poured)\b[^.]*\bor\b|\bin (?:either|one) of the following ways\b|\bchoose one\b|\b(?:changes|differs|varies) depending on (?:your usage|how you use)/i;
// A talisman's or an activation's Trigger, Requirements and Frequency say when it's used, not what it does: taken out before
// reading ("Trigger You become Blinded …" isn't a condition it gives). Each runs to its sentence's end or to "Effect".
const WHEN_CLAUSES = /\b(?:Trigger|Requirements?|Frequency)\b[^.]*?(?=\bEffect\b|\.(?:\s|$)|$)\.?/g;
const EFFECT_LINK = /@UUID\[Compendium\.pf2e\.[\w-]*effects\.Item\./;

// A sentence that says something a creature or its rolls get or lose (not flavor, not how long it lasts).
// (Whole words: "AC" isn't the start of "academic", "checks" of "checkered".)
const MECHANICAL = /\b(?:bonus(?:es)?|penalt(?:y|ies)|resistances?|weakness(?:es)?|immun\w*|Speeds?|damage[ds]?|Hit Points?|DC \d+|Mythic Points?|breathe|breathing|up to (?:\d+|two|three|four|five|six) willing creatures|checks?|saves?|saving throws?|attack(?:s|ed|er|ers)?|Strikes?|AC|conditions?|senses?|darkvision|actions?|reactions?|spells?|clumsy|concealed|dazzled|deafened|enfeebled|fatigued|fleeing|frightened|hidden|immobilized|invisible|off-guard|prone|quickened|sickened|slowed|stunned|stupefied)\b/i;

// What PF2e's own rules on its user do, with no reading of their own here (item.ruleEffects [{ name, words, rules, duration }], the item
// card's Effect): Mirrorblade's "For the next 10 minutes, you aren't Off-Guard to melee attacks from creatures flanking you" — PF2e's
// flanking.offGuardable, as its Deny Advantage sets it, false.
function ruleEffectsOf(sentences, duration, used = new Set()) {
    const found = [];
    for (const [index, sentence] of sentences.entries()) {
        const flank = /^For the next ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)), you aren't Off-Guard to melee attacks from creatures flanking you\.$/i.exec(sentence.trim());
        // (And Deny Advantage's own words, Sturdy Neck Stock's "For 1 minute, you aren't off-guard to Hidden, undetected, or flanking creatures,
        // or creatures using surprise attack of your level or lower": PF2e's Deny Advantage rule, offGuardable its user's level.)
        const deny = flank ? null : /^For ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)), you aren't off-guard to Hidden, undetected, or flanking creatures, or creatures using surprise attack of your level or lower\.$/i.exec(sentence.trim());
        // (Breathing underwater, which no PF2e rule plays: Submersible Helmet's "You can breathe underwater for 8 hours" — on its user's Effect in
        // words, for that time, 2026-10-25.)
        const breathe = flank || deny ? null : /^(?:During this time, )?you can breathe underwater(?: for ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)))?\.$/i.exec(sentence.trim());
        if (breathe) {
            used.add(index);
            found.push({ name: "water breathing", words: "Can breathe underwater", rules: [], duration: breathe[1] ? durationIn(`for ${breathe[1]}`, duration) : duration });
            continue;
        }
        // (Difficult terrain ignored, 2026-10-25 — Winterstep Elixir's "You ignore the uneven ground and difficult terrain caused by ice, and the
        // difficult terrain caused by snow", Underbrush Cloak's "you ignore any difficult terrain caused by plants and fungi", Frostwalker
        // Pattern's "Until the end of your next turn, you ignore difficult terrain and greater difficult terrain from ice and snow": PF2e's own
        // rule for it, system.movement.terrain.{difficult,greater}.ignored { environment, feature } — "all" when it names none; PF2e's own
        // features ice and snow, plants and fungi the environment module's undergrowth. PF2e reduces greater difficult terrain to difficult
        // when difficult is ignored, as Winterstep's "(reducing greater difficult terrain … to ordinary difficult terrain)" says.)
        const terrain = /^(?:(For the next (?:(?:\d+|one|an?) )?(?:rounds?|minutes?|hours?)|Until the end of your (?:next )?turn|For (?:\d+|one|an?) (?:rounds?|minutes?|hours?)), )?you ignore (?:the (?:effects of )?|any )?(?:uneven ground and )?(?:non-magical )?difficult terrain\b([^.]*)\.$/i.exec(sentence.trim());
        if (terrain && !/\bwithin the chosen environment\b|\bresistance\b|\bwhile\b|\bif\b/i.test(terrain[2])) {
            const rest = terrain[2];
            const features = [...new Set([...rest.matchAll(/\b(ice|snow|sand|rubble|plants|fungi|undergrowth)\b/gi)].map(([, word]) => ({ fungi: "undergrowth", plants: "undergrowth" })[word.toLowerCase()] ?? word.toLowerCase()))];
            const greater = /\band greater difficult terrain\b/i.test(sentence);
            const add = (path, feature) => ({ key: "ActiveEffectLike", mode: "add", path, value: { environment: "all", feature } });
            const rules = (features.length ? features : ["all"]).flatMap((feature) => [add("system.movement.terrain.difficult.ignored", feature), ...(greater ? [add("system.movement.terrain.greater.ignored", feature)] : [])]);
            const time = terrain[1] ? (/^Until the end of your next turn$/i.test(terrain[1]) ? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } : /^Until the end of your turn$/i.test(terrain[1]) ? { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } : durationIn(terrain[1].replace(/^For the next (?=[a-z])(?!one\b|an?\b)/i, "for 1 ").replace(/^For the next/i, "for"), duration)) : duration;
            used.add(index);
            // (Frostwalker Pattern's "and don't risk falling when crossing ice": said too — the environment module's Balance on ice.)
            const falling = /\bdon't risk falling when crossing (\w+)\b/i.exec(rest);
            found.push({ name: "difficult terrain ignored", words: `Ignores ${greater ? "difficult and greater difficult" : "difficult"} terrain${features.length ? ` from ${features.join(", ").replace("undergrowth", "plants and fungi")}` : ""}${falling ? `, and doesn't risk falling when crossing ${falling[1]}` : ""}`, rules, duration: time });
            continue;
        }
        // (Creatures Off-Guard to its user, Chiromantic Lines' "Until the end of the turn, all creatures you can see that are not Concealed or
        // hidden are Off-Guard to you": PF2e's EphemeralEffect of Off-Guard on its user's attacks and their damage, as PF2e's own Effects for
        // "off-guard to you" have it — not at a concealed or hidden one; whom its user sees, the table's.)
        const offGuard = flank || deny ? null : /^Until the end of (?:the|your) turn, all creatures you can see that are not Concealed or hidden are Off-Guard to you\.$/i.exec(sentence.trim());
        if (offGuard) {
            used.add(index);
            found.push({ name: "off-guard to you", words: "Creatures it can see that aren't Concealed or hidden are Off-Guard to its attacks", rules: [{ key: "EphemeralEffect", predicate: [{ not: "target:condition:concealed" }, { not: "target:condition:hidden" }], selectors: ["strike-attack-roll", "spell-attack-roll", "strike-damage", "attack-spell-damage"], uuid: "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg" }], duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } });
            continue;
        }
        if (!flank && !deny) continue;
        used.add(index);
        if (flank) found.push({ name: "not off-guard to flankers", words: "Not Off-Guard to melee attacks from creatures flanking it", rules: [{ key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.offGuardable", value: false }], duration: durationIn(`for ${flank[1]}`, duration) });
        else found.push({ name: "deny advantage", words: "Not Off-Guard to hidden, undetected or flanking creatures of its level or lower, or to their surprise attacks (PF2e's Deny Advantage)", rules: [{ key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.offGuardable", value: "@actor.level" }], duration: durationIn(`for ${deny[1]}`, duration) });
    }
    return found;
}

// The row for the item's drinker or user: { effects, modifiers, unread } with something in it, or null. unread: the
// sentences that say something mechanical it didn't read (they go on a note, and the plan counts as partial).
export function ownRow(item, { healing = true } = {}) {
    const html = String(item?.system?.description?.value ?? "");
    // (Fed to another, "it" is the creature fed, the row's drinker: Energizing Treat's "When you feed your animal companion …,
    // it's Quickened for 1 minute".)
    // (A resistance to the type its Trigger names, before the Trigger goes: Safeguarding's "Trigger You would take mental, poison, or
    // spirit damage Effect You gain resistance 5 to the triggering damage type" — chosen of those, on the card.)
    // (A banner's ally, the creature the presser targets — src/compiler/consumables.js grantsOthers: Zealous Banner's "An ally within
    // the banner's aura becomes Quickened for 1 round".)
    // (A second use after the first, a candy's "Secondary Effect" once it's swallowed or bitten: the first read, the second a note.)
    // (Its Frequency, Trigger, Requirements and Cost lines ended where their paragraphs end — "once per day;" — so a block with no Effect
    // heading, a Magic+ statblock's, doesn't lose its effect's first sentence with them.)
    const ended = String(html ?? "").replace(/(<strong>\s*(?:Frequency|Trigger|Requirements?|Cost)\s*<\/strong>[^<]*?)\s*[;,]?\s*(<\/p>)/gi, (all, field, end) => (/[.!?]$/.test(field.trim()) ? all : `${field.trim()}.${end}`));
    const split = /<strong>\s*Secondary Effect\s*<\/strong>|\bSecondary Effect\b/i.exec(ended);
    const secondary = split ? plainText(ended.slice(split.index)).trim() : null;
    const text = plainText(split ? ended.slice(0, split.index) : ended).replace(/\bWhen you feed your (?:animal companion|familiar|mount)[^,]*, it(?:'s| is| becomes) /gi, "You are ")
        .replace(/\bAn? (?:ally|creature) within (?:the|your) banner's aura becomes\b/gi, "You become")
        // (The ally its trigger names, Admirer's Bouquet's "The triggering ally gains …": the row for the creature the presser targets.)
        .replace(/\bThe triggering ally gains\b/g, "You gain")
        .replace(/\bTrigger You would take ((?:\w+, )*\w+,? or \w+) damage\.?\s+Effect (You gain resistance \d+ to the) triggering (damage type\b[^.]*\.)/i, "Effect $2 chosen $3 Choose $1.")
        .replace(WHEN_CLAUSES, " ").replace(/^\s*Activat(?:e|ion)\b[^.]*?\bEffect\s+/i, "").replace(/\bEffect\s+/g, "").replace(/\s+/g, " ");
    // (Its Activate line up to its Effect gone first, or its Requirements run into the first sentence: Essence Forge's "… Requirements The
    // essence forge contains essence You absorb the essence …".)
    if (NOT_ONE_RESULT.test(text) || EFFECT_LINK.test(html)) return null;
    const duration = itemDuration(text);
    const sentences = sentencesOf(text);
    const used = new Set();
    const effects = [...selfConditions(sentences, used)];
    const temp = tempHitPoints(sentences, duration, used);
    if (temp) effects.push(temp);
    const heal = healing ? textHealing(sentences, used) : null;
    if (heal) effects.unshift(heal);
    const modifiers = modifiersOf(sentences, duration, used);
    const resistances = resistancesOf(sentences, duration, used);
    const speeds = speedsOf(sentences, duration, used);
    const senses = sensesOf(sentences, duration, used);
    const weapon = weaponAdjustOf(sentences, duration, used);
    const strikeDamage = strikeDamageOf(sentences, duration, used);
    const suppress = suppressOf(sentences, duration, used);
    const light = lightOf(sentences, duration, used);
    const levelTemp = levelTempOf(sentences, duration, used);
    const attacks = attacksOf(sentences, duration, used);
    const fastHealing = fastHealingOf(sentences, duration, used);
    const ruleEffects = ruleEffectsOf(sentences, duration, used);
    if (!fastHealing.length && !effects.length && !modifiers.length && !resistances.length && !speeds.length && !senses.length && !weapon.length && !strikeDamage.length && !suppress.length && !light.length && !levelTemp.length && !attacks.length && !ruleEffects.length) return null;
    // (Healing another creature, or its temporary Hit Points: the row's recipient is chosen like a drinker's.)
    const other = Boolean(heal?.other || temp?.other);
    if (heal?.other) delete heal.other;
    if (temp?.other) delete temp.other;
    // (Not its time, nor a sentence restating PF2e's usual rule: "As usual being concealed when your position is still obvious, you can't …".)
    // (Nor an introduction's bonus with no number when the number is read: One Day's Breath's "you also gain a status bonus
    // against inhaled threats" before its "+1 status bonus to saves against inhaled threats".)
    const restated = (sentence) => modifiers.length > 0 && /\ban? (?:item |status |circumstance )?bonus\b/i.test(sentence) && !/[+\-–]\d|\d+d\d+|\bDC\b/.test(sentence);
    // ("allowing you to move with greater speed": flavor, not a Speed.)
    // (Nor when it may be used, "You can use this action while Unconscious".)
    // (Nor what its time already says, Affliction Suppressant's "this suppressant isn't long-lasting enough to apply to a daily save against the
    // progression of a disease …" and "It can still help protect you from catching such an affliction when you're initially exposed to it …":
    // its bonus lasts its 10 minutes, so it's at the saves in them, 2026-10-25.)
    const timeSays = (sentence) => /\bisn't long-lasting enough to apply to a daily save\b/i.test(sentence) || /^\s*It can still help protect you from catching such an affliction when you're initially exposed to it\b/i.test(sentence);
    const unread = sentences.filter((sentence, index) => !used.has(index) && !timeSays(sentence) && !/^\s*You can use this (?:action|activation|reaction|ability) (?:while|even (?:if|when|while))\b/i.test(sentence) && MECHANICAL.test(sentence.replace(/\bwith (?:great|greater|incredible|blinding|amazing|surprising) speed\b/gi, "")) && !restated(sentence) && !/^\s*(?:The duration is|Duration|As usual|As normal|As always|The resonant power)\b/i.test(sentence) && !/^\s*This [\w ]+? can be applied to up to (?:\d+|two|three|four|five|six) willing creatures(?: to protect them from dangerous energies)?\.$/i.test(sentence) && !/^\s*The (?:climb|fly|swim|burrow) Speed lasts for (?:\d+|one|an?) (?:rounds?|minutes?|hours?)\.$/i.test(sentence));
    if (secondary) unread.push(secondary);
    return { effects, modifiers, unread, duration, ...(resistances.length ? { resistances } : {}), ...(speeds.length ? { speeds } : {}), ...(senses.length ? { senses } : {}), ...(light.length ? { light } : {}), ...(levelTemp.length ? { levelTemp } : {}), ...(weapon.length ? { weapon } : {}), ...(attacks.length ? { attacks } : {}), ...(fastHealing.length ? { fastHealing } : {}), ...(strikeDamage.length ? { strikeDamage } : {}), ...(suppress.length ? { suppress } : {}), ...(ruleEffects.length ? { ruleEffects } : {}), ...(other ? { other } : {}) };
}

// A reminder of the item's text on its drinker or user, for its time (the user's note-Effect rule for spells,
// 2026-09-26): an item that lasts a while and does nothing else the module reads. null without a time.
export function noteRow(item) {
    const text = plainText(item?.system?.description?.value);
    const duration = itemDuration(text);
    if (!duration) return null;
    const body = text.replace(ACTIVATE_LINE, "").trim();
    // (The ability module names a note Effect "<item>: <label>", "note" without one.)
    // (reminder: the whole text's, beside a row that reads only part of it — gone once later readings leave nothing unread, src/compiler/honest.js.)
    return { noteEffects: [{ text: body, duration, reminder: true }] };
}
