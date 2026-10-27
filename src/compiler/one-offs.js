// One-off rules (the user's answer of 2026-10-27): a rule of one item's own, a mechanism no other item would use, is a line of its card and
// counts done — kept here, so it can still be built later (docs/build-later.md, tools/needs.mjs). Not a unique item's or an artifact's:
// theirs are built (src/compiler/decided.js isSpecialItem). By the plan's source name (an activation's "Item: Activation"), each with the
// rule its card's line leaves to the table and what building it would take. Pure.

export const ONE_OFFS = new Map([
    // (2026-10-27: its 50% longer duration for the next elixir drunk within a minute — the item card's own next-elixir watch to build.)
    ["Baleblood Draft", { rule: "the next elixir drunk within 1 minute (1 minute to 1 hour long) lasts 50% longer; an eerie side effect for a week", build: "a watch on its user's next elixir's Effect, its duration × 1.5" }],
    // (2026-10-27, the Strike group: each its own mechanism, no other PF2e item's.)
    ["Condensed Mana", { rule: "a thrown vial's Strike: 1 force damage on a hit, then a roll on the Wellspring Surges table (rank 4, DC 23) at everyone in its emanation; a missed Strike's surge only if it has an area; a critical failure on a save against it Stunned", build: "the Strike card's hit, then a draw from PF2e's Wellspring Surges RollTable with each of its 20 surges built at rank 4 and DC 23" }],
    ["Dagger of Eternal Sleep", { rule: "it becomes a +1 striking grievous dagger to Strike an unconscious creature; out of an encounter a hit is a critical hit; the damage and the bleed don't wake it, which is then immune until it next wakes; the dagger crumbles", build: "a Strike card with the dagger's runes for that Strike, AdjustDegreeOfSuccess outside an encounter, and an immunity until the creature's unconscious condition ends" }],
    ["Fate Shot", { rule: "on a hit, a DC 11 flat check: on a success every damage die of the Strike (not a critical hit's extra dice) counts as its average + 1, rounded up; on a failure the target takes half and its user the rest as mental damage", build: "a hook on the Strike's damage roll: its dice set to that value, or the damage split between target and user" }],
    ["Spined Shield", { rule: "a spine shot at a target: a ranged Strike with the shield spikes' statistics as a martial ranged weapon with a 120-foot range increment; one spine fewer", build: "a temporary ranged weapon of the spikes' runes and damage, its Strike, and the spines Effect's count lowered" }],
    ["Shuln Fang Katar: Piercing Critical", { rule: "after a critical hit with the katar on a creature in armor, the same damage to that armor, ignoring Hardness under 10", build: "the last critical hit's damage read from the chat and applied to the target's worn armor's Hit Points, less its Hardness when that's 10 or more" }]
]);

export const oneOff = (name) => ONE_OFFS.get(String(name ?? "")) ?? null;
