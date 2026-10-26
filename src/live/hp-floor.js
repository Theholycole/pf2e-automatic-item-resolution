// The "hp floor" Effect's terms (src/compiler/chosen-ally.js FLOOR, Bewitching Bloom (Amaranth)), held to as PF2e applies damage
// (scripts/hp-floor.js): the next damage its creature takes from a hazard or an enemy can't reduce it below 1 Hit Point, and that damage uses
// it up. Pure.

// Whose damage it is: PF2e's own "origin:ally" / "origin:enemy" roll options (its damage buttons add them), else the alliance of the
// actor whose item dealt it. An ally's, or the creature's own, isn't one the Effect is for; a hazard's or one with no source is.
export function fromEnemyOrHazard({ target, rollOptions = [], source = null }) {
    const options = [...rollOptions];
    if (options.includes("origin:ally")) return false;
    if (options.includes("origin:enemy")) return true;
    if (!source) return true;
    if (source === target || (source.uuid && source.uuid === target?.uuid)) return false;
    return !(source.alliance && target?.alliance && source.alliance === target.alliance);
}

// An update's new Hit Points when they're below 1 (nested or a dotted key), else null: what the hook raises to 1.
export function belowOne(changes) {
    const value = changes?.["system.attributes.hp.value"] ?? changes?.system?.attributes?.hp?.value;
    return typeof value === "number" && value < 1 ? value : null;
}

// Whether the damage was taken (its Hit Points or temporary Hit Points lower than before): then the Effect is used up.
export const tookDamage = (before, after) => (Number(after?.value) || 0) + (Number(after?.temp) || 0) < (Number(before?.value) || 0) + (Number(before?.temp) || 0);
