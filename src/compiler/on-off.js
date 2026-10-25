// A Speed its user has while the item is on (2026-10-25, docs/needs.md): Steamflight Pack's "When active, the steamflight pack gives the user a
// fly Speed of 20 feet. It carries enough water for 20 minutes of operation" with its "On/Off Switch … You turn the steamflight pack on or
// off" → a plan whose item.speeds has that Speed, toggled (the item's next activation turns it off: scripts/live.js), for its operating time.
// Either activation turns it on. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const WHILE_ACTIVE = /\bWhen active, the [\w' -]+? gives (?:the user|you|its user|its wearer) an? (fly|swim|climb|burrow) Speed of (\d+) feet\./i;
const OPERATION = /\benough [\w ]+? for (\d+) (minutes?|hours?|rounds?) of operation\b/i;
const SWITCH = /\bYou turn the [\w' -]+? on or off\./i;
const UNITS = { minute: "minutes", hour: "hours", round: "rounds" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The activation's html, the item, the plan's base → the plan, or null.
export function onOffPlan(html, item, base) {
    const text = plainText(item?.system?.description?.value ?? "");
    const speed = WHILE_ACTIVE.exec(text);
    if (!speed || !SWITCH.test(text)) return null;
    // (The activation that's its switch, or the item's own activation it describes — not another of its activations.)
    const own = plainText(html ?? "");
    if (!SWITCH.test(own) && !WHILE_ACTIVE.test(own)) return null;
    const lasts = OPERATION.exec(text);
    const duration = lasts ? { mode: "fixed", value: Number(lasts[1]), unit: UNITS[lasts[2].toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" } : null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        speeds: [{ type: speed[1].toLowerCase(), value: Number(speed[2]), duration, toggle: true }]
    };
}
