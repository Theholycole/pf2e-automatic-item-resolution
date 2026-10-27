// One-off rules (the user's answer of 2026-10-27): a rule of one item's own, a mechanism no other item would use, is a line of its card and
// counts done — kept here, so it can still be built later (docs/build-later.md, tools/needs.mjs). Not a unique item's or an artifact's:
// theirs are built (src/compiler/decided.js isSpecialItem). By the plan's source name (an activation's "Item: Activation"), each with the
// rule its card's line leaves to the table and what building it would take. Pure.

export const ONE_OFFS = new Map([
    // (2026-10-27: its 50% longer duration for the next elixir drunk within a minute — the item card's own next-elixir watch to build.)
    ["Baleblood Draft", { rule: "the next elixir drunk within 1 minute (1 minute to 1 hour long) lasts 50% longer; an eerie side effect for a week", build: "a watch on its user's next elixir's Effect, its duration × 1.5" }],
    // (2026-10-27, the counteract need's general-book entries, each its own item's rule.)
    ["Absolute Solvent (Lesser)", { rule: "everlasting adhesive dissolved outright; any other adhesive (a glue bomb's) counteracted at rank 3, +9", build: "the counteract card listing a creature's or object's adhesive Effects (glue bombs')" }],
    ["Absolute Solvent (Moderate)", { rule: "everlasting adhesive dissolved outright; any other adhesive (a glue bomb's) counteracted at rank 5, +16", build: "the counteract card listing a creature's or object's adhesive Effects (glue bombs')" }],
    ["Absolute Solvent (Greater)", { rule: "everlasting adhesive dissolved outright; any other adhesive (a glue bomb's) counteracted at rank 8, +26", build: "the counteract card listing a creature's or object's adhesive Effects (glue bombs')" }],
    ["Disruption Ammunition", { rule: "on a hit, one spell effect the target is Sustaining counteracted (rank 3, +11)", build: "a hit's counteract card listing the spells its target sustains, wherever their Effects are" }],
    ["Disruption Ammunition (Greater)", { rule: "on a hit, one spell effect the target is Sustaining counteracted (rank 6, +20)", build: "a hit's counteract card listing the spells its target sustains, wherever their Effects are" }],
    ["Reflecting Shield: Reflect Spell", { rule: "a spell it counteracts is turned back on its caster", build: "the spell module recasting the counteracted spell at its caster, from the caster's own numbers" }],
    ["Hungering Maw", { rule: "a would-be possessor its user resists is subject to Seize Soul (DC 37), trapped in the talisman, a new save at the end of each of its turns", build: "a cast of Seize Soul at the triggering creature once the save is rolled" }],
    ["Curious Teardrop: Reflect Emotions", { rule: "after its user's save, a counteract check at +36 to reflect a copy of the emotion effect at its originator", build: "a counteract roll on the save's trigger and the effect recast at its originator under the teardrop's control" }],
    ["Leydroth Spellbreaker: Dispelling Blast", { rule: "one counteract check at +25 against each spell or magical effect in a 30-foot cone, and one item or effect on each creature in it (Dispel Magic's effects)", build: "a cone's counteract card: every spell zone in it and one Effect per creature, one roll" }],
    ["Moonlit Chain: Dim Sight", { rule: "the Dazzled condition suppressed for 1 minute", build: "a condition's suppression with no modifiers of its own (Dazzled's concealment), back when the minute ends" }],
    ["Pheromone Flare (Lesser)", { rule: "a 60-foot lure for 1 hour for one kind of animal: a new save every 10 minutes, fascinated until it reaches the flare, wind and moving it change or end it", build: "zone saves for one creature kind only, repeated every 10 minutes" }],
    ["Pheromone Flare (Moderate)", { rule: "a 60-foot lure for 1 hour for one kind of animal: a new save every 10 minutes, fascinated until it reaches the flare, wind and moving it change or end it", build: "zone saves for one creature kind only, repeated every 10 minutes" }],
    ["Malleable: Reconfigure Armor", { rule: "the armor's specialization group changed to another of its user's choice, property runes that can't apply suppressed", build: "a picker of armor groups and the armor item's group updated (PF2e's ItemAlteration has no group)" }],
    ["Pheromone Flare (Greater)", { rule: "a 60-foot lure for 1 hour for one kind of animal: a new save every 10 minutes, fascinated until it reaches the flare, wind and moving it change or end it", build: "zone saves for one creature kind only, repeated every 10 minutes" }]
]);

export const oneOff = (name) => ONE_OFFS.get(String(name ?? "")) ?? null;
