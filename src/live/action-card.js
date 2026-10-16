// The action card (src/compiler/item-actions.js): an item used by taking a skill action with it. Apply rolls PF2e's own
// action for its user, with the item's bonus (scripts/item-actions.js), at the creature the presser targets when the
// action is aimed at one; then, for the actions the ability module compiles, that action's row for the degree goes on
// the target (Trip's prone, Grapple's grabbed). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function createActionCard({ plan, item, user }) {
    return { kind: "item-action", status: "open", plan, item, user, results: [] };
}

// "Sneak with a +1 item bonus", "Escape".
export function actionText(action) {
    if (action.minimum) return `${action.name} at +${action.minimum.value} ${action.minimum.skill.charAt(0).toUpperCase()}${action.minimum.skill.slice(1)}, when that's higher than your own`;
    return action.bonus ? `${action.name} with a +${action.bonus.value} ${action.bonus.type} bonus` : action.name;
}

const OUTCOME_WORDS = { criticalSuccess: "a critical success", success: "a success", failure: "a failure", criticalFailure: "a critical failure" };
export const outcomeText = (outcome) => OUTCOME_WORDS[outcome] ?? outcome;

export function actionCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const action = state.plan.action;
    const after = open && action.after ? `<ul class="aar-notes"><li>${escape(action.after)}</li></ul>` : "";
    const hint = open && action.targeted ? `<p class="aar-hint">Target the creature, then press the button.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Roll ${escape(action.name)}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(action.name)}</span></header><p class="aar-actions">${escape(state.user.name)}: ${escape(actionText(action))}</p>${after}${hint}${results}${controls}</section>`;
}
