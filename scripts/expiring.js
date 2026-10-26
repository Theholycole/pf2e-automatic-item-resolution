// Items the module made that wither after a time (src/live/card.js createdItemSource: Verdant Branch's fruits, 10 minutes): each flagged with
// the world time it ends at; the active GM's client removes them once the world's time passes it (Foundry's updateWorldTime, which a
// combat's rounds advance), from the world's actors and the scenes' unlinked tokens.

import { MODULE_ID, isActiveGM } from "./foundry.js";

const expired = (actor, worldTime) => (actor?.items?.contents ?? [...(actor?.items ?? [])]).filter((item) => {
    const endsAt = Number(item.flags?.[MODULE_ID]?.expiresAt);
    return Number.isFinite(endsAt) && worldTime >= endsAt;
});

export async function expireItems(worldTime) {
    // (Foundry's collections have no flatMap: spread first.)
    const actors = [...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap((scene) => (scene.tokens?.contents ?? [...(scene.tokens ?? [])]).filter((token) => !token.actorLink && token.actor).map((token) => token.actor))];
    for (const actor of actors) {
        const ids = expired(actor, worldTime).map((item) => item.id);
        if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    }
}

// (Made weapons whose runes lower after a time, Armory Bracelet's after its minute: those runes then.)
const lowering = (actor, worldTime) => (actor?.items?.contents ?? [...(actor?.items ?? [])]).filter((item) => {
    const at = Number(item.flags?.[MODULE_ID]?.made?.downgradeAt);
    return Number.isFinite(at) && worldTime >= at;
});
export async function lowerMadeRunes(worldTime) {
    const actors = [...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap((scene) => (scene.tokens?.contents ?? [...(scene.tokens ?? [])]).filter((token) => !token.actorLink && token.actor).map((token) => token.actor))];
    for (const actor of actors) {
        for (const item of lowering(actor, worldTime)) {
            const down = item.flags[MODULE_ID].made.downgrade ?? {};
            await item.update({ "system.runes.potency": Number(down.potency) || 0, "system.runes.striking": Number(down.striking) || 0, [`flags.${MODULE_ID}.made.-=downgradeAt`]: null });
        }
    }
}

export function setUpExpiringItems() {
    Hooks.on("updateWorldTime", (worldTime) => {
        if (!isActiveGM()) return;
        expireItems(Number(worldTime) || 0).catch((error) => console.error(`${MODULE_ID} | expiring items`, error));
        lowerMadeRunes(Number(worldTime) || 0).catch((error) => console.error(`${MODULE_ID} | made weapons' runes`, error));
    });
}
