// Live play for plan.item.structure and plan.item.removeStructures (2026-10-27, src/compiler/relic-readings.js: Lesser Cube of Nex's walls
// of force): walls the environment module places around its user's token — its api.placeStructure(scene, template), breakable walls of
// the item's numbers, no creature pushed out — and, dismissed, the walls this item placed on the scene removed (its api.removeStructure),
// on the active GM's client. Without the environment module: the card's line says to draw them.

const ENV_ID = "pf2e-automatic-environment-resolution";
const envApi = () => (game.modules.get(ENV_ID)?.active ? game.modules.get(ENV_ID)?.api ?? null : null);
const idOf = (used) => used?.data?.uuid ?? used?.data?._id ?? null;

// The walls placed → the card's line. (Invisible ones, Wall of Force's: the environment module's transparent walls, which block movement only —
// found by the 2026-10-28 case writers; they were placed blocking sight.)
export async function placeItemStructure(structure, { actor, token, used }) {
    const api = envApi();
    const scene = (token?.document ?? token)?.parent ?? canvas?.scene ?? null;
    const name = `${used?.data?.name ?? "The item"}: ${structure.name}`;
    if (!api?.placeStructure || !scene || !token) return `${name}: ${structure.words} — draw its walls by hand (the environment module isn't there to place them).`;
    if (!game.user.isGM) return `${name}: only a GM's client places its walls.`;
    const placed = await api.placeStructure(scene, { name, token: token.document ?? token, shape: structure.shape, feet: structure.feet, ...(structure.kind ? { kind: structure.kind } : {}), ...(structure.invisible ? { invisible: true } : {}), stats: structure.stats, pushOut: false, source: { actorUuid: actor?.uuid ?? null, itemUuid: idOf(used), name: used?.data?.name ?? null } });
    return `${name}: ${placed?.walls?.length ?? 0} walls placed around ${token.name ?? actor?.name} (Hardness ${structure.stats?.hardness}, ${structure.stats?.hp} HP).`;
}

// The walls this item placed on its user's scene, removed → the card's line.
export async function removeItemStructures({ token, used }) {
    const api = envApi();
    const scene = (token?.document ?? token)?.parent ?? canvas?.scene ?? null;
    if (!api?.placedStructures || !api?.removeStructure || !scene) return "Remove its walls by hand.";
    const own = (api.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid && entry.source.itemUuid === idOf(used));
    for (const entry of own) await api.removeStructure(scene, entry.id);
    return own.length ? `Its walls removed (${own.length}).` : "No walls of it on the scene.";
}

