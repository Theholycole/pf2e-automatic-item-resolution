// Live play for plan.item.scrape (src/compiler/legend-readings.js, 2026-10-27: The Waxworks' "An affected creature or adjacent ally can reduce
// both of these values by 1d6 by spending an Interact action to scrape off the goo. Until the damage is reduced to 1d6 per type, the affected
// creature is also Confused"): the item card at the creature scraped, on the active GM's client — each of its persistent damage conditions of
// those types one die lower (PF2e's condition, its formula; gone at none), and once each is 1 die or less, the item's Effect that keeps it
// Confused (and Slowed) removed.

// A persistent damage's formula and the die scraped off → { formula, dice } (formula null when none is left), or null for one that isn't plain
// dice of that size. Pure.
export function scrapedFormula(formula, die) {
    const match = /^\s*(\d+)d(\d+)\s*$/.exec(String(formula ?? ""));
    if (!match || Number(match[2]) !== Number(die)) return null;
    const dice = Number(match[1]) - 1;
    return { formula: dice > 0 ? `${dice}d${match[2]}` : null, dice: Math.max(dice, 0) };
}

// The dice of a persistent damage's formula ("2d6" → 2), or Infinity for one that isn't plain dice. Pure.
export const diceOf = (formula) => Number(/^\s*(\d+)d\d+\s*$/.exec(String(formula ?? ""))?.[1] ?? Infinity);

// target: { actor }; scrape: { types, die, effect, from } → the card's lines.
export async function scrapeGoo(target, name, scrape) {
    const actor = target?.actor;
    if (!actor) return [];
    const persistent = (type) => (actor.itemTypes?.condition ?? []).find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === type) ?? null;
    const lines = [];
    for (const type of scrape.types ?? []) {
        const condition = persistent(type);
        const next = condition ? scrapedFormula(condition.system.persistent.formula, scrape.die) : null;
        if (!condition) continue;
        if (!next) {
            lines.push(`${name}'s persistent ${type} damage (${condition.system.persistent.formula}) isn't plain d${scrape.die}s: lower it by hand.`);
            continue;
        }
        if (next.formula) await condition.update({ "system.persistent.formula": next.formula });
        else await condition.delete();
        lines.push(`${name}'s persistent ${type} damage: ${next.formula ?? "gone"}.`);
    }
    if (!lines.length) return [`${name} has no persistent ${(scrape.types ?? []).join(" or ")} damage to scrape off.`];
    // (Each type at 1 die or less: the Effect that keeps it confused gone.)
    const left = (scrape.types ?? []).map((type) => diceOf(persistent(type)?.system?.persistent?.formula ?? "0d6"));
    if (left.every((dice) => dice <= 1)) {
        const ids = (actor.itemTypes?.effect ?? []).filter((effect) => String(effect.name ?? "").startsWith(scrape.from) && String(effect.name ?? "").endsWith(`: ${scrape.effect}`)).map((effect) => effect.id);
        if (ids.length) {
            await actor.deleteEmbeddedDocuments("Item", ids);
            lines.push(`${name}: down to 1d${scrape.die} a type, its ${scrape.effect} ends.`);
        }
    }
    return lines;
}
