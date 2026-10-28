// The 2026-10-28 batch's readers, one file per group (src/compiler/readings-*.js), wired once into both chains so each group's readings sit in
// its own file: outermost, over what every reader before and the user's rulings left (src/compiler/index.js and permanent.js groupsOf). Each
// reading takes the plan and the item's context (see a group's file) → the new plan, or the same one. Pure.

import { withMovingGroup } from "./readings-moving.js";
import { withStrikeGroup } from "./readings-strike.js";
import { withAreasGroup } from "./readings-areas.js";
import { withPlainGroup } from "./readings-plain.js";
import { withCreaturesGroup } from "./readings-creatures.js";
import { withAfflictionsGroup } from "./readings-afflictions.js";
import { withLeftoversGroup } from "./readings-leftovers.js";

const GROUPS = [withMovingGroup, withStrikeGroup, withAreasGroup, withPlainGroup, withCreaturesGroup, withAfflictionsGroup, withLeftoversGroup];

export const withGroupReadings = (plan, context) => GROUPS.reduce((next, reading) => reading(next, context) ?? next, plan);
