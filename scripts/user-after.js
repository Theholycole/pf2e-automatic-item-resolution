// Live play for plan.userAfter (src/live/user-after.js: Soulfeeding Mask's Devour Soul, Quickened for a minute once a creature takes its
// damage). Once the ability module's card is applied (its "applied" hook, on the GM's client), a creature of those degrees gives the card's
// user that Effect — its words for a slain creature's when one is at 0 Hit Points.

import { userAfterEarned, userAfterSource } from "../src/live/user-after.js";
import { ABILITY_ID, MODULE_ID } from "./foundry.js";

export function setUpUserAfter() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        userAfterApplied(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | user after`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, degree }] }.
export async function userAfterApplied({ state, targets }) {
    const after = state?.plan?.userAfter;
    if (!after || !state.source?.actorUuid) return null;
    const seen = await Promise.all((targets ?? []).map(async (target) => {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        const hp = Number(actor?.attributes?.hp?.value ?? actor?.system?.attributes?.hp?.value);
        return { degree: target.degree ?? "success", hp: Number.isFinite(hp) ? hp : null };
    }));
    const { earned, slain } = userAfterEarned(after, seen);
    if (!earned) return null;
    const user = await fromUuid(state.source.actorUuid).catch(() => null);
    if (!user?.createEmbeddedDocuments) return null;
    const item = { name: state.ability?.name ?? state.plan.source?.name ?? "The item", uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
    const [effect] = await user.createEmbeddedDocuments("Item", [userAfterSource(after, { slain, item, user: { actorUuid: user.uuid, tokenUuid: state.source.tokenUuid ?? null }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
    return effect ?? null;
}
