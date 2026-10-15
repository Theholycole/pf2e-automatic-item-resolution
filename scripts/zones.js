// Live play for a lasting area or a snare (the zone builtin): the ability module's zone, placed on the scene, acting
// on the creatures entering or staying in it (its api.live.startZone; a snare once, for the first creature). Without
// that export, the GM places it by hand.

import { ABILITY_ID } from "./foundry.js";

export async function startItemZone({ plan, used, actor, token }) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    // (The item may be used up already: its name, uuid and actor are all the zone needs.)
    const item = { name: used.data.name, uuid: used.data.uuid ?? null, actor, img: used.data.img ?? null };
    if (startZone) return startZone({ item, plan, sourceToken: token?.document ?? token });
    const what = plan.zone?.once ? "Set the snare in a square within reach; the first creature to enter it attempts its save." : "Mark its area on the scene.";
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${used.data.name}</strong>: ${what} (the ability module's zones aren't there to place it).</p>`
    });
}
