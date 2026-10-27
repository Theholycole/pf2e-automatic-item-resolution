// Creatures teleported to a paired stone, unless they resist (2026-10-27, docs/needs.md "moving"; the user's of the same day: a unique item's
// or an artifact's effects all built): Jahan Waystone's "The stone's glow envelopes all creatures in a 10-foot radius with its light and
// attempts to teleport the creatures to its paired stone. If there is no open space within 30 feet of the target waystone, the teleportation
// attempt fails. A creature can resist the teleportation with a successful @Check[will|dc:45]." The save card at the creatures its user targets
// within 10 feet of the stone, its failures plan.pairedStone { within, degrees }: once it's applied (the ability module's "applied" hook), the
// active GM's client teleports each that failed into an open space within 30 feet of the other stone of the pair — on its scene, or another —,
// or says it fails (scripts/paired-stone.js). Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The reading's matches (src/compiler/whole-artifacts.js) and the item's slug → the card's parts.
export function pairedStonePlanOf([, glow, open, resist], slug) {
    return {
        targeting: { target: `each creature within ${glow[1]} feet of the stone`, range: null, area: { type: "emanation", value: Number(glow[1]) } },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(resist[1]) } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        pairedStone: { within: Number(open[1]), degrees: ["failure", "criticalFailure"], slug },
        notes: [
            `Each creature that fails is teleported to an open space within ${open[1]} feet of the paired stone (none open: it stays); a success resists`,
            "A willing creature can choose not to resist: count its save a failure"
        ]
    };
}
