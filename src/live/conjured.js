// A conjured creature as the item's text has it (src/compiler/conjured.js, src/compiler/creature-readings.js; live in scripts/zones.js):
// the changes to the actor the ability module made — its creature type traded for the item's traits, traits it lacks, immunities added,
// weaknesses it lacks, its size, its Strikes gone —, and the creature its user picks first when the text lets them choose (plan.pick: one
// of the compendiums' creatures with those traits, of that level or lower, as the ability module's summon picks them). Pure.

import { pickable } from "../../../pf2e-automatic-ability-resolution/src/live/conjure.js";

// PF2e's creature types (a trait a creature has one or two of).
export const CREATURE_TYPES = new Set(["humanoid", "animal", "undead", "plant", "construct", "fey", "beast", "fiend", "dragon", "celestial", "elemental", "fungus", "ooze", "aberration", "giant", "spirit", "monitor", "dream", "astral", "time", "ethereal", "petitioner"]);
const PF2E_SIZES = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };

// The made actor ({ traits, immunities, weaknesses, size, items: [{ id, type }] } — its source's) and the plan's creature → { update, deleteIds },
// or null when the item changes nothing on it.
export function conjuredChanges(actor, creature) {
    if (!creature) return null;
    const own = creature.own ?? {};
    const update = {};
    const removed = new Set(creature.removeTraits ?? []);
    if (creature.replaceType || removed.size) {
        const kept = (actor.traits ?? []).filter((trait) => !removed.has(trait) && (!creature.replaceType || !CREATURE_TYPES.has(trait) || (creature.traits ?? []).includes(trait)));
        update["system.traits.value"] = [...new Set([...kept, ...(creature.replaceType ? creature.traits ?? [] : [])])];
    }
    if (creature.immunities?.length) {
        const had = (actor.immunities ?? []).filter((entry) => entry?.type);
        update["system.attributes.immunities"] = [...had, ...creature.immunities.filter((type) => !had.some((entry) => entry.type === type)).map((type) => ({ type }))];
    }
    // (No weaknesses at all, the Petrified Wood tree's; or one it lacks, a Galvasphere's zombie unharmed by vitality.)
    if (own.noWeaknesses) update["system.attributes.weaknesses"] = [];
    else if (own.dropWeaknesses?.length) update["system.attributes.weaknesses"] = (actor.weaknesses ?? []).filter((entry) => !own.dropWeaknesses.includes(entry?.type));
    const size = PF2E_SIZES[String(creature.size ?? "").toLowerCase()];
    if (size && creature.from && size !== actor.size) update["system.traits.size.value"] = size;
    // (Its Strikes gone, Cordelia's Construct Key's broom: PF2e's NPC attacks are its melee items.)
    const deleteIds = own.noStrikes ? (actor.items ?? []).filter((entry) => entry.type === "melee").map((entry) => entry.id) : [];
    return Object.keys(update).length || deleteIds.length ? { update, deleteIds } : null;
}

// The compendiums' creatures a pick allows (index entries [{ uuid, name, level, traits, type }]), the ability module's own filter: of its
// level or lower, with one of `any` traits and all of `all`, highest level first.
export const pickCandidates = (entries, pick) => pickable(entries, pick ?? {});

// The plan with its picked creature ({ uuid, name }) in place of the pick: what the ability module then makes at once.
export function pickedPlan(plan, picked) {
    const { pick: _pick, needs: _needs, ...rest } = plan;
    return { ...rest, creatures: (plan.creatures ?? []).map((creature, index) => (index ? creature : { ...creature, name: picked.name, from: { uuid: picked.uuid } })) };
}

// A creature slain that its item waits for (plan.slainWait { value, unit, each? }, src/compiler/conjured.js: a Wondrous Figurine's week): the
// world time it's usable again. And, for each creature's own wait (Golden Lions'), the ones still waiting at a time: kept on the item as
// [{ until }], and how many of the plan's creatures come now.
const WAIT_SECONDS = { days: 86_400, weeks: 604_800 };
export const slainUntil = (slainWait, worldTime) => (Number(worldTime) || 0) + (Number(slainWait?.value) || 0) * (WAIT_SECONDS[slainWait?.unit] ?? 0);
export const stillSlain = (slain, worldTime) => (slain ?? []).filter((entry) => (Number(entry?.until) || 0) > (Number(worldTime) || 0));
export const countNow = (count, slain, worldTime) => Math.max(0, (Number(count) || 1) - stillSlain(slain, worldTime).length);
