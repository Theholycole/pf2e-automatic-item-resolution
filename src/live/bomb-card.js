// The bomb card's state and HTML: after PF2e's damage roll for a bomb Strike, the
// splash on the creatures within 5 feet of the target (PF2e's own splash rolls,
// ticked by default, each one the user or GM can untick) and the riders on the
// target for the Strike's degree. Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const DEGREE_WORDS = { criticalSuccess: "critical hit", success: "hit", failure: "miss", criticalFailure: "critical miss" };

// splash: [{ type, total }] from PF2e's splash-only rolls. near: the creatures within 5 feet of the target (not it).
// On a miss PF2e's damage (if rolled) is the splash alone, which the target takes too: it's listed first.
export function createBombCard({ plan, item, user, target, outcome, splash = [], near = [] }) {
    const splashed = [...(outcome === "failure" && target ? [target] : []), ...near].map((entry) => ({ ...entry, include: true }));
    return { kind: "bomb", status: "open", plan, item, user, target, outcome, splash, splashed, results: [] };
}

// The row the Strike's degree gives the target.
export const riderRow = (state) => state.plan?.resolution?.outcomes?.[state.outcome] ?? null;

// Which creatures take the splash: the indices left ticked (all, if none are given).
export function withChoices(state, included) {
    if (!Array.isArray(included)) return state;
    return { ...state, splashed: state.splashed.map((entry, index) => ({ ...entry, include: included.includes(index) })) };
}

const UNIT = { rounds: "round", minutes: "minute", hours: "hour", days: "day" };
function timeText(duration) {
    if (duration?.mode !== "fixed") return "";
    if (duration.unit === "rounds" && duration.value === 1 && duration.anchor === "source-turn") return duration.expiry === "turn-end" ? " until the end of the thrower's next turn" : " until the start of the thrower's next turn";
    if (duration.unit === "rounds" && duration.value === 1 && duration.anchor === "target-turn") return duration.expiry === "turn-start" ? " until the start of its next turn" : " until the end of its next turn";
    return ` for ${duration.value} ${duration.value === 1 ? UNIT[duration.unit] ?? duration.unit : duration.unit}`;
}

// The riders on the target, as lines.
export function riderLines(state) {
    const row = riderRow(state);
    if (!row || !state.target) return [];
    const lines = [];
    for (const effect of row.effects ?? []) if (effect.kind === "condition") lines.push(`${state.target.name}: ${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}${timeText(effect.duration)}`);
    for (const modifier of row.modifiers ?? []) lines.push(`${state.target.name}: ${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)}${/speed/.test(modifier.selector) ? "-foot" : ""} ${modifier.type} penalty to ${modifier.selector.replace(/-/g, " ")}${timeText(modifier.duration)}`);
    return lines;
}

export const splashText = (splash) => splash.map((entry) => `${entry.total} ${entry.type}`).join(" and ");

export function bombCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const degree = DEGREE_WORDS[state.outcome] ?? state.outcome;
    const splash = state.splash.length && state.splashed.length
        ? `<p class="aar-actions">Splash (${escape(splashText(state.splash))}):</p><ul class="aar-targets">${state.splashed.map((entry, index) => `<li class="aar-target"><label><input type="checkbox" data-air-splash="${index}"${entry.include ? " checked" : ""}${open && canApply ? "" : " disabled"}> ${escape(entry.name)}</label></li>`).join("")}</ul>`
        : state.splash.length ? `<p class="aar-hint">No other creature within 5 feet of the target for the splash.</p>` : "";
    const riders = open ? riderLines(state) : [];
    const riderList = riders.length ? `<ul class="aar-notes">${riders.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(degree)}${state.target ? ` on ${escape(state.target.name)}` : ""}</span></header>${splash}${riderList}${results}${controls}</section>`;
}
