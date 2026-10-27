// Live play for mark.endsOnDeath (src/compiler/special-sentences.js: Hunter's Dawn's mark, "persists until … the creature dies, or a new
// target is marked"): once a creature PF2e counts dead (actor.isDead), on the active GM's client, every mark Effect at its tokens that ends
// so is deleted from whoever holds it (src/live/card.js marksEndingAt); a new mark replacing the old is scripts/live.js's own.

import { MODULE_ID, isActiveGM } from "./foundry.js";
import { marksEndingAt } from "../src/live/card.js";

async function endMarksAt(actor) {
    const tokens = (actor?.getActiveTokens?.(false, true) ?? []).map((token) => token.uuid ?? token.document?.uuid).filter(Boolean);
    if (actor?.token?.uuid) tokens.push(actor.token.uuid);
    if (!tokens.length) return;
    for (const holder of [...(game.actors ?? []), ...(canvas?.scene?.tokens?.contents ?? []).filter((token) => !token.actorLink).map((token) => token.actor)].filter(Boolean)) {
        const ids = marksEndingAt(holder.itemTypes?.effect ?? [], tokens, MODULE_ID);
        if (!ids.length) continue;
        await holder.deleteEmbeddedDocuments("Item", ids);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: holder }), content: `<p>${holder.name}'s mark on ${actor.name} ends: it died.</p>` });
    }
}

export function setUpMarkEnds() {
    const check = (actor) => {
        if (!isActiveGM() || !actor?.isDead) return;
        endMarksAt(actor).catch((error) => console.error(`${MODULE_ID} | mark ends`, error));
    };
    Hooks.on("updateActor", (actor, changed) => {
        if (changed?.system?.attributes?.hp?.value !== undefined) check(actor);
    });
    Hooks.on("createItem", (item) => {
        if (item?.type === "condition" && ["dying", "dead"].includes(item.slug)) check(item.parent);
    });
    Hooks.on("updateItem", (item) => {
        if (item?.type === "condition" && item.slug === "dying") check(item.parent);
    });
}
