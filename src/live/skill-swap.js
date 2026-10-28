// Two of its user's skills' proficiency ranks swapped for a while (2026-10-27, src/compiler/whole-artifacts.js: The Trader's "select two
// skills. Your proficiency rank with those two skills swaps for 1 hour"): the card's two picks, and its Effect's PF2e rules — ActiveEffectLike
// overrides of each skill's rank with the other's, as they are when it's used. Pure.

export const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const RANKS = ["untrained", "trained", "expert", "master", "legendary"];
const title = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isSkillSwap = (plan) => plan?.builtin === "skill-swap" && Boolean(plan.swap);

// The Effect's rules for skills a and b at ranks rankA and rankB (0–4): each overridden with the other's.
export const swapRules = (a, b, rankA, rankB) => [
    { key: "ActiveEffectLike", mode: "override", path: `system.skills.${a}.rank`, value: Number(rankB) || 0, priority: 100 },
    { key: "ActiveEffectLike", mode: "override", path: `system.skills.${b}.rank`, value: Number(rankA) || 0, priority: 100 }
];
export const swapWords = (a, b, rankA, rankB) => `${title(a)} ${RANKS[rankB] ?? rankB} (was ${RANKS[rankA] ?? rankA}), ${title(b)} ${RANKS[rankA] ?? rankA} (was ${RANKS[rankB] ?? rankB})`;

export function createSwapCard({ plan, item, user }) {
    return { kind: "skill-swap", status: "open", plan, item, user, first: 0, second: 1, results: [] };
}

export function swapCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const pick = (field, at) => `<select data-air-field="${field}">${SKILLS.map((slug, index) => `<option value="${index}"${index === at ? " selected" : ""}>${escape(title(slug))}</option>`).join("")}</select>`;
    const picks = open && canApply ? `<p class="aar-actions">Swap ${pick("first", state.first)} and ${pick("second", state.second)}</p>` : "";
    const lines = (state.plan.swap.lines ?? []).map((line) => `<li>${escape(line)}</li>`).join("");
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-swap="apply">Swap them</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${picks}<ul class="aar-lines">${lines}</ul>${results}${controls}</section>`;
}
