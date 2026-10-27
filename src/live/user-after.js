// What its user gets once its card at a creature is applied, by that creature's result (2026-10-27, src/compiler/book-strikes.js): Soulfeeding
// Mask's Devour Soul, "If the target takes any damage, you become Quickened for 1 minute and can use the extra action each round for only Stride
// actions, unless the damage killed the creature, in which case you can also use the extra action each round for Strike actions as well."
// plan.userAfter { degrees, slug, value?, duration, words, slainWords? }: once the ability module's card is applied (its "applied" hook), a
// creature of one of those degrees gives its user an Effect that grants that condition for its time, its words those for a creature it slew
// when one of them is at 0 Hit Points (scripts/user-after.js). Pure.

import { conditionUuid } from "../compiler/row-readings.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The creatures applied → whether its user gets it, and whether one of them was slain: { earned, slain }. targets: [{ degree, hp }] (hp its
// Hit Points after the card, null when not known).
export function userAfterEarned(after, targets) {
    const fits = (targets ?? []).filter((target) => (after?.degrees ?? []).includes(target?.degree));
    return { earned: fits.length > 0, slain: fits.some((target) => Number.isFinite(target?.hp) && target.hp <= 0) };
}

// The Effect on its user: the condition granted while it lasts, its words.
export function userAfterSource(after, { slain = false, item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const uuid = conditionUuid(after.slug);
    const words = slain && after.slainWords ? after.slainWords : after.words;
    const label = `${after.slug.charAt(0).toUpperCase()}${after.slug.slice(1)}${Number.isFinite(after.value) ? ` ${after.value}` : ""}`;
    const duration = after.duration?.mode === "fixed" ? { value: after.duration.value, unit: after.duration.unit, expiry: after.duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false };
    return {
        name: `${item.name ?? "Item"}: ${label}`,
        type: "effect",
        img: item.img ?? "icons/svg/clockwork.svg",
        flags: { [moduleId]: { userAfter: { slug: after.slug } } },
        system: {
            description: { value: `<p>${escape(words)}, from <strong>${escape(item.name ?? "the item")}</strong>.</p>` },
            duration,
            start: { value: worldTime, initiative },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules: uuid ? [{ key: "GrantItem", uuid, allowDuplicate: true, alterations: Number.isFinite(after.value) ? [{ mode: "override", property: "badge-value", value: after.value }] : [], onDeleteActions: { granter: "cascade", grantee: "cascade" } }] : []
        }
    };
}
