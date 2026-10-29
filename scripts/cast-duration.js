// Live play for plan.castDuration (src/compiler/cast-duration.js: Dust of Disappearance's 1-minute Invisibility, Crown of the Master's
// 8-hour Dominate). The spell module's cast (api.castFromItem) makes its Effects with the cast spell as their origin item; each of those is
// set to the item's duration — those made as it's cast, at once (rememberCastDuration), and those made later, as its card is applied, from
// the cast message's mark (PF2e's createItem, on the active GM's client).

import { castDurationAt } from "../src/compiler/cast-duration.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const originOf = (effect) => effect?.system?.context?.origin?.item ?? null;
const update = (time) => ({ "system.duration.value": time.value, "system.duration.unit": time.unit, ...(time.unit === "unlimited" ? { "system.duration.expiry": null } : {}) });

export function setUpCastDurations() {
    Hooks.on("createItem", (item) => {
        if (item?.type !== "effect" || !isActiveGM()) return;
        const origin = originOf(item);
        if (!origin) return;
        const mark = game.messages.contents.slice(-100).reverse().map((message) => message.flags?.[MODULE_ID]?.castDuration).find((entry) => entry?.spellUuid === origin);
        if (mark && (item.system?.duration?.value !== mark.value || item.system?.duration?.unit !== mark.unit)) item.update(update(mark)).catch((error) => console.error(`${MODULE_ID} | cast duration`, error));
    });
}

// After the cast: the mark on its message, and the Effects already made on the caster and its targets set to the duration. → a line or none.
export async function rememberCastDuration(cast, castDuration, { actor, targets = [] } = {}) {
    let time = castDurationAt(castDuration, actor?.level);
    if (!time || !cast?.spellUuid) return null;
    // (A time the item rolls, Pistol of Wonder's Cloak of Colors "with a duration of 1d10 rounds": castDuration.valueRoll, rolled now, its
    // roll in the chat — 2026-10-28.)
    if (typeof castDuration?.valueRoll === "string" && castDuration.valueRoll.trim() && !castDuration.atLevel) {
        const roll = await new Roll(castDuration.valueRoll).evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Its time (${castDuration.valueRoll} ${time.unit})` });
        time = { ...time, value: Math.max(1, Number(roll.total) || 1) };
    }
    if (cast.message) await cast.message.setFlag(MODULE_ID, "castDuration", { spellUuid: cast.spellUuid, ...time }).catch(() => null);
    const actors = [actor, ...targets.map((token) => token?.actor ?? token?.document?.actor ?? null)].filter(Boolean);
    for (const one of new Set(actors)) for (const effect of (one.itemTypes?.effect ?? []).filter((entry) => originOf(entry) === cast.spellUuid)) await effect.update(update(time));
    return time.unit === "unlimited" ? "It lasts with no time limit." : `It lasts ${time.value} ${time.value === 1 ? time.unit.replace(/s$/, "") : time.unit}.`;
}
