// Live play for etching a rune from its runestone (src/compiler/etching.js, the user's request of 2026-10-16): an Etch
// button (a hammer) on a rune item's row of its owner's sheet. Its dialog picks the weapon, armor or shield it fits (and an
// Energy-Resistant rune's energy) and, for a character etching it themselves, a Crafting check at the rune's DC. On a
// success, or with no check, the rune goes onto the item and the runestone is used up (one of a stack); on a failure it
// stays and nothing changes. The rune's own activations are pressed from the item it's etched onto (src/compiler/runes.js),
// not from the runestone.
// (A rune key PF2e's rune selects have no option for, Forgefather's Seal's on armor: PF2e's weapon and armor sheets rebuild
// system.runes.property from those selects on any edit, so each such select gets the key's option, chosen — the sheet's next save keeps
// it. 2026-10-29, src/compiler/worn-rune.js.)

import { ENERGIES, etchUpdate, fitProblem, needsEnergy, runeDC } from "../src/compiler/etching.js";
import { isRuneItem } from "../src/compiler/runes.js";
import { MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dataOf = (item) => ({ ...item.toObject(false), uuid: item.uuid });
const ONTO = ["weapon", "armor", "shield"];

// runes: PF2e's rune items by key (src/compiler/runes.js runeIndex), read as it's needed (it's indexed at ready).
export function setUpEtching({ runes = () => new Map() } = {}) {
    Hooks.on("renderCreatureSheetPF2e", (sheet, html) => {
        try {
            addButtons(sheet, html);
        } catch (error) {
            console.error(`${MODULE_ID} | etch buttons`, error);
        }
    });
    Hooks.on("renderItemSheet", (sheet, html) => {
        try {
            keepUnknownKeys(sheet.item ?? sheet.document, html instanceof HTMLElement ? html : html?.[0], runes());
        } catch (error) {
            console.error(`${MODULE_ID} | rune selects`, error);
        }
    });
}

// The item's property rune selects (PF2e's "system.runes.property.<n>"): the key in that slot, when the select has no option for it, added
// and chosen, named as PF2e's rune item is.
function keepUnknownKeys(item, root, index) {
    if (!item || !ONTO.includes(item.type) || !root?.querySelectorAll) return;
    const keys = item.system?.runes?.property ?? [];
    for (const select of root.querySelectorAll('select[name^="system.runes.property."]')) {
        const key = Array.isArray(keys) ? keys[Number(select.name.split(".").pop())] : null;
        if (typeof key !== "string" || !key || [...select.options].some((option) => option.value === key)) continue;
        const option = document.createElement("option");
        option.value = key;
        option.textContent = index?.get?.(key)?.name ?? key;
        select.append(option);
        select.value = key;
    }
}

function addButtons(sheet, html) {
    const actor = sheet.actor;
    if (!actor || !(game.user.isGM || actor.isOwner)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    for (const row of root?.querySelectorAll?.("li[data-item-id]") ?? []) {
        const item = actor.items.get(row.dataset.itemId);
        if (!item || !isRuneItem(item) || row.querySelector(".air-etch")) continue;
        const anchor = row.querySelector('.item-name h4 [data-action="toggle-summary"]') ?? row.querySelector(".item-name h4") ?? row.querySelector(".item-name");
        if (!anchor) continue;
        const button = document.createElement("a");
        button.className = "air-etch";
        button.dataset.tooltip = `Etch ${item.name} onto a weapon, armor or shield`;
        button.setAttribute("aria-label", button.dataset.tooltip);
        button.innerHTML = `<i class="fa-solid fa-hammer"></i>`;
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            etchDialog(item).catch((error) => {
                ui.notifications.error(`${item.name}: ${error.message}`);
                console.error(`${MODULE_ID} |`, error);
            });
        });
        anchor.after(button);
    }
}

// The dialog: the item to etch it onto, an Energy-Resistant rune's energy, and the optional Crafting check.
export async function etchDialog(rune) {
    const actor = rune.actor;
    const targets = (actor?.items?.contents ?? [...(actor?.items ?? [])]).filter((item) => ONTO.includes(item.type) && !fitProblem(dataOf(rune), dataOf(item)));
    if (!targets.length) {
        ui.notifications.warn(`${actor?.name ?? "Its owner"} has nothing ${rune.name} can be etched onto.`);
        return false;
    }
    const dc = runeDC(dataOf(rune));
    const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: `Etch ${rune.name}` },
        position: { width: 460 },
        content: `<p>Etch ${escape(rune.name)} onto one of ${escape(actor.name)}'s items. The runestone is used up.</p>
            <div class="form-group"><label>Onto</label><div class="form-fields"><select name="target">${targets.map((item) => `<option value="${item.id}">${escape(item.name)}</option>`).join("")}</select></div></div>
            ${needsEnergy(dataOf(rune)) ? `<div class="form-group"><label>Energy</label><div class="form-fields"><select name="energy">${ENERGIES.map((energy) => `<option value="${energy}">${energy[0].toUpperCase()}${energy.slice(1)}</option>`).join("")}</select></div></div>` : ""}
            <div class="form-group"><label>Crafting check</label><div class="form-fields"><input type="checkbox" name="craft" /></div><p class="hint">Tick it when ${escape(actor.name)} etches the rune themselves: a Crafting check at DC ${dc}, and the rune is etched only on a success. Untick it for a rune etched for them.</p></div>`,
        buttons: [
            { action: "etch", label: "Etch", icon: "fa-solid fa-hammer", default: true, callback: (event, button) => ({ target: button.form.elements.target.value, craft: button.form.elements.craft.checked, energy: button.form.elements.energy?.value ?? null }) },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
    });
    if (!picked || typeof picked !== "object") return false;
    return etchRune(rune, actor.items.get(picked.target), picked);
}

// (PF2e's Automatic Bonus Progression: its slots by level, not by potency rune.)
function abpOn() {
    try {
        return game.settings.get("pf2e", "automaticBonusVariant") !== "noABP";
    } catch {
        return false;
    }
}

// The degree of a PF2e check roll: 0 critical failure … 3 critical success; null when there's none.
const degreeOf = (roll) => {
    const degree = roll?.degreeOfSuccess ?? roll?.options?.degreeOfSuccess;
    return Number.isInteger(degree) ? degree : null;
};

// Etches the rune onto the item: true when it's done. options: craft (the Crafting check first), energy, skipDialog (PF2e's
// roll dialog, for code).
export async function etchRune(rune, target, { craft = false, energy = null, skipDialog = undefined } = {}) {
    const actor = rune?.actor;
    if (!actor || !target) throw new Error("The rune or the item isn't there any more.");
    const config = target.type === "armor" ? CONFIG.PF2E?.armorPropertyRunes : CONFIG.PF2E?.weaponPropertyRunes;
    const keys = config ? new Set(Object.keys(config)) : null;
    const result = etchUpdate(dataOf(rune), dataOf(target), { keys: keys?.size ? keys : null, abp: abpOn(), energy });
    if (result.problem) {
        ui.notifications.warn(result.problem);
        return false;
    }
    const speaker = ChatMessage.getSpeaker({ actor });
    if (craft) {
        const dc = runeDC(dataOf(rune));
        const crafting = actor.skills?.crafting ?? actor.getStatistic?.("crafting");
        if (!crafting) throw new Error(`${actor.name} has no Crafting to roll.`);
        const roll = await crafting.roll({ dc: { value: dc }, label: `Crafting: etch ${rune.name}`, extraRollOptions: ["action:craft", "etch-rune"], ...(skipDialog !== undefined ? { skipDialog } : {}) });
        const degree = degreeOf(roll);
        if (degree === null) {
            ui.notifications.warn("The Crafting check wasn't rolled: nothing is etched.");
            return false;
        }
        if (degree < 2) {
            await ChatMessage.create({ speaker, content: `<p><strong>${escape(rune.name)}</strong>: ${escape(actor.name)} fails the Crafting check (DC ${dc}). The rune isn't etched, and the runestone is unharmed.${degree === 0 ? " What a critical failure costs in materials is the GM's call." : ""}</p>` });
            return false;
        }
    }
    await target.update(result.update);
    if ((Number(rune.system?.quantity) || 1) > 1) await rune.update({ "system.quantity": Number(rune.system.quantity) - 1 });
    else await rune.delete();
    await ChatMessage.create({ speaker, content: `<p>${escape(actor.name)} etches <strong>${escape(result.words)}</strong>${result.replaced.length ? ", in place of its lesser grade" : ""}. The runestone is used up.</p>` });
    return true;
}
