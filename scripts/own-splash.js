// Live play for plan.splash on an item's own attack (src/compiler/thrown.js: Lady's Chalice's "2 spirit splash damage (including to you, if
// you're evil)"). Once the ability module's attack card is applied (its "applied" hook, on the GM's client), a hit or a failure posts the bomb
// card's splash list, as a Strike's splash does (scripts/strikes.js): the creatures within 5 feet of the target — and the target itself on a
// failure — each ticked for the splash, its user among them only when it has one of the traits the text names.

import { bombCardHTML, createBombCard } from "../src/live/bomb-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, creaturesNear, entryOf } from "./foundry.js";

const SPLASHED = new Set(["criticalSuccess", "success", "failure"]);
const traitsOf = (actor) => new Set([...(actor?.system?.traits?.value ?? []), ...(actor?.traits ?? [])].map((trait) => String(trait).toLowerCase()));

export function setUpOwnSplash() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        postOwnSplash(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | splash`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, tokenUuid, degree }] } — a splash card for each target hit or missed (not critically).
export async function postOwnSplash({ state, targets }) {
    const splash = state?.plan?.splash;
    if (!splash) return [];
    const user = { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? "Its user" };
    const userActor = user.actorUuid ? await fromUuid(user.actorUuid).catch(() => null) : null;
    const selfSplashed = (splash.selfOnlyIf ?? []).some((trait) => traitsOf(userActor).has(trait));
    const posted = [];
    for (const target of (targets ?? []).filter((one) => SPLASHED.has(one.degree))) {
        const token = target.tokenUuid ? await fromUuid(target.tokenUuid).catch(() => null) : null;
        if (!token?.actor) continue;
        const near = creaturesNear(token, 5).filter((entry) => entry.actorUuid !== user.actorUuid || selfSplashed);
        if (!near.length && target.degree !== "failure") continue;
        const card = createBombCard({ plan: { source: state.plan.source ?? null }, item: { name: state.ability?.name ?? state.plan.source?.name ?? "The item", uuid: state.ability?.uuid ?? null }, user, target: entryOf(token.object ?? token, token.actor), outcome: target.degree, splash: [{ type: splash.damageType, total: splash.value }], near });
        posted.push(await ChatMessage.create({ content: bombCardHTML(card, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor: userActor ?? undefined }), flags: { [MODULE_ID]: { [FLAG]: card } } }));
    }
    return posted;
}
