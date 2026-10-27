// Live play for a condition its creature avoids gaining (src/compiler/prevent-condition.js: Immortal Bastion, Urn of Ashes): while the
// creature has the readied Effect (flags.<module>.prevents), PF2e's creating that condition on it, or raising its value, is cancelled on the
// client making the change — preCreateItem, preUpdateItem — and the Effect is used up, its owners and the GM told. Once only: the first of
// its conditions to come.

import { MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The readied Effect on the creature for that condition, or null.
export function preventing(actor, slug) {
    return (actor?.itemTypes?.effect ?? []).find((effect) => (effect.flags?.[MODULE_ID]?.prevents ?? []).includes(slug)) ?? null;
}

// Whether a change to a condition item raises it: a value higher than it had (a condition with no value can't be raised).
export function raises(item, changes) {
    const next = Number(foundry.utils.getProperty(changes ?? {}, "system.value.value"));
    const now = Number(item?.system?.value?.value);
    return Number.isFinite(next) && Number.isFinite(now) && next > now;
}

const used = new Set();
function spend(actor, effect, slug) {
    if (used.has(effect.uuid)) return;
    used.add(effect.uuid);
    const whisper = (game.users?.filter?.((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
    const name = escape(actor.token?.name ?? actor.name);
    const from = escape(effect.flags?.[MODULE_ID]?.item?.name ?? String(effect.name).replace(/: .*$/, ""));
    const label = slug.charAt(0).toUpperCase() + slug.slice(1);
    // (After the hook returns: the change it cancels is still underway.)
    setTimeout(async () => {
        await effect.delete().catch(() => null);
        used.delete(effect.uuid);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper, content: `<p><strong>${from}</strong>: ${name} doesn't gain or increase ${escape(label)}; the item's protection is used up.</p>` });
    }, 0);
}

export function setUpPreventCondition() {
    Hooks.on("preCreateItem", (item, data, options, userId) => {
        if (userId !== game.user.id || item?.type !== "condition") return;
        const actor = item.parent;
        const slug = item.slug ?? data?.system?.slug;
        const effect = preventing(actor, slug);
        if (!effect) return;
        spend(actor, effect, slug);
        return false;
    });
    Hooks.on("preUpdateItem", (item, changes, options, userId) => {
        if (userId !== game.user.id || item?.type !== "condition" || !raises(item, changes)) return;
        const effect = preventing(item.parent, item.slug);
        if (!effect) return;
        spend(item.parent, effect, item.slug);
        return false;
    });
}
