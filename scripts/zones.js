// Live play for a lasting area or a snare (the zone builtin): the ability module's zone, placed on the scene, acting
// on the creatures entering or staying in it (its api.live.startZone; a snare once, for the first creature). Without
// that export, the GM places it by hand. And a creature the item becomes (the conjure builtin, src/compiler/conjured.js):
// the ability module's conjured token beside its user (its api.live.startConjure), or the GM's by hand.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";
import { effectSource } from "../src/live/card.js";

export async function startItemZone({ plan, used, actor, token }) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    // (The item may be used up already: its name, uuid and actor are all the zone needs.)
    const item = { name: used.data.name, uuid: used.data.uuid ?? null, actor, img: used.data.img ?? null };
    // (Its user's own PF2e Effect beside the zone, src/compiler/aura-zones.js: Horn of Rust's +1 item bonus to AC.)
    if (plan.ownEffect?.uuid && actor) {
        const template = await fromUuid(plan.ownEffect.uuid).catch(() => null);
        if (template) await actor.createEmbeddedDocuments("Item", [effectSource(template.toObject(), { item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: { actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null }, worldTime: game.time.worldTime, flags: { [MODULE_ID]: { card: true } } })]);
    }
    if (startZone) return startZone({ item, plan, sourceToken: token?.document ?? token });
    const what = plan.zone?.once ? "Set the snare in a square within reach; the first creature to enter it attempts its save." : "Mark its area on the scene.";
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${used.data.name}</strong>: ${what} (the ability module's zones aren't there to place it).</p>`
    });
}

export async function startItemConjure({ plan, used, actor, token }) {
    const startConjure = game.modules.get(ABILITY_ID)?.api?.live?.startConjure;
    const item = { name: used.data.name, uuid: used.data.uuid ?? null, actor, img: used.data.img ?? null };
    if (startConjure) return startConjure({ item, plan, sourceToken: token?.document ?? token });
    const names = (plan.creatures ?? []).map((creature) => `${creature.count > 1 ? `${creature.count} ` : ""}${creature.name}`).join(", ");
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${used.data.name}</strong>: place ${names} beside its user by hand (the ability module's conjuring isn't there).</p>`
    });
}
