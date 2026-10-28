// Live play for a dead creature brought back to life by an item (src/compiler/revive.js: Elixir of Rejuvenation given to the dead, Gift of the
// Poisoned Heart): on the active GM's client, the creature the item card is given to — PF2e's dead status off, Dying and Unconscious gone, its
// Hit Points set, its Focus Points spent — with its debilitation's Effect first (PF2e's conditions granted for the week, so they can't be
// removed or reduced; Drained takes its Hit Points as it's gained, so the creature then has the Hit Points it's given) and a note Effect saying
// what else it comes back without. As the spell module's Raise Dead does.

import { itemNoteSource } from "../src/live/card.js";
import { MODULE_ID } from "./foundry.js";

// Dead: PF2e's dead status, or no Hit Points and not dying (an NPC at 0).
// (Or dying at its most, a character's death — Briar's "Trigger Briar's partner dies", 2026-10-27.)
export const isDead = (actor) => Boolean(actor?.statuses?.has?.("dead")) || (Number(actor?.system?.attributes?.hp?.value ?? 1) <= 0 && !actor?.hasCondition?.("dying"))
    || (Number(actor?.getCondition?.("dying")?.value) > 0 && Number(actor.getCondition("dying").value) >= (Number(actor?.system?.attributes?.dying?.max) || 4));

// target: { actor, token }; revive: { hp, words, debilitation? { days, words, rules } }. → the card's lines.
export async function reviveCreature(target, name, revive, state) {
    const actor = target?.actor;
    if (!actor) return [];
    if (!isDead(actor)) return [`${name} isn't dead: nothing to bring back.`];
    // (Only up to a level, Soulheart (Pure)'s 20th: refused above it.)
    if (Number.isFinite(revive.maxLevel) && Number(actor.level) > revive.maxLevel) return [`${name} is level ${actor.level}: ${state.item?.name ?? "it"} brings back only a creature of level ${revive.maxLevel} or lower.`];
    // (Destroyed by a sphere of annihilation, scripts/sphere.js: only a deity's direct intervention brings it back.)
    if (actor.getFlag?.(MODULE_ID, "annihilated")?.deity) return [`${name} was destroyed by a sphere of annihilation: only a deity's direct intervention can bring it back.`];
    const lines = [];
    const context = { item: state.item ?? {}, user: state.user ?? {}, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID };
    // (Its full Hit Points, its spells and pools kept, and a boon for its days — The Deck of Destiny's Resurrect at a critical success:
    // revive.hp "max", revive.keepPools, revive.boon { name, days, words, rules }, 2026-10-27.)
    const hp = revive.hp === "max" ? Math.max(1, Number(actor.system?.attributes?.hp?.max) || 1) : revive.hp;
    if (revive.boon) {
        const boon = itemNoteSource({ name: revive.boon.name ?? "boon", words: revive.boon.words, duration: { mode: "fixed", value: revive.boon.days, unit: "days", expiry: "turn-start" }, img: "icons/svg/angel.svg" }, context);
        await actor.createEmbeddedDocuments("Item", [{ ...boon, system: { ...boon.system, rules: revive.boon.rules ?? [] } }]);
        lines.push(`${name}: ${revive.boon.words} for ${revive.boon.days} days.`);
    }
    if (revive.debilitation) {
        const debilitated = itemNoteSource({ name: "debilitated", words: revive.debilitation.words, duration: { mode: "fixed", value: revive.debilitation.days, unit: "days", expiry: "turn-start" } }, context);
        await actor.createEmbeddedDocuments("Item", [{ ...debilitated, system: { ...debilitated.system, rules: revive.debilitation.rules ?? [] } }]);
        lines.push(`${name} is debilitated for ${revive.debilitation.days} days.`);
    }
    if (actor.statuses?.has?.("dead")) await actor.toggleStatusEffect?.("dead", { active: false });
    for (const slug of ["dying", "unconscious"]) if (actor.hasCondition?.(slug)) await actor.decreaseCondition(slug, { forceRemove: true });
    // (At full Hit Points and with its pools as they were, Briar's partner too: revive.hp "max", revive.keepPools.)
    const focus = actor.system?.resources?.focus;
    await actor.update({ "system.attributes.hp.value": hp, ...(Number(focus?.value) > 0 && !revive.keepPools ? { "system.resources.focus.value": 0 } : {}) });
    await actor.createEmbeddedDocuments("Item", [itemNoteSource({ name: "back from death", words: revive.words, duration: null }, context)]);
    lines.unshift(`${name} returns to life with ${hp} Hit Point${hp === 1 ? "" : "s"}${revive.hp === "max" ? " (its full Hit Points)" : ""}.`);
    // (The item gone once it works, Soulheart (Pure)'s flash.)
    if (revive.destroysItem && state.item?.uuid) {
        const used = await fromUuid(state.item.uuid).catch(() => null);
        if (used?.delete) {
            await used.delete();
            lines.push(`${state.item.name} is destroyed.`);
        }
    }
    return lines;
}
