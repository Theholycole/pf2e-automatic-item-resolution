// The activations card (permanent items): after PF2e posts an item to chat, its activations the module reads, each
// with an Activate button (the item's owner or the GM); pressing one posts that activation's own card (the routes
// consumables use) and counts it against its frequency ("once per day"), which the card shows — over it, a warning,
// not a refusal (the GM's to judge). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Seconds per frequency period, for counting uses in world time (a day's uses reset at the next day, and so on).
const PERIOD_SECONDS = { round: 6, turn: 6, minute: 60, "10-minutes": 600, hour: 3600, day: 86_400 };

// The period a use falls in: its index in world time (an encounter's: the combat's id).
export function periodOf(frequency, { worldTime = 0, combatId = null } = {}) {
    if (!frequency?.per) return null;
    if (frequency.per === "encounter") return combatId ? `combat:${combatId}` : "no-combat";
    return `${frequency.per}:${Math.floor(Number(worldTime) / (PERIOD_SECONDS[frequency.per] ?? 86_400))}`;
}

// Uses so far this period: record { [activationIndex]: { period, count } }.
export function usesNow(record, index, frequency, now) {
    const period = periodOf(frequency, now);
    const entry = record?.[index];
    return entry && entry.period === period ? entry.count : 0;
}

// The record after one more use.
export function withUse(record, index, frequency, now) {
    const period = periodOf(frequency, now);
    if (!period) return record ?? {};
    return { ...(record ?? {}), [index]: { period, count: usesNow(record, index, frequency, now) + 1 } };
}

const PER_WORDS = { round: "round", turn: "turn", minute: "minute", "10-minutes": "10 minutes", hour: "hour", day: "day", encounter: "encounter" };
export const frequencyText = (frequency) => (frequency?.max ? `${frequency.max === 1 ? "once" : frequency.max === 2 ? "twice" : `${frequency.max} times`} per ${PER_WORDS[frequency.per] ?? frequency.per}` : null);

// activations: [{ index, name, time, frequency, route }] — only those with a card.
export function createActivationsCard({ item, user, activations }) {
    return { kind: "activations", status: "open", item, user, activations, results: [] };
}

const TIME_WORDS = { 1: "1 action", 2: "2 actions", 3: "3 actions", reaction: "reaction", free: "free action", cast: "Cast a Spell" };

export function activationsCardHTML(state, { canApply = false, record = {}, now = {} } = {}) {
    const rows = state.activations.map((activation) => {
        const frequency = frequencyText(activation.frequency);
        const used = activation.frequency?.max ? usesNow(record, activation.index, activation.frequency, now) : 0;
        const left = activation.frequency?.max ? ` · used ${used} of ${activation.frequency.max} this ${PER_WORDS[activation.frequency.per] ?? "period"}` : "";
        const button = canApply ? `<button type="button" data-air-activation="${activation.index}">Activate</button>` : "";
        return `<li class="aar-target"><span class="aar-name">${escape(activation.name ?? state.item.name)} <span class="aar-check">${escape([TIME_WORDS[activation.time] ?? activation.time, frequency].filter(Boolean).join(", "))}${escape(left)}</span></span>${button}</li>`;
    }).join("");
    const results = state.results.length ? `<ul class="aar-applied">${state.results.slice(-5).map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const hint = canApply ? "" : `<p class="aar-hint">${escape(state.user.name)}'s player or the GM can activate it.</p>`;
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">activations</span></header><ul class="aar-targets">${rows}</ul>${results}${hint}</section>`;
}
