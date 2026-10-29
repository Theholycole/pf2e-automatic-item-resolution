// Afflictions, immunities, dying and plain results the reader doesn't parse yet: the readings of the 2026-10-28 batch's afflictions group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.

import { withCastPrice } from "./cast-price.js";
import { withConstructCommand } from "./construct-command.js";
import { disasterHeraldPlan } from "./disaster-herald.js";
import { withHeartCost } from "./heart-cost.js";
import { withKindInstead } from "./kind-instead.js";
import { loadedGradesPlan } from "./loaded-grades.js";
import { withMimicBite } from "./mimic-bite.js";
import { withQuantumDuplicate } from "./quantum-duplicate.js";
import { withRolledCritical } from "./rolled-critical.js";
import { withPurifyingWave } from "./purifying-wave.js";
import { withRottingAura } from "./rotting-aura.js";
import { withRunebrand } from "./runebrand.js";
import { withSlimeOff } from "./slime-off.js";
import { withWhilePersistent } from "./while-persistent.js";

// (A plan still to finish: none, partial, note-only or the GM's no-effect.)
const unfinished = (plan) => !plan || plan.partial || plan.noteOnly || plan.builtin === "no-effect";

export function withAfflictionsGroup(plan, context) {
    let next = plan;
    // (A weapon loaded with two alchemical items, the weakest deciding: src/compiler/loaded-grades.js — the Alchemists+ cannon, drum, rod and
    // wand, the ways card's pick of the grade loaded.)
    if (context.kind === "activation" && unfinished(next) && /\bbased on the weakest\b/.test(context.words ?? "")) next = loadedGradesPlan({ ...context, plan: next }) ?? next;
    // (More damage when the roll was a critical hit before its better degree: src/compiler/rolled-critical.js — Tian Xia+'s ceremonial swords.)
    if (context.kind === "activation" && next?.strike?.degree) next = withRolledCritical(next, context.html);
    // (Strike damage for a minute in place of the armor's own save bonus: src/compiler/runebrand.js — Battlezoo's Runebranded Hide.)
    if (context.kind === "activation" && context.item?.type === "armor" && unfinished(next)) next = withRunebrand(next, context.html, context.item);
    // (An aura sickening those ending their turns in it, by the slot spent: src/compiler/rotting-aura.js — Magic+'s Scepter of Sickening.)
    if (context.kind === "activation" && next?.builtin === "ways" && unfinished(next)) next = withRottingAura(next);
    // (A healing wave that counteracts sickness on those it heals, by the slot spent: src/compiler/purifying-wave.js — Magic+'s Scepter of
    // Purifying.)
    if (context.kind === "activation" && next?.builtin === "ways" && unfinished(next)) next = withPurifyingWave(next, context.item?.system?.level?.value);
    // (A condition from a Strike while its persistent damage lasts: src/compiler/while-persistent.js — Alchemists+'s Fume Ammunition.)
    if (context.kind === "activation" && next?.strike && unfinished(next)) next = withWhilePersistent(next);
    // (Persistent damage from its user's own rage emanation, for the rage: src/compiler/disaster-herald.js — Barbarians+'s Instinct Crown
    // (Disaster).)
    if (context.kind === "activation" && !next) next = disasterHeraldPlan(next, context);
    // (A slime pulled off with Interact actions, others helping: src/compiler/slime-off.js — Alchemists+'s Phial of Slurk.)
    if (context.kind === "consumable" && unfinished(next)) next = withSlimeOff(next, context.text);
    // (A disguised creature that bites later: src/compiler/mimic-bite.js — Alchemists+'s Mimic Melange.)
    if (context.kind === "consumable" && next?.noteOnly) next = withMimicBite(next, context.text, context.base);
    // (A duplicate of its user for downtime, its loyalty the GM's secret roll: src/compiler/quantum-duplicate.js — Inventors+'s Quantum Duplicator.)
    if (context.kind === "consumable" && next?.noteOnly) next = withQuantumDuplicate(next, context.text);
    // (Another damage type for a trait's creatures, the GM's to switch back: src/compiler/kind-instead.js — Alchemists+'s Phoenix Flagon.)
    if (unfinished(next)) next = withKindInstead(next, context.text);
    // (A construct's mind overridden as Command would, its successes immune for a day: src/compiler/construct-command.js — Inventors+'s
    // Construct Controller, its own save card in place of the spell module's cast.)
    if (context.kind === "consumable" && next?.builtin === "cast-spell" && unfinished(next)) next = withConstructCommand(next, context);
    // (Healing an ally pays for with its user's own Hit Points: src/compiler/heart-cost.js — Magic+'s Iron Heart.)
    if (context.kind === "consumable" && unfinished(next)) next = withHeartCost(next, context.html);
    // (A condition its user takes for the spell cast on them: src/compiler/cast-price.js — Tian Xia+'s Cat's Eye.)
    if (next?.builtin === "cast-spell" && unfinished(next)) next = withCastPrice(next);
    return next;
}
