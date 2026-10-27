// Live play for a weapon's soul binding when its damage fells a creature (src/compiler/soul-binding.js: Whisperer of Souls, "whenever you
// reduce a sapient creature of 18th level or higher to 0 Hit Points … the creature must attempt a DC 50 Fortitude save"): through the core's
// damage patch (as scripts/felled.js), on the GM's client — damage whose item is such a weapon, at a sapient creature of that level or higher
// with Hit Points left, and once it's applied the creature at 0: the ability module's save card at it, its wielder the source. Its critical
// hits are the weapon's critical-hit riders (scripts/rune-strikes.js).

import { riderFits, soulBindingRiders } from "../src/compiler/rune-strikes.js";
import { creatureOf } from "./rune-strikes.js";
import { ABILITY_ID, CORE_ID, MODULE_ID } from "./foundry.js";

export function setUpSoulBinding() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (damage?.onApply) damage.onApply({ module: MODULE_ID, name: "soul-binding", before });
}

// (PF2e applies the damage to the creature: its Hit Points afterwards are its own.)
export function before(actor, params) {
    if (!game.user.isGM) return null;
    const weapon = params?.item ?? null;
    if (weapon?.type !== "weapon" || !weapon.actor) return null;
    const riders = soulBindingRiders(weapon).filter((rider) => rider.on === "felled" && riderFits(rider, creatureOf(actor)));
    if (!riders.length || (Number(actor.system?.attributes?.hp?.value) || 0) <= 0) return null;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        if ((Number(live.system?.attributes?.hp?.value) || 0) > 0) return;
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const token = live.getActiveTokens?.(true, true)?.[0] ?? live.token ?? null;
        const wielder = weapon.actor;
        if (!postCard || !token) return;
        for (const rider of riders) await postCard({ plan: rider.plan, item: { name: weapon.name, uuid: weapon.uuid }, sourceActor: wielder, sourceToken: wielder.getActiveTokens?.(true, true)?.[0] ?? null, tokens: [token.object ?? token], cause: "reduced to 0 Hit Points" });
    };
}
