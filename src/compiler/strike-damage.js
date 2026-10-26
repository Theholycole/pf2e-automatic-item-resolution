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
// (Damage on a failure too, Brutal Finish's "On a failure, you deal damage equal to one weapon damage die": that many of the weapon's dice
// at the creature it missed, src/live/strike-card.js riderFor.)
const FAIL_DICE = /^On a failure, you deal damage equal to (one|two|three|\d+) weapon damage (?:die|dice)\.?$/i;
const FEAT_DIE = /^With the ([A-Z][\w' -]+?) feat, one more weapon damage die on a hit and on a failure\.$/;
const TURN_ENDS = /^After the Strike, your turn ends\.$/;
// (Half its extra damage on a failure, Energizing Lattice's "If your Strike fails, but doesn't critically fail, the target still takes half
// the force damage": failHalf, that type's extra dice — scripts/strikes.js, the ability module's card at half.)
const FAIL_HALF = /^If your Strike fails, but doesn't critically fail, the target still takes half the (\w+) damage\.?$/i;
// "an extra die of weapon damage", "an extra two dice of weapon damage".
const WEAPON_DICE = /\b(?:an )?extra (?:(one|two|three|four|\d+) )?(?:die|dice) of weapon damage\b/i;
// "+1 status bonus to this Strike", "with a +1 circumstance bonus to the attack roll".
const ATTACK = /\+(\d+) (status|circumstance|item) bonus to (?:this Strike|the Strike|the attack roll|your attack roll|this attack|the attack)\b/i;
// ("All damage from this Strike is fire damage"; Battering Ammunition's "It deals bludgeoning damage instead of its normal damage type".)
// (And Blessed Ampoule's "the weapon's physical damage for the Strike becomes spirit damage".)
const MATERIAL_STRIKE = /\bThe (?:attack|Strike) is treated as (silver|cold iron|adamantine)\b\.?/i;
const ALTERATION = new RegExp(String.raw`\bAll (?:the )?damage from this Strike is (${TYPES}) damage\b|\b(?:It|The Strike|This Strike|The ammunition) deals (${TYPES}) damage instead of its (?:normal|usual) damage type\b|\bthe weapon's (?:physical )?damage for the Strike becomes (${TYPES}) damage\b`, "i");
// (Cover it ignores, Golden-Cased Bullet's "allowing you to ignore the bonus to AC granted to a target in standard or lesser cover", Arcing Hand
// Crossbow's "This attack ignores the target's cover": PF2e's EphemeralEffect that suppresses the target's cover bonus, for a target in that
// cover, as PF2e's Alchemist Goggles have it — ignoresCover, the levels, 2026-10-26.)
const IGNORE_COVER = /\bignore the bonus to AC granted to a target in ((?:greater|standard|lesser)(?:,? (?:or )?(?:greater|standard|lesser))*) cover\b|\b(?:This|The) (?:attack|Strike) ignores the target's cover\b/i;
const coverLevels = (words) => (words ? [...new Set(words.toLowerCase().match(/greater|standard|lesser/g))].flatMap((level) => (level === "greater" ? ["greater", "greater-prone"] : [level])) : ["lesser", "standard", "greater", "greater-prone"]);
// "Your outcome is one degree of success better than what you rolled": PF2e's AdjustDegreeOfSuccess on the attack roll.
const BETTER = /\b(?:your|the) outcome is one degree of success better than (?:what you rolled|you rolled|it would otherwise be)\b/i;
// (The target Off-Guard to it, Sawtooth Reaper's Bloodmist Whirl's "The next Strike you make treats the target as Off-Guard": PF2e's
// EphemeralEffect of the condition, for that attack.)
const OFF_GUARD = /\btreats the target as Off-Guard\b|\bthe target is Off-Guard (?:to|against) (?:this|the) (?:Strike|attack)\b/i;
// (Its runes for the Strike: Weapon Shot's "For the Strike with which you consume the ammunition, the weapon is a +1
// striking weapon, instead of those of the weapon firing it" — potency 1, striking 1; "+2 greater striking" — 2, 2.)
const RUNES = /\bthe weapon is a \+(\d) (?:(greater|major) )?striking weapon\s*,? instead of (?:those|the runes) of the weapon firing it\b/i;
// "If the club has a greater striking rune, increase the additional damage to 2d6."
const RUNE_STEP = /\bIf the [\w' -]+? has an? (greater|major) striking rune, increase the additional damage to (\d+)d(\d+)\./gi;
// Damage that isn't this Strike's own, or only against some creatures ("to creatures with void healing", "per damage die",
// "any physical ranged attacks … deal").
const NOT_OURS = /^\s*(?:to|against) (?!(?:the|its|your) target\b|the struck creature\b|the target of your Strike\b|it\b)|^\s*per\b/i;
const OTHERS = /\b(?:any|all other|allies|each creature|For the next)\b/i;
// (No range penalty out to an increment: Sniper's Bead's "You take no range increment penalty on your attack, as long as the attack
// is against a target within the affixed weapon's first two range increments", Jistkan War Crossbow's "ignoring the penalty for
// making a Strike within your second or third range increment" — PF2e's "ignore-range-penalty:N" roll option for the Strike.)
// (Sniper's Bead (Major)'s "even if the target is all the way out to the weapon's sixth range increment": all six.)
const RANGE_FREE = /\b(?:You take no range increment penalty on (?:your|the|this) attack, as long as the attack is against a target within (?:the|your) [\w' ]*?first (two|three|four|five|\d+) range increments|ignoring the penalty for making a Strike within your (second(?: or third)?|third) range increments?|You take no range increment penalty on (?:your|the|this) attack, even if the target is all the way out to the [\w' ]*?(fourth|fifth|sixth) range increment)\b/i;
const INCREMENTS = { two: 2, three: 3, four: 4, five: 5, second: 2, "second or third": 3, third: 3, fourth: 4, fifth: 5, sixth: 6 };
// (A trait's penalty gone: Alchemist's Damper's "allowing you to ignore the circumstance penalty of the attached weapon's kickback
// weapon trait" — PF2e's own modifier, by its slug, suppressed for the Strike.)
const SUPPRESS = /\bignore the circumstance penalty of the [\w' ]+? (kickback) (?:weapon )?trait\b/i;
// (Flat splash damage for the Strike: Jistkan War Crossbow's "gains the splash trait and deals 10 piercing splash damage for this
// Strike".)
const SPLASH = new RegExp(String.raw`\b(?:gains the splash trait and )?deals (\d+) (${TYPES}) splash damage for this Strike\b`, "i");
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
    let material = null;
    let degree = null;
    let runes = null;
    const options = [];
    const suppress = [];
    let splash = null;
    let offGuard = false;
    let ignoresCover = null;
    let failDice = 0;
    let featDie = null;
    let turnEnds = false;
    let failHalfType = null;
    let missRefund = false;
    let readied = false;
    let reach = null;
    // (What it says of the multiple attack penalty — PF2e's own buttons, the user's to pick: "held" until all are rolled, "double" (two attacks),
    // "none" — the card's line.)
    let map = null;
    const requires = [];
    const notes = [];
    // (A rune step: the item's own striking rune picks the dice.)
    const striking = Number(item?.system?.runes?.striking) || 0;
    const steps = [...body.matchAll(RUNE_STEP)].map((match) => ({ rune: STRIKING[match[1].toLowerCase()], count: Number(match[2]), faces: match[3] }));
    for (let sentence of body.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
        if (RUNE_STEP.test(sentence)) {
            RUNE_STEP.lastIndex = 0;
            continue;
        }
        RUNE_STEP.lastIndex = 0;
        if (riderSentence(sentence)) continue;
        // (The multiple attack penalty: Piston Gauntlets' "This counts as two attacks when calculating your multiple attack penalty", Iron Cube's
        // "Both attacks count toward your multiple attack penalty, but the penalty doesn't increase until after you've made both of them".)
        if (/^This counts as two attacks (?:when calculating|for) your multiple attack penalty\.$/i.test(sentence.trim())) {
            map = "double";
            continue;
        }
        if (/\bmultiple attack penalty\b[^.;]*\b(?:until|only after)\b/i.test(sentence) && /^(?:Both|These|Each|All|You apply|Your)\b/.test(sentence.trim())) {
            map = "held";
            continue;
        }
        // (Crimson Fulcrum Lens' "… and doesn't count toward your multiple attack penalty": that clause; its sentence goes on.)
        const uncounted = /,? and doesn't count toward your multiple attack penalty(?=\.$)/i.exec(sentence.trim());
        if (uncounted) {
            map = "none";
            sentence = sentence.trim().replace(uncounted[0], "");
        }
        // (Its dice for one Strike, the lens's "(or 2d8 precision damage if you make a jaws Strike)": the other die for a Strike with that
        // attack, PF2e's "item:slug:jaws".)
        const alternate = /\s*\(or (\d+)d(\d+) (?:precision )?damage if you make an? (\w+) Strike\)/i.exec(sentence);
        if (alternate) sentence = sentence.replace(alternate[0], "");
        const from = dice.length;
        // (The splash trait's miss, said again: Drake Rifle's "On a failure, the target and creatures within 5 feet of it still take that
        // splash damage" — the splash card's on a failure, scripts/strikes.js.)
        if (/^On a failure, the target and creatures within 5 feet of it still take that splash damage\.$/i.test(sentence.trim()) && SPLASH.test(body)) continue;
        // (PF2e's own rule said again, Sniper's Bead (Major)'s "As normal, you still can't hit a target more than six range increments away".)
        if (/^As normal, you still can't hit a target more than six range increments away\.$/i.test(sentence.trim())) continue;
        // (An introduction to the range rule read after it, Sniper's Bead's "its magic greatly lessens the effect of distance on your triggering
        // attack" before "You take no range increment penalty …".)
        if (/^When you activate the [\w' -]+?, its magic greatly lessens the effect of distance on your triggering attack\.$/i.test(sentence.trim()) && /\bno range increment penalty\b/i.test(body)) continue;
        // (What its target must be, Starshot Arrow's "The target must be one you can personally detect", "There must be a line of effect between
        // you and the target", "The target must be within the maximum range of your weapon": its user's to choose by, as a requirement is — the
        // card's lines, strike.requires. And a reaction its target may have, Big Rock Bullet's "Creatures with the Catch Rock reaction can use it
        // against a big rock bullet": that creature's, the card's line too.)
        if (/^(?:The target must be one you can personally detect|There must be a line of effect between you and the target|The target must be within the maximum range of your weapon|Creatures with the [A-Z][\w ]+? reaction can use it against an? [\w' -]+?)\.$/.test(sentence.trim())) {
            requires.push(sentence.trim());
            continue;
        }
        // (More reach for the Strike, the Extending rune's "You Strike with the weapon, and you have reach 60 feet for the Strike", Tasset of
        // Flexibility's "Make a Strike with a melee weapon, increasing your reach by 5 feet for that Strike": strike.reach, the card's line —
        // PF2e's own Strike at a creature that far, which PF2e doesn't measure; its intro "giving you an impossible reach" said by it.)
        const reaching = /\b(?:you have reach (\d+) feet for the Strike|increasing your reach by (\d+) feet for that Strike)\.?$/i.exec(sentence.trim());
        if (reaching) {
            reach = reaching[1] ? { feet: Number(reaching[1]) } : { more: Number(reaching[2]) };
            continue;
        }
        if (/^You extend your weapon, giving you an impossible reach\.$|^The [\w' -]+? helps you stretch farther than you normally could\.$/i.test(sentence.trim())) continue;
        // (A miss that gives its use back, Hydra Head Club's "If your Strike misses, the activation does not count against the hydra head club's
        // activation frequency": missRefund — scripts/strikes.js takes the use off the item's record.)
        // (A Strike readied, Flashblade's (its words src/compiler/item-data.js's): until the start of its user's next turn, its use given back if
        // it isn't made — strike.readied.)
        if (/^You Ready it until the start of your next turn; if it isn't made by then, the activation does not count against its frequency\.$/i.test(sentence.trim())) {
            readied = true;
            continue;
        }
        if (/^If your Strike misses, the activation does not count against the [\w' -]+?'s activation frequency\.$/i.test(sentence.trim())) {
            missRefund = true;
            continue;
        }
        // (Its requirement's state ending, Energizing Lattice's glow after the Strike: the requirement is its user's, as each one is.)
        if (/^The [\w ]+? ceases glowing after the Strike\.$/i.test(sentence.trim())) continue;
        const halved = FAIL_HALF.exec(sentence.trim());
        if (halved) {
            failHalfType = halved[1].toLowerCase();
            continue;
        }
        // (A feat's own extra die beside it, Iron Cudgel's "With the Brutal Finish feat, one more weapon damage die on a hit and on a failure":
        // the die's rule only with PF2e's roll option for the feat, feat:brutal-finish, and one more die on a failure — 2026-10-26.)
        const feat = FEAT_DIE.exec(sentence.trim());
        if (feat) {
            featDie = { slug: feat[1].toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: feat[1], diceNumber: 1 };
            continue;
        }
        // (Its user's turn over after the Strike, Brutal Finish's: a line of the card.)
        if (TURN_ENDS.test(sentence.trim())) {
            turnEnds = true;
            continue;
        }
        const failing = FAIL_DICE.exec(sentence.trim());
        if (failing) {
            failDice = COUNT[failing[1].toLowerCase()] ?? Number(failing[1]);
            continue;
        }
        let rest = sentence;
        const isStrike = Boolean(strikeSentence) && sentence.includes(strikeSentence.trim().slice(0, 40));
        const found = sentenceDice(sentence, { own: own && isStrike });
        for (const entry of found) dice.push(entry.die);
        for (const entry of [...found].reverse()) rest = `${rest.slice(0, entry.start)} ${rest.slice(entry.end)}`;
        if (alternate && dice.length === from + 1) {
            const slug = alternate[3].toLowerCase();
            dice[from] = { ...dice[from], predicate: [...(dice[from].predicate ?? []), { not: `item:slug:${slug}` }] };
            dice.push({ ...dice[from], diceNumber: Number(alternate[1]), dieSize: `d${alternate[2]}`, predicate: [`item:slug:${slug}`] });
        } else if (alternate) notes.push(alternate[0].trim());
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
        // (A precious material for the Strike, Quicksilver Cloak's "The attack is treated as silver": PF2e's AdjustStrike materials.)
        const treated = MATERIAL_STRIKE.exec(rest);
        if (treated) {
            material = { silver: "silver", "cold iron": "cold-iron", adamantine: "adamantine" }[treated[1].toLowerCase()];
            rest = rest.replace(treated[0], " ");
        }
        const altered = ALTERATION.exec(rest);
        if (altered) {
            alteration = (altered[1] ?? altered[2] ?? altered[3]).toLowerCase();
            rest = rest.replace(altered[0], " ");
        }
        const upgraded = RUNES.exec(rest);
        if (upgraded) {
            runes = { potency: Number(upgraded[1]), striking: { greater: 2, major: 3 }[upgraded[2]?.toLowerCase()] ?? 1 };
            rest = rest.replace(upgraded[0], " ");
        }
        const free = RANGE_FREE.exec(rest);
        if (free) {
            options.push(`ignore-range-penalty:${INCREMENTS[(free[1] ?? free[2] ?? free[3]).toLowerCase()] ?? Number(free[1])}`);
            rest = rest.replace(free[0], " ");
        }
        const suppressed = SUPPRESS.exec(rest);
        if (suppressed) {
            suppress.push(suppressed[1].toLowerCase());
            rest = rest.replace(suppressed[0], " ");
        }
        const splashed = SPLASH.exec(rest);
        if (splashed) {
            splash = { value: Number(splashed[1]), damageType: splashed[2].toLowerCase() };
            rest = rest.replace(splashed[0], " ");
        }
        const flat = OFF_GUARD.exec(rest);
        if (flat) {
            offGuard = true;
            rest = rest.replace(flat[0], " ");
        }
        const cover = IGNORE_COVER.exec(rest);
        if (cover) {
            ignoresCover = coverLevels(cover[1]);
            rest = rest.replace(cover[0], " ");
        }
        const better = BETTER.exec(rest);
        if (better) {
            degree = { all: "one-degree-better" };
            rest = rest.replace(better[0], " ");
        }
        const changed = rest !== sentence;
        // (Unread: a sentence with nothing read in it, or what a read one leaves that says more.)
        // (Flavor that says no rule — a talisman's "This plain wooden bead dangles from a string attached to the stock of the affixed
        // weapon" — isn't one.)
        if (!changed && !isStrike) {
            const looks = /^\s*(?:This|These)\b/.test(sentence) && !RULE_WORDS.test(sentence) && !/[@\d]|\b(?:damage|AC|DC|save|check|bonus|condition|Hit Points|hits?|miss(?:es)?|critical|target|attack|Strike|undead|creature)\b/i.test(sentence);
            if (!looks) notes.push(sentence.trim());
        }
        else if (RULE_WORDS.test(rest.replace(/\b(?:melee|ranged) Strike\b/gi, ""))) notes.push(sentence.trim());
    }
    // (The rune step in place of the first die, for the item's rune.)
    const step = steps.filter((entry) => striking >= entry.rune).sort((a, b) => b.rune - a.rune)[0];
    if (step && dice.length) dice[0] = { ...dice[0], diceNumber: step.count, dieSize: `d${step.faces}` };
    // (The failure's half: that type's extra dice, read; no such dice, the sentence a note.)
    const halfOf = failHalfType ? dice.find((entry) => entry.damageType === failHalfType && entry.dieSize) : null;
    if (failHalfType && !halfOf) notes.push(`If your Strike fails, but doesn't critically fail, the target still takes half the ${failHalfType} damage.`);
    const failHalf = halfOf ? { formula: `${halfOf.diceNumber}${halfOf.dieSize}`, type: failHalfType } : null;
    return { dice, attack, alteration, degree, ...(material ? { material } : {}), ...(runes ? { runes } : {}), ...(options.length ? { options } : {}), ...(suppress.length ? { suppress } : {}), ...(splash ? { splash } : {}), ...(offGuard ? { offGuard } : {}), ...(ignoresCover ? { ignoresCover } : {}), ...(failDice ? { failDice } : {}), ...(featDie ? { featDie } : {}), ...(turnEnds ? { turnEnds } : {}), ...(failHalf ? { failHalf } : {}), ...(requires.length ? { requires } : {}), ...(missRefund ? { missRefund } : {}), ...(readied ? { readied } : {}), ...(reach ? { reach } : {}), ...(map ? { map } : {}), notes, read: Boolean(dice.length || attack || alteration || material || degree || runes || options.length || suppress.length || splash || offGuard || ignoresCover || failDice || featDie || turnEnds || failHalf || requires.length || missRefund || readied || reach || map) };
}
