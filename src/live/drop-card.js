// The drop card (src/compiler/drop-held.js): each creature a row makes drop what it holds, its held items listed — for "metallic items", the ones
// that look metal ticked (their material, else their kind), the GM's to change — and Drop puts the ticked ones on the ground. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const METALS = new Set(["adamantine", "cold-iron", "silver", "dawnsilver", "mithral", "orichalcum", "siccatite", "djezet", "inubrix", "noqual", "abysium", "keep-stone", "sovereign-steel", "duskwood-steel", "steel", "iron"]);
const NOT_METAL = new Set(["darkwood", "duskwood", "peachwood", "dragonhide", "warpglass", "sisterstone", "cryptic-wood", "wood", "leather", "cloth", "glass", "stone"]);
// (Weapon groups that are mostly metal: a blade, a head, a barrel. Bows, clubs, slings, bombs and fists aren't.)
const METAL_GROUPS = new Set(["sword", "axe", "knife", "pick", "hammer", "flail", "polearm", "spear", "dart", "firearm", "shield"]);

// Does the item look metal? Its material when PF2e says one; else a weapon's group, a shield's name ("steel shield"), or its name.
export function looksMetal(item) {
    const material = String(item?.system?.material?.type ?? "").toLowerCase();
    if (METALS.has(material)) return true;
    if (NOT_METAL.has(material)) return false;
    const name = `${item?.name ?? ""} ${item?.system?.baseItem ?? ""}`.toLowerCase();
    if (/\b(?:steel|iron|metal|chain|bronze|copper|brass|silver|gold|tin|lead)\b/.test(name)) return true;
    if (/\b(?:wood|wooden|bone|leather|rope|cloth|glass|staff|stave)\b/.test(name)) return false;
    if (item?.type === "weapon") return METAL_GROUPS.has(String(item.system?.group ?? "").toLowerCase());
    return false;
}

// creatures: [{ actorUuid, tokenUuid, name, held: [{ id, name, metal }], take? }].
// (One item its user picks of what a creature has, The Crows' and The Juggler's — dropHeld.one: none ticked till it's picked; a creature
// whose degree takes it, into its user's hand — take —, the others dropping it, 2026-10-27.)
export function createDropCard({ dropHeld, item, user, creatures }) {
    return {
        kind: "drop",
        status: "open",
        plan: { dropHeld },
        item,
        user,
        entries: creatures.map((creature) => ({ ...creature, held: creature.held.map((one) => ({ ...one, ticked: dropHeld.one ? false : dropHeld.metallic ? Boolean(one.metal) : true })) })),
        results: []
    };
}

// The items a creature has that the card lists (pure, of plain data: { id, name, type, carryType, bulk, inContainer }): what it holds — or,
// dropHeld.attended, what it holds, wears or carries outside a container, held first —, no heavier than dropHeld.maxBulk (light Bulk 0.1).
export function listedItems(items, dropHeld) {
    // (Only some kinds, dropHeld.types — The Liar's weapons, 2026-10-29.)
    const kinds = dropHeld?.types?.length ? dropHeld.types : ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo"];
    const physical = (items ?? []).filter((one) => kinds.includes(one.type));
    const fits = (one) => !Number.isFinite(Number(dropHeld?.maxBulk)) || (Number(one.bulk) || 0) <= Number(dropHeld.maxBulk);
    const kept = physical.filter((one) => fits(one) && (dropHeld?.attended ? !one.inContainer && ["held", "worn", "dropped"].includes(one.carryType) : one.carryType === "held"));
    return [...kept.filter((one) => one.carryType === "held"), ...kept.filter((one) => one.carryType !== "held")];
}

export function dropCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const metallic = state.plan.dropHeld?.metallic;
    const one = state.plan.dropHeld?.one;
    const rows = state.entries.map((entry, at) => {
        const items = entry.held.length
            ? entry.held.map((item, index) => `<label><input type="checkbox" data-air-drop="${at}:${index}"${item.ticked ? " checked" : ""}${open && canApply ? "" : " disabled"}> ${escape(item.name)}</label>`).join(" ")
            : one ? "has nothing it could be" : "holds nothing";
        return `<li>${escape(entry.name)}${one ? ` (${state.plan.dropHeld.curse ? "cursed" : entry.take ? "into its user's hand" : "dropped"})` : ""}: ${items}</li>`;
    }).join("");
    const hint = metallic && open ? `<p class="aar-hint">Ticked: what looks metal by its material or kind; the GM's to change.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const pickHint = one && open ? `<p class="aar-hint">Tick the one item ${escape(state.user?.name ?? "its user")} picked${state.plan.dropHeld.maxBulk ? ` (${state.plan.dropHeld.maxBulk} Bulk or less)` : ""}.</p>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${state.plan.dropHeld?.curse ? "Curse the ticked weapon" : one ? "Move the ticked item" : "Drop the ticked items"}</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${one ? "one item it picks" : metallic ? "drops the metal items it holds" : "drops what it holds"}</span></header><ul class="aar-notes">${rows}</ul>${hint}${pickHint}${results}${controls}</section>`;
}
