// The Strike card (src/compiler/strikes.js): an item used by Striking (Fear Gem, Duelist's Beacon). Apply readies the
// user's next Strike this turn, an Effect that marks it; PF2e's attack roll then decides (scripts/strikes.js): a hit or a
// critical hit puts the riders for its degree on the target and posts the save the Strike calls for; a miss spends it.
// Pure; the ability module's classes.

import { saveText } from "./poison-card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "strikeRider";
export const isStrikeItem = (plan) => Boolean(plan?.strike) && plan.trigger?.event === "strike" && plan.resolution?.check?.roll === "attack";

export function createStrikeCard({ plan, item, user }) {
    return { kind: "strike", status: "open", plan, item, user, results: [] };
}

// A row in words: "Frightened 1", "Blinded for 1 round", "−10 to land-speed".
function rowText(row) {
    const conditions = (row?.effects ?? []).filter((effect) => effect.kind === "condition").map((effect) => `${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}`);
    const modifiers = (row?.modifiers ?? []).map((modifier) => `${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} to ${modifier.selector}`);
    return [...conditions, ...modifiers].join(", ");
}

// What the Strike carries, as lines: "On a hit: frightened 1", "On a critical hit: frightened 2", "On a hit: DC 22 Fortitude save".
export function strikeLines(plan) {
    const outcomes = plan.resolution.outcomes;
    const hit = rowText(outcomes.success);
    const critical = rowText(outcomes.criticalSuccess);
    return [
        hit ? `On a hit: ${hit}` : null,
        critical && critical !== hit ? `On a critical hit: ${critical}` : null,
        plan.strike.save ? `On a hit: ${saveText(plan.strike.save)} for the target` : null
    ].filter(Boolean);
}

const RANGE_WORDS = { melee: "melee Strike", ranged: "ranged Strike" };
export const strikeWord = (plan) => RANGE_WORDS[plan.strike?.range] ?? "Strike";

export function strikeCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const lines = strikeLines(state.plan).map((line) => `<li>${escape(line)}</li>`).join("");
    const hint = open ? `<p class="aar-hint">${escape(state.user.name)}'s next ${escape(strikeWord(state.plan))} this turn carries it; a miss spends it.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Ready the ${escape(strikeWord(state.plan))}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(strikeWord(state.plan))}</span></header><ul class="aar-notes">${lines}</ul>${hint}${results}${controls}</section>`;
}

// The Effect on the user that marks the readied Strike, until the end of the turn.
export function strikeEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId }) {
    return {
        name: `${state.item.name}: next ${strikeWord(state.plan)}`,
        type: "effect",
        img: img ?? "icons/svg/sword.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { plan: state.plan, item: state.item, user: state.user } } },
        system: {
            description: { value: `<p>The next ${escape(strikeWord(state.plan))} this turn: ${escape(strikeLines(state.plan).join("; "))}. A miss spends it.</p>` },
            duration: { value: 0, unit: "rounds", expiry: "turn-end", sustained: false },
            start: { value: worldTime, initiative },
            rules: []
        }
    };
}

// Whether a Strike takes the readied rider: its range ("melee": not a ranged weapon), and what its degree does — "hit"
// (the riders for that degree), else "spend".
export function riderFor(plan, { ranged = false, outcome } = {}) {
    if (plan.strike?.range === "melee" && ranged) return null;
    if (plan.strike?.range === "ranged" && !ranged) return null;
    return outcome === "success" || outcome === "criticalSuccess" ? "hit" : "spend";
}
