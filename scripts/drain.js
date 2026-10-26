// Live play for plan.drain (src/compiler/drain.js: Blood-Drinker Blade (Greater)'s Exsanguinate). Once the ability module's card at the
// creature is applied (its "applied" hook, on the GM's client), each creature it damaged is marked for the item's time; the first damage of
// the drain's type it then takes (the core's applyDamage listener — its persistent bleed's tick) gives the item's user that share of what it
// lost, after resistances, as PF2e's TempHP on an Effect lasting the rest of that time. The mark is used up, and the GM and the user's owners
// are told.

import { drainMarkSource, drainTempSource } from "../src/live/card.js";
import { drained, shareOfType } from "../src/live/drain.js";
import { ABILITY_ID, CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const markOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.drain && !(effect.isExpired ?? effect.system?.expired)) ?? null;
const hpOf = (actor) => ({ value: actor?.system?.attributes?.hp?.value, temp: actor?.system?.attributes?.hp?.temp });
const DAMAGED = new Set(["success", "criticalSuccess", "failure", "criticalFailure"]);

export function setUpDrain() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markAfterApplied(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | drain mark`, error));
    });
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) {
        console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Exsanguinate's temporary Hit Points won't be given.`);
        return;
    }
    damage.onApply({ module: MODULE_ID, name: "drain", before });
}

// The card applied: { state, targets: [{ actorUuid, degree }] } — a mark on each creature whose row dealt the damage.
export async function markAfterApplied({ state, targets }) {
    const drain = state?.plan?.drain;
    if (!drain) return [];
    const outcomes = state.plan.resolution?.outcomes ?? {};
    const user = { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? null };
    const item = { name: state.ability?.name ?? state.plan.source?.name ?? "The item", uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
    const marked = [];
    for (const target of targets ?? []) {
        const degree = target.degree ?? "success";
        if (!DAMAGED.has(degree) || outcomes[degree]?.damage?.mode === "none" || !target.actorUuid) continue;
        const actor = await fromUuid(target.actorUuid).catch(() => null);
        if (!actor?.createEmbeddedDocuments) continue;
        await markOf(actor)?.delete();
        // (Its user the Effect's origin, else the creature itself: PF2e wants one.)
        const [effect] = await actor.createEmbeddedDocuments("Item", [drainMarkSource(drain, { item, user: user.actorUuid ? user : { ...user, actorUuid: actor.uuid }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        marked.push(effect);
    }
    return marked;
}

// (PF2e applies the damage to a copy of the creature with the attack's context: its Hit Points afterwards are the creature's own.)
export function before(actor, params) {
    if (!game.user.isGM) return null;
    const mark = markOf(actor);
    const drain = mark?.flags?.[MODULE_ID]?.drain;
    const share = drain ? shareOfType(params?.damage, drain.type) : null;
    if (!share) return null;
    const hp = hpOf(actor);
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        // (Damage it took none of — immune, or all resisted — leaves the mark for the next.)
        if (!drained(hp, hpOf(live), 1, 1)) return;
        const amount = drained(hp, hpOf(live), share, drain.fraction);
        await mark.delete();
        const user = drain.userUuid ? await fromUuid(drain.userUuid).catch(() => null) : null;
        if (amount > 0 && user?.createEmbeddedDocuments) {
            const item = { name: mark.name.replace(/: drained$/, ""), uuid: mark.system?.context?.origin?.item ?? null, img: mark.img ?? null };
            await user.createEmbeddedDocuments("Item", [drainTempSource(amount, { item, user: { actorUuid: user.uuid }, start: mark.system?.start ?? {}, duration: mark.system?.duration?.unit === "unlimited" ? null : { mode: "fixed", value: mark.system.duration.value, unit: mark.system.duration.unit, expiry: mark.system.duration.expiry }, moduleId: MODULE_ID })]);
        }
        const whisper = (game.users?.filter?.((one) => one.isGM || user?.testUserPermission?.(one, "OWNER")) ?? []).map((one) => one.id);
        const name = escape(live.token?.name ?? live.name);
        const content = amount > 0 ? `<p><strong>${escape(user?.name ?? drain.userName ?? "Its user")}</strong> gains ${amount} temporary Hit Points from the ${drain.type ? `${escape(drain.type)} ` : ""}damage <strong>${name}</strong> took (${escape(mark.name)}).</p>` : `<p>${escape(mark.name)} is used up: <strong>${name}</strong>'s damage gave no temporary Hit Points.</p>`;
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user ?? live }), whisper, content });
    };
}
