// Live play for an Effect that ends when its creature gives itself away (src/compiler/camouflage.js: Camouflage Dye). Its PF2e RollOptions say
// how: "air-ends-on:hostile" — on the active GM's client, after an attack roll, a damage roll or a spell cast by that creature (its chat
// message) — and "air-ends-on:long-move" — after Foundry moves its token farther than half its land Speed (the "moveToken" hook, as
// scripts/move-damage.js reads it). The Effect goes, and its Hidden and Undetected with it.

import { movedFarEnough } from "./move-damage.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const HOSTILE = new Set(["attack-roll", "spell-attack-roll", "damage-roll", "spell-cast"]);

// Its Effects that end on that kind of thing.
export function endingOn(actor, kind) {
    return (actor?.itemTypes?.effect ?? []).filter((effect) => (effect.system?.rules ?? []).some((rule) => rule?.key === "RollOption" && rule.option === `air-ends-on:${kind}`));
}

// Whether a chat message is one of a creature's hostile actions: an attack roll, a damage roll, or a spell cast.
export const isHostileMessage = (message) => HOSTILE.has(message?.flags?.pf2e?.context?.type) || Boolean(message?.flags?.pf2e?.casting && message?.flags?.pf2e?.origin?.type === "spell");

async function endThem(actor, effects, why) {
    const ids = effects.map((effect) => effect.id).filter((id) => actor.items?.get?.(id));
    if (!ids.length) return;
    await actor.deleteEmbeddedDocuments("Item", ids);
    for (const slug of ["hidden", "undetected"]) if (actor.hasCondition?.(slug)) await actor.decreaseCondition(slug, { forceRemove: true });
    const names = [...new Set(effects.map((effect) => String(effect.name ?? "").replace(/:.*$/, "")))].join(", ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${names}</strong> ends: ${actor.name} ${why}, and it's no longer Hidden or Undetected.</p>` });
}

export function setUpEndsOnHostile() {
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM() || !isHostileMessage(message)) return;
        const actor = message.actor ?? ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
        const effects = endingOn(actor, "hostile");
        if (effects.length) endThem(actor, effects, "used a hostile action").catch((error) => console.error(`${MODULE_ID} | ends on hostile`, error));
    });
    Hooks.on("moveToken", (token, movement) => {
        if (!isActiveGM()) return;
        const actor = token?.actor;
        const effects = endingOn(actor, "long-move");
        if (!effects.length) return;
        const feet = Number(movement?.passed?.distance) || 0;
        const speed = Number(actor.system?.movement?.speeds?.land?.value ?? actor.system?.attributes?.speed?.total ?? actor.system?.attributes?.speed?.value) || 0;
        if (speed && movedFarEnough(feet, speed, true)) endThem(actor, effects, `moved ${feet} feet, more than half its Speed`).catch((error) => console.error(`${MODULE_ID} | ends on a long move`, error));
    });
}
