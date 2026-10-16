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

// The text → { modifier, rank, conditions, traits, afflictions, pick: "each" | "one" | "highest", reduce?, notes } or null.
export function readCounteract(html, { level = 0 } = {}) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    // (The sentence that counteracts, and the next one, where the rank or modifier is often given.)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(])/);
    const at = sentences.findIndex((sentence) => /\b(?:attempts? (?:a counteract check|to counteract)|to counteract ailments|the salve attempts to counteract)\b|\bcounteract modifier is \+\d+/i.test(sentence));
    if (at < 0) return null;
    const said = sentences.slice(at, at + 3).join(" ");
    // (Aimed at the drinker: "on you", "affecting you", "afflicting you", "within yourself", or a creature the salve is applied to.)
    if (!/\b(?:on you|affecting you|afflicting you|within yourself|of your choice|counteract (?:the|its) (?:paralysis|petrification)|the effect causing your condition)\b/i.test(said) && !/\bApplying this [\w ]+ to a creature\b|\bWhen you (?:consume|drink|eat)\b[^.]*\bcounteract\b/i.test(text)) return null;
    if (/\bcan't be counteracted\b|\bwithin \d+ feet\b|\bthe triggering spell\b/i.test(said)) return null;
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
    // (What it counteracts: in the sentences that say counteract — Fu Water names them in the one after "to counteract
    // ailments within yourself".)
    // (Bracers of Pain's "the effect causing your condition": the conditions its Trigger names, "You gain an effect that makes you
    // Immobilized, Slowed, Stupefied, or Paralyzed".)
    const trigger = /\bthe effect causing your condition\b/i.test(said) ? /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "" : "";
    const counteractSentence = `${sentences.slice(Math.max(0, at - 1), at + 3).filter((sentence) => /\bcounteract|\bremoving\b/i.test(sentence)).join(" ")} ${trigger}`.trim();
    const words = counteractSentence.toLowerCase();
    const conditions = [...new Set([...CONDITIONS.filter((slug) => new RegExp(String.raw`\b${slug}\b`).test(words)), ...Object.entries(CONDITION_WORDS).filter(([word]) => words.includes(word)).map(([, slug]) => slug)])];
    const traits = [...new Set([...[...counteractSentence.matchAll(/\bthe (\w+) trait\b/gi)].map((match) => match[1].toLowerCase()), ...[...counteractSentence.matchAll(/\b(emotion|mental|transmutation|fear) effects?\b/gi)].map((match) => match[1].toLowerCase())])];
    const afflictions = ["curse", "disease", "poison"].filter((kind) => new RegExp(String.raw`\b${kind}s?\b`, "i").test(counteractSentence));
    if (!conditions.length && !traits.length && !afflictions.length) return null;
    const pick = /\bhighest[- ]level\b/i.test(counteractSentence) ? "highest" : /\b(?:each|all|every)\b/i.test(counteractSentence) && !/\bone (?:effect|condition)\b/i.test(counteractSentence) ? "each" : "one";
    // (Moon Radish Soup: "if successful, it reduces the value of your stupefied condition by 1 (or by 2 on a critical success)".)
    const reduce = /\breduces the value of your \w+ condition by (\d+)(?: \(or by (\d+) on a critical success\))?/i.exec(said);
    const notes = sentences.slice(at + 1, at + 4).filter((sentence) => /\b(?:doesn't happen until|temporarily immune|You're then|hostile|negative)\b/i.test(sentence));
    return { modifier, rank, conditions, traits, afflictions, pick, ...(reduce ? { reduce: { success: Number(reduce[1]), criticalSuccess: Number(reduce[2] ?? reduce[1]) } } : {}), ...(notes.length ? { notes } : {}) };
}
