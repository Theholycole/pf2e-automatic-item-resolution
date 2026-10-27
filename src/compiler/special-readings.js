// Unique items' and artifacts' own rules (2026-10-27, the user: "unique effects that are on unique rarity items should be automated"): the
// readers each of their activations needed, one wrapper on the activations' chain (src/compiler/permanent.js specialOf) — last, over what
// the readers before left. What's left over then that's only lore (src/compiler/lore-lines.js) is decided again. Pure.

import { withHostileEnds } from "./hostile-ends.js";
import { withSpecialSentences } from "./special-sentences.js";

// The plan, and its activation's { name (its source name), html, text (plain), words (its effect's), base, info, frequency, item } → the plan with
// its item's own rules, or the same plan.
export function withSpecialReadings(plan, { name, html, text, words, base, info, frequency, item }) {
    let next = withSpecialSentences(plan, { name, words, html, base, info, frequency, item });
    next = withHostileEnds(next, text, name);
    next = withoutNextTier(next, name);
    next = withTerrainAdaptation(next, name);
    return next;
}

// (Slithermaw's Bane's Terrain Adaptation, its heat or cold the ways card's two ways (src/compiler/temperature.js): its terrain PF2e's ChoiceSet
// on its user's Effect until their next daily preparations — "aquatic, arctic, desert, forest, mountain, plains, sky, swamp, or underground",
// PF2e's environment types —, non-magical difficult terrain there ignored (PF2e's system.movement.terrain.difficult.ignored for that
// environment), and +1 circumstance to saves against the environment's hazards, disasters and temperatures there (the environment module's
// "environment" roll option, or an environmental hazard's trait, in that terrain).)
const ADAPT = /^You alter the exterior of the armor to better adapt to the surrounding terrain: ((?:\w+, )+)or (\w+)\.$/;
const ADAPTED = /^You ignore non-magical difficult terrain within the chosen environment and gain a \+(\d+) circumstance bonus to saving throws against environmental hazards, natural disasters, and extreme temperatures that originate from that terrain\.$/;
function withTerrainAdaptation(plan, name) {
    if (name !== "Slithermaw's Bane: Terrain Adaptation" || plan?.builtin !== "ways") return plan;
    const notes = (way) => (way.plan?.notes ?? []).map(String);
    const first = plan.ways[0];
    const adapt = notes(first).map((note) => ADAPT.exec(note)).find(Boolean);
    const adapted = [...(plan.notes ?? []), ...notes(first)].map((note) => ADAPTED.exec(String(note))).find(Boolean);
    if (!adapt || !adapted) return plan;
    const terrains = [...adapt[1].split(/,\s*/).filter(Boolean), adapt[2]];
    const chosen = "{item|flags.pf2e.rulesSelections.terrain}";
    const note = {
        label: "Terrain Adaptation",
        text: `Adapted to the terrain its user picks (${terrains.join(", ")}) until their next daily preparations: non-magical difficult terrain there is ignored, and +${adapted[1]} circumstance to saves against environmental hazards, natural disasters and extreme temperatures from it.`,
        rules: [
            { key: "ChoiceSet", flag: "terrain", prompt: "Which terrain?", choices: terrains.map((terrain) => ({ label: `${terrain.charAt(0).toUpperCase()}${terrain.slice(1)}`, value: terrain })) },
            { key: "ActiveEffectLike", mode: "add", path: "system.movement.terrain.difficult.ignored", value: { environment: chosen, feature: "all" } },
            { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: Number(adapted[1]), predicate: [`environment:${chosen}`, { or: ["environment", "origin:trait:environmental"] }] }
        ],
        duration: null
    };
    const ways = plan.ways.map((way) => {
        const own = way.plan;
        const success = own.resolution?.outcomes?.success;
        const rest = notes(way).filter((line) => !ADAPT.test(line) && !ADAPTED.test(line));
        return { ...way, plan: { ...own, partial: undefined, notes: rest.length ? rest : undefined, automation: { ...(own.automation ?? {}), level: "automatic" }, resolution: { ...own.resolution, outcomes: { ...own.resolution.outcomes, success: { ...success, noteEffects: [...(success?.noteEffects ?? []), note] } } } } };
    });
    const left = (plan.notes ?? []).filter((line) => !ADAPTED.test(String(line)) && !ADAPT.test(String(line)));
    return { ...plan, ways, partial: undefined, notes: left.length ? left : undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}

// (Briar's casts, whose blocks run on into the next Sharpness Point tier's words, "8 Sharpness Points Briar becomes a +4 major striking …":
// that tier's runes and statistics are the item's own, not this cast's, and its "Briar casts … on its partner" the cast itself — not its card's
// lines.)
const TIER = /^(?:Briar casts (?:an? )?(?:\d+(?:st|nd|rd|th)-rank )?[\w' ]+ on its partner\.\s*)?\d+ Sharpness Points Briar becomes\b|^Its statistics improve as follows\./;
function withoutNextTier(plan, name) {
    if (name !== "Briar" || plan?.builtin !== "cast-spell" || !(plan.notes ?? []).some((note) => TIER.test(String(note)))) return plan;
    const notes = plan.notes.filter((note) => !TIER.test(String(note)));
    return { ...plan, notes: notes.length ? notes : undefined };
}
