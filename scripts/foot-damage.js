// Live play for damage each time a creature deals damage with a foot Strike (src/compiler/snares.js stakedRows: Hoof Stakes Snare's stakes). Its
// note Effect carries PF2e's RollOption "air-foot-damage:<dice>:<type>"; on the active GM's client, when PF2e applies damage from a Strike of
// that creature's that's a foot (its item named a foot, hoof, kick, stomp or Trample — the core's applyDamage listener, the damage's item) and
// the creature it hits loses Hit Points by it, the stakes' dice are rolled and applied to the striker through PF2e.

import { CORE_ID, MODULE_ID, damageRollClass, isActiveGM } from "./foundry.js";

const OPTION = /^air-foot-damage:(\d+d\d+):([a-z]+)$/;
// (A foot Strike: "Foot", "Hoof", "Kick", "Stomp", Trample's.)
export const FOOT = /\b(?:foot|feet|hoof|hooves|kick|stomp|trample)\b/i;

// The creature's foot damages: [{ dice, type, effect }].
export function footDamagesOf(actor) {
    const found = [];
    for (const effect of actor?.itemTypes?.effect ?? []) {
        for (const rule of effect.system?.rules ?? []) {
            const match = rule?.key === "RollOption" ? OPTION.exec(String(rule.option ?? "")) : null;
            if (match) found.push({ dice: match[1], type: match[2], effect });
        }
    }
    return found;
}

const hitPoints = (actor) => (Number(actor?.system?.attributes?.hp?.value) || 0) + (Number(actor?.system?.attributes?.hp?.temp) || 0);

export function setUpFootDamage() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (damage?.onApply) damage.onApply({ module: MODULE_ID, name: "foot-damage", before });
}

// (PF2e applies the damage to the creature hit: whether it lost Hit Points is known after.)
export function before(actor, params) {
    if (!isActiveGM()) return null;
    const item = params?.item ?? null;
    const striker = item?.actor ?? null;
    if (!striker || striker.uuid === actor?.uuid || !FOOT.test(String(item.name ?? ""))) return null;
    const damages = footDamagesOf(striker);
    if (!damages.length) return null;
    const had = hitPoints(actor);
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        if (hitPoints(live) >= had) return;
        const DamageRoll = damageRollClass();
        if (!DamageRoll) return;
        for (const { dice, type, effect } of damages) {
            const roll = await new DamageRoll(`${dice}[${type}]`).evaluate();
            const from = String(effect.name ?? "").replace(/:.*$/, "");
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: striker }), flavor: `<strong>${from}</strong>: its ${item.name} dealt damage — ${dice} ${type}` });
            await striker.applyDamage({ damage: roll, token: striker.getActiveTokens?.()?.[0]?.document ?? null });
        }
    };
}
