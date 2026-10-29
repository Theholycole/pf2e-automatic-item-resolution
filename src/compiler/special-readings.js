// Unique items' and artifacts' own rules (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"): the
// readers each of their activations needed, one wrapper on the activations' chain (src/compiler/permanent.js specialOf) — last, over what
// the readers before left. What's left over then that's only lore (src/compiler/lore-lines.js) is decided again. Pure.

import { withHostileEnds } from "./hostile-ends.js";
import { withSpecialSentences } from "./special-sentences.js";

// The plan, and its activation's { name (its source name), html, text (plain), words (its effect's), base, info, frequency, item } → the plan with
// its item's own rules, or the same plan.
export function withSpecialReadings(plan, { name, html, text, words, base, info, frequency, item, options }) {
    let next = withSpecialSentences(plan, { name, words, html, base, info, frequency, item, options });
    next = withHostileEnds(next, text, name);
    next = withoutNextTier(next, name);
    // (Slithermaw's Bane's Terrain Adaptation: src/compiler/artifact-readings.js's, as its Heroic grade's — 2026-10-28, one mechanism for both.)
    // (Mindsponge's Wipe Memories refused while it's full — "Once full, it cannot be activated at all, other than to squeeze it", its Absorb
    // Memories' four: item.storeFull, scripts/activations.js.)
    if (name === "Mindsponge: Wipe Memories" && next?.item && !next.item.storeFull) next = { ...next, item: { ...next.item, storeFull: 4 } };
    next = withVisionKills(next, name);
    return next;
}

// (Vision of Meloth's "If the target is reduced to 0 HP by this effect, the vision becomes reality and kills the target instantly": the save's
// death once its damage leaves it at 0, the core's postDamageTerminal; what onlookers see, and the sword's whim, its card's lines.)
const KILLS = /^If the target is reduced to 0 HP by this effect, the vision becomes reality and kills the target instantly\.$/;
function withVisionKills(plan, name) {
    if (name !== "Meloth's Lifedrinker (Level 7): Vision of Meloth" || plan?.resolution?.kind !== "save" || !(plan.notes ?? []).some((note) => KILLS.test(String(note)))) return plan;
    const notes = plan.notes.filter((note) => !KILLS.test(String(note)));
    return { ...plan, resolution: { ...plan.resolution, postDamageTerminal: { kind: "death", threshold: 0 } }, notes: notes.length ? notes : undefined };
}

// (Briar's casts, whose blocks run on into the next Sharpness Point tier's words, "8 Sharpness Points Briar becomes a +4 major striking …":
// that tier's runes and statistics are the item's own, not this cast's, and its "Briar casts … on its partner" the cast itself — not its card's
// lines.)
const TIER = /^(?:Briar casts (?:an? )?(?:\d+(?:st|nd|rd|th)-rank )?[\w' ]+ on its partner\.\s*)?\d+ Sharpness Points Briar becomes\b|^Its statistics improve as follows\./;
function withoutNextTier(plan, name) {
    if (name !== "Briar" || plan?.builtin !== "cast-spell" || !(plan.notes ?? []).some((note) => TIER.test(String(note)))) return plan;
    const notes = plan.notes.filter((note) => !TIER.test(String(note)));
    return { ...plan, notes: notes.length ? notes : undefined };
}
