// Live play for an Effect whose time each hit of some types shortens (src/compiler/installed.js shortensOnHit, Bone Dreadnought Plate's
// "each time you're hit by an attack that deals damage of one of these types, decrease the remaining duration by 1 minute"): the core's
// applyDamage listener sees an attack's damage on its creature (a weapon's or an attack's, PF2e's own items), and once it's applied that
// Effect's time is that much shorter — whatever its resistance left of the damage — and its owners and the GM are told.

import { CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const shortened = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.getFlag?.(MODULE_ID, "shortensOnHit"));
// (An attack: a weapon's or an NPC's attack, or a roll its options call one.)
const byAttack = (params) => Boolean(params?.item?.isOfType?.("weapon", "melee")) || (params?.item?.system?.traits?.value ?? []).includes("attack") || [...(params?.rollOptions ?? [])].some((option) => option === "item:trait:attack" || option === "action:strike");
const typesOf = (params) => new Set((params?.damage?.instances ?? []).map((instance) => String(instance?.type ?? "").toLowerCase()).filter(Boolean));

export function setUpShortenOnHit() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return;
    damage.onApply({ module: MODULE_ID, name: "shorten-on-hit", before });
}

function before(actor, params) {
    const effects = shortened(actor);
    if (!effects.length || !byAttack(params)) return null;
    const types = typesOf(params);
    const hit = effects.filter((effect) => effect.getFlag(MODULE_ID, "shortensOnHit").types.some((type) => types.has(type)));
    if (!hit.length) return null;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        const lines = [];
        for (const effect of hit) {
            const own = live.items?.get?.(effect.id);
            const by = effect.getFlag(MODULE_ID, "shortensOnHit");
            if (!own || own.system?.duration?.unit !== by.unit) continue;
            const value = Math.max(0, (Number(own.system.duration.value) || 0) - by.value);
            await own.update({ "system.duration.value": value });
            lines.push(`${escape(own.name)}: ${by.value} ${by.value === 1 ? by.unit.replace(/s$/, "") : by.unit} shorter, ${value} left in all`);
        }
        if (!lines.length) return;
        const whisper = (game.users?.filter?.((user) => user.isGM || live.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), whisper, content: `<p>${lines.join("; ")} (hit by an attack of its types).</p>` });
    };
}
