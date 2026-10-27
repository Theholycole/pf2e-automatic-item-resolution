// A talisman that goes off by itself at its wearer's act (2026-10-27, docs/needs.md "Spells and the user's resources"): Detect Anathema Fulu's
// "this fulu activates on its own if its wearer begins to perform an act anathema to a specific deity or cause … if you proceed, the fulu
// immolates in a burst of flame. This deals 4d6 fire damage and brands your skin until you receive an appropriate Atone ritual." → the
// direct-damage card (src/compiler/direct-damage.js) of 4d6 fire at its wearer, the brand a note Effect on it with no end (an Atone ritual
// is the GM's), and its lines: the act and the warning the GM's call, its wearer the creature to target. Pure.

import { directDamagePlan } from "./direct-damage.js";

const BURN = /\bif you proceed, the [\w' ]+? immolates\b[^.]*\.\s*This deals (\d+d\d+) (\w+) damage and brands your skin until you receive an appropriate ([A-Z][\w' ]+?) ritual\./i;
const OWN = /\bactivates on its own if its wearer begins to perform an act anathema to\b/i;

// The item's plain text, the base plan and the item → the plan, or null.
export function anathemaBurnPlan(text, base, item = null) {
    const burn = BURN.exec(String(text ?? ""));
    if (!burn || !OWN.test(text)) return null;
    const plan = directDamagePlan(`The creature takes ${burn[1]} ${burn[2]} damage.`, base, { item });
    if (!plan?.directDamage) return null;
    const success = { ...plan.resolution.outcomes.success, noteEffects: [{ label: "Branded", text: `Its skin is branded until it receives an appropriate ${burn[3]} ritual.`, duration: null }] };
    return {
        ...plan,
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success } },
        notes: ["It goes off by itself as its wearer begins an act anathema to its deity or cause, hot as a warning first: it burns only if the wearer goes on (the GM's call).", "Its wearer takes the damage: target the wearer."]
    };
}
