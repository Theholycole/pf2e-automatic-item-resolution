// A consumable that counteracts what afflicts its drinker (Surging Serum's "attempts to counteract each effect that's
// inflicting the Clumsy or Enfeebled condition on you, using a 2nd-rank counteract and a +8 counteract modifier", Bottled
// Catharsis's emotion effects, Panacea's curses and diseases, Contagion Metabolizer's highest-level poison or disease): what
// the counteract card (src/live/counteract-card.js, the user's answer of 2026-10-15) lists on the drinker and rolls. Not
// one aimed elsewhere (a spell within 30 feet, the triggering spell, ice, adhesives), nor one that "can't be counteracted".
// Pure.

import { plainText } from "./rows.js";

const CONDITIONS = ["blinded", "clumsy", "confused", "controlled", "dazzled", "deafened", "doomed", "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened", "grabbed", "immobilized", "paralyzed", "petrified", "restrained", "sickened", "slowed", "stunned", "stupefied"];
const CONDITION_WORDS = { paralysis: "paralyzed", petrification: "petrified" };
const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)?`;
const FREE = /\bcounteract (the triggering spell|the triggering illusion|the fire|the effect or item|the spell|the darkness|that effect|the effect(?= with a counteract modifier))\b|\bto end (a magical darkness effect)\b/i;

// The text → { modifier, rank, conditions, traits, afflictions, pick: "each" | "one" | "highest", reduce?, notes } or null.
export function readCounteract(html, { level = 0 } = {}) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    // (The sentence that counteracts, and the next one, where the rank or modifier is often given.)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(])/);
    const at = sentences.findIndex((sentence) => /\b(?:attempts? (?:a counteract check|to counteract)|to counteract ailments|the salve attempts to counteract)\b|\bcounteract modifier (?:is|of) \+\d+/i.test(sentence));
    if (at < 0) return null;
    const said = sentences.slice(at, at + 3).join(" ");
    // (Or a spell on a creature nearby, Etheric Essence Disruptor's "attempt to counteract an active divine or occult spell within 30
    // feet, with a +7 counteract modifier and a counteract rank of 2": a spell's Effect on a creature within that distance, its
    // tradition the GM's to check.)
    const near = /\battempt to counteract an active ((?:arcane|divine|occult|primal)(?: or (?:arcane|divine|occult|primal))?) spell within (\d+) feet\b/i.exec(said);
    // (Or conditions on an adjacent creature, Violet Ray's "You apply the violet ray to an adjacent creature and attempt to counteract the
    // Blinded, Clumsy, … condition with a counteract rank of 6 and a counteract modifier of +22": the creatures beside its user.)
    const adjacent = /\bto an adjacent creature and attempt to counteract\b/i.test(said);
    // (A list of conditions to pick from, The Teamster's "Select one of the following conditions currently affecting you: Blinded, …".)
    const listed = /\bSelect one of the following conditions currently affecting you: ([^.]+)\./i.exec(text)?.[1] ?? "";
    // (Or what it's aimed at that isn't on a creature: Antimagic Armor's "attempts to counteract the triggering spell", Frost Brand's "the blade
    // attempts to counteract the fire", Cloth of Nullification's "attempt to counteract the effect or item", Reflecting Shield's "the spell",
    // Brilliant's "to end a magical darkness effect": the card's one row for it, its DC and rank the GM's, and the GM's to end once
    // counteracted. Its own rank when the text says it's a stored spell's: the GM's too.)
    const free = FREE.exec(said);
    if (free && !/\bcan't be counteracted\b/i.test(said)) {
        const modifierOf = /\+(\d+) counteract modifier\b|\bcounteract (?:check )?modifier (?:of |is )?\+(\d+)|\bcounteract (?:check )?modifier (?:of |is )?1d20\s*\+\s*(\d+)/i.exec(said);
        if (!modifierOf) return null;
        const stated = new RegExp(String.raw`\bcounteract rank (?:of |is )?${ORDINAL}\b|\ban? ${ORDINAL}-rank (?:Dispel Magic|counteract)\b`, "i").exec(said);
        const stored = /\busing the rank of the spell stored in\b/i.test(said);
        const rank = stated ? Number(stated[1] ?? stated[2]) : stored ? null : Math.max(1, Math.ceil(Number(level) / 2));
        // (Twilight Lantern's "the effect", a darkness effect it targets; Crimson Tome's "that effect", one restoring the slain to life.)
        const name = { "the triggering spell": "the triggering spell", "the triggering illusion": "the triggering illusion", "the fire": "the magical fire", "the effect or item": "the magical effect or item", "the spell": "the spell", "the darkness": "the magical darkness", "a magical darkness effect": "the magical darkness", "that effect": "the effect", "the effect": /\bdarkness effect\b/i.test(`${sentences[at - 1] ?? ""} ${said}`) ? "the darkness effect" : "the effect" }[(free[1] ?? free[2]).toLowerCase()];
        const after = sentences.slice(at + 1, at + 3).filter((sentence) => /\b(?:If it fails|If the spell is successfully counteracted|Regardless of the result|Once you do|This expends|If you succeed)\b/i.test(sentence));
        return { modifier: Number(modifierOf[1] ?? modifierOf[2] ?? modifierOf[3]), rank, conditions: [], traits: [], afflictions: [], free: { name }, pick: "one", notes: [...(stored ? ["Its counteract rank is the stored spell's: give it on the card."] : []), ...after] };
    }
    // (Aimed at the drinker: "on you", "affecting you", "afflicting you", "within yourself", or a creature the salve is applied to.)
    if (!near && !adjacent && !listed && !/\b(?:on you|affecting you|afflicting you|you are currently suffering|within yourself|of your choice|counteract (?:the|its) (?:paralysis|petrification)|the effect causing your condition)\b/i.test(said) && !/\bApplying this [\w ]+ to a creature\b|\bWhen you (?:consume|drink|eat)\b[^.]*\bcounteract\b/i.test(text)) return null;
    if (/\bcan't be counteracted\b|\bthe triggering spell\b/i.test(said) || (!near && /\bwithin \d+ feet\b/i.test(said))) return null;
    const modifier = Number(
        /\+(\d+) counteract modifier\b/i.exec(said)?.[1]
        ?? /\bcounteract (?:check )?modifier (?:of |is )?\+(\d+)/i.exec(said)?.[1]
        // (Skarja's Heartstone's "counteract modifier 1d20+23".)
        ?? /\bcounteract (?:check )?modifier (?:of |is )?1d20\s*\+\s*(\d+)/i.exec(said)?.[1]
        ?? /\(counteract \+(\d+)\)/i.exec(said)?.[1]
        ?? /\b(?:a|with a) \+(\d+) modifier\b/i.exec(said)?.[1]
        ?? /\b(?:a )?1d20\s*\+\s*(\d+) modifier\b/i.exec(said)?.[1]
        ?? NaN
    );
    if (!Number.isFinite(modifier)) return null;
    const stated = new RegExp(String.raw`\b${ORDINAL}-rank counteract\b|\bat ${ORDINAL}-rank\b|\bcounteract (?:rank|level) (?:of |is )?${ORDINAL}\b`, "i").exec(said);
    // (No rank stated: an item's is half its level, rounded up.)
    const rank = stated ? Number(stated[1] ?? stated[2] ?? stated[3]) : Math.max(1, Math.ceil(Number(level) / 2));
    if (near) return { modifier, rank, conditions: [], traits: [], afflictions: [], spells: true, within: Number(near[2]), pick: "one", notes: [`Only an active ${near[1]} spell: tick one that is.`] };
    // (What it counteracts: in the sentences that say counteract — Fu Water names them in the one after "to counteract
    // ailments within yourself".)
    // (Bracers of Pain's "the effect causing your condition": the conditions its Trigger names, "You gain an effect that makes you
    // Immobilized, Slowed, Stupefied, or Paralyzed".)
    const trigger = /\bthe effect causing your condition\b/i.test(said) ? /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "" : "";
    const counteractSentence = `${sentences.slice(Math.max(0, at - 1), at + 3).filter((sentence) => /\bcounteract|\bremoving\b/i.test(sentence)).join(" ")} ${trigger}`.trim();
    const words = `${counteractSentence} ${listed}`.toLowerCase();
    const conditions = [...new Set([...CONDITIONS.filter((slug) => new RegExp(String.raw`\b${slug}\b`).test(words)), ...Object.entries(CONDITION_WORDS).filter(([word]) => words.includes(word)).map(([, slug]) => slug)])];
    const traits = [...new Set([...[...counteractSentence.matchAll(/\bthe (\w+) trait\b/gi)].map((match) => match[1].toLowerCase()), ...[...counteractSentence.matchAll(/\b(emotion|mental|transmutation|fear) effects?\b/gi)].map((match) => match[1].toLowerCase())])];
    // (Or "any one affliction", Golden Gloves': each kind.)
    const afflictions = /\bany one affliction\b/i.test(counteractSentence) ? ["curse", "disease", "poison"] : ["curse", "disease", "poison"].filter((kind) => new RegExp(String.raw`\b${kind}s?\b`, "i").test(counteractSentence));
    if (!conditions.length && !traits.length && !afflictions.length) return null;
    const singled = /\b(?:one|a single) (?:effect|condition)\b/i.test(`${counteractSentence} ${sentences.slice(at, at + 4).join(" ")}`) || Boolean(listed);
    const pick = /\bhighest[- ]level\b/i.test(counteractSentence) ? "highest" : /\b(?:each|all|every)\b/i.test(counteractSentence) && !singled ? "each" : "one";
    // (Moon Radish Soup: "if successful, it reduces the value of your stupefied condition by 1 (or by 2 on a critical success)".)
    const reduce = /\breduces the value of your \w+ condition by (\d+)(?: \(or by (\d+) on a critical success\))?/i.exec(said);
    const notes = [
        ...sentences.slice(at + 1, at + 4).filter((sentence) => /\b(?:doesn't happen until|temporarily immune|You're then|hostile|negative|the condition returns|levels lower)\b/i.test(sentence)),
        // (The Teamster's "If the source of the condition is more than 4 levels lower than your current level, The Teamster automatically
        // counters the condition", before the counteract.)
        ...sentences.slice(Math.max(0, at - 1), at).filter((sentence) => /\bautomatically counters?\b/i.test(sentence)),
        ...(/\busing the source of the condition to determine\b/i.test(said) ? ["Its DC and rank are those of what caused the condition."] : [])
    ];
    return { modifier, rank, conditions, traits, afflictions, pick, ...(adjacent ? { within: 5 } : {}), ...(reduce ? { reduce: { success: Number(reduce[1]), criticalSuccess: Number(reduce[2] ?? reduce[1]) } } : {}), ...(notes.length ? { notes } : {}) };
}
