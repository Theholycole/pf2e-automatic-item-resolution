// The disbelief card (src/compiler/disbelief.js, the user's ruling for illusions, 2026-10-25): an item's illusion the GM's to hold up — the
// creatures that can try to see through it, each one's Perception against the item's DC on the GM's Disbelieve (the creatures targeted), and
// who saw through it, kept on the card while the illusion lasts. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400 };
export const isDisbelief = (state) => state?.kind === "disbelief";

// What it says: "A creature that touches the illusion or Seeks to examine its user can try to disbelieve it: Perception DC 18."
// (Its DC its user's, Wooden Nickel's Deception DC — disbelief.against, filled in when the card is posted —, and a second check beside it,
// disbelief.also: Misdirecting Haversack's "Society DC 20 reads its real text (Decipher Writing)", 2026-10-27.)
const STATISTICS = { perception: "Perception", will: "Will" };
const nameOf = (statistic) => STATISTICS[statistic] ?? `${String(statistic).charAt(0).toUpperCase()}${String(statistic).slice(1)}`;
const dcWords = (check) => (Number.isFinite(check.dc) ? `DC ${check.dc}${check.against ? ` (its user's ${nameOf(check.against)} DC)` : ""}` : `against its user's ${nameOf(check.against ?? "deception")} DC`);
export function disbeliefText(disbelief) {
    const also = disbelief.also ? `; ${nameOf(disbelief.also.statistic)} ${dcWords({ against: disbelief.against, ...disbelief.also })} ${disbelief.also.what}` : "";
    return `A creature that ${disbelief.when} can try to disbelieve it: ${nameOf(disbelief.statistic)} ${dcWords(disbelief)}${also}`;
}

// worldTime: now, for its time (none: until the GM closes it). userDCs: its user's DCs by statistic, for a DC that's its user's.
const filled = (check, against, userDCs) => (Number.isFinite(check?.dc) || !against || !Number.isFinite(userDCs?.[against]) ? check : { ...check, dc: userDCs[against] });
export function createDisbeliefCard({ plan, item, user, worldTime = 0, userDCs = {} }) {
    const lasts = plan.disbelief?.lasts;
    const until = lasts ? (Number(worldTime) || 0) + Number(lasts.value) * (SECONDS[lasts.unit] ?? 60) : null;
    const own = plan.disbelief;
    const disbelief = own ? { ...filled(own, own.against, userDCs), ...(own.also ? { also: filled(own.also, own.also.against ?? own.against, userDCs) } : {}) } : own;
    return { kind: "disbelief", status: "open", plan: { disbelief, source: plan.source ?? null }, item, user, until, saw: [], fooled: [], results: [] };
}

// A creature's attempt: { name, degree, also } → the next state (seen through on a success or a critical success). also: the second check's,
// seeing through only when it says so (Wooden Nickel's Crafting); else its own line (the Haversack's Society, the real text read).
const degreeWords = (degree) => degree.replace(/([A-Z])/g, " $1").toLowerCase();
export function withAttempt(state, { name, degree, also = false }) {
    const success = degree === "success" || degree === "criticalSuccess";
    const second = also ? state.plan.disbelief?.also ?? null : null;
    const through = success && (!second || Boolean(second.through));
    const saw = through && !state.saw.includes(name) ? [...state.saw, name] : state.saw;
    const fooled = !through && !second && !state.fooled.includes(name) && !saw.includes(name) ? [...state.fooled, name] : state.fooled;
    const line = second ? `${name} (${nameOf(second.statistic)}): ${degreeWords(degree)}, ${success ? second.what : "no wiser"}` : `${name}: ${degreeWords(degree)}, ${through ? "sees through the illusion" : "still fooled"}`;
    return { ...state, saw, fooled, results: [...state.results, line].slice(-8) };
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
    // (A second check, its pick: Perception to disbelieve, or the other.)
    const pick = disbelief.also ? `<select data-air-field="check"><option value="0">${escape(nameOf(disbelief.statistic))}: disbelieve</option><option value="1">${escape(nameOf(disbelief.also.statistic))}: ${escape(disbelief.also.what)}</option></select>` : "";
    const controls = open && canApply ? `<footer class="aar-controls">${pick}<button type="button" data-air-action="apply">${disbelief.also ? "Roll it" : "Disbelieve"} (the creatures targeted)</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">disbelief, for the GM</span></header>${lines}${results}${controls}</section>`;
}
