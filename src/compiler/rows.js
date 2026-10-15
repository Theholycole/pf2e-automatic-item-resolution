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
    const pattern = new RegExp(String.raw`\b(?:making|leaving|rendering|render|makes|leaves|renders) you (${names})(?: (\d+))?\b|\byou(?:'re| are| become| also become| are also| remain)(?: (?:both|also|now))? (${names})(?: (\d+))?\b`, "gi");
    for (const [index, sentence] of sentences.entries()) {
        if (/\b(?:if|when|whenever|unless|while|after|once|each time|throughout|instead of|can't|cannot|don't|aren't|isn't|no longer|could|would|against|next time)\b/i.test(sentence.replace(/^\s*(?:When|Upon|After) (?:you )?(?:drink|consum|eat|imbib|swallow)\w*\b[^,]*,/i, ""))) continue;
        const timed = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?|days?)\b/i.test(sentence) || UNTIL_NEXT_TURN.test(sentence);
        if (!timed) continue;
        const until = UNTIL_NEXT_TURN.exec(sentence);
        const duration = until ? { mode: "fixed", value: 1, unit: "rounds", expiry: /\bend\b/i.test(until[0]) ? "turn-end" : "turn-start", anchor: "source-turn" } : durationIn(sentence, null);
        for (const match of sentence.matchAll(pattern)) {
            const slug = (match[1] ?? match[3]).toLowerCase();
            const value = match[2] ?? match[4];
            if (effects.some((effect) => effect.slug === slug)) continue;
            // (Only to some: "invisible to scrying magic", "Invisible to creatures with the fiend … trait" — not the condition.)
            if (/^\s*(?:to|from|against)\b/i.test(sentence.slice(match.index + match[0].length))) continue;
            used.add(index);
            effects.push({ kind: "condition", slug, value: value ? Number(value) : null, duration: slug === "prone" ? null : duration });
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
        const self = new RegExp(String.raw`\byou (?:immediately )?regain ${AMOUNT_PARENS} Hit Points\b`, "i").exec(sentence);
        const other = new RegExp(String.raw`\brestor(?:e|es|ing) ${AMOUNT_PARENS} Hit Points to (?:it|them|the (?:target|creature)|that creature|an? (?:willing,? |living,? |adjacent,? )*(?:creature|ally))\b`, "i").exec(sentence);
        const match = self ?? other;
        if (match && !/\b(?:if|when|whenever|each time|the next time|at the (?:start|end))\b/i.test(sentence.slice(0, match.index))) {
            used.add(index);
            const amount = match[1].replace(/\s+/g, "");
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
    ...SKILLS.map((skill) => [new RegExp(`^${skill}(?: checks?)?$`, "i"), skill])
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
const ACTIONS = { climb: "climb", swim: "swim", "high jump": "high-jump", "long jump": "long-jump", leap: "leap", balance: "balance", "tumble through": "tumble-through", escape: "escape", hide: "hide", sneak: "sneak", seek: "seek", "sense motive": "sense-motive", "sense direction": "sense-direction", track: "track", demoralize: "demoralize", feint: "feint", grapple: "grapple", trip: "trip", shove: "shove", disarm: "disarm", "recall knowledge": "recall-knowledge", "treat wounds": "treat-wounds", "administer first aid": "administer-first-aid", "pick a lock": "pick-a-lock", "disable a device": "disable-a-device", squeeze: "squeeze", impersonate: "impersonate", lie: "lie", "make an impression": "make-an-impression", request: "request", coerce: "coerce", perform: "perform", "gather information": "gather-information" };
function scopeOf(scope) {
    const against = /^against ((?:[\w-]+(?:,? (?:and|or) |, )?)+?)(?: effects| spells| abilities| threats)?$/i.exec(scope);
    if (against) {
        const traits = against[1].split(/,? (?:and|or) |, /).map((word) => TRAITS[word.toLowerCase()]);
        if (!traits.length || traits.some((trait) => !trait)) return null;
        return [traits.length === 1 ? `item:trait:${traits[0]}` : { or: traits.map((trait) => `item:trait:${trait}`) }];
    }
    const to = /^to ((?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?)(?:,? (?:and|or) (?:[A-Z][\w]*(?: (?:a |an )?[A-Z]?[\w]+)*?))*)$/.exec(scope);
    if (to) {
        const actions = to[1].split(/,? (?:and|or) |, /).map((words) => ACTIONS[words.toLowerCase()]);
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
        if (/^\s*(?:If|When|Whenever|While|Each time)\b/i.test(sentence)) continue;
        for (const match of sentence.matchAll(pattern)) {
            const [, sign, number, feet, type, kind, list] = match;
            if ((kind.toLowerCase() === "bonus") !== (sign === "+")) continue;
            const value = (sign === "+" ? 1 : -1) * Number(number);
            const timed = { type: type?.toLowerCase() ?? "untyped", duration: durationIn(sentence, duration) };
            // ("+10-foot status bonus to your Speed": the land Speed; "to your Speeds": all of them.)
            if (feet) {
                const speeds = /^(?:your |its )?(?:land )?(Speeds?)$/i.exec(list.trim());
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
            const selectors = selectorsOf(names.replace(/^all /i, ""));
            if (!selectors) continue;
            used.add(index);
            for (const selector of selectors) modifiers.push({ selector, value, ...timed, ...(predicate ? { predicate } : {}) });
        }
    }
    return modifiers;
}

// Items whose text isn't one use with one result: activated on a trigger, an affliction's stages, a second
// effect, a choice of ways to use it ("may be applied to armor, a weapon, or mixed into an elixir"), or one
// that links PF2e Effects (those Effects hold its rules).
const NOT_ONE_RESULT = /\bStage 1\b|\bSecondary Effect\b|\broll (?:a |an )?(?:d\d+|\d+d\d+)\b[^.]*\btable\b|\bon the (?:following )?table\b|\b(?:may|can) be (?:applied|used|mixed|poured)\b[^.]*\bor\b|\bin (?:either|one) of the following ways\b|\bchoose one\b/i;
// A talisman's or an activation's Trigger, Requirements and Frequency say when it's used, not what it does: taken out before
// reading ("Trigger You become Blinded …" isn't a condition it gives). Each runs to its sentence's end or to "Effect".
const WHEN_CLAUSES = /\b(?:Trigger|Requirements?|Frequency)\b[^.]*?(?=\bEffect\b|\.(?:\s|$)|$)\.?/g;
const EFFECT_LINK = /@UUID\[Compendium\.pf2e\.[\w-]*effects\.Item\./;

// A sentence that says something a creature or its rolls get or lose (not flavor, not how long it lasts).
const MECHANICAL = /\b(?:bonus|penalty|resistance|weakness|immun\w*|Speeds?|damage|Hit Points|DC \d+|checks?|saves?|saving throws?|attack|Strikes?|AC|conditions?|senses?|darkvision|actions?|reactions?|spells?|(?:clumsy|concealed|dazzled|deafened|enfeebled|fatigued|fleeing|frightened|hidden|immobilized|invisible|off-guard|prone|quickened|sickened|slowed|stunned|stupefied)\b)/i;

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
    if (!effects.length && !modifiers.length) return null;
    // (Healing another creature: the row's recipient is chosen like a drinker's.)
    const other = Boolean(heal?.other);
    if (heal?.other) delete heal.other;
    // (Not its time, nor a sentence restating PF2e's usual rule: "As usual being concealed when your position is still obvious, you can't …".)
    const unread = sentences.filter((sentence, index) => !used.has(index) && MECHANICAL.test(sentence) && !/^\s*(?:The duration is|Duration|As usual|As normal|As always)\b/i.test(sentence));
    return { effects, modifiers, unread, duration, ...(other ? { other } : {}) };
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
