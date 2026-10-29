// PF2e's own items left over: the general books' last ones, and readings two groups built twice: the readings of the 2026-10-28 batch's leftovers group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.

import { withBombSnare } from "./bomb-snare.js";
import { withCubeWalls } from "./cube-faces.js";
import { withDancingWhip } from "./dancing-whip.js";
import { withPlacedStructure } from "./placed-structures.js";
import { withWonderRows } from "./wonder-table.js";
import { withBoons } from "./boons.js";
import { withCastBoost } from "./cast-boost.js";

const READINGS = [
    // (Instant Fortress, Warding Escutcheon's door, Testudo Shield's barrier: the structure card — src/compiler/placed-structures.js.)
    withPlacedStructure,
    // (Cube of Force and Lesser Cube of Nex: the cube's faces on the ways card, as Cube of Nex's — src/compiler/cube-faces.js.)
    withCubeWalls,
    // (Feather Token (Whip): the animated weapon's card, a Trip or a Strike each round — src/compiler/dancing-whip.js.)
    withDancingWhip,
    // (Bomb Snare: a way for each bomb it can be loaded with, options.bombs — src/compiler/bomb-snare.js.)
    withBombSnare,
    // (Pistol of Wonder: its d% table's rows built on what plays them, the rest its card's lines — src/compiler/wonder-table.js.)
    withWonderRows,
    // (The boons, Elder Seed's, Heartblood Ring's, Phoenix Cinder's and Void Fragment's stages on one Effect, and the activation a stage gives
    // on the item made for it — src/compiler/boons.js, 2026-10-29.)
    withBoons,
    // (Starless Scope's reaction as its user casts: a Religion check against the spell's DC, its degree the spell's — src/compiler/cast-boost.js,
    // 2026-10-29.)
    withCastBoost
];

export function withLeftoversGroup(plan, context) {
    return READINGS.reduce((next, reading) => reading(next, context) ?? next, plan);
}
