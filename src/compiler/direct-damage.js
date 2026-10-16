// Damage an item deals outright to one creature, with no roll against it: Forge Warden's "The attacking creature takes
// 2d6 fire damage", Kortos Diamond's "You deal an additional 2d8 force damage to the struck creature", Clear Cutter's
// Axe's "deals an additional 1d10 persistent fire damage to the plant", Horns of Naraga's "The creature takes 5d6 void
// damage". The plan is the ability compiler's shape for such damage — the check family with no roll ("automatic"), the
// damage shared — so live play sends it to the creatures its presser targets through the ability module's card, which
// rolls it and applies it with PF2e's resistances. What else the text says is a note. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";

const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed|untyped";
// (Or a number: Wolf Fang's damage of its user's Strength modifier, src/compiler/item-data.js withOwnerNumbers.)
const DICE = String.raw`(\d+d\d+(?:\s*\+\s*\d+)?|\d+)`;
const KIND = String.raw`(?:(persistent) )?(?:(${TYPES}) )?damage`;
// The one creature: "The attacking creature", "the struck creature", "The creature", "the triggering enemy", "the plant",
// "the undead that caused the condition", "The required creature", "the target".
const ONE = String.raw`(?:the|that|your) (?:(?:attacking|triggering|struck|damaged|required|living|affected|grabbed) )?(?:creature|enemy|foe|attacker|target|plant|undead|construct|aberration)(?: (?:that|who|you) [\w ]{1,40}?)?`;
const TAKES = new RegExp(String.raw`\b${ONE} takes (?:an additional |an extra )?${DICE} ${KIND}\b`, "i");
const DEALS_TO = new RegExp(String.raw`\b(?:you deal|deals?|inflicts?) (?:an additional |an extra )?${DICE} (?:additional )?${KIND} to ${ONE}\b`, "i");
// (Burr Shield's "One of the burrs catches on the Strike's target, inflicting 1d10 persistent bleed damage".)
const INFLICTING = new RegExp(String.raw`\bon (?:${ONE}|the Strike's target), inflicting ${DICE} ${KIND}\b`, "i");
// Not one creature, or not outright: an area, a save, a condition on it, a number not rolled.
const NOT_OUTRIGHT = /\b(?:each|every|all|any) (?:other )?(?:creatures?|enem(?:y|ies)|foes?)\b|\bcreatures in\b|\bwithin \d+ feet\b|\bsave\b|\bsaving throw\b|@Check|\bbasic\b|\bequal to\b|\bper\b|\bfor every\b|\bif (?!you are)/i;

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A text whose damage isn't outright: degrees of a save ("Success The creature takes 2d6 acid damage"), a save at all, or
// a Strike's on a hit ("On a successful hit, the target takes an additional 1d6 force damage", Hydrocannon's).
const DEGREES = /\b(?:Critical Success|Critical Failure)\b|\b(?:Success|Failure) (?:The|the|You|you|It|it)\b/;
const SAVED = /@Check\[(?:type:)?(?:fortitude|reflex|will)\b|\b(?:save|saving throw)\b/i;
const STRUCK = /\b(?:make|makes|attempt|attempts) an? (?:[\w-]+ ){0,3}?Strike\b|\bsuccessful (?:attack|hit|Strike)\b|\bon a hit\b|\bhits a target\b|\bUpon Striking\b/i;
const ROW_START = /^(?:On a|Even on|Success|Failure|Critical)\b/;
// (A shield's statistics line, "Hardness HP BT 6 36 18": not a note.)
const STATS = /^Hardness\b.*\bHP\b/;

// The text (plain, from the activation's Effect on) → { formula, type, category, effects, modifiers, notes } or null.
// A save only for others (the target's allies nearby take damage with a basic save, Shei Long's Blade): not this card's,
// a note beside the target's outright damage.
const OTHERS_SAVE = /^(?:(?:All|Each|Every|Any) (?:of )?(?:the target['’]s |its |other )?(?:allies|creatures|enemies|foes)\b|Creatures (?:who|that) (?:critically )?(?:fail|succeed))/i;
const savedForTarget = (body) => body.split(/(?<=[.!?])\s+(?=[A-Z])/).some((sentence) => SAVED.test(sentence) && !OTHERS_SAVE.test(sentence.trim()));

export function readDirectDamage(text) {
    const plain = String(text ?? "");
    if (DEGREES.test(plain)) return null;
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    if (savedForTarget(body) || (SAVED.test(plain) && !SAVED.test(body))) return null;
    if (STRUCK.test(body)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const inflicting = INFLICTING.exec(sentence);
        const match = TAKES.exec(sentence) ?? DEALS_TO.exec(sentence) ?? inflicting;
        if (!match || NOT_OUTRIGHT.test(sentence) || ROW_START.test(sentence)) continue;
        const [, formula, given, type] = match;
        // (Bleed is always persistent.)
        const category = given || /^bleed$/i.test(type ?? "") ? "persistent" : null;
        // (What the sentence leaves — "Reduce the value of the drained condition you gain by 1, and …" — and the others, as notes.)
        const rest = sentence.replace(match[0], "").replace(/^[\s,.;]+|[\s,.;]+$/g, "");
        // ("… takes 1d6 bleed damage and is off-guard until the end of your next turn": its conditions too, the bombs' reader.)
        const clause = /\band (?:is|becomes) ([^.]+)/i.exec(rest);
        const riders = clause ? riderRow(`is ${clause[1]}`) : null;
        const ridden = Boolean(riders && (riders.effects.length || riders.modifiers.length));
        // (What carries it there, "One of the burrs catches", isn't a rule.)
        const left = match === inflicting && !/\b(?:and|if|unless|save|condition)\b/i.test(rest) ? "" : ridden ? rest.replace(clause[0], "").replace(/^(?:When you activate (?:it|the [\w' -]+?),)?[\s,.;]*$/i, "") : rest;
        const notes = [...(left.split(/\s+/).filter(Boolean).length > 3 ? [sentence] : []), ...sentences.filter((other, at) => at !== index && !STATS.test(other))];
        return { formula: formula.replace(/\s+/g, ""), type: type && type.toLowerCase() !== "untyped" ? type.toLowerCase() : null, category, effects: ridden ? riders.effects : [], modifiers: ridden ? riders.modifiers : [], notes };
    }
    return null;
}

// Conditions an item puts outright on the one creature it names, no damage, no roll (Imposing Shield's "The creature that
// made the attack that triggered your Shield Block becomes Frightened 2", Highhelm War Shield's "The creature becomes
// Grabbed"): { effects, modifiers, notes } or null — the bombs' rider reader on the sentence. Not one scoped to you ("Off-
// Guard against the next melee attack you attempt"), nor under a condition.
const ONE_IS = /^(?:The|That) (?:(?:attacking|triggering|struck|damaged|affected) )?(?:creature|target|attacker|foe|enemy)(?: that [^.]{1,80}?)? (?:is|becomes)\b\s*(.+)$/i;
// (Before the Strike its user then makes: Gallows Tooth's "make a melee Strike against an adjacent creature. That creature is
// Off-Guard against the Strike and until the end of your turn" — the creature off-guard now, the Strike a note. Enemies around
// its user: Jade Bauble's "Until the start of your next turn, enemies within the reach of the weapon … are Off-Guard" — each
// one targeted.)
const RULE_WORDS = /\b(?:Strike|check|save|saving throw|damage|bonus|penalty|Hit Points|condition|Speed|reach|action|resistance|immune)\b/i;
const BEFORE_STRIKE = /\bThat creature is ([\w-]+(?: \d+)?) against the Strike and until the end of your turn\./i;
const ENEMIES_IN_REACH = /\bUntil the (start|end) of your next turn, enemies within (?:the )?reach of [^.]+? are ([\w-]+(?: \d+)?)\./i;
export function readOutrightConditions(text) {
    const plain = String(text ?? "");
    if (DEGREES.test(plain) || SAVED.test(plain)) return null;
    let body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const before = BEFORE_STRIKE.exec(body);
    const enemies = ENEMIES_IN_REACH.exec(body);
    if (before) body = body.replace(BEFORE_STRIKE, `The target is ${before[1]} until the end of your turn.`).replace(/\bmake a melee Strike against an adjacent creature\b/i, "you then make a melee Strike against it");
    else if (enemies) body = body.replace(ENEMIES_IN_REACH, `The target is ${enemies[2]} until the ${enemies[1]} of your next turn.`);
    else if (STRUCK.test(body)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
        const match = ONE_IS.exec(sentence);
        if (!match || NOT_OUTRIGHT.test(sentence) || /\b(?:against (?:the next|your)|to you\b|to your\b)/i.test(sentence)) continue;
        const row = riderRow(`is ${match[1]}`);
        if (!row.effects.length && !row.modifiers.length) continue;
        // (Not its Activate line, nor a sentence with no rule in it: a talisman's has no "Effect" to start from.)
        return { effects: row.effects, modifiers: row.modifiers, notes: sentences.filter((other, at) => at !== index && !STATS.test(other) && !/^Activate\b/.test(other) && RULE_WORDS.test(other)) };
    }
    return null;
}

// The plan: the check family with no roll, at the creature the presser targets; null when nothing is read. Not for
// ammunition (PF2e's own rules deal its damage on the Strike).
export function directDamagePlan(text, base, { item = null } = {}) {
    if (item?.type === "ammo" || /\bammunition\b|\bbullet\b|\barrow\b|\bbolt\b/i.test(item?.name ?? "") || (item?.system?.traits?.value ?? []).includes("ammunition")) return null;
    const read = readDirectDamage(text);
    if (!read) {
        // (Conditions alone, outright.)
        const conditions = readOutrightConditions(text);
        if (!conditions) return null;
        return {
            ...base,
            modelVersion: MODEL_VERSION,
            automation: { level: conditions.notes.length ? "guided" : "automatic" },
            targeting: { target: "1 creature", range: null, area: null },
            trigger: { event: "use" },
            resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { damage: none().damage, effects: conditions.effects, modifiers: conditions.modifiers, ...(conditions.notes.length ? { manualInstructions: conditions.notes.map((note) => `{target}: ${note}`) } : {}) }, failure: none(), criticalFailure: none() } },
            notes: conditions.notes,
            ...(conditions.notes.length ? { partial: true } : {})
        };
    }
    const component = { id: "0", formula: read.formula, type: read.type, category: read.category };
    const success = {
        damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] },
        effects: read.effects,
        modifiers: read.modifiers,
        ...(read.notes.length ? { manualInstructions: read.notes.map((note) => `{target}: ${note}`) } : {})
    };
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [component] }, outcomes: { criticalSuccess: none(), success, failure: none(), criticalFailure: none() } },
        directDamage: { formula: read.formula, type: read.type, category: read.category },
        notes: read.notes,
        ...(read.notes.length ? { partial: true } : {})
    };
}

// The plan to keep: the damage over nothing, a note alone or the GM's fallback.
// (Also over the ability compiler's own outright damage when this one reads more of it: Heedless Spurs' mount's quickened beside its
// bleed.)
export function directDamageOver(plan, damage) {
    if (!damage) return plan;
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") return damage;
    const automatic = (given) => given?.resolution?.kind === "check" && given.resolution.check?.roll === "automatic" && !given.builtin;
    const count = (given) => (given?.resolution?.outcomes?.success?.effects ?? []).length + (given?.resolution?.outcomes?.success?.modifiers ?? []).length;
    return automatic(plan) && automatic(damage) && count(damage) > count(plan) ? damage : plan;
}

// Damage a successful save negates (Mycoweave Shield's "dealing 1d6 persistent poison damage to all creatures in within it;
// a successful @Check[fortitude|dc:16] save negates the damage"): a save at the creatures the presser targets, its damage on
// a failure and none on a success — the ability module's save card, as an item's other saves.
const NEGATED = /\bdealing (\d+d\d+(?:\s*[+-]\s*\d+)?) (?:(persistent) )?(\w+) damage to (?:all )?(?:the )?creatures?\b[^;.]*[;,] a successful @Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\] save negates the damage\b/i;
const negatedRow = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] });

export function negatingSavePlan(text, base) {
    const match = NEGATED.exec(String(text ?? ""));
    if (!match) return null;
    const [, dice, category, type, statistic, dc] = match;
    const kind = type.toLowerCase();
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creatures it reaches", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: statistic.toLowerCase(), basic: false, against: { dc: "fixed", value: Number(dc) } },
            sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${dice.replace(/\s+/g, "")}[${category ? "persistent," : ""}${kind}]`, type: kind, category: category ? "persistent" : null }] },
            outcomes: { criticalSuccess: negatedRow(0), success: negatedRow(0), failure: negatedRow(1), criticalFailure: negatedRow(1) }
        }
    };
}

// Damage to a creature that touches the drinker, for the item's time (Potion of Fire Retaliation's "For 1 minute after
// drinking a potion of fire retaliation, you glow with a faint aura of fire energy, and a creature that touches you (such as
// by making an unarmed attack …) takes fire damage. The aura deals 1d4 fire damage."): no save, at the creature the presser
// targets, each time — plan.retaliation, a card kept open for the item's time (src/live/route.js "later"). The Moderate and
// higher grades' "… or is adjacent to you and hits you with a melee weapon strike takes fire damage" too: retaliation
// { adjacentMelee: true }; rounds, the item's time (1 minute: 10).
const TOUCHER = /\ba creature that touches you\b[^.]*?\btakes (\w+) damage\b/i;
const AURA_DEALS = /\bThe aura deals (\d+d\d+(?:\s*\+\s*\d+)?|\d+) (\w+) damage\b/i;
const ADJACENT_MELEE = /\bor is adjacent to you and hits you with a melee weapon strike\b/i;
const ROUNDS = { round: 1, rounds: 1, minute: 10, minutes: 10, hour: 600, hours: 600 };
const TIME = /\bFor (\d+) (rounds?|minutes?|hours?) after\b/i;
export function retaliationPlan(text, base) {
    const touched = TOUCHER.exec(String(text ?? ""));
    const deals = touched && AURA_DEALS.exec(String(text ?? ""));
    if (!deals) return null;
    const success = { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] };
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature that touches you", range: null, area: null },
        trigger: { event: "use" },
        retaliation: { ...(ADJACENT_MELEE.test(String(text ?? "")) ? { adjacentMelee: true } : {}), ...(TIME.exec(String(text ?? "")) ? { rounds: Number(TIME.exec(String(text ?? ""))[1]) * ROUNDS[TIME.exec(String(text ?? ""))[2].toLowerCase()] } : {}) },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: deals[1].replace(/\s+/g, ""), type: deals[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: none(), success, failure: none(), criticalFailure: none() } }
    };
}

// "You unleash the infused energy …, inflicting 2d6 damage of that energy type to the creature who made the melee Strike"
// (Energy-Absorbing runes): the energy is the one its maker chose, "acid, cold, electricity, or fire" in the item's own
// text — outright damage at the creature targeted, its type the card's picker (plan.damageChoices). whole: the item's text.
const OF_THAT_TYPE = /\binflict(?:s|ing)? (\d+d\d+) damage of that (?:energy|damage) type to (?:the creature who made the (?:melee )?Strike|the attacker|that creature)\b/i;
const ENERGIES = "acid|cold|electricity|fire|sonic";
const ENERGY_LIST = new RegExp(String.raw`\b((?:${ENERGIES})(?:,\s*(?:${ENERGIES}))*,?\s*or\s+(?:${ENERGIES}))\b`, "i");
export function energyChoicePlan(text, base, whole = text) {
    const match = OF_THAT_TYPE.exec(String(text ?? ""));
    const types = [...(ENERGY_LIST.exec(String(whole ?? ""))?.[1] ?? "").matchAll(new RegExp(ENERGIES, "gi"))].map(([type]) => type.toLowerCase());
    if (!match || !types.length) return null;
    const plan = directDamagePlan(`The attacking creature takes ${match[1]} ${types[0]} damage.`, base);
    return plan ? { ...plan, damageChoices: types.map((type) => ({ label: type.replace(/^\w/, (letter) => letter.toUpperCase()), formula: `${match[1]}[${type}]` })) } : null;
}
