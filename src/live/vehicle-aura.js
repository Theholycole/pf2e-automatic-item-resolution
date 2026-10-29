// An area as far as a vehicle is long, round that vehicle (2026-10-28, docs/needs.md "Ships and vehicles"): Sea Dragon Figurehead's Tempest
// Roar, a tempest in an emanation as far out as its ship is long — the zone's centre "vehicle" (src/compiler/readings-areas.js). The vehicle
// is the one its user targets, else the one its user's token stands on; its length PF2e's vehicle's space (system.details.space.long, in
// feet), else its token's longer side. scripts/zones.js places the ability module's zone round that token (attached to it, so it moves
// with the ship). Pure.

const isVehicle = (token) => token?.actor?.type === "vehicle";

// targets, tokens: token documents ({ id, x, y, width, height, actor }, x and y in pixels, width and height in squares); user: its user's
// token; gridSize: pixels a square → the vehicle's token, or null.
export function vehicleFor({ targets = [], tokens = [], user = null, gridSize = 100 } = {}) {
    const aimed = (targets ?? []).find(isVehicle);
    if (aimed) return aimed;
    if (!user) return null;
    const size = Number(gridSize) || 100;
    const x = Number(user.x) + ((Number(user.width) || 1) * size) / 2;
    const y = Number(user.y) + ((Number(user.height) || 1) * size) / 2;
    const under = (tokens ?? []).filter((token) => isVehicle(token) && token.id !== user.id && x >= Number(token.x) && x <= Number(token.x) + (Number(token.width) || 1) * size && y >= Number(token.y) && y <= Number(token.y) + (Number(token.height) || 1) * size);
    // (Two at once, a boat on a ship's deck: the smaller, the one it's in.)
    return under.sort((a, b) => (Number(a.width) || 1) * (Number(a.height) || 1) - (Number(b.width) || 1) * (Number(b.height) || 1))[0] ?? null;
}

// How long it is, in feet: PF2e's vehicle's space, else its token's longer side.
export function vehicleLength(token, { gridDistance = 5 } = {}) {
    const long = Number(token?.actor?.system?.details?.space?.long);
    if (long > 0) return long;
    return Math.max(Number(token?.width) || 1, Number(token?.height) || 1) * (Number(gridDistance) || 5);
}

// The zone round it: its emanation as far as the vehicle is long, centred on that token (the ability module's "self" centre at it).
export function vehicleZone(zone, token, { gridDistance = 5 } = {}) {
    return { ...zone, centre: "self", area: { ...(zone?.area ?? { type: "emanation" }), value: vehicleLength(token, { gridDistance }) } };
}
