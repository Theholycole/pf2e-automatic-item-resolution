// An activation that gives its user a Focus Point (about 40 of PF2e's worn items: "You gain 1 Focus Point, which you
// can use only to cast a witch hex spell. If not used by the end of your turn, this Focus Point is lost."; Crimson
// Tome's "regain one Focus Point"): a builtin the item module plays itself (scripts/focus.js), since the core has no
// Focus Point change. Not one that spends the point at once on a spell (Harmonic Hauberk's "and immediately use the
// Focus Point to cast Lingering Composition"), nor one about a point another activation gives. Pure.

import { plainText } from "./rows.js";

const AMOUNTS = { 1: 1, one: 1, a: 1, an: 1, 2: 2, two: 2 };
// (Or a Mythic Point, Whispering Veil's "You gain 1 Mythic Point, which you can spend to attempt the check. If you don't spend this point by the
// end of this turn, it is lost": the same card, the point a Mythic Point — a Hero Point under the world setting, scripts/spend.js.)
const GAIN = /\b(?:you )?(?:gain|regain|recover) (1|one|a|2|two) (Focus|Mythic) Points?\b(?:, which you can (?:use|spend) only (?:to |on )?([^.]+?))?(?=[.;,]|$)/i;
const LOST = /\b(?:if (?:it's |it is )?not used|if you don't spend (?:this|that|the) (?:Focus )?Point)[^.]*\bby the end of (?:your|this|the) turn\b[^.]*\blost\b/i;

// The activation's text (its block) → { amount, only, lost } or null.
export function readFocusGain(html) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const match = GAIN.exec(text);
    if (!match) return null;
    // (Spent at once on a spell, or a point given elsewhere: not a gain to play.)
    if (/\bimmediately (?:use|spend)s? (?:the|that|this) (?:Focus|Mythic) Point\b/i.test(text) || /\bthe Focus Point granted by\b/i.test(text)) return null;
    return { amount: AMOUNTS[match[1].toLowerCase()], only: match[3]?.trim() ?? null, lost: LOST.test(text) ? "turn-end" : null, ...(/^mythic$/i.test(match[2]) ? { resource: "mythic" } : {}) };
}

export function focusPlan(html, base) {
    const focus = readFocusGain(html);
    if (!focus) return null;
    return { ...base, builtin: "focus-point", automation: { level: "automatic" }, targeting: { target: "self", range: null, area: null }, trigger: { event: "use" }, focus };
}
