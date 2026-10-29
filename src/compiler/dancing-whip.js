// A feather token's dancing whip (2026-10-28, docs/needs.md; a one-off of 2026-10-27, src/compiler/one-offs.js, built): Feather Token (Whip)'s
// "This feather transforms into a +1 striking Dancing whip when activated. The whip immediately jumps from your grasp and proceeds to attack
// your enemies until 1 minute has passed or it fails its flat check for dancing, at which point it vanishes. If the whip's target isn't prone,
// the whip uses its actions to attempt to Trip that creature instead of making a Strike. The whip's total attack modifier for Striking or
// Tripping is +18". The animated weapon's card (src/compiler/self-fighting.js: plan.again, kept open for the minute and pressed each round,
// then the Animated rune's DC 6 flat check — a failure and it's gone): its Trip at +18 against the target's Reflex DC, PF2e's Trip rows
// (the ability module's compiled action) without its critical failure's fall — the whip has no footing to lose —, and for a target already
// prone its Strike at +18, a +1 striking whip's 2d4 slashing with no Strength (plan.ifTarget, its conditions: src/live/if-target.js). Its
// numbers are its own: no weapon item to read them from (selfFighting.own). Pure.

import { weaponStrikePlan } from "./self-fighting.js";
import { sentencesOf } from "./lasting.js";

// (The feather tokens' shared opening, then its own.)
const WHIP = [
    /^Each feather token appears to be a simple feather from some exotic bird\.$/,
    /^The feather's shaft, dipped in gold, bears a single arcane rune\.$/,
    /^Activating a feather token causes it to transform into another object, which then can be used as normal for that object\.$/,
    /^Each feather can be activated only once, with most of them permanently becoming the item in their description\.$/,
    /^(?:Activate (?:A )?Interact )?This feather transforms into a \+(\d) (striking) Dancing (whip) when activated\.$/,
    /^The whip immediately jumps from your grasp and proceeds to attack your enemies until (1) (minute) has passed or it fails its flat check for dancing ?, at which point it vanishes\.$/,
    /^If the whip's target isn't prone, the whip uses its actions to attempt to Trip that creature instead of making a Strike\.$/,
    /^The whip's total attack modifier for Striking or Tripping is \+(\d+) instead of the normal bonus for a dancing weapon\.$/
];
// (The Animated rune's flat check: "Each round, when the weapon finishes using its actions, attempt a DC 6 flat check".)
const ANIMATED_FLAT = 6;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// The consumable's plan and its context → the whip's card, or the same plan.
export function withDancingWhip(plan, { kind, words, item, base, info, options }) {
    if (kind !== "consumable" || item?.name !== "Feather Token (Whip)") return plan;
    const sentences = sentencesOf(words);
    if (sentences.length !== WHIP.length || !WHIP.every((pattern, index) => pattern.test(sentences[index]))) return plan;
    const trip = options?.basicActions?.trip;
    if (!trip?.resolution?.check || trip.builtin) return plan;
    const modifier = Number(WHIP[7].exec(sentences[7])[1]);
    const lasts = WHIP[5].exec(sentences[5]);
    const name = item.name;
    // (Its Strike at a prone target: the animated weapon's, its own +18 and a +1 striking whip's dice — 2d4 slashing, no Strength.)
    const { selfFighting: _fights, ...strike } = weaponStrikePlan({ name, modifier, flat: null, wait: null, index: 0 });
    const strikePlan = { ...strike, resolution: { ...strike.resolution, sharedDamage: { rollOnce: true, components: [{ id: "weapon", formula: "2d4", type: "slashing", category: null }] } } };
    // (Its Trip: PF2e's rows at +18, no fall of its own on a critical failure.)
    const outcomes = Object.fromEntries(Object.entries(trip.resolution.outcomes).map(([degree, row]) => [degree, { ...row, effects: (row?.effects ?? []).filter((effect) => effect?.recipient !== "self") }]));
    const tripPlan = {
        ...strike,
        source: { name: `${name}: its Trip` },
        targeting: { target: "1 creature within its reach", range: null, area: null },
        ownCheck: { kind: "maneuver", modifier },
        resolution: { ...trip.resolution, check: { ...trip.resolution.check, modifier }, outcomes },
        selfFighting: { base: modifier, flat: ANIMATED_FLAT, wait: null, index: 0, own: true, vanishes: true },
        ifTarget: [{ conditions: ["prone"], instead: strikePlan }]
    };
    return {
        ...base,
        automation: { level: "automatic" },
        trigger: { event: "use" },
        targeting: { target: null, range: null, area: null },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        partial: undefined,
        noteOnly: undefined,
        decided: undefined,
        unread: undefined,
        notes: [
            `The feather becomes a +1 striking animated (dancing) whip that leaps from its user's grasp to fight its enemies for ${lasts[1]} ${lasts[2]}: at the end of its user's turn each round it Flies up to 40 feet, then acts — its card each round, then the DC ${ANIMATED_FLAT} flat check; a failure, or the minute's end, and it vanishes.`,
            `At a target that isn't prone it Trips (+${modifier} against its Reflex DC); at one that's prone it Strikes (+${modifier}, 2d4 slashing).`,
            "A whip's Strikes are nonlethal (its nonlethal trait): a creature it would bring to 0 Hit Points is knocked out, not killed."
        ],
        again: { plan: tripPlan, later: true, repeat: true, time: { value: Number(lasts[1]), unit: "minutes" } },
        item: { ...info }
    };
}
