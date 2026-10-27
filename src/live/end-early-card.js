// The end-early card (src/compiler/end-early.js): an item's effect on each creature its card affected, and how that creature ends it early —
// a flat check each try (its DC, then the next, then outright), or the Interact actions it spends. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function createEndEarlyCard({ endEarly, item, user, creatures }) {
    return { kind: "end-early", status: "open", plan: { endEarly }, item, user, entries: creatures.map((creature) => ({ ...creature, step: 0, done: false })), results: [], ...(endEarly.how.criticalDC ? { critical: Boolean(endEarly.critical) } : {}) };
}

// What the next try is for an entry: "a DC 10 flat check", "it ends outright", "3 Interact actions spent".
export const checkDC = (endEarly, critical) => (critical && endEarly.how.criticalDC ? endEarly.how.criticalDC : endEarly.how.dc);

// The way an entry ends it: its degree's own (Glittering Snare's rows), else the item's one way.
export const howFor = (endEarly, entry) => endEarly.byDegree?.[entry?.degree] ?? endEarly.how;

export function tryWords(given, entry, critical = false) {
    const endEarly = { ...given, how: howFor(given, entry) };
    // (Or an action of a trait, Blindpepper Bolt's manipulate action.)
    if (endEarly.how.kind === "actions") return `${endEarly.how.count} ${endEarly.how.trait ? `${endEarly.how.trait} ` : "Interact "}action${endEarly.how.count === 1 ? "" : "s"} spent${endEarly.how.helped ? " (by it or creatures helping, not all at once)" : ""}`;
    // (Or a skill check to pull free, Antler Arrow's Athletics: its DC, the harder one when the card's tick says so.)
    // (Or a save, Silencing Ammunition's Will save to tug the arrow out.)
    if (endEarly.how.kind === "check") {
        const what = endEarly.how.save ?? endEarly.how.skill;
        return `an Interact action: a DC ${checkDC(endEarly, critical)} ${what.charAt(0).toUpperCase()}${what.slice(1)} ${endEarly.how.save ? "save" : "check"}`;
    }
    const step = endEarly.how.steps[entry.step] ?? endEarly.how.steps.at(-1);
    return step === "auto" ? "an Interact action: it ends outright" : `an Interact action: a DC ${step} flat check`;
}

export function endEarlyCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const endEarly = state.plan.endEarly;
    const what = endEarly.conditions?.length ? endEarly.conditions.join(" or ") : "its effects";
    const left = state.entries.map((entry, index) => [entry, index]).filter(([entry]) => !entry.done);
    const rows = state.entries.map((entry) => `<li>${escape(entry.name)}: ${entry.done ? "ended" : escape(tryWords(endEarly, entry, state.critical))}</li>`).join("");
    // (The harder DC's tick, set after a critical hit: Antler Arrow's archer with the bow critical specialization.)
    const harder = endEarly.how.criticalDC && open ? `<p class="aar-actions"><label><input type="checkbox" data-air-field="critical"${state.critical ? " checked" : ""}${canApply ? "" : " disabled"}> After a critical hit by an archer with the bow critical specialization: DC ${endEarly.how.criticalDC}</label></p>` : "";
    const pick = open && canApply && left.length ? `<p class="aar-actions">Creature: <select data-air-field="entry">${left.map(([entry, index]) => `<option value="${index}">${escape(entry.name)}</option>`).join("")}</select></p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && left.length ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Try to end it</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">ending ${escape(what)} early</span></header><ul class="aar-notes">${rows}</ul>${harder}${pick}${results}${controls}</section>`;
}
