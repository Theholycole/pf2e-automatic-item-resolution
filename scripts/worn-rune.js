// Live play for a rune worn on its wearer's armor (src/compiler/worn-rune.js: Forgefather's Seal, etched onto the worn armor or worn in the
// inventory, 2026-10-29): its passive's PF2e Effect (Effect: Forgefather's Seal — fire resistance 40, the armor's check and Speed penalties
// ignored, +1 to a light or medium armor's AC), which PF2e gives no one, kept on the wearer while it's worn, on the active GM's client. Given
// as the armor is worn or the seal etched or put on, gone once it isn't — only the one given here: one put on by hand stays, and none is given
// beside it. Looked at again at each of its turns' start (a seal worn before this, or an Effect deleted while it's still worn).

import { wornEffectChanges, wornRunes } from "../src/compiler/worn-rune.js";
import { isRuneItem } from "../src/compiler/runes.js";
import { effectSource } from "../src/live/card.js";
import { MODULE_ID, isActiveGM, originOptionsOf } from "./foundry.js";

const GIVEN = "wornRune";
const queues = new Map();

// runes: PF2e's rune items by key (src/compiler/runes.js runeIndex), read as it's needed (it's indexed at ready).
export function setUpWornRunes({ runes = () => new Map() } = {}) {
    // (Its armor's or a rune's changes: not an Effect's, so the Effect it gives or ends doesn't look again.)
    const changed = (item) => {
        if (!item?.actor || !isActiveGM() || !(item.type === "armor" || isRuneItem(item))) return;
        keep(item.actor, runes());
    };
    for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, changed);
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (combatant?.actor && isActiveGM()) keep(combatant.actor, runes());
    });
}

// One look at a time for each creature, in turn.
function keep(actor, index) {
    const next = (queues.get(actor.uuid) ?? Promise.resolve()).then(() => keepNow(actor, index)).catch((error) => console.error(`${MODULE_ID} | worn rune`, error));
    queues.set(actor.uuid, next);
    return next;
}

async function keepNow(actor, index) {
    const runes = wornRunes({ armor: actor.wornArmor ?? null, items: actor.itemTypes?.equipment ?? [] }, index);
    const effects = (actor.itemTypes?.effect ?? []).map((effect) => ({ id: effect.id, given: effect.flags?.[MODULE_ID]?.[GIVEN] ?? null, source: effect._stats?.compendiumSource ?? effect.flags?.core?.sourceId ?? null }));
    const { add, remove } = wornEffectChanges(runes, effects);
    if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
    const sources = [];
    for (const { uuid, rune } of add) {
        const template = await fromUuid(uuid).catch(() => null);
        if (!template) continue;
        const source = effectSource(template.toObject(), { item: { name: rune.name, uuid: rune.holder.uuid ?? null }, user: { actorUuid: actor.uuid }, originOptions: originOptionsOf(rune.holder.uuid, actor.uuid), worldTime: game.time.worldTime, flags: { [MODULE_ID]: { [GIVEN]: uuid } } });
        source._stats = { ...(source._stats ?? {}), compendiumSource: uuid };
        sources.push(source);
    }
    if (sources.length) await actor.createEmbeddedDocuments("Item", sources);
}
