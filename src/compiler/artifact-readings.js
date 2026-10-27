// Unique items' and artifacts' activations built whole (2026-10-27, docs/needs.md; the user, the same day: "unique effects that are on unique
// rarity items should be automated … They are special and should feel special to players"): an activation read sentence by sentence, every
// sentence of its effect one of the reading's own — none dropped —, into what its card plays: every number, condition, duration, save, area
// and choice its text gives. Each reading names the mechanism it feeds (its own file and live script when it's a new one); its item's history,
// look and destruction are src/compiler/lore-lines.js's. Pure.

import { sentencesOf } from "./lasting.js";
import { spherePlanOf } from "./sphere.js";

// Each reading: the source names it's for (an activation's "Item: Activation"), whether it reads over the plan read before (by default only
// none, note-only, or the GM's no-effect), its Requirements line's pattern when it has one, a pattern for each of its effect's sentences —
// every sentence must be one, in order — and the card they make (from its matches, the plan before and { html, item, requirements, trigger }).
const READINGS = [
    {
        // Sphere of Annihilation: its control a check each round, the sphere moved toward a failed controller or where a successful one directs
        // it, whatever it touches destroyed (src/compiler/sphere.js, the item module's sphere card).
        names: ["Sphere of Annihilation"],
        requirements: /^You are within (\d+) feet of the sphere$/,
        sentences: [
            /^You attempt a @Check\[(arcana)\|dc:(\d+)\|[^\]]*\] or @Check\[(occultism)\|dc:\2\|[^\]]*\] check to take control of the sphere\.$/,
            /^If someone else already controls the sphere, this check uses their Will DC if higher\.$/,
            /^If you succeed, you take control of the sphere\.$/,
            /^If you fail, the sphere moves (\d+) feet closer to you \(or (\d+) feet on a critical failure\)\.$/,
            /^You keep control as long as you remain within (\d+) feet of the sphere and Sustain the Activation each round\.$/,
            /^When you Sustain the Activation, you must attempt a @Check\[(arcana)\|dc:(\d+)\|[^\]]*\] or @Check\[(occultism)\|dc:\2\|[^\]]*\] check\.$/,
            /^If you succeed, you direct the sphere to move up to (\d+) feet in a straight line \(or up to (\d+) feet on a critical success\)\.$/,
            /^On a failure, you lose control of the sphere, and it moves (\d+) feet closer to you in a straight line \(or (\d+) feet on a critical failure\)\.$/
        ],
        card: (found, _plan, { requirements, item }) => spherePlanOf(found, requirements, item)
    }
];

const named = (reading, name) => reading.names.includes(name);
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// Whether a source name has a reading here.
export const hasArtifactReading = (name) => READINGS.some((reading) => named(reading, name));

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (src/compiler/lasting.js activationBase); requirements, trigger: its activation's
// lines; item: its item's whole text, plain.
export function withArtifactReading(plan, { name, words, requirements = null, trigger = null, html = "", item = "", base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const asked = reading.requirements ? reading.requirements.exec(String(requirements ?? "").trim()) : null;
        if (reading.requirements && !asked) continue;
        if (reading.trigger && !reading.trigger.test(String(trigger ?? "").trim())) continue;
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, item, requirements: asked, trigger, base, info }) : null;
        if (!card) continue;
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(own ?? {}) }
        };
    }
    return plan;
}
