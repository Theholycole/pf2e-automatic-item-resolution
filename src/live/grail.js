// A drink an item fills that casts on whoever drinks it (2026-10-27, src/compiler/relic-readings.js plan.item.wine: Grail of Twisted Desires).
// Filled: a consumable in its user's inventory, the same look whatever it is (flags.<module>.wine { kind, cast, from }); drunk: its spell
// cast on the drinker by the spell module, or nothing for ordinary wine. Its twist: unless its user is chaotic, the GM's secret d6 as it's
// filled — at or under its use's odds (1, 2, 3 in 6 for the day's first, second and third) the wine is another kind, the next one along.
// Pure.

// The kind it really is: the chosen kind, or another (the next in the list) when the secret roll is at or under the use's odds.
export function twistedKind(kinds, chosen, { roll, use, chaotic = false }) {
    const odds = Math.min(3, Math.max(1, Number(use) || 1));
    if (chaotic || !(Number(roll) <= odds)) return chosen;
    const others = kinds.filter((kind) => kind !== chosen);
    return others[(Number(roll) - 1) % others.length] ?? chosen;
}

// The wine's item: drunk with an Interact action, its kind hidden in its flags.
export function wineSource(wine, { from = "Grail of Twisted Desires", level = 0, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: `Wine from the ${from}`,
        type: "consumable",
        img: "icons/consumables/drinks/wine-amphora-clay-red.webp",
        flags: { [moduleId]: { wine: { ...wine, from } } },
        system: {
            category: "other",
            quantity: 1,
            uses: { value: 1, max: 1, autoDestroy: true },
            level: { value: Number(level) || 0 },
            traits: { value: ["consumable", "magical"], rarity: "unique" },
            description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">A</span> (manipulate)</p><hr /><p>Wine from the chalice. It looks, tastes and smells like any wine; Detect Magic shows only that it's magical.</p>" }
        }
    };
}

// The drink's plan, from the wine's flag: its spell cast on the drinker, or ordinary wine's nothing.
export function winePlan(flag) {
    const name = `Wine from the ${flag?.from ?? "chalice"}`;
    if (!flag?.cast) return { source: { name }, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] } } }, notes: ["Ordinary wine: nothing more."] };
    return { source: { name }, automation: { level: "automatic" }, trigger: { event: "use" }, builtin: "cast-spell", spell: flag.cast.spell, rank: flag.cast.rank, dc: null, attack: null, tradition: null, self: true, area: false, targets: false, notes: [`The wine was ${flag.kind}: ${flag.cast.spell.name} at rank ${flag.cast.rank} on its drinker.`], item: { recipient: "drinker" } };
}
