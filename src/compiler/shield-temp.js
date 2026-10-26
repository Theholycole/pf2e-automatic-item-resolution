// A shield's own temporary Hit Points (2026-10-26, docs/needs.md "Objects and the item itself"): Ablative Shield Plating's "Applying the
// plating grants the shield 10 temporary Hit Points that last for 10 minutes or until lost". Before, its card said there was nothing to play.
// plan.item.shieldTemp { value, lasts }: the card puts an Effect on its user for the shield it plates, and the Hit Points that shield then
// loses come off those first (scripts/shield-temp.js), the Effect gone once they're used up. Pure.

const PLATING = /\bApplying the [\w' -]+? grants the shield (\d+) temporary Hit Points that last for (\d+|one|an?) (minutes?|hours?) or until lost\./i;
const COUNT = { one: 1, a: 1, an: 1 };

// The item's plain text → { value, lasts } or null.
export function readShieldTemp(text) {
    const match = PLATING.exec(String(text ?? ""));
    if (!match) return null;
    return { value: Number(match[1]), lasts: { mode: "fixed", value: COUNT[match[2].toLowerCase()] ?? Number(match[2]), unit: match[3].toLowerCase().replace(/s?$/, "s"), expiry: "turn-start", anchor: "effect-start" } };
}
