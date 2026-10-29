// An item zone's saves whose affliction is the item's own (2026-10-28, src/compiler/visibility.js bottledGrasp: Kraken Bottle's kraken ink
// poison, its stages in the bottle's text): their affliction's uuid "item" made the used item's — its compendium source, which outlasts a
// consumable used up — so the ability module's hand-off gives Pseudo Afflictions that item to track (its affliction { uuid }). Pure.

const filled = (row, uuid) => (row?.affliction?.uuid === "item" ? { ...row, affliction: { ...row.affliction, uuid } } : row);

// The zone's plan and the item's uuid → the plan with those saves' afflictions named, or the same plan.
export function withAfflictionItem(plan, uuid) {
    const saves = plan?.zone?.saves ?? [];
    if (!uuid || !saves.some((save) => Object.values(save.plan?.resolution?.outcomes ?? {}).some((row) => row?.affliction?.uuid === "item"))) return plan;
    return {
        ...plan,
        zone: {
            ...plan.zone,
            saves: saves.map((save) => (save.plan?.resolution?.outcomes ? { ...save, plan: { ...save.plan, resolution: { ...save.plan.resolution, outcomes: Object.fromEntries(Object.entries(save.plan.resolution.outcomes).map(([degree, row]) => [degree, filled(row, uuid)])) } } } : save))
        }
    };
}
