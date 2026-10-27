// Saves an item's Effect calls for at the start or end of a creature's turn near its bearer (2026-10-27, src/compiler/relic-readings.js
// item.ruleEffects[].turnAuras: Clockwork Sun's illumination). Each aura: { radius, at "start" | "end", plan (a save card's), sighted?,
// unless? [Effect slugs], only? { abilities: [slugs] }, label }: a creature whose turn starts (or ends) within the radius of the Effect's
// bearer gets the save card — "a sighted creature that ends their turn within 20 feet … and didn't Avert Gaze" (not blinded, no Avert Gaze
// Effect), "Creatures that are vulnerable to sunlight … if they start their turn within the illumination" (an ability of theirs by one of
// those slugs) — while the Effect lasts (scripts/turn-auras.js). The bearer itself never. Pure.

// Whether the aura calls for its save on this creature: { at, distance (feet), self, conditions, effects, abilities } (slugs).
export function auraFits(aura, { at, distance, self = false, conditions = [], effects = [], abilities = [] }) {
    if (!aura || self || aura.at !== at || !(Number(distance) <= Number(aura.radius))) return false;
    if (aura.sighted && conditions.includes("blinded")) return false;
    if ((aura.unless ?? []).some((slug) => effects.includes(slug))) return false;
    if ((aura.only?.abilities ?? []).length && !aura.only.abilities.some((slug) => abilities.includes(slug))) return false;
    return true;
}

// Its words: "a Fortitude save at the end of a sighted creature's turn within 20 feet (not one that Averted Gaze)".
export function auraText(aura) {
    const who = aura.only?.abilities?.length ? `a creature vulnerable to sunlight` : aura.sighted ? "a sighted creature" : "a creature";
    return `${aura.label ?? "its save"} at the ${aura.at} of ${who}'s turn within ${aura.radius} feet${(aura.unless ?? []).includes("effect-avert-gaze") ? " (not one that Averted Gaze that turn)" : ""}`;
}
