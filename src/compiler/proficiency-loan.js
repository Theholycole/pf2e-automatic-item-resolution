// A weapon its user is as good with as with their best, for a while: Blade Phantom's Guide's "When you apply a blade phantom's guide to
// a weapon … For 1 minute, you treat your proficiency with that weapon as equal to your highest weapon proficiency. This effect cannot
// affect a weapon whose level is higher than the blade phantom's guide (11th)." plan.item.proficiency { duration, maxLevel }: the item
// card's weapon picker (the user's weapons up to that level), then an Effect with PF2e's MartialProficiency rule for that weapon at the
// user's highest weapon proficiency rank (scripts/live.js). Pure.

import { durationIn } from "./rows.js";

const TREAT = /\bFor (\d+|one|a|an) (rounds?|minutes?|hours?), you treat your proficiency with that weapon as equal to your highest weapon proficiency\b/i;
const MAX_LEVEL = /\bcannot affect a weapon whose level is higher than the [\w' -]+? \((\d+)(?:st|nd|rd|th)\)/i;

// The text (plain) → { duration, maxLevel } or null.
export function readProficiencyLoan(text) {
    const plain = String(text ?? "");
    const treat = TREAT.exec(plain);
    if (!treat) return null;
    return { duration: durationIn(`for ${treat[1]} ${treat[2]}`, null), maxLevel: Number(MAX_LEVEL.exec(plain)?.[1]) || null };
}
