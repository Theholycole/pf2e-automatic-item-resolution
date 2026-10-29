// The cast-boost card (src/compiler/cast-boost.js, scripts/cast-boost.js; Starless Scope's, 2026-10-29): its user's last cast, the check against
// its DC, what its degree does. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// A spell's DC by its rank and rarity (GM Core's DCs by spell rank; uncommon +2, rare +5, unique +10).
const BY_RANK = [15, 18, 20, 23, 26, 28, 31, 34, 36, 39];
const BY_RARITY = { common: 0, uncommon: 2, rare: 5, unique: 10 };
export const spellDC = (rank, rarity = "common") => BY_RANK[Math.min(10, Math.max(1, Number(rank) || 1)) - 1] + (BY_RARITY[rarity] ?? 0);

// A degree number (PF2e's 0–3) → its row's key.
export const DEGREE_KEYS = ["criticalFailure", "failure", "success", "criticalSuccess"];

export function createCastBoostCard({ plan, item, user, cast = null }) {
    return { kind: "cast-boost", status: "open", plan, item, user, cast, results: [], shattered: false };
}

// The row's words, for the card before it's rolled.
export function rowWords(row) {
    const parts = [];
    if (row?.attack) parts.push(`+${row.attack} status to its attack rolls`);
    if (row?.save) parts.push(`${row.save} status to a foe's saves against it`);
    if (row?.refund) parts.push(`its slot not spent (rank ${row.refund.maxRank} or lower)`);
    if (row?.flat) parts.push(`a DC ${row.flat.dc} flat check${row.flat.shatter ? ", the lens shattered on a failure" : ""}`);
    if (row?.lose) parts.push("the spell lost");
    if (row?.shatter) parts.push("the lens shattered");
    return parts.join("; ") || "the spell cast normally";
}

const NAMES = { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure" };

export function castBoostCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const boost = state.plan.castBoost;
    const cast = state.cast;
    const subject = cast ? `${escape(cast.name)} (rank ${escape(cast.rank)}, DC ${escape(cast.dc)})` : "no spell cast yet — cast it first, then Apply";
    const rows = Object.entries(boost.rows).map(([degree, row]) => `<li>${NAMES[degree]}: ${escape(rowWords(row))}</li>`).join("");
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const button = open ? `<button type="button" data-air-action="apply">Roll ${escape(boost.skill.charAt(0).toUpperCase() + boost.skill.slice(1))}</button>` : state.shattered ? `<button type="button" data-air-action="apply">Put in a new lens (2 actions)</button>` : "";
    const controls = canApply && button ? `<footer class="aar-controls">${button}</footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(boost.skill)} against the spell's DC</span></header><p class="aar-actions">${escape(state.user.name)}'s last cast: ${subject}</p>${open ? `<ul class="aar-notes">${rows}${(state.plan.notes ?? []).map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : ""}${results}${controls}</section>`;
}
