// The found card: a consumable its user finds for the need at hand, the GM's pick (src/compiler/unique-rules.js withFoundConsumable — The
// Unicorn). The GM types the item's name (PF2e's equipment) or its uuid and presses Find; scripts/found.js checks it fits, puts it in its user's
// inventory with the world time it vanishes at (scripts/expiring.js), or — nothing typed — gives the activation's use back. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const SECONDS = { rounds: 6, minutes: 60, hours: 3600 };

export const isFound = (plan) => plan?.builtin === "found-item" && Boolean(plan.found);

export function createFoundCard({ plan, item, user, level }) {
    return { kind: "found", status: "open", plan, item, user, level: Number(level) || 0, results: [] };
}

const timeWords = (time) => `${time.value} ${time.value === 1 ? time.unit.replace(/s$/, "") : time.unit}`;

// "A common alchemical or magical consumable of level 20 or lower, the GM's pick; it vanishes unless used within 1 minute".
export const foundText = (found, level) => `A ${found.rarity} ${found.kinds.join(" or ")} consumable of level ${level} or lower, the GM's pick; it vanishes unless used within ${timeWords(found.vanish)}`;

// Whether PF2e's item (its source: type, system.level, system.traits) fits: null, or why not.
export function foundMisfit(source, found, level) {
    if (source?.type !== "consumable") return `${source?.name ?? "It"} isn't a consumable.`;
    const traits = source.system?.traits ?? {};
    if (found.rarity && (traits.rarity ?? "common") !== found.rarity) return `${source.name} isn't ${found.rarity}.`;
    if ((Number(source.system?.level?.value) || 0) > level) return `${source.name} is above level ${level}.`;
    const kinds = traits.value ?? [];
    if (!found.kinds.some((kind) => kinds.includes(kind) || (kind === "magical" && kinds.some((trait) => ["arcane", "divine", "occult", "primal"].includes(trait))))) return `${source.name} is neither ${found.kinds.join(" nor ")}.`;
    return null;
}

// The world time it vanishes at, from when it's found.
export const vanishesAt = (found, worldTime) => (Number(worldTime) || 0) + (Number(found.vanish?.value) || 1) * (SECONDS[found.vanish?.unit] ?? 60);

export function foundCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const field = open && canApply ? `<p class="aar-actions">The GM's pick (its name or uuid; leave it empty when nothing fits, and the use isn't spent): <input type="text" data-air-field="found" value=""></p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Find</button></footer>` : open ? `<p class="aar-hint">Waiting for the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">${escape(foundText(state.plan.found, state.level))}.</p>${notes}${field}${results}${controls}</section>`;
}
