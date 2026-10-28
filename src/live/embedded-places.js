// Places an item keeps for teleportation (2026-10-27, src/compiler/whole-artifacts.js: Guiding Star Orb (Heroic)'s Embed Location, "The
// Guiding Star Orb can have up to three locations embedded at a time; if this activity is used a fourth time, the new location replaces the
// oldest stored one"): its record on the item, [{ scene, sceneName, x, y, at }], newest last. Pure.

export const PLACES = "embeddedPlaces";
export const isEmbed = (plan) => plan?.builtin === "embed-location" && Boolean(plan.embed);

// The record after a place is embedded: at most max of them, the oldest gone first.
export function withPlace(record, place, max) {
    const list = [...(Array.isArray(record) ? record : []), place];
    return list.slice(Math.max(0, list.length - Math.max(1, Number(max) || 1)));
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function embedCardHTML({ item, user, places, embed, dropped = null }) {
    const list = places.map((place, index) => `<li>${index + 1}. ${escape(place.sceneName ?? "a scene")} (${Math.round(place.x)}, ${Math.round(place.y)})</li>`).join("");
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="applied"><header><strong>${escape(item.name)}</strong><span class="aar-check">used by ${escape(user.name)}</span></header><p class="aar-actions">${escape(user.name)}'s place is embedded${dropped ? ` (it replaces the oldest, ${escape(dropped.sceneName ?? "a scene")})` : ""}. Up to ${escape(embed.max)} at a time:</p><ul class="aar-lines">${list}</ul><p class="aar-hint">${escape(embed.line)}</p></section>`;
}
