// Creatures made or controlled, lasting and repeating effects, and choices on the card: the readings of the 2026-10-28 batch's creatures group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.
// (2026-10-28, docs/needs.md: the installed modules' items of this group — the "+" modules' and Battlezoo's. Their words aren't kept here:
// each reading names its item and says its rule in our own words; its patterns match the item's sentences in short pieces. Each item's
// sentences are read whole, every one of them one of its reading's — none dropped —, into what its card plays: a conjured creature (the
// ability module's conjure card), a note Effect for a rule PF2e can't play (the user's ruling of 2026-10-25), an Effect of PF2e's rules on
// the creature it's for (item.ruleEffects, until its next daily preparations where the text says so: scripts/until-rest.js), a ways card
// for a pick, and the card's lines for its user's own actions, the map and what's out of combat.)

import { CREATURE_READINGS, plainWords } from "./creatures-group.js";

const sentencesOf = (words) => plainWords(words).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const named = (reading, name) => (reading.name instanceof RegExp ? reading.name.test(String(name ?? "")) : reading.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null. (Its last ones may be missing where the reading says so,
// optional — a lower grade's words without the higher's extra rule: null for each.)
function matched(reading, sentences) {
    const missing = reading.sentences.length - sentences.length;
    if (missing < 0 || missing > (reading.optional ?? 0)) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? [...found, ...Array(missing).fill(null)] : null;
}

export function withCreaturesGroup(plan, context) {
    const readings = CREATURE_READINGS.filter((reading) => named(reading, context?.name) && (!reading.kind || reading.kind === context.kind));
    if (!readings.length) return plan;
    for (const reading of readings) {
        // (A table read before, each of its rows by its number — Rumbustious Robes' Pocket Full of Chaos: the rows' own plans.)
        if (reading.rows) {
            const rows = plan?.builtin === "table" ? plan.table?.rows ?? [] : [];
            const found = Object.fromEntries(Object.entries(reading.rows).map(([low, pattern]) => [low, pattern.exec(plainWords(rows.find((row) => row.low === Number(low))?.text))]));
            const card = rows.length && Object.values(found).every(Boolean) ? reading.card(found, plan, context) : null;
            if (card) return card;
            continue;
        }
        // (Its effect's words, or for an activation with no Effect heading its whole text: a vial's or a furnace's.)
        const words = reading.whole ? context.text : context.words ?? context.text;
        const found = matched(reading, sentencesOf(words));
        const card = found ? reading.card(found, plan, context) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept and those changed: undefined ones gone.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        return {
            ...context.base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(context.frequency ? { frequency: context.frequency } : {}) },
            ...rest,
            item: { ...context.info, ...(own ?? {}) }
        };
    }
    return plan;
}
