// Live play for an Effect that ends when its creature gives itself away (src/compiler/camouflage.js: Camouflage Dye). Its PF2e RollOptions say
// how: "air-ends-on:hostile" — on the active GM's client, after an attack roll, a damage roll or a spell cast by that creature (its chat
// message) — and "air-ends-on:long-move" — after Foundry moves its token farther than half its land Speed (the "moveToken" hook, as
// scripts/move-damage.js reads it). The Effect goes, and its Hidden and Undetected with it. (And "air-ends-on:<condition>", Ring of the Weary
// Traveler's fatigue ignored — src/compiler/fatigue-ignored.js —: when PF2e gives the creature that condition again, the Effect goes, and the
// condition's penalties are back.) And "air-ends-on:targeted" — its creature subject to a hostile act, src/live/targeted.js: an attack roll at it,
// a save it rolls, damage it takes (PF2e's damageTaken), none of them its own source's — Flawed Orb of Gold Dragonkind's stun (2026-10-27).

import { movedFarEnough } from "./move-damage.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";
import { endsFor, hostileAt } from "../src/live/targeted.js";

const HOSTILE = new Set(["attack-roll", "spell-attack-roll", "damage-roll", "spell-cast"]);

// Its Effects that end on that kind of thing.
export function endingOn(actor, kind) {
    return (actor?.itemTypes?.effect ?? []).filter((effect) => (effect.system?.rules ?? []).some((rule) => rule?.key === "RollOption" && rule.option === `air-ends-on:${kind}`));
}

// Whether a chat message is one of a creature's hostile actions: an attack roll, a damage roll, or a spell cast.
export const isHostileMessage = (message) => HOSTILE.has(message?.flags?.pf2e?.context?.type) || Boolean(message?.flags?.pf2e?.casting && message?.flags?.pf2e?.origin?.type === "spell");
// (Or only an attack or a damage roll, "air-ends-on:attack" — Corpseward Pendant's ward, which a spell that harms no one doesn't end, 2026-10-27.)
const ATTACKS = new Set(["attack-roll", "spell-attack-roll", "damage-roll"]);
export const isAttackMessage = (message) => ATTACKS.has(message?.flags?.pf2e?.context?.type);

async function endThem(actor, effects, why, { unhide = true } = {}) {
    const ids = effects.map((effect) => effect.id).filter((id) => actor.items?.get?.(id));
    if (!ids.length) return;
    await actor.deleteEmbeddedDocuments("Item", ids);
    if (unhide) for (const slug of ["hidden", "undetected"]) if (actor.hasCondition?.(slug)) await actor.decreaseCondition(slug, { forceRemove: true });
    const names = [...new Set(effects.map((effect) => String(effect.name ?? "").replace(/:.*$/, "")))].join(", ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${names}</strong> ends: ${actor.name} ${why}${unhide ? ", and it's no longer Hidden or Undetected" : ""}.</p>` });
}

export function setUpEndsOnHostile() {
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM() || !isHostileMessage(message)) return;
        const actor = message.actor ?? ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
        const effects = endingOn(actor, "hostile");
        if (effects.length) endThem(actor, effects, "used a hostile action").catch((error) => console.error(`${MODULE_ID} | ends on hostile`, error));
        const attacked = isAttackMessage(message) ? endingOn(actor, "attack") : [];
        if (attacked.length) endThem(actor, attacked, "attacked or dealt damage", { unhide: false }).catch((error) => console.error(`${MODULE_ID} | ends on an attack`, error));
    });
    // (Its creature subject to a hostile act: an attack at it or a save it rolls — not its own source's —, or damage it takes.)
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM()) return;
        const roller = message.actor ?? ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
        const found = hostileAt(message.flags?.pf2e?.context, roller?.uuid ?? null);
        if (!found) return;
        const origin = message.flags?.pf2e?.origin?.uuid ? fromUuidSync(message.flags.pf2e.origin.uuid)?.name ?? null : message.item?.name ?? null;
        for (const uuid of new Set(found.at)) {
            const doc = fromUuidSync(uuid);
            const actor = doc?.actor ?? doc;
            const effects = endingOn(actor, "targeted").filter((effect) => endsFor(effect.name, origin));
            if (effects.length) endThem(actor, effects, "was subject to a hostile act", { unhide: false }).catch((error) => console.error(`${MODULE_ID} | ends when targeted`, error));
        }
    });
    Hooks.on("updateActor", (actor, changed, options) => {
        if (!isActiveGM() || !(Number(options?.damageTaken) > 0) || options?.damageUndo) return;
        const effects = endingOn(actor, "targeted");
        if (effects.length) endThem(actor, effects, "took damage", { unhide: false }).catch((error) => console.error(`${MODULE_ID} | ends on damage`, error));
    });
    Hooks.on("createItem", (item) => {
        if (!isActiveGM() || item?.type !== "condition" || !item.slug) return;
        const actor = item.parent;
        const effects = endingOn(actor, item.slug);
        if (effects.length) endThem(actor, effects, `became ${item.slug} again`, { unhide: false }).catch((error) => console.error(`${MODULE_ID} | ends on ${item.slug}`, error));
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
