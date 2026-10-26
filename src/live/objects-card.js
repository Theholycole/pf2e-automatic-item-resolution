// The objects card (src/compiler/objects.js): what an item does to one of its user's items, or to itself — stored in it, out of it into a
// hand, to a hand, worn, repaired, a weapon made in the hand, a weapon reloaded — the item picked on the card from the user's own (its choices, made when the card is posted). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isObjects = (plan) => plan?.builtin === "objects" && Boolean(plan.objects?.op);

const BULK_WORDS = (bulk) => (bulk === 0 ? "negligible Bulk" : bulk === 0.1 ? "light Bulk" : `${bulk} Bulk`);
// What it does, in words: "Into Retrieval Belt: an item it's holding (1 Bulk or less)".
// (stored: the spell it holds, { name, rank }, for its stored-spell ops — src/compiler/stored-spell.js.)
export function objectsText(objects, item = {}, stored = null) {
    if (objects.op === "cast-stored" && stored) return `${stored.name} (rank ${stored.rank}) cast from ${item.name ?? "it"} at ${objects.at === "attacker" ? "the attacker (target it)" : "the creatures its user targets"}; it's empty after`;
    if (objects.op === "cast-stored") return `Nothing stored: store ${objects.store?.from === "scroll" ? "one of its user's scrolls that fits (the scroll is burned)" : "one of its user's spells that fits (spending its casting is its user's own)"}`;
    if (objects.op === "ready-stored") return stored ? `Ready to unleash ${stored.name} on a foe that hits its user, until its next turn` : `Nothing stored in ${item.name ?? "it"} to unleash`;
    if (objects.op === "expend-stored") return stored ? `${stored.name} let go: ${item.name ?? "it"} is empty` : `Nothing stored in ${item.name ?? "it"}`;
    const limit = Number.isFinite(objects.maxBulk) ? ` (${BULK_WORDS(objects.maxBulk)} or less)` : "";
    if (objects.op === "store") return `Into ${item.name ?? "it"}: an item it's holding${limit}`;
    if (objects.op === "retrieve") return `Out of ${item.name ?? "it"}, into a hand: an item stored in it`;
    if (objects.op === "hand") return objects.self ? `${item.name ?? "It"} to its user's hand` : `To its user's hand: one of its items${limit}`;
    if (objects.op === "don") return `${item.name ?? "It"} worn`;
    if (objects.op === "reshape") return objects.forms ? `${item.name ?? "It"} takes its other shape (a ${objects.forms.join(" or a ")}), its runes kept` : `${item.name ?? "It"} takes the shape of another melee weapon held in as many hands (picked), its runes kept`;
    if (objects.op === "repair" && objects.amount) return `${objects.amount} Hit Points restored, up to its maximum: one of its user's damaged items${objects.damagedBy ? ` (what the ${objects.damagedBy} did)` : ""}${limit}`;
    if (objects.op === "repair") return `Repaired to its full Hit Points, no longer broken: one of its user's items${limit}`;
    if (objects.op === "reload") return `Reloaded with one of its user's rounds for it: one of its user's weapons with reload ${objects.reload}`;
    // ("A +1 striking dagger in its user's hand, the last one gone: Strike with it".)
    if (objects.op === "create" && objects.choose) {
        const runes = (potency, striking) => (potency ? `+${potency}${striking ? ` ${["", "", "greater ", "major "][striking]}striking` : ""}` : "non-magical");
        return `A ${runes(objects.potency, objects.striking)} weapon of its user's choice in hand (picked)${objects.ammo ? `, with ${objects.ammo} pieces of its ammunition if it takes some` : ""}${objects.then ? `; ${runes(objects.then.potency, objects.then.striking)} after ${objects.then.after.value} minute` : ""}${objects.untilRest ? "; it crumbles at its user's next daily preparations" : ""}`;
    }
    if (objects.op === "create") {
        const runes = objects.potency ? `+${objects.potency}${objects.striking ? ` ${["", "", "greater ", "major "][objects.striking]}striking` : ""} ` : "";
        return `A ${runes}${objects.weapon} in its user's hand${objects.replaces ? ", the last one it made gone" : ""}${objects.whileHeld ? ", gone once it's out of the hand" : ""}: Strike with it`;
    }
    return objects.op;
}

// choices: [{ id, name }] — its user's items the op can take (none for its own).
export function createObjectsCard({ plan, item, user, choices = [], stored = null }) {
    return { kind: "objects", status: "open", plan, item, user, choices, pick: 0, results: [], ...(stored ? { stored } : {}) };
}

export function objectsCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const objects = state.plan.objects;
    // (A stored spell to cast: no item to pick.)
    // (Its own shape changed: the shape picked.)
    const own = (objects.self && objects.op !== "reshape" && !objects.choose) || (objects.op === "cast-stored" && Boolean(state.stored));
    const line = `<p class="aar-actions">${escape(objectsText(objects, state.item, state.stored ?? null))}.</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const picker = own ? ""
        : !state.choices.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} has no item it can take.</p>` : "")
            : open && canApply ? `<p class="aar-actions">${objects.op === "reshape" ? "Shape" : objects.choose ? "Weapon" : "Item"}: <select data-air-field="pick">${state.choices.map((choice, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(choice.name)}</option>`).join("")}</select></p>`
                : `<p class="aar-actions">${objects.op === "reshape" ? "Shape" : objects.choose ? "Weapon" : "Item"}: ${escape(state.choices[state.pick ?? 0]?.name ?? "")}</p>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const ready = own || state.choices.length;
    const controls = open && canApply && ready ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open && ready ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${line}${notes}${picker}${results}${controls}</section>`;
}
