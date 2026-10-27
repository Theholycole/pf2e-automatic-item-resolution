// Permanent items' activations on the character sheet (the user's choice, 2026-10-15: buttons on the sheet's item rows,
// not a card after "send to chat"): each activation the module reads gets an Activate button by the item's name, for its
// owner or the GM; pressing it posts that activation's own card (the routes consumables use) and counts it against its
// frequency ("once per day"), which the button's tooltip shows — over it, a warning to the GM, not a refusal. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Seconds per frequency period, for counting uses in world time (a day's uses reset at the next day, and so on).
// (A week's and a month's — 30 days — for a figurine's "once per week", a fossil fragment's "four times per month": 2026-10-27.)
const PERIOD_SECONDS = { round: 6, turn: 6, minute: 60, "10-minutes": 600, hour: 3600, day: 86_400, week: 604_800, month: 2_592_000, year: 31_536_000 };

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

// A wait before it's used again (trigger.recharge { formula | value, unit }, src/compiler/cooldown.js and the ability compiler's recharge): its
// seconds in world time, the formula's roll given. Waits { [activationIndex]: until } on the item.
const UNIT_SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 };
export const rechargeSeconds = (recharge, rolled = null) => (Number(rolled ?? recharge?.value) || 0) * (UNIT_SECONDS[recharge?.unit] ?? 0);
export const rechargeLeft = (waits, index, worldTime) => Math.max(0, (Number(waits?.[index]) || 0) - (Number(worldTime) || 0));
// "3 rounds", "10 minutes", "2 hours": what's left, in its largest whole unit.
export function waitText(seconds) {
    const left = Math.max(0, Number(seconds) || 0);
    if (left >= 86_400) return `${Math.ceil(left / 86_400)} ${Math.ceil(left / 86_400) === 1 ? "day" : "days"}`;
    if (left >= 3600) return `${Math.ceil(left / 3600)} ${Math.ceil(left / 3600) === 1 ? "hour" : "hours"}`;
    if (left >= 60) return `${Math.ceil(left / 60)} ${Math.ceil(left / 60) === 1 ? "minute" : "minutes"}`;
    return `${Math.ceil(left / 6)} ${Math.ceil(left / 6) === 1 ? "round" : "rounds"}`;
}

const PER_WORDS = { round: "round", turn: "turn", minute: "minute", "10-minutes": "10 minutes", hour: "hour", day: "day", week: "week", month: "month", year: "year", encounter: "encounter" };
export const frequencyText = (frequency) => (frequency?.max ? `${frequency.max === 1 ? "once" : frequency.max === 2 ? "twice" : `${frequency.max} times`} per ${PER_WORDS[frequency.per] ?? frequency.per}` : null);
export const perWord = (frequency) => PER_WORDS[frequency?.per] ?? "period";

const TIME_WORDS = { 1: "1 action", 2: "2 actions", 3: "3 actions", reaction: "reaction", free: "free action", cast: "Cast a Spell" };

// An activation's button tooltip: "Activate: Shadow Slip (reaction, once per day; used 0 of 1 this day)".
export function activationTooltip(activation, { itemName, record = {}, now = {}, waits = {} } = {}) {
    const frequency = frequencyText(activation.frequency);
    const used = activation.frequency?.max ? `used ${usesNow(record, activation.index, activation.frequency, now)} of ${activation.frequency.max} this ${perWord(activation.frequency)}` : null;
    // (Still waiting to be used again: how long.)
    const left = rechargeLeft(waits, activation.index, now.worldTime);
    const details = [[TIME_WORDS[activation.time] ?? activation.time, frequency].filter(Boolean).join(", "), used, left ? `usable again in ${waitText(left)}` : null].filter(Boolean).join("; ");
    return `Activate: ${activation.name ?? itemName}${details ? ` (${details})` : ""}`;
}

// The buttons for an item row: activations [{ index, name, time, frequency }].
export function activationButtonsHTML(activations, options = {}) {
    return activations.map((activation) => `<a class="air-activate" data-air-activate="${activation.index}" data-tooltip="${escape(activationTooltip(activation, options))}" aria-label="${escape(activationTooltip(activation, options))}"><i class="fa-solid fa-bolt"></i></a>`).join("");
}
