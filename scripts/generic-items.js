// Live play for the module's own items (packs/_source/items, the user's requests of 2026-10-16), which ask for what they
// are when they first go into an inventory:
// - the generic spellgun asks for the spell it mimics and its rank (src/compiler/generic-spellgun.js); the spell's plan is
//   the spell module's, through the core, and is kept on the item;
// - the gun staff asks for a two-handed firearm and a staff to merge with it (src/compiler/gun-staff.js), and gets a
//   Reinforced Stock attached that keeps its runes.
// The picker opens for the user who put the item there. Closed without a pick, the item's sheet has a button for it; a generic
// spellgun used with no spell comes back, as nothing happened.

import { GENERIC_SPELLGUN, isPending as spellgunPending, loadedUpdate, lowestRank, pickable, spellgunFromSpell } from "../src/compiler/generic-spellgun.js";
import { GUN_STAFF, REINFORCED_STOCK, firearmProblem, gunStaffUpdate, isBaseFirearm, isPending as gunStaffPending, isStaff } from "../src/compiler/gun-staff.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dataOf = (item) => ({ ...item.toObject(false), uuid: item.uuid });
const open = new Set();

export function setUpGenericItems() {
    Hooks.on("createItem", (item, options, userId) => {
        if (!item.actor || (options?.[MODULE_ID]?.pickFor ?? userId) !== game.user.id) return;
        offer(item).catch((error) => console.error(`${MODULE_ID} | ${item.name}`, error));
    });
    Hooks.on("renderItemSheet", (sheet, html) => {
        try {
            addSheetButton(sheet.item ?? sheet.document, html instanceof HTMLElement ? html : html?.[0]);
        } catch (error) {
            console.error(`${MODULE_ID} | sheet button`, error);
        }
    });
    // (The Reinforced Stock keeps the gun staff's runes: etching one on the gun staff etches it on the stock.)
    Hooks.on("updateItem", (item, changes, options, userId) => {
        if (userId !== game.user.id || !changes?.system?.runes || !item.flags?.[MODULE_ID]?.[GUN_STAFF]?.staff) return;
        const runes = foundry.utils.deepClone(item._source.system.runes);
        const subitems = item._source.system.subitems ?? [];
        if (!subitems.some((sub) => sub.type === "weapon" && JSON.stringify(sub.system?.runes) !== JSON.stringify(runes))) return;
        const next = subitems.map((sub) => (sub.type === "weapon" ? { ...sub, system: { ...sub.system, runes } } : sub));
        item.update({ "system.subitems": next }).catch((error) => console.error(`${MODULE_ID} | stock runes`, error));
    });
}

function offer(item) {
    if (spellgunPending(item)) return pickSpell(item);
    if (gunStaffPending(item)) return pickGunStaff(item);
    return Promise.resolve();
}

// A pending item's sheet: a line and a button that opens its picker.
function addSheetButton(item, root) {
    if (!item || !root || !item.isOwner || root.querySelector(".air-generic-pick")) return;
    const what = spellgunPending(item) ? "spellgun" : gunStaffPending(item) ? "gun staff" : null;
    if (!what) return;
    const box = document.createElement("div");
    box.className = "air-generic-pick";
    box.style.cssText = "display:flex;gap:0.5em;align-items:center;margin:0.25em 0.5em;padding:0.25em 0.5em;border:1px solid var(--color-border-highlight, #ff6400);border-radius:4px";
    box.innerHTML = what === "spellgun"
        ? `<span style="flex:1">This spellgun holds no spell yet.</span><button type="button">Load a spell</button>`
        : `<span style="flex:1">This gun staff isn't merged yet.</span><button type="button">Pick its firearm and staff</button>`;
    box.querySelector("button").addEventListener("click", () => offer(item).catch((error) => console.error(`${MODULE_ID} | ${item.name}`, error)));
    (root.querySelector(".sheet-body") ?? root.querySelector("form") ?? root).prepend(box);
}

// --- Choices, from every Item compendium (and the world's items) ---

let indexed = null;
async function itemIndex() {
    indexed ??= (async () => {
        const fields = ["system.level.value", "system.traits.value", "system.traits.rarity", "system.defense", "system.damage", "system.ritual", "system.group", "system.usage.value"];
        const entries = [];
        for (const pack of game.packs.filter((entry) => entry.documentName === "Item")) {
            try {
                for (const entry of await pack.getIndex({ fields })) entries.push({ ...entry, uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`, from: pack.metadata.label });
            } catch (error) {
                console.warn(`${MODULE_ID} | ${pack.collection} couldn't be indexed.`, error);
            }
        }
        for (const item of game.items ?? []) entries.push({ ...item.toObject(false), uuid: item.uuid, from: "World" });
        return entries;
    })();
    return indexed;
}

// The choices, labelled by name (with where from, when two share a name), sorted.
function labelled(entries) {
    const counts = new Map();
    for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    return entries.map((entry) => ({ ...entry, label: counts.get(entry.name) > 1 ? `${entry.name} (${entry.from})` : entry.name })).sort((a, b) => a.label.localeCompare(b.label));
}

const listHTML = (id, choices) => `<datalist id="${id}">${choices.map((choice) => `<option value="${escape(choice.label)}"></option>`).join("")}</datalist>`;

// A dropped item's document, or null.
async function droppedItem(event) {
    const editor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const data = editor?.getDragEventData?.(event) ?? null;
    return data?.type === "Item" && data.uuid ? fromUuid(data.uuid).catch(() => null) : null;
}

// DialogV2's render callback gives the dialog (v13+) or its element.
const elementOf = (dialog) => dialog?.element ?? (dialog instanceof HTMLElement ? dialog : null);

// --- The generic spellgun ---

async function pickSpell(item) {
    if (open.has(item.uuid)) return;
    open.add(item.uuid);
    try {
        const choices = labelled((await itemIndex()).filter(pickable));
        const byLabel = new Map(choices.map((choice) => [choice.label, choice]));
        let dropped = null;
        const listId = `air-spells-${foundry.utils.randomID()}`;
        const ranks = Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("");
        const picked = await foundry.applications.api.DialogV2.wait({
            window: { title: `Load ${item.name}` },
            position: { width: 480 },
            content: `<p>Pick the spell ${escape(item.actor?.name ?? "its owner")}'s spellgun mimics: type to find it, or drop a spell here. A hit affects the target as if it failed its save against the spell (a spell attack spell: as the spell's hit); a critical hit as if it critically failed.</p>
                <div class="form-group"><label>Spell</label><div class="form-fields"><input type="text" name="spell" list="${listId}" autocomplete="off" autofocus /></div></div>
                ${listHTML(listId, choices)}
                <div class="form-group"><label>Rank</label><div class="form-fields"><select name="rank">${ranks}</select></div></div>`,
            buttons: [
                { action: "load", label: "Load", icon: "fa-solid fa-wand-sparkles", default: true, callback: (event, button) => ({ label: button.form.elements.spell.value.trim(), rank: Number(button.form.elements.rank.value) }) },
                { action: "later", label: "Not now", icon: "fa-solid fa-xmark" }
            ],
            render: (event, dialog) => {
                const root = elementOf(dialog);
                const input = root?.querySelector("[name=spell]");
                const rank = root?.querySelector("[name=rank]");
                if (!input || !rank) return;
                // (The ranks below the spell's own aren't offered.)
                const fit = (lowest) => {
                    for (const option of rank.options) option.disabled = Number(option.value) < lowest;
                    if (Number(rank.value) < lowest) rank.value = String(lowest);
                };
                input.addEventListener("input", () => {
                    const choice = byLabel.get(input.value.trim());
                    if (choice) fit(lowestRank(choice));
                });
                root.addEventListener("dragover", (drag) => drag.preventDefault());
                root.addEventListener("drop", async (drop) => {
                    drop.preventDefault();
                    const document = await droppedItem(drop);
                    if (document?.type !== "spell") return void ui.notifications.warn("Drop a spell.");
                    dropped = document;
                    input.value = document.name;
                    fit(lowestRank(document));
                });
            },
            rejectClose: false
        });
        if (!picked || typeof picked !== "object") return;
        const uuid = dropped && dropped.name === picked.label ? dropped.uuid : byLabel.get(picked.label)?.uuid ?? choices.find((choice) => choice.name === picked.label)?.uuid;
        if (!uuid) {
            ui.notifications.warn(picked.label ? `There's no spell "${picked.label}" to pick.` : "Pick a spell.");
            open.delete(item.uuid);
            return pickSpell(item);
        }
        const loaded = await loadSpell(item, uuid, picked.rank);
        if (!loaded) {
            open.delete(item.uuid);
            return pickSpell(item);
        }
    } finally {
        open.delete(item.uuid);
    }
}

// The spell loaded at the rank: false when a hit would carry nothing of it.
export async function loadSpell(item, uuid, rank) {
    const spell = await fromUuid(uuid).catch(() => null);
    if (spell?.type !== "spell") {
        ui.notifications.warn("That isn't a spell.");
        return false;
    }
    const source = dataOf(spell);
    const at = Math.max(lowestRank(source), Math.min(10, Number(rank) || lowestRank(source)));
    const core = game.modules.get(CORE_ID)?.api;
    let spellPlan = null;
    try {
        spellPlan = (await core?.registry?.preparePlan?.(spell))?.plan ?? null;
    } catch (error) {
        console.warn(`${MODULE_ID} | ${spell.name} couldn't be compiled.`, error);
    }
    const plan = spellgunFromSpell(spellPlan ? foundry.utils.deepClone(spellPlan) : null, { spell: source, rank: at });
    if (!plan) {
        ui.notifications.warn(`A spellgun's hit can't carry ${spell.name}: it has no save, spell attack or damage the modules read. Pick another spell.`);
        return false;
    }
    await item.update(loadedUpdate(source, at, plan));
    ui.notifications.info(`${item.actor?.name ?? "The"} spellgun is loaded with ${spell.name} at rank ${at}.`);
    return true;
}

// A generic spellgun used with no spell in it (scripts/live.js, on the active GM's client): it comes back, and its user is told.
export async function restoreUnloaded(used, message) {
    const actor = used.actor ?? message?.actor ?? null;
    if (!actor) return;
    // (PF2e's Use posts its message before it takes the dose: that's waited for, so it isn't done after the item is back.)
    const before = Number(used.data.system?.quantity) || 1;
    let live = null;
    for (let tries = 0; tries < 20; tries++) {
        live = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
        if (!live || Number(live.system?.quantity) < before) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const author = message?.author?.id ?? message?.user?.id ?? null;
    if (live) await live.update({ "system.quantity": before });
    else {
        const { uuid, ...data } = used.data;
        await actor.createEmbeddedDocuments("Item", [data], { keepId: true, [MODULE_ID]: { pickFor: author } });
    }
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: [...new Set([author, ...game.users.filter((user) => user.isGM).map((user) => user.id)].filter(Boolean))],
        content: `<p><strong>${escape(used.data.name)}</strong> holds no spell yet, so nothing happened: it's back in ${escape(actor.name)}'s inventory. Load a spell from its sheet first.</p>`
    });
}

export const isUnloadedSpellgun = (data) => spellgunPending(data);

// --- The gun staff ---

async function pickGunStaff(item) {
    if (open.has(item.uuid)) return;
    open.add(item.uuid);
    try {
        const index = await itemIndex();
        const firearms = labelled(index.filter(isBaseFirearm));
        const staves = labelled(index.filter(isStaff));
        const firearmsBy = new Map(firearms.map((choice) => [choice.label, choice]));
        const stavesBy = new Map(staves.map((choice) => [choice.label, choice]));
        const dropped = {};
        const ids = { firearm: `air-firearms-${foundry.utils.randomID()}`, staff: `air-staves-${foundry.utils.randomID()}` };
        const picked = await foundry.applications.api.DialogV2.wait({
            window: { title: `Merge ${item.name}` },
            position: { width: 480 },
            content: `<p>Pick the firearm ${escape(item.actor?.name ?? "its owner")}'s gun staff is built on (a two-handed one) and the staff merged with it: type to find them, or drop them here. It becomes a +1 firearm with a Reinforced Stock attached that holds the staff's spells, as the Musket Staff of Force does.</p>
                <div class="form-group"><label>Firearm</label><div class="form-fields"><input type="text" name="firearm" list="${ids.firearm}" autocomplete="off" autofocus /></div></div>
                ${listHTML(ids.firearm, firearms)}
                <div class="form-group"><label>Staff</label><div class="form-fields"><input type="text" name="staff" list="${ids.staff}" autocomplete="off" /></div></div>
                ${listHTML(ids.staff, staves)}`,
            buttons: [
                { action: "merge", label: "Merge", icon: "fa-solid fa-gun", default: true, callback: (event, button) => ({ firearm: button.form.elements.firearm.value.trim(), staff: button.form.elements.staff.value.trim() }) },
                { action: "later", label: "Not now", icon: "fa-solid fa-xmark" }
            ],
            render: (event, dialog) => {
                const root = elementOf(dialog);
                if (!root) return;
                root.addEventListener("dragover", (drag) => drag.preventDefault());
                root.addEventListener("drop", async (drop) => {
                    drop.preventDefault();
                    const document = await droppedItem(drop);
                    if (!document) return;
                    if (isStaff(document)) {
                        dropped.staff = document;
                        root.querySelector("[name=staff]").value = document.name;
                    } else if (document.type === "weapon" && document.system?.group === "firearm") {
                        const problem = firearmProblem(document);
                        if (problem) return void ui.notifications.warn(problem);
                        dropped.firearm = document;
                        root.querySelector("[name=firearm]").value = document.name;
                    } else ui.notifications.warn(`${document.name} is neither a two-handed firearm nor a staff.`);
                });
            },
            rejectClose: false
        });
        if (!picked || typeof picked !== "object") return;
        const uuidOf = (kind, by, list) => (dropped[kind] && dropped[kind].name === picked[kind] ? dropped[kind].uuid : by.get(picked[kind])?.uuid ?? list.find((choice) => choice.name === picked[kind])?.uuid);
        const firearmUuid = uuidOf("firearm", firearmsBy, firearms);
        const staffUuid = uuidOf("staff", stavesBy, staves);
        if (!firearmUuid || !staffUuid) {
            ui.notifications.warn(!firearmUuid ? `Pick a two-handed firearm${picked.firearm ? ` ("${picked.firearm}" isn't one)` : ""}.` : `Pick a staff${picked.staff ? ` ("${picked.staff}" isn't one)` : ""}.`);
            open.delete(item.uuid);
            return pickGunStaff(item);
        }
        if (!(await mergeGunStaff(item, firearmUuid, staffUuid))) {
            open.delete(item.uuid);
            return pickGunStaff(item);
        }
    } finally {
        open.delete(item.uuid);
    }
}

// The gun staff merged from the firearm and the staff: false when either won't do.
export async function mergeGunStaff(item, firearmUuid, staffUuid) {
    const [firearm, staff, stock] = await Promise.all([firearmUuid, staffUuid, REINFORCED_STOCK].map((uuid) => fromUuid(uuid).catch(() => null)));
    const problem = !firearm ? "That firearm isn't there any more." : firearmProblem(firearm) ?? (!staff || !isStaff(staff) ? `${staff?.name ?? "That"} isn't a staff.` : null);
    if (problem) {
        ui.notifications.warn(problem);
        return false;
    }
    const update = gunStaffUpdate(item.toObject(), dataOf(firearm), dataOf(staff), { stock: stock ? dataOf(stock) : null, id: foundry.utils.randomID() });
    await item.update(update);
    ui.notifications.info(`${item.actor?.name ?? "The"} gun staff is now ${update.name}.`);
    return true;
}

export { GENERIC_SPELLGUN };
