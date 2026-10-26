// Live play for plan.item.armed (src/compiler/armed.js: Flame Layer Balm). The core's applyDamage listener sees each damage before PF2e applies
// it: on a creature marked, damage of the mark's type that takes some of its Hit Points sets it off — PF2e's Effects it carries (Spell Effect:
// Fiery Body for its minute) on the creature, the mark used up, a line said. On the GM's client that applies the damage.

import { effectSource } from "../src/live/card.js";
import { drained, shareOfType } from "../src/live/drain.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const markOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.armed && !(effect.isExpired ?? effect.system?.expired)) ?? null;
const hpOf = (actor) => ({ value: actor?.system?.attributes?.hp?.value, temp: actor?.system?.attributes?.hp?.temp });
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpArmed() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: Flame Layer Balm won't burst.`);
    damage.onApply({ module: MODULE_ID, name: "armed", before });
}

export function before(actor, params) {
    if (!game.user.isGM) return null;
    const mark = markOf(actor);
    const armed = mark?.flags?.[MODULE_ID]?.armed;
    if (!armed || !shareOfType(params?.damage, armed.damageType)) return null;
    const hp = hpOf(actor);
    return async () => {
        const live = fromUuidSync(actor.uuid) ?? actor;
        if (!drained(hp, hpOf(live), 1, 1)) return;
        await mark.delete();
        const given = [];
        for (const application of armed.applications) {
            const template = application.uuid ? await fromUuid(application.uuid).catch(() => null) : null;
            if (!template) continue;
            const source = effectSource(template.toObject(), { application, item: { name: mark.name.replace(/: armed$/, ""), uuid: mark.system?.context?.origin?.item ?? null }, user: { actorUuid: mark.system?.context?.origin?.actor ?? live.uuid }, worldTime: game.time.worldTime, flags: { [MODULE_ID]: { card: true } } });
            source._stats = { ...(source._stats ?? {}), compendiumSource: application.uuid };
            await live.createEmbeddedDocuments("Item", [source]);
            given.push(template.name);
        }
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), content: `<p>${escape(mark.name.replace(/: armed$/, ""))} bursts into flame as <strong>${escape(live.token?.name ?? live.name)}</strong> takes ${escape(armed.damageType)} damage: ${given.map(escape).join(", ") || "its Effect (apply it by hand)"}.</p>` });
    };
}
