// Two linked portals an item makes (2026-10-27, src/compiler/whole-artifacts.js: Mountebank's Passage's Doorway to Onyx and Doorway to Pearl):
// each a Region on a square its user picks within range, Foundry's own teleportToken behaviour taking a token that moves in out through the
// other colour's portal; the previous one of its colour gone, both gone at its user's next daily preparations (scripts/portals.js). Pure.

export const PORTAL = "portal";
export const isPortal = (plan) => plan?.builtin === "portal" && Boolean(plan.portal);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// A portal's Region: its square { x, y } (top-left, pixels) of grid size, its colour, the other's Region uuid (none yet: no way through).
export function portalRegion({ name, square, size, color, other = null, flags }) {
    return {
        name,
        color: color === "white" ? "#f4f1e8" : "#1d1b22",
        shapes: [{ type: "rectangle", x: square.x, y: square.y, width: size, height: size, anchorX: 0, anchorY: 0, rotation: 0, gridBased: true }],
        behaviors: [{ name: `${name}: through`, type: "teleportToken", system: { destinations: other ? [other] : [], placement: "center", snap: true, choice: false, revealed: true } }],
        visibility: 2,
        highlightMode: "coverage",
        displayMeasurements: false,
        flags
    };
}

export function createPortalCard({ plan, item, user }) {
    return { kind: "portal", status: "open", plan, item, user, results: [] };
}

export function portalCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const portal = state.plan.portal;
    const lines = [`A ${portal.color} portal on a vertical surface within ${portal.within} feet: whoever moves through it comes out of the ${portal.other} portal, when there's one on this plane`, `The last ${portal.color} portal it made is gone; this one lasts until its user's next daily preparations`, "Only while the pistol isn't loaded"];
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const hint = open && canApply ? `<p class="aar-hint">Press Pick and click the square against the surface (right-click or Escape cancels).</p>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-portal="pick">Pick</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><ul class="aar-lines">${lines.map((line) => `<li>${escape(line)}.</li>`).join("")}</ul>${hint}${results}${controls}</section>`;
}
