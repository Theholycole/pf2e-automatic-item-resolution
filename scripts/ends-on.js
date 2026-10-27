// Live play for bonus.endsOn (src/compiler/readied-bonus.js: Scale of Igroon's "This bonus ends if you Activate another ability or use the
// Shield Block reaction"). A readied Effect flagged endsOn ends at its creature's next item activation through this module (another item's, or
// another of the same item's activations: scripts/activations.js calls endOnActivate before its card), and at its next Shield Block — PF2e's
// applyDamage with shieldBlockRequest, which the core's damage listener (its patches.damage.onApply) sees.

import { MODULE_KEY } from "../src/live/fortune-card.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const ending = (actor, kind) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.endsOn?.[kind]);

// An activation by its creature: its readied Effects that end then (the one this activation gives comes later, once its card is applied).
export async function endOnActivate(actor) {
    const gone = ending(actor, "activate");
    if (gone.length) await actor.deleteEmbeddedDocuments("Item", gone.map((effect) => effect.id)).catch(() => null);
    return gone.map((effect) => effect.name);
}

export function setUpEndsOn() {
    game.modules.get(CORE_ID)?.api?.patches?.damage?.onApply?.({
        module: MODULE_ID,
        name: "ends-on-shield-block",
        before: (actor, params) => {
            if (!params?.shieldBlockRequest) return null;
            const gone = ending(actor, "shieldBlock");
            if (!gone.length) return null;
            return async () => {
                const live = fromUuidSync(actor.uuid) ?? actor;
                const ids = gone.map((effect) => effect.id).filter((id) => live.items?.get?.(id));
                if (ids.length) await live.deleteEmbeddedDocuments("Item", ids).catch(() => null);
            };
        }
    });
}
