// One-off rules (the user's answer of 2026-10-27): a rule of one item's own, a mechanism no other item would use, is a line of its card and
// counts done — kept here, so it can still be built later (docs/build-later.md, tools/needs.mjs). Not a unique item's or an artifact's:
// theirs are built (src/compiler/decided.js isSpecialItem). By the plan's source name (an activation's "Item: Activation"), each with the
// rule its card's line leaves to the table and what building it would take. Pure.

export const ONE_OFFS = new Map([
    // (2026-10-27: its 50% longer duration for the next elixir drunk within a minute — the item card's own next-elixir watch to build.)
    ["Baleblood Draft", { rule: "the next elixir drunk within 1 minute (1 minute to 1 hour long) lasts 50% longer; an eerie side effect for a week", build: "a watch on its user's next elixir's Effect, its duration × 1.5" }],
    // (2026-10-27, the lasting ones: something done again at each turn, or at the next hit, that only this item does.)
    ["Sea Retrieval Line", { rule: "the rope's end moves 20 feet through the water now and at the start of each of its user's turns (120 feet at most) to an unattended, stationary object or a willing creature of 10 Bulk or less, then pulls it toward its user, or its user toward a stationary object, at that rate", build: "a turn-start hook moving the rope's end, then the target's (or its user's) token, 20 feet" }],
    ["Kizidhar's Shield: Repair", { rule: "the shield regains 3 Hit Points at the start of each of its user's turns for a minute", build: "the turn-start healing (scripts/turn-heal.js) given to the shield item's own Hit Points" }],
    ["Breech Ejectors", { rule: "fitted into a double-barreled firearm, after it fires its next reload of both barrels before the end of its user's next turn is a single Interact action, the ejectors used up", build: "a later card at that reload loading both barrels at once (the objects card's reload)" }],
    ["Shifter Prosthesis", { rule: "the arm absorbs a held one-handed weapon (two at most), out of reach until released by the same activation; its other activation reshapes it into an absorbed weapon with all its statistics and etched runes until activated again", build: "the objects card storing a weapon in the arm, and the arm made that weapon (its statistics and runes) until the next activation" }],
    ["Called (Lastwall)", { rule: "the called weapon within 100 feet appears in its owner's hand even if Restrained; a creature holding it first attempts a Will save against its owner's Will DC, and on a success the bond breaks until it's imprinted again", build: "the objects card's hand for the rune's own weapon, and the holder's Will save card before it's taken from another creature" }],
    ["Duchy Defender: Declare Judgment", { rule: "the next time the musket damages the creature it focuses on (one it knows committed a crime within Alkenstar's borders), 2d8 more precision damage", build: "a TokenMark at that creature and a readied Strike with no time limit, its 2d8 precision only at the mark, spent by the first damaging hit at it" }]
]);

export const oneOff = (name) => ONE_OFFS.get(String(name ?? "")) ?? null;
