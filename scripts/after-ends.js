// Live play for plan.afterEnds (src/compiler/after-ends.js: Heart of Sarnax's Slowed 2 once Stunned ends, Fatigued for an hour once Bestow
// Vim's Quickened does). Once the ability module's card at the creature is applied (its "applied" hook, on the GM's client), each creature of
// that degree that has the condition is marked. When PF2e deletes that condition from it (its timed Effect gone, its value down to 0) and it
// has none of it left, the active GM's client gives it the next condition for its time, the mark used up.

import { immunityEffect } from "../../pf2e-automatic-ability-resolution/src/live/auras.js";
import { afterEndsEffectSource, afterEndsMarkSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

const marksOf = (actor, slug) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.afterEnds?.when === slug);

export function setUpAfterEnds() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markAfterEnds(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | after-ends mark`, error));
        backlashAfterApplied(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | backlash`, error));
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
        // (A temporary immunity from then on, Captivating Bauble's 24 hours once its fascination ends: the ability module's own "Immune:" Effect.)
        if (then.immunity) {
            const time = { worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null };
            const [immune] = await actor.createEmbeddedDocuments("Item", [immunityEffect(ABILITY_ID, then.immunity, { ability: { name: item.name, slug: then.immunity.slug, img: item.img }, source: { actorUuid: mark.system?.context?.origin?.actor ?? null, name: "" }, time })]);
            given.push(immune);
            continue;
        }
        const [effect] = await actor.createEmbeddedDocuments("Item", [afterEndsEffectSource(then, { item, user: { actorUuid: mark.system?.context?.origin?.actor ?? actor.uuid }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        given.push(effect);
    }
    return given;
}

// (Its user's backlash once the card is applied, Celestial Peachwood Sword's 1d6 void per level of each undead it destroyed — plan.backlash, src/
// compiler/after-ends.js withAfterApplied: rolled on its user for each creature of those degrees, by that creature's level.)
export async function backlashAfterApplied({ state, targets }) {
    const backlash = state?.plan?.backlash;
    const user = backlash && state.source?.actorUuid ? await fromUuid(state.source.actorUuid).catch(() => null) : null;
    if (!user?.applyDamage) return [];
    const [count, faces] = String(backlash.perLevel).split("d").map(Number);
    const DamageRoll = (CONFIG.Dice?.rolls ?? []).find((roll) => roll?.name === "DamageRoll");
    const rolls = [];
    for (const target of (targets ?? []).filter((one) => backlash.degrees.includes(one.degree))) {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        const level = Math.max(1, Number(actor?.level ?? actor?.system?.details?.level?.value) || 1);
        const roll = await new DamageRoll(`${count * level}d${faces}[${backlash.type}]`).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: user }), flavor: `<strong>${state.ability?.name ?? "Backlash"}</strong>: backlash for destroying ${target.name ?? "the creature"} (level ${level})` });
        await user.applyDamage({ damage: roll, token: state.source.tokenUuid ? (await fromUuid(state.source.tokenUuid).catch(() => null)) ?? undefined : undefined });
        rolls.push(roll);
    }
    return rolls;
}
