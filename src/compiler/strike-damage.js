// What an item's Strike adds to PF2e's own rolls (Mantle of the Tikbalang's "Make a melee Strike. This Strike deals an
// additional 4d6 mental damage"; Pick of Arcane Accuracy's "You gain a +1 status bonus to this Strike, and if you hit, you
// deal an additional 1d4 persistent force damage"; Piston Gauntlets' "an extra two dice of weapon damage"; Iris of the
// Sky's "All damage from this Strike is fire damage"): extra dice, an attack bonus, a damage type, read for PF2e's
// DamageDice, FlatModifier and DamageAlteration rules on the readied Strike's Effect (src/live/strike-card.js). Whatever
// else the text says about the Strike is kept, sentence by sentence, as notes. Pure.

const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed";
const COUNT = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
const STRIKING = { greater: 2, major: 3 };

// "an additional 4d6 mental damage", "an additional 1d4 persistent force damage", "6d6 additional force damage", "an
// additional 1d6 damage", "an additional 1d8 precision damage (or …)", and a second die after it ("and 1d6 persistent fire
// damage").
const EXTRA = new RegExp(String.raw`\b(?:an )?(?:additional|extra) (\d+)d(\d+) (?:(persistent|precision|splash) )?(?:(${TYPES}|untyped) )?damage\b|\b(\d+)d(\d+) (?:additional|extra) (?:(persistent|precision|splash) )?(?:(${TYPES}|untyped) )?damage\b`, "gi");
const AND_DIE = new RegExp(String.raw`^,? and (?:an additional )?(\d+)d(\d+) (?:(persistent|precision|splash) )?(?:(${TYPES}) )?damage\b`, "i");
// (A next Strike's own damage, no "additional": Venom Lash's "deals 2d6 persistent poison damage to the target".)
const OWN_DIE = new RegExp(String.raw`\bdeals? (\d+)d(\d+) (?:(persistent|precision|splash) )?(?:(${TYPES}) )?damage\b`, "i");
// (The hit's own added damage in other words: Shatterpoint Ammunition's "In addition, the target takes 1d8 persistent sonic
// damage from the vibrations", "the target takes 2d6 acid damage in addition to the damage normally dealt".)
const TARGET_TAKES = new RegExp(String.raw`^In addition, (?:the target|it) (?:also )?takes (\d+)d(\d+) (?:(persistent|precision|splash) )?(?:(${TYPES}) )?damage\b|\b(?:the target|it) (?:also )?takes (\d+)d(\d+) (?:(persistent|precision|splash) )?(?:(${TYPES}) )?damage in addition to\b`, "i");
// "an extra die of weapon damage", "an extra two dice of weapon damage".
const WEAPON_DICE = /\b(?:an )?extra (?:(one|two|three|four|\d+) )?(?:die|dice) of weapon damage\b/i;
// "+1 status bonus to this Strike", "with a +1 circumstance bonus to the attack roll".
const ATTACK = /\+(\d+) (status|circumstance|item) bonus to (?:this Strike|the Strike|the attack roll|your attack roll|this attack|the attack)\b/i;
const ALTERATION = new RegExp(String.raw`\bAll (?:the )?damage from this Strike is (${TYPES}) damage\b`, "i");
// "Your outcome is one degree of success better than what you rolled": PF2e's AdjustDegreeOfSuccess on the attack roll.
const BETTER = /\b(?:your|the) outcome is one degree of success better than (?:what you rolled|you rolled|it would otherwise be)\b/i;
// "If the club has a greater striking rune, increase the additional damage to 2d6."
const RUNE_STEP = /\bIf the [\w' -]+? has an? (greater|major) striking rune, increase the additional damage to (\d+)d(\d+)\./gi;
// Damage that isn't this Strike's own, or only against some creatures ("to creatures with void healing", "per damage die",
// "any physical ranged attacks … deal").
const NOT_OURS = /^\s*(?:to|against) (?!(?:the|its|your) target\b|the struck creature\b|the target of your Strike\b|it\b)|^\s*per\b/i;
const OTHERS = /\b(?:any|all other|allies|each creature|For the next)\b/i;
// What a sentence may leave over and still say nothing more (the Strike, its weapon, its timing).
const RULE_WORDS = /\b(?:teleport\w*|Strides?|Steps?|Fly|Leap|reach|penalty|bonus|ignores?|counts?|instead|half|area|cone|line|\d+-foot|emanation|trait|cover|range|feet|creatures?|save|DC|frequency|multiple attack|terrain|Hit Points|resistances?|weakness|immun\w*|condition|light|glow\w*|choose|choice|jaws)\b/i;

const die = (count, faces, category, type) => ({ diceNumber: Number(count), dieSize: `d${faces}`, category: category ? category.toLowerCase() : null, damageType: type && type.toLowerCase() !== "untyped" ? type.toLowerCase() : null });

// Damage only under some condition ("Goat If your last action was to Stride at least half your Speed, this does an
// additional 1d4 force damage"): not the Strike's on any hit. "If you hit" / "When the Strike hits" are its own.
const CONDITION = /\b(?:if|when|whenever|unless)\b/i;
const ON_HIT = /\b(?:if|when) (?:you|it|this Strike|the Strike|your Strike) (?:hit|hits|successfully)\b/i;
const conditional = (prefix) => CONDITION.test(prefix) && !ON_HIT.test(prefix);

// One sentence's dice: [{ die, start, end }] — none when the damage isn't this Strike's own.
function sentenceDice(sentence, { own = false } = {}) {
    if (OTHERS.test(sentence)) return [];
    const found = [];
    for (const match of sentence.matchAll(EXTRA)) {
        const rest = sentence.slice(match.index + match[0].length);
        if (NOT_OURS.test(rest) || conditional(sentence.slice(0, match.index))) return [];
        found.push({ die: die(match[1] ?? match[5], match[2] ?? match[6], match[3] ?? match[7], match[4] ?? match[8]), start: match.index, end: match.index + match[0].length });
        const next = AND_DIE.exec(rest);
        if (next) found.push({ die: die(next[1], next[2], next[3], next[4]), start: match.index + match[0].length, end: match.index + match[0].length + next[0].length });
    }
    if (!found.length) {
        const match = TARGET_TAKES.exec(sentence);
        if (match && !conditional(sentence.slice(0, match.index))) found.push({ die: die(match[1] ?? match[5], match[2] ?? match[6], match[3] ?? match[7], match[4] ?? match[8]), start: match.index, end: match.index + match[0].length });
    }
    if (!found.length && own) {
        const match = OWN_DIE.exec(sentence);
        if (match && !NOT_OURS.test(sentence.slice(match.index + match[0].length))) found.push({ die: die(match[1], match[2], match[3], match[4]), start: match.index, end: match.index + match[0].length });
    }
    return found;
}

// The Strike's extras in its text (from the Strike on): { dice, attack, alteration, notes, read } — dice
// [{ diceNumber, dieSize, category, damageType }] (dieSize null: the weapon's, when the item isn't one), attack
// { value, type }, alteration (a damage type), notes (sentences left unread), read (whether anything was).
// options: item (its runes and damage die), strikeSentence (the sentence the Strike is in), own (a next Strike's own
// damage counts), riderSentence(sentence) (true when the hit riders read it).
export function readStrikeExtras(text, { item = null, strikeSentence = null, own = false, riderSentence = () => false } = {}) {
    const body = String(text ?? "").replace(/\s*Craft Requirements\b.*$/s, "");
    const dice = [];
    let attack = null;
    let alteration = null;
    let degree = null;
    const notes = [];
    // (A rune step: the item's own striking rune picks the dice.)
    const striking = Number(item?.system?.runes?.striking) || 0;
    const steps = [...body.matchAll(RUNE_STEP)].map((match) => ({ rune: STRIKING[match[1].toLowerCase()], count: Number(match[2]), faces: match[3] }));
    for (const sentence of body.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
        if (RUNE_STEP.test(sentence)) {
            RUNE_STEP.lastIndex = 0;
            continue;
        }
        RUNE_STEP.lastIndex = 0;
        if (riderSentence(sentence)) continue;
        let rest = sentence;
        const isStrike = Boolean(strikeSentence) && sentence.includes(strikeSentence.trim().slice(0, 40));
        const found = sentenceDice(sentence, { own: own && isStrike });
        for (const entry of found) dice.push(entry.die);
        for (const entry of [...found].reverse()) rest = `${rest.slice(0, entry.start)} ${rest.slice(entry.end)}`;
        const weapon = WEAPON_DICE.exec(rest);
        if (weapon && !OTHERS.test(sentence)) {
            const count = COUNT[weapon[1]?.toLowerCase() ?? "a"] ?? Number(weapon[1]);
            dice.push({ diceNumber: count, dieSize: item?.type === "weapon" && item.system?.damage?.die ? item.system.damage.die : null, category: null, damageType: null, weaponDie: true });
            rest = rest.replace(weapon[0], " ");
        }
        const bonus = ATTACK.exec(rest);
        if (bonus && !attack) {
            attack = { value: Number(bonus[1]), type: bonus[2].toLowerCase() };
            rest = rest.replace(bonus[0], " ");
        }
        const altered = ALTERATION.exec(rest);
        if (altered) {
            alteration = altered[1].toLowerCase();
            rest = rest.replace(altered[0], " ");
        }
        const better = BETTER.exec(rest);
        if (better) {
            degree = { all: "one-degree-better" };
            rest = rest.replace(better[0], " ");
        }
        const changed = rest !== sentence;
        // (Unread: a sentence with nothing read in it, or what a read one leaves that says more.)
        if (!changed && !isStrike) notes.push(sentence.trim());
        else if (RULE_WORDS.test(rest.replace(/\b(?:melee|ranged) Strike\b/gi, ""))) notes.push(sentence.trim());
    }
    // (The rune step in place of the first die, for the item's rune.)
    const step = steps.filter((entry) => striking >= entry.rune).sort((a, b) => b.rune - a.rune)[0];
    if (step && dice.length) dice[0] = { ...dice[0], diceNumber: step.count, dieSize: `d${step.faces}` };
    return { dice, attack, alteration, degree, notes, read: Boolean(dice.length || attack || alteration || degree) };
}
