// An item zone's saves whose affliction is the item's own (2026-10-28, src/compiler/visibility.js bottledGrasp: Kraken Bottle's kraken ink
// poison, its stages in the bottle's text): their affliction's uuid "item" made the used item's — its compendium source, which outlasts a
// consumable used up — so the ability module's hand-off gives Pseudo Afflictions that item to track (its affliction { uuid }). Pure.

const filled = (row, uuid) => (row?.affliction?.uuid === "item" ? { ...row, affliction: { ...row.affliction, uuid } } : row);
// (And the resolution's own hand-off, the one the core's save family hands on.)
const handedOn = (resolution, uuid) => (resolution?.afflictionHandoff?.uuid === "item" ? { ...resolution, afflictionHandoff: { ...resolution.afflictionHandoff, uuid } } : resolution);

// The zone's plan and the item's uuid → the plan with those saves' afflictions named, or the same plan.
export function withAfflictionItem(plan, uuid) {
    const saves = plan?.zone?.saves ?? [];
    if (!uuid || !saves.some((save) => Object.values(save.plan?.resolution?.outcomes ?? {}).some((row) => row?.affliction?.uuid === "item"))) return plan;
    return {
        ...plan,
        zone: {
            ...plan.zone,
            saves: saves.map((save) => (save.plan?.resolution?.outcomes ? { ...save, plan: { ...save.plan, resolution: { ...handedOn(save.plan.resolution, uuid), outcomes: Object.fromEntries(Object.entries(save.plan.resolution.outcomes).map(([degree, row]) => [degree, filled(row, uuid)])) } } } : save))
        }
    };
}
