// Its wearer's shields repaired at each turn's start (2026-10-27, docs/needs.md; a unique item's or an artifact's passive rule, built as its
// activations are): Forgefather's Seal's "While wearing armor etched with a Forgefather's seal … any shield you wield automatically recovers 10
// Hit Points at the start of your turn each round." PF2e has no rule for a shield's Hit Points coming back, so this reads the sentence off the
// item's text — { hp } — and scripts/shield-repair.js repairs its wearer's held shields by that much at each of its turns' start, while it wears
// armor and its Seal of Mending hasn't stopped it till its next daily preparations (src/compiler/unique-rules.js withMended's objects.pauses).
// Pure.

import { plainText } from "./rows.js";

// (Its rule while worn, the seal's either form's: src/compiler/worn-rune.js too.)
export const WORN = /\bWhile wearing armor etched with an? [\w' -]+?\s*, you gain\b/i;
const REPAIRS = /\bIn addition, any shield you wield automatically recovers (\d+) Hit Points at the start of your turn each round\./i;

// The item's text (html or plain) → { hp } or null.
export function readShieldRepair(text) {
    const plain = plainText(text);
    const said = WORN.test(plain) ? REPAIRS.exec(plain) : null;
    return said ? { hp: Number(said[1]) } : null;
}

// Its wearer's held shields ({ id, name, hp: { value, max } }) and the repair → [{ id, name, from, to, max }]: each damaged one, not one
// destroyed (none of it left to wield), up to its maximum.
export function shieldRepairs(shields, repair) {
    return (shields ?? []).filter((shield) => Number(shield?.hp?.max) > 0 && Number(shield.hp.value) > 0 && Number(shield.hp.value) < Number(shield.hp.max))
        .map((shield) => ({ id: shield.id, name: shield.name, from: Number(shield.hp.value), to: Math.min(Number(shield.hp.max), Number(shield.hp.value) + repair.hp), max: Number(shield.hp.max) }));
}
