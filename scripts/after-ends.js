// Live play for plan.afterEnds (src/compiler/after-ends.js: Heart of Sarnax's Slowed 2 once Stunned ends, Fatigued for an hour once Bestow
// Vim's Quickened does). Once the ability module's card at the creature is applied (its "applied" hook, on the GM's client), each creature of
// that degree that has the condition is marked. When PF2e deletes that condition from it (its timed Effect gone, its value down to 0) and it
// has none of it left, the active GM's client gives it the next condition for its time, the mark used up.

import { afterEndsEffectSource, afterEndsMarkSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

const marksOf = (actor, slug) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.afterEnds?.when === slug);

export function setUpAfterEnds() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markAfterEnds(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | after-ends mark`, error));
    });
    Hooks.on("deleteItem", (item) => {
        if (item?.type !== "condition" || !isActiveGM()) return;
        followAfterEnds(item.parent, item.slug ?? item.system?.slug).catch((error) => console.error(`${MODULE_ID} | after-ends`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, degree }] }.
export async function markAfterEnds({ state, targets }) {
    const entries = state?.plan?.afterEnds ?? [];
    if (!entries.length) return [];
    const item = { name: state.ability?.name ?? state.plan.source?.name ?? "The item", uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
    const marked = [];
    for (const target of targets ?? []) {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor?.createEmbeddedDocuments) continue;
        for (const entry of entries.filter((one) => one.degree === (target.degree ?? "success"))) {
            // (Only while it has that condition: one its immunity kept off has nothing to end.)
            if (!actor.hasCondition?.(entry.when)) continue;
            const [mark] = await actor.createEmbeddedDocuments("Item", [afterEndsMarkSource(entry, { item, user: { actorUuid: state.source?.actorUuid ?? actor.uuid, tokenUuid: state.source?.tokenUuid ?? null }, worldTime: game.time.worldTime, moduleId: MODULE_ID })]);
            marked.push(mark);
        }
    }
    return marked;
}

export async function followAfterEnds(actor, slug) {
    if (!actor || !slug || actor.hasCondition?.(slug)) return [];
    const given = [];
    for (const mark of marksOf(actor, slug)) {
        const { then } = mark.flags[MODULE_ID].afterEnds;
        const item = { name: mark.name.replace(new RegExp(`: after ${slug}$`), ""), uuid: mark.system?.context?.origin?.item ?? null, img: mark.img ?? null };
        await mark.delete();
        const [effect] = await actor.createEmbeddedDocuments("Item", [afterEndsEffectSource(then, { item, user: { actorUuid: mark.system?.context?.origin?.actor ?? actor.uuid }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        given.push(effect);
    }
    return given;
}
