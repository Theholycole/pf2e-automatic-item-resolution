// A hit that compels its creature's next action (2026-10-27, docs/needs.md "Changes to a Strike"): Mindlock Shot's "When you command this
// ammunition, you pick a Stride or Strike. If you hit a creature with the ammunition, it falls under a mental effect that makes it use its first
// action on its next turn to take the action you picked. It chooses exactly how to use that action, and if you choose Stride, the target can
// Step if doing so is beneficial for it. On a critical hit, the target must use its next 2 actions to do as you chose, within the same
// parameters." The ways card's pick of the action (its user's, when commanding it), each way the ammunition's next ranged Strike (the Strike
// card, scripts/strikes.js) whose hit puts a note Effect on the creature hit until the end of its next turn — the user's rule for a creature's
// compelled behaviour, a note Effect on it — one action on a hit, two on a critical hit. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const COMPELLED = /\bWhen you command this ammunition, you pick an? (\w+) or (\w+)\. If you hit a creature with the ammunition, it falls under a mental effect that makes it use its first action on its next turn to take the action you picked\. It chooses exactly how to use that action, and if you choose (\w+), the target can (\w+) if doing so is beneficial for it\. On a critical hit, the target must use its next (\d|two|three) actions to do as you chose, within the same parameters\./i;
const NUMBER = { two: 2, three: 3 };
const NEXT_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

export function compelledHitWays(html, base) {
    const found = COMPELLED.exec(plainText(html));
    if (!found) return null;
    const [, first, second, swapped, instead, more] = found;
    const count = NUMBER[more.toLowerCase()] ?? Number(more);
    const way = (action) => {
        const step = action.toLowerCase() === swapped.toLowerCase() ? ` (or ${instead} instead, if that serves it better)` : "";
        const label = `Mindlocked (${action})`;
        const hit = { label, text: `It must use its first action on its next turn to ${action}${step}; it chooses how.`, duration: NEXT_TURN };
        const critical = { label, text: `It must use its next ${count} actions to ${action}${step}; it chooses how.`, duration: NEXT_TURN };
        return {
            name: action,
            plan: {
                ...base,
                modelVersion: MODEL_VERSION,
                automation: { level: "automatic" },
                targeting: { target: "the creature the Strike hits", range: null, area: null },
                trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
                resolution: {
                    kind: "save",
                    check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
                    outcomes: { criticalSuccess: { ...none(), noteEffects: [critical] }, success: { ...none(), noteEffects: [hit] }, failure: none(), criticalFailure: none() }
                },
                strike: { range: "ranged", save: null, ammo: true, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [] }
            }
        };
    };
    return { ...base, modelVersion: MODEL_VERSION, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways: [way(first), way(second)] };
}
