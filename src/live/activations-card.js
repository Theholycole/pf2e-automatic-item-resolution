// Permanent items' activations on the character sheet (the user's choice, 2026-10-15: buttons on the sheet's item rows,
// not a card after "send to chat"): each activation the module reads gets an Activate button by the item's name, for its
// owner or the GM; pressing it posts that activation's own card (the routes consumables use) and counts it against its
// frequency ("once per day"), which the button's tooltip shows — over it, a warning to the GM, not a refusal. Pure.

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

// The record with one use given back (Hydra Head Club's miss: "the activation does not count against … its activation frequency"), none
// below 0.
export function withoutUse(record, index, frequency, now) {
    const period = periodOf(frequency, now);
    const count = usesNow(record, index, frequency, now);
    if (!period || count <= 0) return record ?? {};
    return { ...(record ?? {}), [index]: { period, count: count - 1 } };
}

// Whether one more use goes over the frequency.
export const overLimit = (record, index, frequency, now) => Boolean(frequency?.max) && usesNow(record, index, frequency, now) >= frequency.max;

const PER_WORDS = { round: "round", turn: "turn", minute: "minute", "10-minutes": "10 minutes", hour: "hour", day: "day", encounter: "encounter" };
export const frequencyText = (frequency) => (frequency?.max ? `${frequency.max === 1 ? "once" : frequency.max === 2 ? "twice" : `${frequency.max} times`} per ${PER_WORDS[frequency.per] ?? frequency.per}` : null);
export const perWord = (frequency) => PER_WORDS[frequency?.per] ?? "period";

const TIME_WORDS = { 1: "1 action", 2: "2 actions", 3: "3 actions", reaction: "reaction", free: "free action", cast: "Cast a Spell" };

// An activation's button tooltip: "Activate: Shadow Slip (reaction, once per day; used 0 of 1 this day)".
export function activationTooltip(activation, { itemName, record = {}, now = {} } = {}) {
    const frequency = frequencyText(activation.frequency);
    const used = activation.frequency?.max ? `used ${usesNow(record, activation.index, activation.frequency, now)} of ${activation.frequency.max} this ${perWord(activation.frequency)}` : null;
    const details = [[TIME_WORDS[activation.time] ?? activation.time, frequency].filter(Boolean).join(", "), used].filter(Boolean).join("; ");
    return `Activate: ${activation.name ?? itemName}${details ? ` (${details})` : ""}`;
}

// The buttons for an item row: activations [{ index, name, time, frequency }].
export function activationButtonsHTML(activations, options = {}) {
    return activations.map((activation) => `<a class="air-activate" data-air-activate="${activation.index}" data-tooltip="${escape(activationTooltip(activation, options))}" aria-label="${escape(activationTooltip(activation, options))}"><i class="fa-solid fa-bolt"></i></a>`).join("");
}
