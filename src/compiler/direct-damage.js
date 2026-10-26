// Damage an item deals outright to one creature, with no roll against it: Forge Warden's "The attacking creature takes
// 2d6 fire damage", Kortos Diamond's "You deal an additional 2d8 force damage to the struck creature", Clear Cutter's
// Axe's "deals an additional 1d10 persistent fire damage to the plant", Horns of Naraga's "The creature takes 5d6 void
// damage". The plan is the ability compiler's shape for such damage — the check family with no roll ("automatic"), the
// damage shared — so live play sends it to the creatures its presser targets through the ability module's card, which
// rolls it and applies it with PF2e's resistances. What else the text says is a note. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";

import { readReductions } from "./reduce.js";

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
        // (Bleed is always persistent, as PF2e has it — Exsanguinate's share of it too, src/compiler/drain.js.)
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
// (Or a penalty it takes: North Wind's Night Verse's "The target takes a –5-foot status penalty to its Speeds for 1 round",
// src/compiler/item-data.js.)
const ONE_IS = /^(?:The|That) (?:(?:attacking|triggering|struck|damaged|affected) )?(?:creature|target|attacker|foe|enemy)(?: that [^.]{1,80}?)? (is|becomes|takes)\b\s*(.+)$/i;
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
        // (A penalty it takes only from later hits — Silkspinner's Shield's "Successful shield bash Strikes made with the shield during
        // this time entangle the target … The target takes a –10-foot … penalty": not outright.)
        if (/^takes$/i.test(match[1]) && /\b(?:during this time|Strikes? made with)\b/i.test(body)) continue;
        const row = riderRow(`${/^takes$/i.test(match[1]) ? "takes" : "is"} ${match[2]}`);
        if (!row.effects.length && !row.modifiers.length) continue;
        // (Not its Activate line, nor a sentence with no rule in it: a talisman's has no "Effect" to start from.)
        // (The Strike its user then makes, Gallows Tooth's: PF2e's own, with the creature already off-guard to it — the card's line, plan.then.)
        const then = before ? sentences.find((other) => /^When you activate this talisman, you then make a melee Strike against it\.$/i.test(other)) : null;
        return { effects: row.effects, modifiers: row.modifiers, ...(then ? { then: "Make a melee Strike against it (PF2e's own)" } : {}), notes: sentences.filter((other, at) => at !== index && other !== then && !STATS.test(other) && !/^Activate\b/.test(other) && RULE_WORDS.test(other)) };
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
            ...(conditions.then ? { then: conditions.then } : {}),
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
// (Or an activation's, Numerian Steel Breastplate's "For 1 minute, adjacent creatures that hit you with a melee Strike, as well as creatures
// that touch you or hit you with an unarmed attack, take 1d10 electricity damage per hit" — and Instinct Crown (Dragon)'s until the end of
// its user's rage, its type its instinct dragon's breath, the card's pick.)
const ADJACENT_OR_TOUCH = /\b(?:For (\d+) (rounds?|minutes?)|Until the end of your rage), adjacent creatures that hit you with a melee (?:Strike|attack), as well as creatures that touch you or hit you with an unarmed attack, take (\d+d\d+(?:\s*\+\s*\d+)?) (?:(acid|cold|electricity|fire|poison|sonic|force|mental|spirit|vitality|void) )?damage (?:per hit|each time they do)\b/i;
const BREATH_TYPES = ["acid", "cold", "electricity", "fire", "poison", "sonic", "mental", "spirit", "void"];
function adjacentOrTouchPlan(text, base) {
    const match = ADJACENT_OR_TOUCH.exec(String(text ?? ""));
    if (!match) return null;
    const [, count, unit, dice, type] = match;
    const breath = !type && /\bThe damage type is that of your instinct's dragon breath\b/i.test(String(text ?? ""));
    if (!type && !breath) return null;
    const formula = dice.replace(/\s+/g, "");
    const success = { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] };
    const none = { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] };
    const rounds = count ? Number(count) * ROUNDS[unit.toLowerCase()] : 10;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: breath ? "guided" : "automatic" },
        targeting: { target: "the creature that touches you", range: null, area: null },
        trigger: { event: "use" },
        // (Until the end of its user's rage: the card closes when its Rage Effect goes, scripts/live.js — 2026-10-25, no longer a note.)
        retaliation: { adjacentMelee: true, rounds, ...(!count ? { untilRage: true } : {}) },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${formula}[${type ? type.toLowerCase() : BREATH_TYPES[0]}]`, type: type ? type.toLowerCase() : BREATH_TYPES[0], category: null }] }, outcomes: { criticalSuccess: { ...none }, success, failure: { ...none }, criticalFailure: { ...none } } },
        ...(breath ? { damageChoices: BREATH_TYPES.map((kind) => ({ label: kind.charAt(0).toUpperCase() + kind.slice(1), formula: `${formula}[${kind}]` })) } : {})
    };
}

// A retaliation beside an activation's own result, Thunder Mail's Call Down Lightning: its 6d6 electricity to the creatures around its user,
// then "Additionally, for the next minute, whenever a creature touches you or hits you with a melee unarmed attack or a non-reach melee
// weapon attack, it takes 1d8 electricity damage" — said as Numerian Steel Breastplate's is (a non-reach melee weapon's hit comes from an
// adjacent creature): its retaliation plan, the later card posted beside the activation's (plan.alsoRetaliation, scripts/live.js).
const RETALIATES_TOO = /^Additionally, for the next (minute|(\d+) (?:rounds|minutes)), whenever a creature touches you or hits you with a melee unarmed attack or a non-reach melee weapon attack, it takes (\d+d\d+(?:\s*\+\s*\d+)?) (acid|cold|electricity|fire|poison|sonic|force|mental|spirit|vitality|void) damage\.$/i;
export function retaliationBeside(sentence, base) {
    const match = RETALIATES_TOO.exec(String(sentence ?? "").trim());
    if (!match) return null;
    const [, time, count, dice, type] = match;
    const span = time.toLowerCase() === "minute" ? "For 1 minute" : `For ${count} ${/rounds/i.test(time) ? "rounds" : "minutes"}`;
    return adjacentOrTouchPlan(`${span}, adjacent creatures that hit you with a melee Strike, as well as creatures that touch you or hit you with an unarmed attack, take ${dice} ${type} damage per hit.`, base);
}

export function retaliationPlan(text, base) {
    const adjacent = adjacentOrTouchPlan(text, base);
    if (adjacent) return adjacent;
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

// A partial plan without the notes that only say again the damage it deals: Clear Cutter's Axe's "The clear cutter's axe deals an additional
// 1d10 persistent fire damage to the plant" beside that very damage, its row's "by hand" line too — and no longer partial when that was
// all it left. Only a sentence that says nothing else: its dice and type the plan's own. Pure.
// (A sentence of two such clauses too, the other a condition the plan lowers: Grim Ring's "Reduce the value of the drained condition you gain
// by 1, and the undead that caused the condition takes 2d6 vitality damage".)
// (reduce: the conditions it lowers, when they aren't on the plan's item yet — an activation's, src/compiler/permanent.js.)
export function withoutDamageRestated(plan, { reduce = null } = {}) {
    const components = plan?.partial ? plan.resolution?.sharedDamage?.components ?? [] : [];
    if (!components.length) return plan;
    const lowered = (clause) => {
        const read = readReductions(clause);
        return read.length > 0 && read.every((entry) => (reduce ?? plan.item?.reduce ?? []).some((own) => JSON.stringify(own) === JSON.stringify(entry)));
    };
    const said = (entry) => {
        const sentence = String(typeof entry === "string" ? entry : entry?.text ?? "").replace(/^\{target\}:\s*/, "").replace(/\s*\(by hand\)\.?$/, "").trim();
        const clauses = sentence.split(/,\s+and\s+/);
        if (clauses.length === 2 && lowered(`${clauses[0]}.`)) return damageSaid(`${clauses[1].charAt(0).toUpperCase()}${clauses[1].slice(1)}`, components);
        return damageSaid(sentence, components);
    };

    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !said(entry)) : list);
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: kept(row.manualInstructions) } : row]));
    const next = { ...plan, ...(plan.notes ? { notes: kept(plan.notes) } : {}), ...(plan.unread ? { unread: kept(plan.unread) } : {}), resolution: { ...plan.resolution, outcomes } };
    if (JSON.stringify(next) === JSON.stringify(plan)) return plan;
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    if (Array.isArray(next.notes) && !next.notes.length) delete next.notes;
    if (Array.isArray(next.unread) && !next.unread.length) delete next.unread;
    if (!left.length) {
        delete next.partial;
        if (next.automation?.level === "guided") next.automation = { ...next.automation, level: "automatic" };
    }
    return next;
}

// Whether the sentence only deals the damage of one of the components: its subject before it at most ("The clear cutter's axe"), nothing after.
function damageSaid(sentence, components) {
    const match = TAKES.exec(sentence) ?? DEALS_TO.exec(sentence);
    if (!match) return false;
    const before = sentence.slice(0, match.index).trim();
    const after = sentence.slice(match.index + match[0].length).trim();
    if (!(before === "" || /^(?:The|Your) [\w' -]+$/i.test(before)) || !/^\.?$/.test(after)) return false;
    const [, dice, persistent, type] = match;
    return components.some((component) => String(component.formula).replace(/\s+/g, "") === dice.replace(/\s+/g, "") && (component.type ?? null) === (type ? type.toLowerCase() : null) && (component.category === "persistent") === Boolean(persistent));
}

// Retaliation while what the item gives lasts, for creatures of one trait only (2026-10-20; a third-party salve's resistance, and its damage
// for an ooze that hits the creature with an unarmed Strike): plan.item.retaliate, the plan of a "later" attack card kept open for that time
// (scripts/live.js posts it after the item card's Apply, for the creature it gave the resistance to), its retaliation's who and only.
const OOZE_HIT = /^If a creature with the (\w+) trait [^.]*?\bStrikes you with an unarmed attack\b[^.]*?\bit takes (\d+(?:d\d+)?)(?: (\w+) damage)?\.$/i;
const UNTYPED_SAID = /^This damage is untyped and [^.]*?\bresisted\.$/i;
export function withRetaliateAfter(plan, base) {
    const notes = [...(plan?.notes ?? []), ...(plan?.unread ?? [])];
    const found = notes.map((note) => [note, OOZE_HIT.exec(String(note).trim())]).find(([, match]) => match);
    const lasts = (plan?.item?.resist ?? []).find((entry) => entry.duration?.mode === "fixed")?.duration;
    if (!found || !lasts) return plan;
    const [said, match] = found;
    const type = (match[3] ?? "untyped").toLowerCase();
    const damage = directDamagePlan(`The attacking creature takes ${match[2]} ${type} damage.`, { ...base, activation: base?.activation ?? null });
    if (!damage) return plan;
    const rounds = Number(lasts.value) * ({ rounds: 1, minutes: 10, hours: 600 }[lasts.unit] ?? 10);
    const trait = match[1].toLowerCase();
    const retaliate = { ...damage, targeting: { target: "the creature that hits you", range: null, area: null }, retaliation: { rounds, only: { traits: [trait] }, unarmed: true, who: `a creature with the ${trait} trait hits {user} with an unarmed Strike` } };
    const kept = (list) => (list ?? []).filter((note) => note !== said && !UNTYPED_SAID.test(String(note).trim()));
    const left = { notes: kept(plan.notes), unread: kept(plan.unread) };
    const { partial, notes: _notes, unread: _unread, ...rest } = plan;
    const done = !left.notes.length && !left.unread.length;
    return { ...rest, ...(left.notes.length ? { notes: left.notes } : {}), ...(left.unread.length ? { unread: left.unread } : {}), ...(done ? { automation: { ...(plan.automation ?? {}), level: "automatic" } } : { partial: true }), item: { ...plan.item, retaliate } };
}
