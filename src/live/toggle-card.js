// The toggle card: an activation that sets one of the item's own PF2e toggles (a RollOption rule with suboptions) —
// Four-Ways Dogslicer's Gem Twist (flaming, frost or shock), Pharasmin Visor's three visions, Broadleaf Shield's seasons,
// Nosoi Charm's skill. The ability compiler reads it as its "modes" builtin whose ways are each a "roll-option"
// ({ option, suboption | value }); the card picks the way and Set has PF2e switch the item's toggle to it
// (actor.toggleRollOption), so PF2e's own rules for that choice apply. Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const isWay = (plan) => plan?.builtin === "roll-option" && typeof plan.option === "string";
export const isToggle = (plan) => plan?.builtin === "modes" && (plan.modes?.length ?? 0) > 0 && plan.modes.every((mode) => isWay(mode.plan)) && !plan.all && !plan.random;

// names: the ways' names to show (PF2e's localized suboption labels, by the caller), else the plan's.
export function createToggleCard({ plan, item, user, names = null }) {
    const ways = plan.modes.map((mode, index) => ({ name: names?.[index] ?? mode.name, ...mode.plan }));
    // (An activation named for one way — Pharasmin Visor's Pierce the Night — starts on it.)
    const named = String(plan.item?.activation?.name ?? "").toLowerCase();
    const choice = Math.max(0, plan.modes.findIndex((mode) => String(mode.name).toLowerCase() === named));
    return { kind: "toggle", status: "open", plan, item, user, ways, choice, results: [] };
}

// The PF2e call for the chosen way: toggleRollOption(domain, option, itemId, value, suboption).
export function toggleRequest(state, { rules = [], itemId = null } = {}) {
    const way = state.ways[state.choice ?? 0] ?? state.ways[0];
    const rule = rules.find((entry) => entry?.key === "RollOption" && entry.option === way.option);
    return { domain: way.domain ?? rule?.domain ?? "all", option: way.option, itemId, value: way.value ?? true, suboption: way.suboption ?? null, name: way.name };
}

export function toggleCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const pick = open && canApply && state.ways.length > 1
        ? `<p class="aar-actions">Set to: <select data-air-field="choice">${state.ways.map((way, index) => `<option value="${index}"${index === (state.choice ?? 0) ? " selected" : ""}>${escape(way.name)}</option>`).join("")}</select></p>`
        : `<p class="aar-actions">${escape(state.ways.map((way) => way.name).join(", "))}</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Set</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to set it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">its toggle</span></header>${open ? pick : ""}${notes}${results}${controls}</section>`;
}
