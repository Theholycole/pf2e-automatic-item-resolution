// Temporary Hit Points from a share of the damage the item's target takes (2026-10-26): Blood-Drinker Blade (Greater)'s Exsanguinate — 6d6
// bleed to the required creature, its user gaining half the bleed damage the creature takes, after resistances, for 1 minute. PF2e's bleed
// is always persistent (its @Damage and the core's dice), so that damage is the persistent bleed's: the card at the creature deals it
// (src/compiler/direct-damage.js), and plan.drain { fraction, type, duration } marks the creature once the card is applied
// (scripts/drain.js) — the first damage of that type it then takes gives the user that share of what it lost, as temporary Hit Points for
// the rest of the minute (src/live/drain.js). In place of the card's typed amount (plan.levelTemp from "amount"). Pure.

import { directDamagePlan, readDirectDamage } from "./direct-damage.js";

// "the bleed damage the creature takes", "the damage the target takes": its type, or null for any.
const TAKEN = /^the (?:(\w+) )?damage (?:the|that) (?:creature|target|foe|enemy) takes$/i;
const SHARE = /\btemporary Hit Points equal to (?:half |twice |double )?the (?:\w+ )?damage (?:the|that) (?:creature|target|foe|enemy) takes\b/i;
const LOSE = /^You lose any remaining temporary Hit Points after\b/i;

export function withDrain(plan, text, base, { item = null } = {}) {
    const entries = plan?.levelTemp ?? [];
    const entry = entries.find((one) => one.from === "amount" && !one.heal && TAKEN.test(one.of));
    if (!entry) return plan;
    const read = readDirectDamage(text);
    const type = TAKEN.exec(entry.of)[1]?.toLowerCase() ?? null;
    if (!read || (type && read.type !== type)) return plan;
    const damage = directDamagePlan(text, base, { item });
    if (!damage) return plan;
    // (What the card no longer leaves the GM: the share's sentence, and its loss after the time.)
    const kept = (line) => !SHARE.test(line) && !LOSE.test(line.replace(/^\{target\}:\s*/, ""));
    const success = damage.resolution.outcomes.success;
    const left = (success.manualInstructions ?? []).filter(kept);
    const notes = (damage.notes ?? []).filter(kept);
    const outcomes = { ...damage.resolution.outcomes, success: { ...success, ...(left.length ? { manualInstructions: left } : {}) } };
    if (!left.length) delete outcomes.success.manualInstructions;
    const rest = entries.filter((one) => one !== entry);
    const { levelTemp: _gone, partial: _partial, unread: _unread, ...others } = plan;
    return {
        ...others,
        ...damage,
        ...(rest.length ? { levelTemp: rest } : {}),
        resolution: { ...damage.resolution, outcomes },
        notes: notes.length ? notes : undefined,
        automation: { level: left.length || notes.length ? "guided" : "automatic" },
        drain: { fraction: entry.multiplier, type, duration: entry.duration ?? null },
        ...(left.length || notes.length ? { partial: true } : {})
    };
}
