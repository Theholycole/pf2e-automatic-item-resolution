// An activation that switches on one of the item's own PF2e toggles, named for it: Glacier Hammer's Grow Icicles ("Until
// the end of your turn, the maul deals 1d6 extra cold damage instead of just 1"), whose rules give the 1d6 while its
// RollOption "grow-icicles" is on; Smoking Sword's Stoke Flames, Storm Hammer's Electrify, Screaming Pinion's Transcendent
// Shot (its next attack), Fighter's Fork's Fluid Length (extended or not, back and forth). The plan is the toggle card's
// (src/live/toggle-card.js) with that one way, and how long it stays on: until "turn-end" (live play switches it off at the
// end of its user's turn), "damage" (after the next damage roll with the item), "move" (when its user's token moves), or null
// (flipped, for good). Only for an
// activation nothing else reads. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const slugOf = (name) => String(name ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The item's toggle (a RollOption rule without ways of its own) named as the activation is: "grow-icicles",
// "fighters-fork:fluid-length", "screaming-pinion-transcendent-shot". (An activation with no name: the item's one toggle named for
// the item, which its other rules wait for — Sure-Step Crampons' "sure-step-crampons" on its bonus to Fortitude and Reflex.)
export function namedToggle(item, activationName) {
    const toggles = (item?.system?.rules ?? []).filter((rule) => rule?.key === "RollOption" && rule.toggleable && !rule.suboptions?.length && typeof rule.option === "string");
    const name = slugOf(activationName);
    if (!name) {
        const own = toggles.length === 1 && [slugOf(item?.name), item?.system?.slug].includes(toggles[0].option) ? toggles[0] : null;
        const gates = own && (item.system.rules ?? []).some((rule) => rule !== own && JSON.stringify(rule.predicate ?? []).includes(`"${own.option}"`));
        return gates ? own : null;
    }
    return toggles.find((rule) => rule.option === name || rule.option.endsWith(`:${name}`) || rule.option.endsWith(`-${name}`)) ?? null;
}

// How long it stays on, by its words.
function untilOf(text) {
    if (/\bUntil the end of (?:your|this|the current) turn\b/i.test(text)) return "turn-end";
    if (/\bThe next (?:attack|Strike)\b[^.]*\bdeals\b/i.test(text)) return "damage";
    if (/\bYou (?:extend or shorten|shorten or extend)\b/i.test(text)) return null;
    // (Sure-Step Crampons' "until the next time you move", "The bonus lasts until you move from your current spot": off when its
    // user's token moves.)
    if (/\buntil (?:the next time )?you move\b/i.test(text)) return "move";
    return undefined;
}

export function optionPlan(item, activation, base) {
    const rule = namedToggle(item, activation?.name);
    if (!rule) return null;
    const text = plainText(activation.html).replace(/^.*?\bEffect\b\s*/s, "");
    const until = untilOf(text);
    if (until === undefined) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        builtin: "modes",
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        modes: [{ name: activation.name ?? "On", plan: { builtin: "roll-option", option: rule.option, ...(rule.domain ? { domain: rule.domain } : {}), value: until === null ? "flip" : true } }],
        ...(until ? { until } : {})
    };
}
