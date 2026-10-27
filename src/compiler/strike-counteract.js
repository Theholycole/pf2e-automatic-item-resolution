// A counteract check the Strike's hit makes (2026-10-27, docs/needs.md). Awakened Silver Shot: "On a hit, it attempts to counteract any polymorph
// effect on the target. The counteract rank is 9, and the counteract modifier is +27. If you fail (but don't critically fail) the counteract check
// against a devil or a werecreature, you get a success instead. If you counteracted the Change Shape ability, the creature can't use that ability
// again for 1 round, or 1 minute on a critical success. If you hit a devil or werecreature not under a polymorph effect, the target is Enfeebled
// 1 for 1 minute instead." Awakened Cold Iron Shot: "You can name a creature you believe to be enchanted by your target or allow the shot to
// choose an enchanted creature randomly. On a hit, the shot attempts to counteract the spell or effect the target is using to manipulate that
// creature's mind. … If you fail (but don't critically fail) the counteract check against a demon or fey, you get a success instead. If you hit a
// demon or fey with no active spell effects on other creatures, the target is Stupefied 1 for 1 minute instead."
// → strike.counteract { counteract, fallback }: on a hit (scripts/strikes.js) the counteract card, at the creature hit (its polymorph Effects) or
// at the creature its user names (its mental Effects from the creature hit — origin "target"); a failure a success against those traits
// (failToSuccess, of the creature hit); after Change Shape counteracted, a note Effect (afterCounter). The fallback: the creature hit, of those
// traits, with no such Effect — on it (silver) or from it on others (cold iron) — gets that condition for that time. Pure.

const POLYMORPH = /^On a hit, it attempts to counteract any polymorph effect on the target\.$/i;
const MIND = /^On a hit, the shot attempts to counteract the spell or effect the target is using to manipulate that creature's mind\.$/i;
const NAMED = /^You can name a creature you believe to be enchanted by your target or allow the shot to choose an enchanted creature randomly\.$/i;
const NUMBERS = /^The counteract rank is (\d+), and the counteract modifier is \+(\d+)\.$/i;
const FAIL_UP = /^If you fail \(but don't critically fail\) the counteract check against an? ([a-z]+) or (?:an? )?([a-z]+), you get a success instead\.$/i;
const CHANGE_SHAPE = /^If you counteracted the Change Shape ability, the creature can't use that ability again for (\d+) (rounds?|minutes?), or (\d+) (rounds?|minutes?) on a critical success\.$/i;
const SILVER_FALLBACK = /^If you hit an? ([a-z]+) or ([a-z]+) not under a polymorph effect, the target is (Enfeebled|Stupefied|Clumsy|Drained) (\d+) for (\d+) (rounds?|minutes?) instead\.$/i;
const IRON_FALLBACK = /^If you hit an? ([a-z]+) or ([a-z]+) with no active spell effects on other creatures, the target is (Enfeebled|Stupefied|Clumsy|Drained) (\d+) for (\d+) (rounds?|minutes?) instead\.$/i;
const said = (note) => String(note ?? "").trim();
const unit = (word) => (/^min/i.test(word) ? "minutes" : "rounds");
// ("werecreatures" is PF2e's "werecreature" trait.)
const trait = (word) => word.toLowerCase().replace(/s$/, "");

// The plan → the plan with its Strike's counteract, or the same plan.
export function withStrikeCounteract(plan) {
    const notes = (plan?.strike?.notes ?? []).map(said);
    const polymorph = notes.find((note) => POLYMORPH.test(note));
    const mind = notes.find((note) => MIND.test(note));
    const numbers = notes.map((note) => NUMBERS.exec(note)).find(Boolean);
    if (!(polymorph || mind) || !numbers) return plan;
    const up = notes.map((note) => FAIL_UP.exec(note)).find(Boolean);
    const shape = notes.map((note) => CHANGE_SHAPE.exec(note)).find(Boolean);
    const fallback = notes.map((note) => (polymorph ? SILVER_FALLBACK : IRON_FALLBACK).exec(note)).find(Boolean);
    const named = mind ? notes.find((note) => NAMED.test(note)) : null;
    const counteract = {
        rank: Number(numbers[1]),
        modifier: Number(numbers[2]),
        ...(polymorph ? { traits: ["polymorph"], at: "target" } : { traits: ["mental"], at: "named", origin: "target" }),
        ...(up ? { failToSuccess: { traits: [trait(up[1]), trait(up[2])] } } : {}),
        ...(shape ? { afterCounter: { name: "Change Shape", words: "It can't use Change Shape", success: { value: Number(shape[1]), unit: unit(shape[2]) }, criticalSuccess: { value: Number(shape[3]), unit: unit(shape[4]) } } } : {})
    };
    const said_ = [polymorph ?? mind, numbers[0], up?.[0], shape?.[0], fallback?.[0], named].filter(Boolean);
    const left = (plan.strike.notes ?? []).filter((note) => !said_.includes(said(note)));
    const strike = {
        ...plan.strike,
        notes: left,
        counteract: {
            counteract,
            ...(fallback ? { fallback: { traits: [trait(fallback[1]), trait(fallback[2])], slug: fallback[3].toLowerCase(), value: Number(fallback[4]), duration: { mode: "fixed", value: Number(fallback[5]), unit: unit(fallback[6]), expiry: "turn-start", anchor: "effect-start" }, unless: polymorph ? "polymorph-on-it" : "spells-on-others" } } : {})
        },
        // (Its "name a creature" sentence, before the hit's: the card's pick.)
        ...(mind ? { lines: [...(plan.strike.lines ?? []), "On a hit, the counteract card lists the creatures near: its user names the one it believes the creature hit enchants (or the GM picks one at random)"] } : {})
    };
    return { ...plan, strike, ...(plan.partial && !left.length && !(plan.notes ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
