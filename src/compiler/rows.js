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
const UNIT_WORD = String.raw`(rounds?|minutes?|hours?|days?)`;
export function itemDuration(text) {
    // ("The next time you would die from damage within 8 hours after you drink the ambrosia": its time, before the
    // "immune … for 24 hours" that follows.)
    const stated = new RegExp(String.raw`\b(?:Duration|The duration is|with a duration of|lasts? for) (\d+|one|an?) ${UNIT_WORD}\b|\bwithin (\d+|one|an?) ${UNIT_WORD} after (?:you )?(?:drink|consum|eat|imbib|apply|applied|activat)`, "i").exec(text)
        ?? new RegExp(String.raw`\bfor (?:the next )?(\d+|one|an?) ${UNIT_WORD}\b`, "i").exec(text);
    const rolled = new RegExp(String.raw`\b(?:for|Duration|The duration is) (\d+)d(\d+) ${UNIT_WORD}\b`, "i").exec(text);
    if (rolled && (!stated || rolled.index < stated.index)) {
        const [, count, sides, unit] = rolled;
        return { mode: "fixed", value: Math.floor((Number(count) * (Number(sides) + 1)) / 2), valueRoll: `${count}d${sides}`, unit: UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" };
    }
    const next = !stated ? /\bfor the next (round|minute|hour|day)\b/i.exec(text) : null;
    if (!stated && !next) return null;
    const [count, unit] = stated ? [stated[1] ?? stated[3], stated[2] ?? stated[4]] : ["1", next[1]];
    return { mode: "fixed", value: WORD_NUMBERS[count.toLowerCase()] ?? Number(count), unit: UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" };
}

// A sentence's own time, else the item's.
function durationIn(sentence, fallback) {
    const own = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?|days?)\b/i.exec(sentence);
    return own ? { mode: "fixed", value: WORD_NUMBERS[own[1].toLowerCase()] ?? Number(own[1]), unit: UNITS[own[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : fallback;
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
    // (And "You Stride and turn partially invisible, becoming Concealed …": the sentence's own "you".)
    const pattern = new RegExp(String.raw`\b(?:making|leaving|rendering|render|makes|leaves|renders) you (${names})(?: (\d+))?\b|\byou(?:'re| are| become| also become| are also| remain)(?: (?:both|also|now))? (${names})(?: (\d+))?\b|\bYou\b[^.]*?,\s*becoming (${names})(?: (\d+))?\b`, "gi");
    for (const [index, sentence] of sentences.entries()) {
        if (/\b(?:if|when|whenever|unless|while|after|once|each time|throughout|instead of|can't|cannot|don't|aren't|isn't|no longer|could|would|against|next time)\b/i.test(sentence.replace(/^\s*(?:When|Upon|After) (?:you )?(?:drink|consum|eat|imbib|swallow)\w*\b[^,]*,/i, ""))) continue;
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
            const slug = (match[1] ?? match[3] ?? match[5]).toLowerCase();
            const value = match[2] ?? match[4] ?? match[6];
            if (effects.some((effect) => effect.slug === slug)) continue;
            // (Only to some: "invisible to scrying magic", "Invisible to creatures with the fiend … trait" — not the condition.)
            if (/^\s*(?:to|from|against)\b/i.test(sentence.slice(match.index + match[0].length))) continue;
            // (Another way it ends, "or until you use a hostile action, whichever comes first", stays on the note.)
            // ("or until you Dismiss the activation" is removing it: not another way.)
            if (!/\bor until (?!you Dismiss)/i.test(sentence)) used.add(index);
            effects.push({ kind: "condition", slug, value: value ? Number(value) : null, duration: slug === "prone" || dismissed ? null : duration });
        }
    }
    return effects;
}

const AMOUNT = String.raw`(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)`;

function tempHitPoints(sentences, duration, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        const match = new RegExp(String.raw`\byou gain ${AMOUNT} temporary Hit Points\b`, "i").exec(sentence);
        if (match && !/\b(?:if|when|whenever|each time|the next time)\b/i.test(sentence.slice(0, match.index))) {
            // (Its other half stays unread, for the note: "You drop to 1 Hit Point instead of being reduced to 0 HP or dying,
            // and you gain 100 temporary Hit Points" — the 1 HP the GM sets.)
            if (!/\binstead\b/i.test(sentence)) used.add(index);
            const amount = match[1].replace(/\s+/g, "");
            return { kind: "temp-hp", ...(/d/.test(amount) ? { formula: amount } : { amount: Number(amount) }), duration: durationIn(sentence, duration) };
        }
    }
    return null;
}

// "you regain 3d10 Hit Points"; or another creature's, "restoring 4d6+15 Hit Points to it" (a willing, adjacent creature:
// other, so the card offers the user and the creatures next to them).
const AMOUNT_PARENS = String.raw`\(?(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\)?`;
function textHealing(sentences, used = new Set()) {
    for (const [index, sentence] of sentences.entries()) {
        // ("you regain 3d10 Hit Points", "you regain an additional 4d6 Hit Points", "You restore 8d10+15 Hit Points", "healing you
        // for 3d8 Hit Points", "healing the wielder for 10 Hit Points".)
        const self = new RegExp(String.raw`\byou (?:immediately )?regain (?:an additional )?${AMOUNT_PARENS} Hit Points\b|\bYou restore ${AMOUNT_PARENS} Hit Points\b(?! to)|\bhealing (?:you|the wielder|the wearer) for ${AMOUNT_PARENS} Hit Points\b`, "i").exec(sentence);
        const other = new RegExp(String.raw`\brestor(?:e|es|ing) ${AMOUNT_PARENS} Hit Points to (?:it|them|the (?:target|creature)|that creature|an? (?:willing,? |living,? |adjacent,? )*(?:creature|ally))\b`, "i").exec(sentence);
        const match = self ?? other;
        // (Tallowheart Mass's "If you consume a portion, you regain …": the eating is the activation, not a condition.)
        const lead = sentence.slice(0, match?.index ?? 0).replace(/^\s*If you (?:consume|eat|drink) (?:a portion|it|one)[^,]*,\s*/i, "");
        if (match && !/\b(?:if|when|whenever|each time|the next time|at the (?:start|end))\b/i.test(lead)) {
            used.add(index);
            const amount = (match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/\s+/g, "");
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
    [/^attack rolls?$/i, "attack-roll"], [/^damage rolls?$/i, "damage"], [/^initiative(?: rolls?| checks?)?$/i, "initiative"], [/^skill checks$/i, "skill-check"],
    ...SKILLS.map((skill) => [new RegExp(`^${skill}(?: checks?)?$`, "i"), skill]),
    // ("Intelligence-based skill checks": PF2e's int-based domain.)
    [/^strength-based (?:skill )?checks?$/i, "str-based"], [/^dexterity-based (?:skill )?checks?$/i, "dex-based"], [/^constitution-based (?:skill )?checks?$/i, "con-based"],
    [/^intelligence-based (?:skill )?checks?$/i, "int-based"], [/^wisdom-based (?:skill )?checks?$/i, "wis-based"], [/^charisma-based (?:skill )?checks?$/i, "cha-based"]
];

function selectorsOf(list) {
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
const ACTIONS = { reposition: "reposition", climb: "climb", swim: "swim", "high jump": "high-jump", "long jump": "long-jump", leap: "leap", balance: "balance", "tumble through": "tumble-through", escape: "escape", hide: "hide", sneak: "sneak", seek: "seek", "sense motive": "sense-motive", "sense direction": "sense-direction", track: "track", demoralize: "demoralize", feint: "feint", grapple: "grapple", trip: "trip", shove: "shove", disarm: "disarm", "recall knowledge": "recall-knowledge", "treat wounds": "treat-wounds", "administer first aid": "administer-first-aid", "pick a lock": "pick-a-lock", "disable a device": "disable-a-device", squeeze: "squeeze", impersonate: "impersonate", lie: "lie", "make an impression": "make-an-impression", request: "request", coerce: "coerce", perform: "perform", "gather information": "gather-information" };
// Creatures PF2e's origin roll options name ("against effects created by devils" → origin:trait:devil).
const CREATURES = { aberrations: "aberration", animals: "animal", beasts: "beast", celestials: "celestial", constructs: "construct", daemons: "daemon", demons: "demon", devils: "devil", dragons: "dragon", elementals: "elemental", fey: "fey", fiends: "fiend", fungi: "fungus", giants: "giant", haunts: "haunt", oozes: "ooze", plants: "plant", spirits: "spirit", swarms: "swarm", undead: "undead" };
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
    const to = /^to ((?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?)(?:,? (?:and|or) (?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?))*)$/.exec(scope)
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
    const pattern = /\byou (?:gain|get|have|receive|take|suffer)(?: an?)? ([+-])(\d+)(-foot)? (?:(item|status|circumstance) )?(bonus|penalty) (?:to|on) ([^.;]+?)(?=(?: for (?:\d+|one|an?) \w+| until\b| while\b|,? (?:but|which|though|unless|if)\b|,? and (?:you|your)\b| as long as\b|;|\.|$))/gi;
    for (const [index, whole] of sentences.entries()) {
        // ("When you Activate this fulu, you gain …", "Upon drinking …,": the use itself, not a condition.)
        const sentence = whole.replace(/^\s*(?:When|After|Upon|Once) (?:you )?(?:activate|drink|consume|eat|imbibe|apply|use|chew|inhale)\w*\b[^,]*,\s*/i, "");
        // ("While the effect lasts, you gain …", "During this time, …": its time, not a condition.)
        const said = sentence.replace(/^\s*(?:While (?:the|this|its) (?:effect|elixir|potion|benefit)s? lasts?|While (?:it's |it is )?activated|During this time|For the duration),\s*/i, "")
            // ("you gain resistance 5 … but take a -5-foot status penalty to all Speeds": the same "you".)
            .replace(/(\byou (?:gain|get|have)\b[^.;]*?),? (but|and) (take|suffer)\b/i, "$1, $2 you $3");
        if (/^\s*(?:If|When|Whenever|While|Each time)\b/i.test(said)) continue;
        for (const match of said.matchAll(pattern)) {
            const [, sign, number, feet, type, kind, list] = match;
            if ((kind.toLowerCase() === "bonus") !== (sign === "+")) continue;
            const value = (sign === "+" ? 1 : -1) * Number(number);
            const timed = { type: type?.toLowerCase() ?? "untyped", duration: durationIn(sentence, duration) };
            // ("+10-foot status bonus to your Speed": the land Speed; "to your Speeds": all of them.)
            if (feet) {
                const speeds = /^(?:your |its |all (?:of )?(?:your )?)?(?:land )?(Speeds?)$/i.exec(list.trim());
                if (!speeds) continue;
                used.add(index);
                modifiers.push({ selector: /s$/i.test(speeds[1]) ? "all-speeds" : "land-speed", value, ...timed });
                continue;
            }
            // A scope after the list ("… against diseases", "… to Climb"): a predicate when PF2e has one, else left out.
            const scoped = /^(.+?) ((?:against|to) .+)$/.exec(list);
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
            if (!/^,? and (?:you|your)\b/i.test(tail) || !MECHANICAL.test(tail)) used.add(index);
            for (const selector of selectors) modifiers.push({ selector, value, ...timed, ...(predicate && !lastOnly ? { predicate } : {}) });
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
function resistancesOf(sentences, duration, used = new Set()) {
    const found = [];
    const pattern = /\byou (?:gain|get|have) resistance (\d+) to ((?:all|[a-z]+)(?:(?:,|, and| and) [a-z]+)*)(?: damage)?(?=[.;]|,? (?:but|and)\b| for\b| until\b|$)/gi;
    for (const [index, whole] of sentences.entries()) {
        const sentence = whole.replace(/^\s*(?:When|After|Upon|Once) (?:you )?(?:activate|drink|consume|eat|imbibe|apply|use|chew|inhale)\w*\b[^,]*,\s*/i, "").replace(/^\s*(?:Additionally|In addition|Also),\s*/i, "");
        if (/^\s*(?:If|When|Whenever|While|Each time)\b/i.test(sentence) || /\b(?:triggering|except|double|instead|chosen|choose|attuned|one type|all(?:y|ies)|creatures?|emanation|aura|against (?:the|that|one))\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(pattern)) {
            const words = match[2].toLowerCase().split(/,? and |, /).map((word) => word.trim());
            const types = words.length === 1 && words[0] === "all" ? ["all-damage"] : words;
            if (!types.every((type) => type === "all-damage" || RESIST_TYPES.has(type))) continue;
            // (A sentence that says more after it — "… and take no fall damage" — stays a note too, unless that's read.)
            const more = /^,? (?:and|but)\b/i.test(sentence.slice(match.index + match[0].length));
            if (!more) used.add(index);
            for (const type of types) found.push({ type, value: Number(match[1]), duration: durationIn(sentence, duration) });
        }
    }
    return found;
}

// A Speed of a new kind for its user, for the item's time: "You gain a fly Speed equal to your Speed until the end of your
// next turn" (Umbral Wings), "a swim Speed equal to half your land Speed" (Buoyant Buckle), "a fly Speed equal to either
// your land Speed or 20 feet, whichever is greater" (Soaring Wings), "a fly Speed of 30 feet or your Speed, whichever is
// lower" (Thrice-Fried Mudwings) → [{ type, value, duration }], value a number or PF2e's formula on the land Speed (PF2e's
// BaseSpeed rule, the item card's Effect). Not under a condition ("If you don't have a fly Speed, …"), nor another's.
const LAND = "@actor.system.movement.speeds.land.value";
function speedsOf(sentences, duration, used = new Set()) {
    const found = [];
    const pattern = /\b(?:you (?:gain|have|get)|grants? you|that grant you) an? (?:(\d+)-foot )?(fly|climb|swim|burrow) Speed(?: (?:equal to (?:either )?(half )?your (?:land )?Speed(?: or (\d+) feet, whichever is (greater|higher|lower|slower|less))?|of (\d+) feet(?: or your (?:land )?Speed, whichever is (greater|higher|lower|slower|less))?))?/gi;
    for (const [index, whole] of sentences.entries()) {
        const sentence = whole.replace(/^\s*(?:During this time|While (?:the|this|its) (?:effect|elixir|potion|benefit)s? lasts?|For the duration),\s*/i, "");
        if (/^\s*(?:If|When(?!ever you consume| you (?:consume|drink|eat))|Whenever|While|Each time|Unless)\b/i.test(sentence) || /\b(?:all(?:y|ies)|creatures? (?:in|within)|emanation|as if you had)\b/i.test(sentence)) continue;
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

// A vision for its user: "you gain darkvision until you deactivate it" (Obsidian Goggles), "You gain greater darkvision until
// the beginning of your next turn" (Darkvision Scope) → [{ selector, duration }] (PF2e's Sense rule, the item card's
// Effect). Another way it ends ("as long as you continue to look through the scope", "or the item is no longer invested by
// you") stays on the note.
const SENSES = { "greater darkvision": "greater-darkvision", darkvision: "darkvision", "low-light vision": "low-light-vision" };
function sensesOf(sentences, duration, used = new Set()) {
    const found = [];
    const pattern = /\b(?:you (?:gain|have|get)|grants? you)(?: the)? (greater darkvision|darkvision|low-light vision)\b/gi;
    for (const [index, sentence] of sentences.entries()) {
        if (/^\s*(?:If|When|Whenever|While|Each time|Unless)\b/i.test(sentence) || /\b(?:all(?:y|ies)|creatures? (?:in|within)|emanation|as if you had)\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(pattern)) {
            const selector = SENSES[match[1].toLowerCase()];
            if (found.some((entry) => entry.selector === selector)) continue;
            const until = UNTIL_NEXT_TURN.exec(sentence);
            const time = until ? { mode: "fixed", value: 1, unit: "rounds", expiry: /\bend\b/i.test(until[0]) ? "turn-end" : "turn-start", anchor: "source-turn" } : /\buntil you (?:deactivate|Dismiss)\b/i.test(sentence) ? null : durationIn(sentence, duration);
            if (!/\bas long as\b|\bwhichever comes first\b|\bor (?:until|the item)\b/i.test(sentence)) used.add(index);
            found.push({ selector, duration: time });
        }
    }
    return found;
}

// Items whose text isn't one use with one result: activated on a trigger, an affliction's stages, a second
// effect, a choice of ways to use it ("may be applied to armor, a weapon, or mixed into an elixir"), or one
// that links PF2e Effects (those Effects hold its rules).
const NOT_ONE_RESULT = /\bStage 1\b|\bSecondary Effect\b|\broll (?:a |an )?(?:d\d+|\d+d\d+)\b[^.]*\btable\b|\bon the (?:following )?table\b|\b(?:may|can) be (?:applied|used|mixed|poured)\b[^.]*\bor\b|\bin (?:either|one) of the following ways\b|\bchoose one\b|\b(?:changes|differs|varies) depending on (?:your usage|how you use)/i;
// A talisman's or an activation's Trigger, Requirements and Frequency say when it's used, not what it does: taken out before
// reading ("Trigger You become Blinded …" isn't a condition it gives). Each runs to its sentence's end or to "Effect".
const WHEN_CLAUSES = /\b(?:Trigger|Requirements?|Frequency)\b[^.]*?(?=\bEffect\b|\.(?:\s|$)|$)\.?/g;
const EFFECT_LINK = /@UUID\[Compendium\.pf2e\.[\w-]*effects\.Item\./;

// A sentence that says something a creature or its rolls get or lose (not flavor, not how long it lasts).
// (Whole words: "AC" isn't the start of "academic", "checks" of "checkered".)
const MECHANICAL = /\b(?:bonus(?:es)?|penalt(?:y|ies)|resistances?|weakness(?:es)?|immun\w*|Speeds?|damage[ds]?|Hit Points|DC \d+|Mythic Points?|breathe|breathing|checks?|saves?|saving throws?|attack(?:s|ed|er|ers)?|Strikes?|AC|conditions?|senses?|darkvision|actions?|reactions?|spells?|clumsy|concealed|dazzled|deafened|enfeebled|fatigued|fleeing|frightened|hidden|immobilized|invisible|off-guard|prone|quickened|sickened|slowed|stunned|stupefied)\b/i;

// The row for the item's drinker or user: { effects, modifiers, unread } with something in it, or null. unread: the
// sentences that say something mechanical it didn't read (they go on a note, and the plan counts as partial).
export function ownRow(item, { healing = true } = {}) {
    const html = String(item?.system?.description?.value ?? "");
    const text = plainText(html).replace(WHEN_CLAUSES, " ").replace(/\bEffect\s+/g, "").replace(/\s+/g, " ");
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
    if (!effects.length && !modifiers.length && !resistances.length && !speeds.length && !senses.length) return null;
    // (Healing another creature: the row's recipient is chosen like a drinker's.)
    const other = Boolean(heal?.other);
    if (heal?.other) delete heal.other;
    // (Not its time, nor a sentence restating PF2e's usual rule: "As usual being concealed when your position is still obvious, you can't …".)
    // (Nor an introduction's bonus with no number when the number is read: One Day's Breath's "you also gain a status bonus
    // against inhaled threats" before its "+1 status bonus to saves against inhaled threats".)
    const restated = (sentence) => modifiers.length > 0 && /\ban? (?:item |status |circumstance )?bonus\b/i.test(sentence) && !/[+\-–]\d|\d+d\d+|\bDC\b/.test(sentence);
    const unread = sentences.filter((sentence, index) => !used.has(index) && MECHANICAL.test(sentence) && !restated(sentence) && !/^\s*(?:The duration is|Duration|As usual|As normal|As always)\b/i.test(sentence));
    return { effects, modifiers, unread, duration, ...(resistances.length ? { resistances } : {}), ...(speeds.length ? { speeds } : {}), ...(senses.length ? { senses } : {}), ...(other ? { other } : {}) };
}

// A reminder of the item's text on its drinker or user, for its time (the user's note-Effect rule for spells,
// 2026-09-26): an item that lasts a while and does nothing else the module reads. null without a time.
export function noteRow(item) {
    const text = plainText(item?.system?.description?.value);
    const duration = itemDuration(text);
    if (!duration) return null;
    const body = text.replace(ACTIVATE_LINE, "").trim();
    // (The ability module names a note Effect "<item>: <label>", "note" without one.)
    return { noteEffects: [{ text: body, duration }] };
}
