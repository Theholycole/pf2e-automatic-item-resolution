// One-off rules (the user's answer of 2026-10-27): a rule of one item's own, a mechanism no other item would use, is a line of its card and
// counts done — kept here, so it can still be built later (docs/build-later.md, tools/needs.mjs). Not a unique item's or an artifact's:
// theirs are built (src/compiler/decided.js isSpecialItem). By the plan's source name (an activation's "Item: Activation"), each with the
// rule its card's line leaves to the table and what building it would take. Pure.

export const ONE_OFFS = new Map([
    // (2026-10-27: its 50% longer duration for the next elixir drunk within a minute — the item card's own next-elixir watch to build.)
    ["Baleblood Draft", { rule: "the next elixir drunk within 1 minute (1 minute to 1 hour long) lasts 50% longer; an eerie side effect for a week", build: "a watch on its user's next elixir's Effect, its duration × 1.5" }],
    // (2026-10-27: the rune's own extra die made larger for one hit — PF2e names that die "serrating", so a DamageAlteration could reach it.)
    ["Serrating", { rule: "its next hit with the weapon this turn that deals slashing damage adds 1d12 instead of the rune's 1d4", build: "an Effect to the end of the turn with PF2e's DamageAlteration (slug serrating, dice-faces 12, override), ended by its next slashing damage roll with the weapon" }],
    // (2026-10-27: an intelligent weapon taking itself back to a worthy owner, off the map.)
    ["Duchy Defender: To the Worthy!", { rule: "the weapon returns itself to a worthy previous owner's hands (their space if their hands are full), or to a random public place in Alkenstar, after which it can't transport itself for 1d4 days", build: "the weapon moved to that owner's inventory, and the 1d4 days its own recharge after a random place" }],
    // (2026-10-27: the burrower pushed out of stone it ends its move in, 1d6 for every 5 feet.)
    ["Earthglide Cloak: Glide through Earth", { rule: "ending its Burrow inside solid stone, its user is expelled to the nearest open area and takes 1d6 bludgeoning damage for every 5 feet to it", build: "after the move, a damage card for the feet to the open area its user gives" }],
    // (2026-10-27: a creature thrown 10 feet where its user picks, or tossed straight up to land in its square, after the Stride and Strike.)
    ["Hodag Leather: Hodag Toss", { rule: "after its user's Stride and a successful Strike, a successful Athletics check against the creature's Fortitude DC throws it 10 feet in a straight line its user picks (1d6 bludgeoning if into a solid object) or straight up to land in its own square (1d6 bludgeoning), Prone either way", build: "a ways card on the success: thrown to a space its user picks (placed.js) and Prone, or tossed up with the 1d6 and Prone" }],
    // (2026-10-27: a misfortune ended outright, once a month for a year, after a week of offerings.)
    ["Incense Bundle of Annual Blessings", { rule: "after its twelve sticks are offered at their deities' shrines within a week, a misfortune effect on its user is disrupted automatically, once a month for the next 12 months", build: "a card with 12 monthly uses that ends a misfortune Effect (PF2e's RollTwice keeping the lower) on its user" }]
]);

export const oneOff = (name) => ONE_OFFS.get(String(name ?? "")) ?? null;
