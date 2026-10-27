// Live play for a creature its user picks before it's made (plan.pick, src/compiler/creature-readings.js: Dust of Corpse Animation's skeleton
// or zombie of level 3 or lower, Oil of Dynamism's animated object): a list of the compendiums' creatures that fit (PF2e's rulebook
// bestiaries, as the ability module's summons offer them — src/live/conjured.js pickCandidates), filtered by name, on the using client;
// what must be there first (plan.needs) said above it. { uuid, name }, or null when none is picked.

import { CORE_PACKS } from "../../pf2e-automatic-ability-resolution/src/compiler/gm-fallback.js";
import { pickCandidates } from "../src/live/conjured.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

let indexCache = null;
async function creatureIndex() {
    if (indexCache) return indexCache;
    const packs = game.packs.filter((pack) => pack.documentName === "Actor" && pack.metadata.packageName === "pf2e" && CORE_PACKS.has(pack.metadata.name));
    const entries = [];
    for (const pack of packs) {
        const index = await pack.getIndex({ fields: ["system.details.level.value", "system.traits.value", "system.traits.rarity", "type"] });
        for (const entry of index) entries.push({ uuid: entry.uuid ?? `Compendium.${pack.collection}.Actor.${entry._id}`, name: entry.name, level: Number(entry.system?.details?.level?.value), traits: entry.system?.traits?.value ?? [], rarity: entry.system?.traits?.rarity ?? "common", type: entry.type });
    }
    indexCache = entries;
    return entries;
}

export async function pickConjured(plan, itemName) {
    // (Of a rarity only, The Hollow Star's common aberration.)
    const entries = pickCandidates((await creatureIndex()).filter((entry) => !plan.pick?.rarity || entry.rarity === plan.pick.rarity), plan.pick);
    if (!entries.length) {
        ui.notifications.warn(`${itemName}: no creature in the compendiums fits.`);
        return null;
    }
    const kinds = [plan.pick.any?.length ? plan.pick.any.join(" or ") : null, plan.pick.all?.length ? plan.pick.all.join(" and ") : null].filter(Boolean).join(", ");
    const options = entries.map((entry, index) => `<option value="${escape(entry.uuid)}"${index ? "" : " selected"}>${escape(entry.name)} (${entry.level})</option>`).join("");
    const content = `${plan.needs ? `<p>Only with ${escape(plan.needs)}.</p>` : ""}<p>A creature: ${escape(kinds || "any")}${Number.isFinite(plan.pick.maxLevel) ? `, level ${plan.pick.maxLevel} or lower` : ""}.</p><input type="search" name="filter" placeholder="Filter by name" autocomplete="off"><select name="creature" size="12" style="width: 100%; height: 18em; margin-top: 4px">${options}</select>`;
    const uuid = await foundry.applications.api.DialogV2.wait({
        window: { title: itemName },
        content,
        buttons: [
            { action: "make", label: "Choose", default: true, callback: (_event, button) => button.form?.elements?.creature?.value || null },
            { action: "cancel", label: "Cancel", callback: () => null }
        ],
        render: (_event, dialog) => {
            const root = dialog.element ?? dialog;
            const filter = root.querySelector?.("input[name=filter]");
            const select = root.querySelector?.("select[name=creature]");
            filter?.addEventListener("input", () => {
                const words = filter.value.trim().toLowerCase();
                for (const option of select.options) option.hidden = Boolean(words) && !option.textContent.toLowerCase().includes(words);
            });
        },
        rejectClose: false
    }).catch(() => null);
    // (Foundry's dialog answers "cancel" when its callback gives nothing: only a creature from the list counts.)
    const chosen = entries.find((entry) => entry.uuid === uuid);
    return chosen ? { uuid: chosen.uuid, name: chosen.name } : null;
}
