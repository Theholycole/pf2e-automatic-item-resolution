// The disbelief card (src/compiler/disbelief.js, the user's ruling for illusions, 2026-10-25): an item's illusion the GM's to hold up — the
// creatures that can try to see through it, each one's Perception against the item's DC on the GM's Disbelieve (the creatures targeted), and
// who saw through it, kept on the card while the illusion lasts. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400 };
export const isDisbelief = (state) => state?.kind === "disbelief";

// What it says: "A creature that touches the illusion or Seeks to examine its user can try to disbelieve it: Perception DC 18."
export function disbeliefText(disbelief) {
    const statistic = disbelief.statistic === "will" ? "Will" : "Perception";
    return `A creature that ${disbelief.when} can try to disbelieve it: ${statistic} DC ${disbelief.dc}`;
}

// worldTime: now, for its time (none: until the GM closes it).
export function createDisbeliefCard({ plan, item, user, worldTime = 0 }) {
    const lasts = plan.disbelief?.lasts;
    const until = lasts ? (Number(worldTime) || 0) + Number(lasts.value) * (SECONDS[lasts.unit] ?? 60) : null;
    return { kind: "disbelief", status: "open", plan: { disbelief: plan.disbelief, source: plan.source ?? null }, item, user, until, saw: [], fooled: [], results: [] };
}

// A creature's attempt: { name, degree } → the next state (seen through on a success or a critical success).
export function withAttempt(state, { name, degree }) {
    const through = degree === "success" || degree === "criticalSuccess";
    const saw = through && !state.saw.includes(name) ? [...state.saw, name] : state.saw;
    const fooled = !through && !state.fooled.includes(name) && !saw.includes(name) ? [...state.fooled, name] : state.fooled;
    return { ...state, saw, fooled, results: [...state.results, `${name}: ${degree.replace(/([A-Z])/g, " $1").toLowerCase()}, ${through ? "sees through the illusion" : "still fooled"}`].slice(-8) };
}

export function disbeliefCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const disbelief = state.plan.disbelief;
    const lasts = disbelief.lasts ? ` for up to ${disbelief.lasts.value} ${disbelief.lasts.value === 1 ? disbelief.lasts.unit.replace(/s$/, "") : disbelief.lasts.unit}` : "";
    const lines = [
        `<p class="aar-actions">${escape(state.user.name)}'s illusion${escape(lasts)}. ${escape(disbeliefText(disbelief))}.</p>`,
        disbelief.ends ? `<p class="aar-hint">${escape(disbelief.ends)}</p>` : "",
        state.saw.length ? `<p class="aar-actions">Saw through it: ${state.saw.map(escape).join(", ")}.</p>` : "",
        state.fooled.length ? `<p class="aar-hint">Tried and still fooled: ${state.fooled.map(escape).join(", ")}.</p>` : ""
    ].join("");
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Disbelieve (the creatures targeted)</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">disbelief, for the GM</span></header>${lines}${results}${controls}</section>`;
}
