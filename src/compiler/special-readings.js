// Unique items' and artifacts' own rules (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"): the
// readers each of their activations needed, one wrapper on the activations' chain (src/compiler/permanent.js specialOf) — last, over what
// the readers before left. What's left over then that's only lore (src/compiler/lore-lines.js) is decided again. Pure.

import { withHostileEnds } from "./hostile-ends.js";

// The plan, and its activation's { name (its source name), html, text (plain) } → the plan with its item's own rules, or the same plan.
export function withSpecialReadings(plan, { name, html, text }) {
    let next = plan;
    next = withHostileEnds(next, text, name);
    return next;
}
