// Live play for places an item keeps (2026-10-27, src/live/embedded-places.js: Guiding Star Orb (Heroic)'s Embed Location): its user's place —
// its token's scene and square — recorded on the item, the oldest gone past its limit, and the card listing them for the teleportation spells
// cast with it to arrive at exactly.

import { embedCardHTML, PLACES, withPlace } from "../src/live/embedded-places.js";
import { MODULE_ID, entryOf } from "./foundry.js";

export async function postEmbedCard({ plan, used, actor, token }) {
    const own = token?.document ?? token ?? null;
    if (!own?.parent) throw new Error(`${used.data.name}: ${actor?.name ?? "its user"}'s token isn't on a scene to embed.`);
    const holder = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
    const before = holder?.getFlag?.(MODULE_ID, PLACES) ?? [];
    const place = { scene: own.parent.id, sceneName: own.parent.name, x: Number(own.x), y: Number(own.y), at: game.time.worldTime };
    const places = withPlace(before, place, plan.embed.max);
    const dropped = before.length + 1 > places.length ? before[0] : null;
    if (holder) await holder.setFlag(MODULE_ID, PLACES, places);
    return ChatMessage.create({ content: embedCardHTML({ item: { name: used.data.name }, user: entryOf(token, actor), places, embed: plan.embed, dropped }), speaker: ChatMessage.getSpeaker({ actor }) });
}
