// The objects card (src/compiler/objects.js): what an item does to one of its user's items, or to itself — stored in it, out of it into a
// hand, to a hand, worn, repaired, a weapon made in the hand — the item picked on the card from the user's own (its choices, made when the card is posted). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isObjects = (plan) => plan?.builtin === "objects" && Boolean(plan.objects?.op);

const BULK_WORDS = (bulk) => (bulk === 0 ? "negligible Bulk" : bulk === 0.1 ? "light Bulk" : `${bulk} Bulk`);
// What it does, in words: "Into Retrieval Belt: an item it's holding (1 Bulk or less)".
export function objectsText(objects, item = {}) {
    const limit = Number.isFinite(objects.maxBulk) ? ` (${BULK_WORDS(objects.maxBulk)} or less)` : "";
    if (objects.op === "store") return `Into ${item.name ?? "it"}: an item it's holding${limit}`;
    if (objects.op === "retrieve") return `Out of ${item.name ?? "it"}, into a hand: an item stored in it`;
    if (objects.op === "hand") return objects.self ? `${item.name ?? "It"} to its user's hand` : `To its user's hand: one of its items${limit}`;
    if (objects.op === "don") return `${item.name ?? "It"} worn`;
    if (objects.op === "repair" && objects.amount) return `${objects.amount} Hit Points restored, up to its maximum: one of its user's damaged items${objects.damagedBy ? ` (what the ${objects.damagedBy} did)` : ""}${limit}`;
    if (objects.op === "repair") return `Repaired to its full Hit Points, no longer broken: one of its user's items${limit}`;
    // ("A +1 striking dagger in its user's hand, the last one gone: Strike with it".)
    if (objects.op === "create") {
        const runes = objects.potency ? `+${objects.potency}${objects.striking ? ` ${["", "", "greater ", "major "][objects.striking]}striking` : ""} ` : "";
        return `A ${runes}${objects.weapon} in its user's hand${objects.replaces ? ", the last one it made gone" : ""}${objects.whileHeld ? ", gone once it's out of the hand" : ""}: Strike with it`;
    }
    return objects.op;
}

// choices: [{ id, name }] — its user's items the op can take (none for its own).
export function createObjectsCard({ plan, item, user, choices = [] }) {
    return { kind: "objects", status: "open", plan, item, user, choices, pick: 0, results: [] };
}

export function objectsCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const objects = state.plan.objects;
    const own = objects.self;
    const line = `<p class="aar-actions">${escape(objectsText(objects, state.item))}.</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const picker = own ? ""
        : !state.choices.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} has no item it can take.</p>` : "")
            : open && canApply ? `<p class="aar-actions">Item: <select data-air-field="pick">${state.choices.map((choice, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(choice.name)}</option>`).join("")}</select></p>`
                : `<p class="aar-actions">Item: ${escape(state.choices[state.pick ?? 0]?.name ?? "")}</p>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const ready = own || state.choices.length;
    const controls = open && canApply && ready ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open && ready ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${line}${notes}${picker}${results}${controls}</section>`;
}
