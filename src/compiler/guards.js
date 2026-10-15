// Last checks on a plan before it's played (the user's rule: never apply a rule wrongly; a note says it instead). Pure.
//
// A valued condition read with no value — Gearbinder Oil's "increases its slowed condition", Mamlambo Scale's "As failure,
// but …" whose failure value didn't carry over — isn't applied: a note on the creature for that degree says it, and the
// GM sets the value. (Stunned for a time, "Stunned for 1 round", has no value by right.)

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"]);

const unvalued = (effect) => effect?.kind === "condition" && VALUED.has(effect.slug) && !Number.isFinite(effect.value) && !(effect.slug === "stunned" && effect.duration) && effect.recipient !== "self";

function guardOutcomes(resolution) {
    if (!resolution?.outcomes) return null;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter(unvalued);
        if (!bad.length) {
            outcomes[degree] = row;
            continue;
        }
        changed = true;
        outcomes[degree] = {
            ...row,
            effects: row.effects.filter((effect) => !bad.includes(effect)),
            noteEffects: [...(row.noteEffects ?? []), ...bad.map((effect) => ({ label: effect.slug, text: `${effect.slug.charAt(0).toUpperCase()}${effect.slug.slice(1)}: the item doesn't say how much; the GM sets it.`, duration: effect.duration ?? null }))]
        };
    }
    return changed ? { ...resolution, outcomes } : null;
}

// The plan with its unvalued conditions as notes (its own rows, and the saves it carries: a bomb's, a Strike's), marked
// partial; the same plan when there are none.
export function guardValues(plan) {
    if (!plan || plan.builtin) return plan;
    const own = guardOutcomes(plan.resolution);
    const itemSave = plan.item?.save?.plan ? guardOutcomes(plan.item.save.plan.resolution) : null;
    const strikeSave = plan.strike?.save ? guardOutcomes(plan.strike.save.resolution) : null;
    if (!own && !itemSave && !strikeSave) return plan;
    return {
        ...plan,
        ...(own ? { resolution: own } : {}),
        ...(itemSave ? { item: { ...plan.item, save: { ...plan.item.save, plan: { ...plan.item.save.plan, resolution: itemSave } } } } : {}),
        ...(strikeSave ? { strike: { ...plan.strike, save: { ...plan.strike.save, resolution: strikeSave } } } : {}),
        partial: true
    };
}
