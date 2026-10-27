// Places traded after a failed save (2026-10-27, src/compiler/relic-readings.js plan.swap: Planar Ribbon's), its pure part: the card of
// Off-Guard at the creature's allies — to its user alone, until the end of its user's turn, the core's scope { against: "actor" } as Boots
// of the Dead's (src/compiler/off-guard-next.js). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

export function swapOffGuardPlan(name) {
    const effect = { kind: "condition", slug: "off-guard", value: null, duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, scope: { against: "actor", attacks: "any" } };
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${name}: Off-Guard to its user` },
        automation: { level: "automatic" },
        targeting: { target: "the creature's allies", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), effects: [effect] }, failure: none(), criticalFailure: none() } }
    };
}
