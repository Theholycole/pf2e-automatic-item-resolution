// Live play for a save's afterDamage (2026-10-27, src/compiler/artifact-readings.js: Horn of Rust's "A creature damaged by this aura is exposed
// to a potent form of tetanus … DC 19 Fortitude save"): once the ability module's card for that save has applied (its "applied" hook, on the
// active GM's client), each creature of the degrees that took its damage gets its own save card for what follows — the tetanus's Fortitude
// save, at that creature (plan.struckToken: no targeting needed), its affliction handed on as a poison's is (scripts/poisons.js).

import { createExposureCard, exposureCardHTML } from "../src/live/poison-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, isActiveGM } from "./foundry.js";

// The applied card's targets of those degrees → the save cards' plans, one each. Pure.
export function afterDamagePlans(afterDamage, targets) {
    if (!afterDamage?.plan) return [];
    return (targets ?? []).filter((target) => target.tokenUuid && (afterDamage.degrees ?? []).includes(target.degree)).map((target) => ({ plan: { ...afterDamage.plan, struckToken: target.tokenUuid }, name: target.name ?? "the creature" }));
}

export function setUpAfterDamage() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!isActiveGM()) return;
        postAfterDamage(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | after damage`, error));
    });
}

async function postAfterDamage({ state, targets }) {
    const afterDamage = state?.plan?.afterDamage;
    if (!afterDamage) return;
    const item = { name: afterDamage.plan.source?.name ?? state.ability?.name ?? "The item", uuid: state.ability?.uuid ?? null };
    const user = { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? item.name };
    for (const { plan } of afterDamagePlans(afterDamage, targets)) {
        const card = createExposureCard({ plan, item, user });
        await ChatMessage.create({ content: exposureCardHTML(card, { canApply: true }), flags: { [MODULE_ID]: { [FLAG]: card } } });
    }
}
