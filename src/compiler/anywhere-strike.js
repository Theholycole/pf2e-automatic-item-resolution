// A Strike at a creature beyond its weapon's reach or range, free of penalties (2026-10-27, docs/needs.md "Changes to a Strike"): the Impossible
// rune's "You and the weapon flash to a perfect attacking position, then return to where you started. Make a Strike with the etched weapon
// against one creature you can see, even if the target is beyond the weapon's reach or range. On this Strike, ignore any circumstance penalty,
// status penalty, and range increment penalty." The Strike card (scripts/strikes.js): PF2e's own "ignore-range-penalty" roll option on it;
// its target out of reach or range its user's to pick (PF2e rolls a Strike at any creature targeted), and the circumstance and status
// penalties its user unticks in PF2e's roll dialog (PF2e has no rule that drops a kind of penalty) — the card's lines. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const ANYWHERE = /^(?:You and the weapon flash to a perfect attacking position, then return to where you started\. )?Make a Strike with the etched weapon against one creature you can see, even if the target is beyond the weapon's reach or range\. On this Strike, ignore any circumstance penalty, status penalty, and range increment penalty\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

export function anywhereStrikePlan(html, base) {
    const words = plainText(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
    if (!ANYWHERE.test(words)) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: {
            range: null, save: null, own: false, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [],
            options: ["ignore-range-penalty"],
            lines: ["With the etched weapon, at one creature you can see even beyond its reach or range (you flash to a perfect attacking position and back)", "Untick any circumstance or status penalty in PF2e's roll dialog: this Strike ignores them"]
        }
    };
}
