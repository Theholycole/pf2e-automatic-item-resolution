// Live play for an Effect whose healing a damage type pauses (src/compiler/installed.js deactivatedBy, Troll Hide's "If you take electricity or
// fire damage, the armor deactivates until the end of your next turn"): the core's applyDamage listener sees the damage on its creature, and
// once it's applied with one of those types, its creature gets the "deactivated" Effect (src/live/card.js deactivatedEffectSource) to the end of
// its next turn — the installed Effect's FastHealing is predicated off while it lasts, so the next turn's start heals none. A second such
// damage before then starts it again. Its owners and the GM are told.

import { deactivatedEffectSource } from "../src/live/card.js";
import { CORE_ID, MODULE_ID, startInitiative } from "./foundry.js";
import { damageTypes } from "./turn-heal.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const watched = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.getFlag?.(MODULE_ID, "deactivatedBy") && !(effect.isExpired ?? effect.system?.expired));

// The Effects a damage of these types pauses (pure): those flagged with one of them.
export const pausedBy = (flags, types) => flags.filter((flag) => (flag?.types ?? []).some((type) => types.includes(type)));

export function setUpDeactivated() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return;
    damage.onApply({ module: MODULE_ID, name: "deactivated", before });
}

function before(actor, params) {
    const effects = watched(actor);
    if (!effects.length) return null;
    const types = damageTypes(params?.damage);
    const hit = effects.filter((effect) => pausedBy([effect.getFlag(MODULE_ID, "deactivatedBy")], types).length);
    if (!hit.length) return null;
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        const lines = [];
        for (const effect of hit) {
            const { types: by, slug } = effect.getFlag(MODULE_ID, "deactivatedBy");
            const name = String(effect.name ?? "").replace(/: installed$/, "");
            // (Again before it's over: from now, the old one gone.)
            const old = (live.itemTypes?.effect ?? []).filter((other) => other.getFlag?.(MODULE_ID, "deactivated") === slug);
            if (old.length) await live.deleteEmbeddedDocuments("Item", old.map((other) => other.id)).catch(() => null);
            await live.createEmbeddedDocuments("Item", [deactivatedEffectSource({ name, slug, types: by }, { worldTime: game.time.worldTime, initiative: startInitiative(live), moduleId: MODULE_ID })]);
            lines.push(`${escape(name)} is deactivated until the end of ${escape(live.name)}'s next turn (${escape(by.filter((type) => types.includes(type)).join(" and "))} damage)`);
        }
        const whisper = (game.users?.filter?.((user) => user.isGM || live.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), whisper, content: `<p>${lines.join("; ")}.</p>` });
    };
}
