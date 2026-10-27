// A double that takes what's aimed at its user (2026-10-27, docs/needs.md "creatures"; the user's of the same day: a unique item's or an
// artifact's effects all built): Shadewither Key's Umbral Double, "A creature must succeed at a @Check[flat|dc:11] when targeting you with an
// attack, spell, or other effect; on a failure, they hit the shadowy double instead of you. The effect lasts for 1 minute or until the double is
// hit, whichever comes first. Once the double is hit, it's destroyed. As long as the double exists, you don't gain the Shadewither Key's item
// bonus to Stealth checks." A note Effect on its user for the minute: PF2e's RollOption "air-decoy-double:<dc>" — scripts/decoy-double.js
// rolls the flat check for each attack roll at its user and each save it makes against another's targeted spell, a failure destroying the
// double (the Effect deleted) and that creature's next damage to its user within the minute none — and PF2e's AdjustModifier suppressing the
// item's own Stealth bonus (its modifier's slug, the item's) while it lasts. Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds" };

// The reading's matches (src/compiler/artifact-readings.js) and the item's slug → the card's parts.
export function decoyDoublePlanOf(found, slug) {
    const [, , , check, lasts, , stealth] = found;
    const dc = Number(check[1]);
    return {
        targeting: { target: null, range: null, area: null },
        resolution: {
            kind: "check",
            check: { roll: "automatic" },
            outcomes: {
                success: {
                    ...none(),
                    noteEffects: [{
                        label: "Umbral double",
                        text: `An umbral double shares its space: a creature targeting it with an attack, spell or other effect attempts a DC ${dc} flat check (rolled for it), and on a failure hits the double instead, which is destroyed (this Effect ends). It doesn't get the key's item bonus to Stealth while the double lasts.`,
                        duration: { mode: "fixed", value: Number(lasts[1]), unit: UNITS[lasts[2].toLowerCase()], expiry: "turn-start" },
                        rules: [{ key: "RollOption", domain: "all", option: `air-decoy-double:${dc}` }, ...(stealth && slug ? [{ key: "AdjustModifier", selector: "stealth", slug, suppress: true }] : [])]
                    }]
                }
            }
        }
    };
}
