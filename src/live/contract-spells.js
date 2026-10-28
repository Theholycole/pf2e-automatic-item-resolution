// A contract's selected spells in live play (2026-10-27, src/compiler/contract-spells.js: Limitless Power's Unleash Power): its record on the
// item — { selected: { [slot]: uuid }, used: { [uuid]: day } } — the first cast of each slot its signer's selection, a non-cantrip cast today
// left out until the next day. Pure.

export const CONTRACT = "contract";
export const dayOf = (worldTime) => Math.floor((Number(worldTime) || 0) / 86_400);

// The choices its card offers now: each slot's selected spell once there is one (else all of that slot's), less the non-cantrips cast today.
export function contractChoices(plan, record, day) {
    const selected = record?.selected ?? {};
    const used = record?.used ?? {};
    return (plan.choices ?? []).filter((choice) => (!selected[choice.slot] || selected[choice.slot] === choice.spell.uuid) && !(choice.slot !== "cantrip" && plan.contract?.oncePerDay === "non-cantrip" && used[choice.spell.uuid] === day));
}

// Why that choice can't be cast now, or null.
export function contractRefusal(plan, record, choice, day) {
    if (!choice) return null;
    const selected = record?.selected?.[choice.slot];
    if (selected && selected !== choice.spell.uuid) return `its ${choice.slot === "cantrip" ? "cantrip" : `rank ${choice.slot} spell`} is another (its signer's selection)`;
    if (choice.slot !== "cantrip" && plan.contract?.oncePerDay === "non-cantrip" && record?.used?.[choice.spell.uuid] === day) return `${choice.spell.name} was cast with it today already`;
    return null;
}

// The record after a cast of that choice.
export function withContractCast(record, choice, day) {
    return { selected: { ...(record?.selected ?? {}), [choice.slot]: record?.selected?.[choice.slot] ?? choice.spell.uuid }, used: { ...(record?.used ?? {}), [choice.spell.uuid]: day } };
}
