// The polymorph Effect a new form is picked for, and its Effect made again (scripts/reshape.js; src/compiler/reshape.js: Bestiary of
// Metamorphosis's Shifting Form). Pure.

// Of a creature's Effects ({ name, traits, rules, originTraits }), the polymorph ones whose form PF2e asks for: a ChoiceSet beside a
// BattleForm (or with the polymorph trait, its own or its spell's).
export function reshapeCandidates(effects) {
    return (effects ?? []).filter((effect) => {
        const rules = effect.rules ?? [];
        const polymorph = rules.some((rule) => rule?.key === "BattleForm") || [...(effect.traits ?? []), ...(effect.originTraits ?? [])].includes("polymorph");
        return polymorph && rules.some((rule) => rule?.key === "ChoiceSet");
    });
}

// Half the time left, in rounds: seconds left → { value, unit } (a round at least).
export const halvedDuration = (seconds) => ({ value: Math.max(1, Math.floor(Math.max(0, Number(seconds) || 0) / 6 / 2)), unit: "rounds" });

// The Effect's source made again: its ChoiceSets' picks cleared so PF2e asks again, half its time left from now.
export function reshapedSource(source, { seconds, worldTime = 0, initiative = null }) {
    const copy = JSON.parse(JSON.stringify(source));
    delete copy._id;
    const flags = copy.flags?.pf2e?.rulesSelections;
    for (const rule of copy.system?.rules ?? []) {
        if (rule?.key !== "ChoiceSet") continue;
        delete rule.selection;
        if (flags && rule.flag) delete flags[rule.flag];
    }
    if (flags && !Object.keys(flags).length) delete copy.flags.pf2e.rulesSelections;
    const time = halvedDuration(seconds);
    copy.system = { ...(copy.system ?? {}), duration: { ...(copy.system?.duration ?? {}), value: time.value, unit: time.unit, expiry: copy.system?.duration?.expiry ?? "turn-start" }, start: { value: worldTime, initiative } };
    return copy;
}

export const reshapeText = () => "A new form of its user's polymorph spell (PF2e asks which), its time left halved";
