// A bonus for each adjacent enemy (2026-10-27, src/compiler/whole-artifacts.js: Vambrace of Gorum's Blade of Iron, "+1 circumstance bonus to
// AC for each adjacent enemy (up to a +4 bonus)"): its user's Effect, flagged adjacentEnemies { per, max, type, selector }, its one FlatModifier
// set to the count as it changes (scripts/adjacent-bonus.js). Pure.

export const ADJACENT = "adjacentEnemies";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The bonus for that many adjacent enemies.
export const adjacentBonus = (adjacent, count) => Math.min(Number(adjacent.max) || 0, (Number(adjacent.per) || 1) * Math.max(0, Number(count) || 0));
export const adjacentRules = (adjacent, count) => [{ key: "FlatModifier", selector: adjacent.selector ?? "ac", type: adjacent.type ?? "circumstance", value: adjacentBonus(adjacent, count), label: "Adjacent enemies" }];

// Whether two spaces { x, y, w, h } (pixels) are adjacent or overlapping on a grid of that size, at the same height.
export const isAdjacent = (a, b, size) => a.x < b.x + b.w + size && a.x + a.w + size > b.x && a.y < b.y + b.h + size && a.y + a.h + size > b.y;

// The Effect's source: { name, words, adjacent, duration }, context { item, user, worldTime, initiative }.
export function adjacentEffectSource(effect, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: `${item.name}: ${effect.name}`,
        type: "effect",
        img: item.img ?? "icons/svg/shield.svg",
        flags: { [moduleId]: { [ADJACENT]: effect.adjacent } },
        system: {
            description: { value: `<p>${escape(effect.words)}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: effect.duration ? { value: effect.duration.value, unit: effect.duration.unit, expiry: effect.duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            tokenIcon: { show: true },
            rules: adjacentRules(effect.adjacent, 0)
        }
    };
}
