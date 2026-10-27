// Live play for plan.heldCounteract (src/compiler/legend-readings.js, 2026-10-27: Halcyon Heart's net, "The net also attempts to counteract
// teleportation effects and planar travel of the creature it's entrapping"): once the ability module's card at the creature is applied (its
// "applied" hook, on the GM's client), the counteract card at each creature of a degree it's for — the creature hit, the net holding it —,
// kept for when it tries to teleport or travel the planes, its traits given for a fortune against some kinds (the net's against a demon).

import { postCounteractAt } from "./counteract.js";
import { ABILITY_ID, MODULE_ID } from "./foundry.js";

// The card's results it's for: { degrees } and [{ degree, actorUuid }] → those targets. Pure.
export const heldBy = (held, targets) => (held ? (targets ?? []).filter((target) => (held.degrees ?? ["success", "criticalSuccess"]).includes(target.degree) && target.actorUuid) : []);

export function setUpHitCounteract() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        counteractHeld(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | held counteract`, error));
    });
}

export async function counteractHeld({ state, targets }) {
    const held = state?.plan?.heldCounteract;
    const item = { name: state?.ability?.name ?? state?.plan?.source?.name ?? "The item", uuid: state?.ability?.uuid ?? null };
    const user = { actorUuid: state?.source?.actorUuid ?? null, tokenUuid: state?.source?.tokenUuid ?? null, name: state?.source?.name ?? null };
    const posted = [];
    for (const target of heldBy(held, targets)) {
        const actor = await fromUuid(target.actorUuid).catch(() => null);
        if (!actor) continue;
        const traits = [...(actor.traits ?? new Set(actor.system?.traits?.value ?? []))];
        posted.push(await postCounteractAt({ counteract: { ...held.counteract, struckTraits: traits }, item, user, drinkers: [{ actorUuid: actor.uuid, tokenUuid: target.tokenUuid ?? null, name: target.name ?? actor.name }] }));
    }
    return posted;
}
