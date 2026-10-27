// Live play for plan.item.afterRest (2026-10-27, src/compiler/relic-readings.js: Vile Remnant's Hear My Words, "the next time you sleep, you
// endure horrific nightmares and must succeed at a … Will save upon waking to avoid becoming Stupefied 1 for 24 hours"): kept on its user as
// it's used (flag afterRest); at its next rest (PF2e's pf2e.restForTheNight, the active GM's client), the ability module's save card of its
// plan at its user, and it's gone.

import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

const AFTER_REST = "afterRest";

// As it's used → the card's line.
export async function rememberAfterRest(entry, { actor, used }) {
    await actor.setFlag(MODULE_ID, AFTER_REST, [...(actor.getFlag(MODULE_ID, AFTER_REST) ?? []), { ...entry, item: { name: used?.data?.name ?? entry.item?.name ?? "The item", uuid: used?.data?.uuid ?? null } }]);
    return `${entry.words}: its card at ${actor.name}'s next rest.`;
}

async function afterRest(actor) {
    const entries = actor?.getFlag?.(MODULE_ID, AFTER_REST) ?? [];
    if (!entries.length) return;
    await actor.unsetFlag(MODULE_ID, AFTER_REST);
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const token = actor.getActiveTokens?.(true, true)?.[0] ?? null;
    for (const entry of entries) {
        if (postCard && token) await postCard({ plan: entry.plan, item: entry.item, sourceActor: actor, sourceToken: token.object ?? token, tokens: [token.object ?? token], cause: `${entry.item.name}: on waking` });
        else await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")).map((user) => user.id), content: `<p><strong>${entry.item.name}</strong>: on waking, ${entry.words} (roll it by hand: no token on this scene).</p>` });
    }
}

export function setUpAfterRest() {
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (isActiveGM()) afterRest(actor).catch((error) => console.error(`${MODULE_ID} | after rest`, error));
    });
}
