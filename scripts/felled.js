// Live play for plan.felled (src/compiler/after-ends.js withFelledReward: Doom Switch's Bragging Rights). Once the ability module's card at the
// creature is applied (its "applied" hook, on the GM's client), each creature of a rewarded degree is marked for the reward's time. Damage its
// user deals it (the core's applyDamage listener: the damage's item is its user's) that leaves it at 0 Hit Points gives its user that many
// temporary Hit Points (its level, or twice it) for their time — PF2e's TempHP on an Effect — and the mark is used up.

import { drainTempSource, felledMarkSource } from "../src/live/card.js";
import { ABILITY_ID, CORE_ID, MODULE_ID } from "./foundry.js";

const markOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.felled && !(effect.isExpired ?? effect.system?.expired)) ?? null;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpFelled() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markFelled(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | felled mark`, error));
    });
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (damage?.onApply) damage.onApply({ module: MODULE_ID, name: "felled", before });
}

// The card applied: { state, targets: [{ actorUuid, degree }] } — a mark on each creature of a degree the reward is for.
export async function markFelled({ state, targets }) {
    const felled = state?.plan?.felled;
    if (!felled) return [];
    const user = { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? null };
    const item = { name: state.ability?.name ?? state.plan.source?.name ?? "The item", uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
    const marked = [];
    for (const target of targets ?? []) {
        const multiplier = felled.temp?.[target.degree];
        const actor = multiplier && target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor?.createEmbeddedDocuments) continue;
        await markOf(actor)?.delete();
        const [mark] = await actor.createEmbeddedDocuments("Item", [felledMarkSource(felled, multiplier, { item, user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        marked.push(mark);
    }
    return marked;
}

// (PF2e applies the damage to the creature: its Hit Points afterwards are its own.)
export function before(actor, params) {
    if (!game.user.isGM) return null;
    const mark = markOf(actor);
    const felled = mark?.flags?.[MODULE_ID]?.felled;
    const dealer = params?.item?.actor ?? null;
    if (!felled?.userUuid || !dealer || dealer.uuid !== felled.userUuid) return null;
    const hp = Number(actor.system?.attributes?.hp?.value) || 0;
    if (hp <= 0) return null;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        if ((Number(live.system?.attributes?.hp?.value) || 0) > 0) return;
        const user = await fromUuid(felled.userUuid).catch(() => null);
        if (!user?.createEmbeddedDocuments) return;
        const level = Math.max(0, Number(live.level ?? live.system?.details?.level?.value) || 0);
        const amount = level * (Number(felled.multiplier) || 1);
        await mark.delete();
        if (amount > 0) {
            const item = { name: mark.name.replace(/: marked for defeat$/, ""), uuid: mark.system?.context?.origin?.item ?? null, img: mark.img ?? null };
            await user.createEmbeddedDocuments("Item", [drainTempSource(amount, { item, user: { actorUuid: user.uuid }, start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null }, duration: felled.tempLasts, moduleId: MODULE_ID })]);
        }
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user }), content: `<p><strong>${escape(user.name)}</strong> fells <strong>${escape(live.token?.name ?? live.name)}</strong> (${escape(mark.name.replace(/: marked for defeat$/, ""))}): ${amount} temporary Hit Points.</p>` });
    };
}
