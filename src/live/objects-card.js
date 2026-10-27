// The objects card (src/compiler/objects.js): what an item does to one of its user's items, or to itself — stored in it, out of it into a
// hand, to a hand, worn, repaired, a weapon made in the hand, a weapon reloaded — the item picked on the card from the user's own (its choices, made when the card is posted). Pure.

import { pauseWords } from "./shield-repair.js";

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
    // (Another creature's item damaged, Rustbringer's: the targeted creature's.)
    if (objects.op === "damage") return `${objects.formula}${objects.type && objects.type !== "untyped" ? ` ${objects.type}` : ""} damage to the targeted creature's ${objects.of}${objects.ignoresHardness ? ", ignoring its Hardness" : ""} (rolled, its Hit Points lowered: Broken at its Broken Threshold, destroyed at 0)`;
    // (Charges stored in itself from a spell, Conflagration Club's Absorb Arcana: the slot's rank typed, of the type picked.)
    if (objects.op === "charge") return `${item.name ?? "It"} gains charges equal to ${objects.typed} (typed below), attuned to ${objects.attune}${objects.onlyWhenEmpty ? " (only when it has none)" : ""}`;
    // (Itself, by an amount its trigger dealt: Sanguine Klar's bleed damage, typed on the card.)
    if (objects.op === "repair" && objects.typed) return `${item.name ?? "It"} regains Hit Points equal to ${objects.typed} (typed below)${objects.upTo === "hardness" ? ", at most its Hardness" : ""}, up to its maximum`;
    // (The item its talisman is affixed to, once the damage lands: Mending Lattice's, Fortifying Pebble's.)
    if (objects.op === "repair" && objects.affixed && objects.less) return `${objects.amount} of the damage the item it's affixed to just took taken back (${objects.amount} Hit Points restored, no more than it took): pick that item once the damage lands`;
    if (objects.op === "repair" && objects.affixed && objects.negates) return `The damage negated: the item it's affixed to repaired to its full Hit Points, no longer broken — pick that item once the damage lands`;
    if (objects.op === "repair" && objects.amount) return `${objects.amount} Hit Points restored, up to its maximum: one of its user's damaged items${objects.damagedBy ? ` (what the ${objects.damagedBy} did)` : ""}${limit}`;
    // (Within its user's reach, its own or another's, up to a level, even a destroyed one — Forgefather's Seal's Seal of Mending, 2026-10-27.)
    if (objects.op === "repair" && objects.reach) return `Repaired to its full Hit Points${objects.destroyed ? ", even if destroyed" : ""}, no longer broken: an item of its user's or of a creature within its reach${Number.isFinite(objects.maxLevel) ? `, of level ${objects.maxLevel} or lower` : ""}${objects.pauses ? `; then ${pauseWords(objects.pauses)}` : ""}`;
    if (objects.op === "repair") return `Repaired to its full Hit Points, no longer broken: one of its user's items${limit}`;
    if (objects.op === "reload" && objects.recalled) return `The round it just missed with back in it, loaded: the firearm it's affixed to (one of its user's weapons with reload ${objects.reload}), no other round spent`;
    if (objects.op === "reload") return `Reloaded with one of its user's rounds for it: one of its user's weapons with reload ${objects.reload}`;
    // ("A +1 striking dagger in its user's hand, the last one gone: Strike with it".)
    if (objects.op === "create" && objects.choose) {
        const runes = (potency, striking) => (potency ? `+${potency}${striking ? ` ${["", "", "greater ", "major "][striking]}striking` : ""}` : "non-magical");
        return `A ${runes(objects.potency, objects.striking)} weapon of its user's choice in hand (picked)${objects.ammo ? `, with ${objects.ammo} pieces of its ammunition if it takes some` : ""}${objects.then ? `; ${runes(objects.then.potency, objects.then.striking)} after ${objects.then.after.value} minute` : ""}${objects.untilRest ? "; it crumbles at its user's next daily preparations" : ""}`;
    }
    if (objects.op === "create") {
        const runes = objects.potency ? `+${objects.potency}${objects.striking ? ` ${["", "", "greater ", "major "][objects.striking]}striking` : ""} ` : "";
        // (Several, Chain of Stars' shuriken: their damage type, each gone after its attack; whom and from where they Strike.)
        if (objects.quantity > 1) return `${objects.quantity} ${runes}${objects.weapon}s${objects.damageType ? ` of ${objects.damageType}` : ""} for its user${objects.vanishAfterAttack ? ", each gone after its attack roll" : ""}: Strike with them — up to ${objects.strikes?.count ?? objects.quantity} Strikes, each at a different creature and not the one it hit, as though from that creature's space (measure from there); its multiple attack penalty rises only after the last (the same PF2e button for each)`;
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
    // (Another creature's item, Rustbringer's: its owner targeted first, its items listed after the first Apply when it has several.)
    const theirs = objects.whose === "target";
    const picker = own ? ""
        : !state.choices.length ? (open ? `<p class="aar-hint">${theirs ? `Target the creature whose ${escape(objects.of)} it is, then Apply.` : `${escape(state.user.name)} has no item it can take.`}</p>` : "")
            : open && canApply ? `<p class="aar-actions">${objects.op === "reshape" ? "Shape" : objects.choose ? "Weapon" : theirs && state.owner ? `${escape(state.owner.name)}'s ${escape(objects.of)}` : "Item"}: <select data-air-field="pick">${state.choices.map((choice, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(choice.name)}</option>`).join("")}</select></p>`
                : `<p class="aar-actions">${objects.op === "reshape" ? "Shape" : objects.choose ? "Weapon" : "Item"}: ${escape(state.choices[state.pick ?? 0]?.name ?? "")}</p>`;
    // (An amount its user types, Sanguine Klar's bleed damage.)
    const typed = objects.typed && open && canApply ? `<p class="aar-actions">${escape(objects.typed.charAt(0).toUpperCase() + objects.typed.slice(1))}: <input type="number" min="0" step="1" data-air-field="amount" value="${escape(state.amount ?? "")}"></p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const ready = own || state.choices.length || theirs;
    const controls = open && canApply && ready ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open && ready ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${line}${notes}${picker}${typed}${results}${controls}</section>`;
}
