// One-off rules (the user's answer of 2026-10-27): a rule of one item's own, a mechanism no other item would use, is a line of its card and
// counts done — kept here, so it can still be built later (docs/build-later.md, tools/needs.mjs). Not a unique item's or an artifact's:
// theirs are built (src/compiler/decided.js isSpecialItem). By the plan's source name (an activation's "Item: Activation"), each with the
// rule its card's line leaves to the table and what building it would take. Pure.

export const ONE_OFFS = new Map([
    // (2026-10-27: its 50% longer duration for the next elixir drunk within a minute — the item card's own next-elixir watch to build.)
    ["Baleblood Draft", { rule: "the next elixir drunk within 1 minute (1 minute to 1 hour long) lasts 50% longer; an eerie side effect for a week", build: "a watch on its user's next elixir's Effect, its duration × 1.5" }]
]);

export const oneOff = (name) => ONE_OFFS.get(String(name ?? "")) ?? null;
