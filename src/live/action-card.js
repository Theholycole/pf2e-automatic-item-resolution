// The action card (src/compiler/item-actions.js): an item used by taking a skill action with it. Apply rolls PF2e's own
// action for its user, with the item's bonus (scripts/item-actions.js), at the creature the presser targets when the
// action is aimed at one; then, for the actions the ability module compiles, that action's row for the degree goes on
// the target (Trip's prone, Grapple's grabbed). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function createActionCard({ plan, item, user }) {
    return { kind: "item-action", status: "open", plan, item, user, ...(plan.action?.slugs ? { choice: 0 } : {}), results: [] };
}

// The action picked of several (The Bear's Grapple, Shove or Trip): its slug, name and rows in place of the first's.
export function chosenAction(state) {
    const action = state.plan.action;
    if (!action.slugs) return action;
    const index = Number.isInteger(state.choice) && action.slugs[state.choice] ? state.choice : 0;
    return { ...action, slug: action.slugs[index], name: action.names[index], basic: action.basics?.[action.slugs[index]] ?? null };
}

// "Sneak with a +1 item bonus", "Escape".
export function actionText(action) {
    // (At mythic proficiency, Spindle Key's: its user's level + 10 for the check's proficiency.)
    const using = `${action.statistic ? ` using ${action.statistic.charAt(0).toUpperCase()}${action.statistic.slice(1)}` : ""}${action.mythic ? " at mythic proficiency (its level + 10)" : ""}`;
    const name = action.names ? action.names.join(" or ") : action.name;
    if (action.names) return `${name}${using}${action.bonus ? ` with a +${action.bonus.value} ${action.bonus.type} bonus` : ""} (picked below)`;
    if (action.minimum) return `${action.name} at +${action.minimum.value} ${action.minimum.skill.charAt(0).toUpperCase()}${action.minimum.skill.slice(1)}, when that's higher than your own${action.minimum.ownBonus ? ` (else your own with a +${action.minimum.ownBonus.value} ${action.minimum.ownBonus.type} bonus)` : ""}`;
    return `${action.name}${using}${action.bonus ? ` with a +${action.bonus.value} ${action.bonus.type} bonus` : ""}`;
}

const OUTCOME_WORDS = { criticalSuccess: "a critical success", success: "a success", failure: "a failure", criticalFailure: "a critical failure" };
export const outcomeText = (outcome) => OUTCOME_WORDS[outcome] ?? outcome;

export function actionCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const action = state.plan.action;
    const after = open && action.after ? `<ul class="aar-notes"><li>${escape(action.after)}</li></ul>` : "";
    // (Every creature of a kind in an area — Horn of Exorcism's undead within 30 feet: those, however many.)
    const each = action.separate ? "a roll for each one" : "one roll against each one's DC";
    const who = action.everyone ? `Target ${escape(action.everyone)} (${each})` : action.maxTargets > 1 ? `Target up to ${action.maxTargets} creatures (${each})` : "Target the creature";
    const hint = open && action.targeted ? `<p class="aar-hint">${who}, then press the button.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    // (One of several actions: a picker.)
    const pick = open && canApply && action.names ? `<p class="aar-actions">Action: <select data-air-field="choice">${action.names.map((name, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></p>` : "";
    const word = action.names ? "the action" : action.name;
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Roll ${escape(word)}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(action.names ? action.names.join(" / ") : action.name)}</span></header><p class="aar-actions">${escape(state.user.name)}: ${escape(actionText(action))}</p>${pick}${after}${hint}${results}${controls}</section>`;
}
