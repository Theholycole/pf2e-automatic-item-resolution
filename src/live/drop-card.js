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

// creatures: [{ actorUuid, tokenUuid, name, held: [{ id, name, metal }] }].
export function createDropCard({ dropHeld, item, user, creatures }) {
    return {
        kind: "drop",
        status: "open",
        plan: { dropHeld },
        item,
        user,
        entries: creatures.map((creature) => ({ ...creature, held: creature.held.map((one) => ({ ...one, ticked: dropHeld.metallic ? Boolean(one.metal) : true })) })),
        results: []
    };
}

export function dropCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const metallic = state.plan.dropHeld?.metallic;
    const rows = state.entries.map((entry, at) => {
        const items = entry.held.length
            ? entry.held.map((one, index) => `<label><input type="checkbox" data-air-drop="${at}:${index}"${one.ticked ? " checked" : ""}${open && canApply ? "" : " disabled"}> ${escape(one.name)}</label>`).join(" ")
            : "holds nothing";
        return `<li>${escape(entry.name)}: ${items}</li>`;
    }).join("");
    const hint = metallic && open ? `<p class="aar-hint">Ticked: what looks metal by its material or kind; the GM's to change.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Drop the ticked items</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${metallic ? "drops the metal items it holds" : "drops what it holds"}</span></header><ul class="aar-notes">${rows}</ul>${hint}${results}${controls}</section>`;
}
