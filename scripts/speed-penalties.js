// Live play for plan.item.speedPenaltiesEnd (src/compiler/reduce.js readSpeedPenaltyEnds: Spleen Bloodstone of Arazni's "as well as any Speed
// penalties affecting you", Cayden's Tankard's "anything giving such targets a circumstance penalty to Speed") and a reduce entry's unlessMagical
// (Break Bonds' "unless the effect is magical and of 12th level or higher"). A Speed penalty is a PF2e FlatModifier rule on a Speed selector
// with a value below 0, on one of the creature's Effects: that rule is taken off the Effect (the Effect gone when it was its only rule). An
// Effect of the level spared, and magical, keeps it — and the condition it grants. → lines for the card.

const MAGICAL = new Set(["magical", "arcane", "divine", "occult", "primal"]);
const SPEED = /(?:^|-)speeds?$/;
const selectorsOf = (rule) => [].concat(rule?.selector ?? rule?.selectors ?? []).map(String);

// Whether an Effect is magical and of that level or higher: its traits (a spell's Effect counts as magical), its level.
export function sparedBy(effect, level) {
    if (!effect || !level) return false;
    const traits = new Set([...(effect.system?.traits?.value ?? [])].map(String));
    const magical = [...traits].some((trait) => MAGICAL.has(trait)) || /^spell-effect-/.test(effect.system?.slug ?? effect.slug ?? "");
    return magical && (Number(effect.system?.level?.value ?? effect.level) || 0) >= level;
}

// The Effect granting the creature's condition, when one does (PF2e's grantedBy).
export function granterOf(actor, slug) {
    const condition = actor?.getCondition?.(slug) ?? null;
    const id = condition?.flags?.pf2e?.grantedBy?.id ?? null;
    return id ? actor.items?.get?.(id) ?? null : null;
}

// A Speed penalty rule: a FlatModifier on a Speed with a value below 0, of the type when one is given.
export const isSpeedPenalty = (rule, type = null) => rule?.key === "FlatModifier" && selectorsOf(rule).some((selector) => SPEED.test(selector)) && Number(rule.value) < 0 && (!type || rule.type === type);

export async function endSpeedPenalties(actor, name, { type = null, unlessMagical = null } = {}) {
    const lines = [];
    for (const effect of [...(actor?.itemTypes?.effect ?? [])]) {
        const rules = effect.system?.rules ?? [];
        const penalties = rules.filter((rule) => isSpeedPenalty(rule, type));
        if (!penalties.length) continue;
        if (sparedBy(effect, unlessMagical)) {
            lines.push(`${name}: ${effect.name}'s Speed penalty stays (magical, level ${unlessMagical} or higher)`);
            continue;
        }
        const kept = rules.filter((rule) => !penalties.includes(rule));
        if (kept.length) await effect.update({ "system.rules": kept });
        else await effect.delete();
        lines.push(`${name}: ${effect.name}'s Speed penalty ends`);
    }
    return lines.length ? lines : [`${name} has no ${type ? `${type} ` : ""}Speed penalty to end`];
}
