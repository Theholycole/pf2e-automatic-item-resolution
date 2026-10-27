// Unique items' and artifacts' own rules (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"): the
// readers each of their activations needed, one wrapper on the activations' chain (src/compiler/permanent.js specialOf) — last, over what
// the readers before left. What's left over then that's only lore (src/compiler/lore-lines.js) is decided again. Pure.

import { withHostileEnds } from "./hostile-ends.js";
import { withSpecialSentences } from "./special-sentences.js";

// The plan, and its activation's { name (its source name), html, text (plain), words (its effect's), base, info, frequency, item } → the plan with
// its item's own rules, or the same plan.
export function withSpecialReadings(plan, { name, html, text, words, base, info, frequency, item }) {
    let next = withSpecialSentences(plan, { name, words, html, base, info, frequency, item });
    next = withHostileEnds(next, text, name);
    next = withoutNextTier(next, name);
    return next;
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
