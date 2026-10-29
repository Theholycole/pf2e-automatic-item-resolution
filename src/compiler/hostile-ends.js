// A stun its creature keeps only until it's attacked or otherwise subject to a hostile act (2026-10-27, docs/needs.md; an artifact's, every
// rule built): Flawed Orb of Gold Dragonkind's "Any stun from this activation ends if the dragon is attacked or otherwise subject to a hostile
// act other than that of the orb". Each stun is an Effect on the dragon granting PF2e's Stunned, with the RollOption "air-ends-on:targeted"
// that scripts/ends-on-hostile.js ends it by (an attack roll at it, damage it takes, a save it rolls against anything but the orb):
// "Success The dragon is Stunned 3" (the Effect goes once the stun's spent); "Failure The dragon is stunned for as long as the orb's
// wielder Sustains the Activation" (a Sustain's 10 minutes at most, its Stunned held while it lasts; removed sooner when they stop: the
// Effect's words); "Critical Failure As failure, but hostile actions don't end the dragon's stun" (no RollOption). The save's own rules:
// "Choose a dragon" (no other creature affected: plan.ifTarget lacks), "Gold dragons take a -4 circumstance penalty to this saving throw" (a
// gold dragon by its name, PF2e giving them no trait of their own: ifTarget named), "(or higher with orb shards)" — Orb Shard's "Each orb
// shard within 60 feet of the flawed orb … increases the save DC against the orb by 1": plan.dcNear, counted as it's used (scripts/live.js).
// Pure.

import { conditionUuid } from "./row-readings.js";

const ORB = /^Flawed Orb of Gold Dragonkind$/;
const WORDS = [
    /\bYou attempt to overwhelm a dragon's mind-while you cannot control the dragon, you can render it immobile for a short time\./,
    /\bChoose a dragon within (\d+) feet; the dragon can attempt to resist the orb with a @Check\[will\|dc:(\d+)\] saving throw \(or higher with orb shards ?\)\./,
    /\bGold dragons take a -(\d+) circumstance penalty to this saving throw\./,
    /\bAny stun from this activation ends if the dragon is attacked or otherwise subject to a hostile act other than that of the orb\./,
    /\bCritical Success The dragon is unaffected\./,
    /\bSuccess The dragon is Stunned (\d+)\./,
    /\bFailure The dragon is stunned for as long as the orb's wielder Sustains the Activation\./,
    /\bCritical Failure As failure, but hostile actions don't end the dragon's stun\./
];
// (A Sustain with no time of its own lasts 10 minutes at most, PF2e's rule for Sustain.)
const SUSTAIN_MOST = { mode: "fixed", value: 10, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const ENDS = { key: "RollOption", domain: "all", option: "air-ends-on:targeted" };
const ENDS_WORDS = "It ends if the dragon is attacked or otherwise subject to a hostile act other than the orb's.";

// The orb's plan (its save read) and its activation's plain text → the save with every rule played, or the same plan.
export function withHostileEnds(plan, text, name) {
    if (!ORB.test(String(name ?? "")) || plan?.resolution?.kind !== "save") return plan;
    const found = WORDS.map((pattern) => pattern.exec(String(text ?? "")));
    if (!found.every(Boolean)) return plan;
    const [, choose, gold, , , stunned] = found;
    const outcomes = plan.resolution.outcomes;
    const stun = conditionUuid("stunned");
    const row = (degree, noteEffects) => ({ ...outcomes[degree], effects: [], noteEffects, manualInstructions: undefined });
    const held = (ends) => ({
        label: "Stunned while Sustained",
        text: `Stunned for as long as the orb's wielder Sustains the activation, 10 minutes at most: remove this Effect when they stop.${ends ? ` ${ENDS_WORDS}` : " Hostile actions don't end it."}`,
        rules: [{ key: "GrantItem", uuid: stun, inMemoryOnly: true }, ...(ends ? [ENDS] : [])],
        duration: SUSTAIN_MOST
    });
    const next = {
        ...plan,
        targeting: { ...(plan.targeting ?? {}), range: `${choose[1]} feet` },
        resolution: {
            ...plan.resolution,
            outcomes: {
                ...outcomes,
                criticalSuccess: row("criticalSuccess", []),
                success: row("success", [{ label: `Stunned ${stunned[1]}`, text: `Stunned ${stunned[1]} by the orb; this Effect goes once the stun's spent. ${ENDS_WORDS}`, rules: [{ key: "GrantItem", uuid: stun, onDeleteActions: { granter: "cascade", grantee: "cascade" }, alterations: [{ mode: "override", property: "badge-value", value: Number(stunned[1]) }] }, ENDS], duration: null }]),
                failure: row("failure", [held(true)]),
                criticalFailure: row("criticalFailure", [held(false)])
            }
        },
        // (No other creature: it must be a dragon. A gold one by its name: PF2e's gold dragons have no trait of their own.)
        ifTarget: [...(plan.ifTarget ?? []), { traits: ["dragon"], lacks: true, immune: true }, { named: "gold dragon", bonus: { value: -Number(gold[1]), type: "circumstance" } }],
        // (Orb Shard's own numbers: 1 each within 60 feet.)
        dcNear: { name: "Orb Shard", within: 60, each: 1 },
        notes: [...(plan.notes ?? []), "Each Orb Shard within 60 feet of the orb raises the DC by 1, counted as it's used; one crafted back into the orb counts for good (the GM may change the DC)."]
    };
    for (const degree of Object.keys(next.resolution.outcomes)) if (next.resolution.outcomes[degree]?.manualInstructions === undefined) delete next.resolution.outcomes[degree].manualInstructions;
    const left = (plan.unread ?? []).length;
    return left ? next : { ...next, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}
