// Live play for the module's own items (packs/_source/items, the user's requests of 2026-10-16), which ask for what they
// are when they first go into an inventory:
// - the generic spellgun asks for the spell it mimics and its rank (src/compiler/generic-spellgun.js); the spell's plan is
//   the spell module's, through the core, and is kept on the item;
// - the gun staff asks for a two-handed firearm and a staff to merge with it (src/compiler/gun-staff.js), and gets a
//   Reinforced Stock attached that keeps its runes.
// The picker opens for the user who put the item there. Closed without a pick, the item's sheet has a button for it; a generic
// spellgun used with no spell comes back, as nothing happened.
// A spell dropped on a sheet's inventory (2026-10-20, the user's request): PF2e's maker of scrolls and wands offers a spellgun of it too,
// at the rank picked there, made loaded. A spell dropped on a generic spellgun (its sheet, or its row in an inventory) opens its picker
// with that spell.

import { GENERIC_SPELLGUN, isPending as spellgunPending, loadedUpdate, lowestRank, pickable, spellgunFromSpell } from "../src/compiler/generic-spellgun.js";
import { GUN_STAFF, REINFORCED_STOCK, firearmProblem, gunStaffUpdate, isBaseFirearm, isPending as gunStaffPending, isStaff } from "../src/compiler/gun-staff.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dataOf = (item) => ({ ...item.toObject(false), uuid: item.uuid });
const open = new Set();
const rootOf = (html) => (html instanceof HTMLElement ? html : html?.[0] ?? null);

// The generic spellgun in the module's compendium, and the same uuid without "Item." (Foundry reads it the same) for PF2e's maker: PF2e's
// crafting takes an item at one of the maker's uuids for a scroll or a wand and crafts nothing else, so the Generic Spellgun itself,
// crafted, is still crafted.
export const GENERIC_SPELLGUN_UUID = `Compendium.${MODULE_ID}.items.Item.airSpellgunGen01`;
const MAKER_UUID = `Compendium.${MODULE_ID}.items.airSpellgunGen01`;

export function setUpGenericItems() {
    Hooks.on("createItem", (item, options, userId) => {
        if (!item.actor || (options?.[MODULE_ID]?.pickFor ?? userId) !== game.user.id) return;
        offer(item).catch((error) => console.error(`${MODULE_ID} | ${item.name}`, error));
    });
    Hooks.on("renderItemSheet", (sheet, html) => {
        try {
            const item = sheet.item ?? sheet.document;
            addSheetButton(item, rootOf(html));
            takeSpellDrops(rootOf(html), () => item);
        } catch (error) {
            console.error(`${MODULE_ID} | sheet button`, error);
        }
    });
    // (A spell dropped on a generic spellgun's row in an inventory: its picker, not PF2e's maker.)
    Hooks.on("renderActorSheet", (sheet, html) => {
        try {
            const actor = sheet.actor ?? sheet.document;
            for (const row of rootOf(html)?.querySelectorAll?.("[data-item-id]") ?? []) {
                if (actor?.items?.get(row.dataset.itemId)?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]) takeSpellDrops(row, () => actor.items.get(row.dataset.itemId));
            }
        } catch (error) {
            console.error(`${MODULE_ID} | inventory drops`, error);
        }
    });
    addMakerTypes();
    Hooks.on("renderSpellcastingItemCreator", (app) => {
        const { actor, spell } = app.options ?? {};
        if (actor?.uuid && spell?.type === "spell") makers.set(actor.uuid, { spell, app });
    });
    Hooks.on("closeSpellcastingItemCreator", (app) => {
        const uuid = app.options?.actor?.uuid;
        setTimeout(() => makers.get(uuid)?.app === app && makers.delete(uuid), 5000);
    });
    Hooks.on("preCreateItem", (item, data, options, userId) => {
        if (userId !== game.user.id) return;
        const made = fromMaker(item, data);
        if (!made) return;
        makeLoaded(item.parent, made).catch((error) => console.error(`${MODULE_ID} | ${made.spell.name} spellgun`, error));
        return false;
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

// A pending item's sheet: a line and a button that opens its picker. (Not the compendium's own, which can't be changed.)
function addSheetButton(item, root) {
    if (!item || !root || item.pack || !item.isOwner || root.querySelector(".air-generic-pick")) return;
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

// A spell dragged over an element (a generic spellgun's sheet or row): its picker with that spell, and nothing else gets the drop.
// item(): the spellgun then. (The drag's data is read as it's dropped: a spell's uuid, its type from the index or the document.)
function takeSpellDrops(element, item) {
    const gun = item();
    if (!element || element.dataset.airSpellDrops || !gun?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN] || gun.pack || !gun.isOwner) return;
    element.dataset.airSpellDrops = "1";
    element.addEventListener("dragover", (drag) => drag.preventDefault());
    element.addEventListener("drop", (drop) => {
        const editor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        const data = editor?.getDragEventData?.(drop) ?? null;
        if (data?.type !== "Item" || !data.uuid || fromUuidSync(data.uuid)?.type !== "spell") return;
        drop.preventDefault();
        drop.stopPropagation();
        drop.stopImmediatePropagation();
        fromUuid(data.uuid)
            .then((spell) => spell && item() && pickSpell(item(), { spell }))
            .catch((error) => console.error(`${MODULE_ID} | spell drop`, error));
    }, { capture: true });
}

// PF2e's maker of scrolls and wands (a spell dropped on a sheet's inventory), with a spellgun among its kinds: one for a spell of a rank
// (any rank from the spell's own), one for a cantrip (its rank asked after). PF2e makes the item from MAKER_UUID; that's put aside as it's
// created (fromMaker) and the spellgun is made loaded instead (makeLoaded).
function addMakerTypes() {
    const kinds = CONFIG.PF2E?.spellcastingItems;
    if (!kinds || kinds.spellgun) return;
    try {
        kinds.spellgun = { name: "Spellgun", compendiumUuids: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, MAKER_UUID])) };
        kinds.spellgunCantrip = { name: "Spellgun", compendiumUuids: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, index ? null : MAKER_UUID])), cantripsOnly: true };
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's maker of scrolls and wands couldn't offer spellguns.`, error);
    }
}

// The spell each actor's maker was opened with (PF2e keeps it in the maker's options), until a moment after the maker closes.
const makers = new Map();

// The item PF2e's maker is creating as a spellgun: its spell, rank (null for a cantrip's, asked), and whether it's mystified; else null.
// (PF2e names it "<kind> of <spell> (Rank n)"; for a spell of a rank it holds the spell, heightened.)
export function fromMaker(item, data, found = makers) {
    const maker = item?.parent?.uuid ? found.get(item.parent.uuid) : null;
    const flag = data?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN];
    if (!maker || !flag || flag.spell || !String(data.name ?? "").includes(maker.spell.name)) return null;
    const embedded = data.system?.spell ?? null;
    if (embedded && embedded.name !== maker.spell.name) return null;
    return { spell: maker.spell, rank: Number(embedded?.system?.location?.heightenedLevel) || null, mystified: data.system?.identification?.status === "unidentified" };
}

// A cantrip's rank, from 1 to 10 (its caster's cantrip rank first), or null when the dialog's closed.
async function askRank(spell, actor) {
    const usual = Math.max(1, Math.min(10, Math.ceil((Number(actor?.level) || 1) / 2)));
    const ranks = Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}"${index + 1 === usual ? " selected" : ""}>${index + 1}</option>`).join("");
    const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: `${spell.name} Spellgun` },
        position: { width: 400 },
        content: `<p>The rank ${escape(spell.name)} is heightened to on the spellgun (a scroll's level and price for that rank).</p>
            <div class="form-group"><label>Rank</label><div class="form-fields"><select name="rank">${ranks}</select></div></div>`,
        buttons: [
            { action: "make", label: "Make", icon: "fa-solid fa-wand-sparkles", default: true, callback: (event, button) => Number(button.form.elements.rank.value) },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
    });
    return Number.isFinite(picked) ? picked : null;
}

// The spellgun of the spell at the rank in the actor's inventory, loaded (a stack of the same one grows).
async function makeLoaded(actor, { spell, rank, mystified }) {
    const at = rank ?? (await askRank(spell, actor));
    if (!at) return;
    const loaded = await spellgunFor(spell, at);
    if (!loaded) return;
    const template = await fromUuid(GENERIC_SPELLGUN_UUID).catch(() => null);
    if (!template) return void ui.notifications.error("The Generic Spellgun isn't in the module's compendium.");
    const data = foundry.utils.mergeObject(template.toObject(), foundry.utils.expandObject(loadedUpdate(loaded.source, loaded.at, loaded.plan)));
    delete data._id;
    data._stats = { ...(data._stats ?? {}), compendiumSource: GENERIC_SPELLGUN_UUID };
    if (mystified) data.system.identification = { ...(data.system.identification ?? {}), status: "unidentified" };
    await actor.inventory.add(data, { stack: true });
    ui.notifications.info(`${actor.name} has a ${data.name}.`);
}

// spell: a spell to start with (one dropped on the spellgun).
async function pickSpell(item, { spell = null } = {}) {
    if (open.has(item.uuid)) return;
    open.add(item.uuid);
    try {
        const choices = labelled((await itemIndex()).filter(pickable));
        const byLabel = new Map(choices.map((choice) => [choice.label, choice]));
        let dropped = spell?.type === "spell" ? spell : null;
        const listId = `air-spells-${foundry.utils.randomID()}`;
        const ranks = Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("");
        const holds = item.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]?.spell?.name ?? null;
        const picked = await foundry.applications.api.DialogV2.wait({
            window: { title: `Load ${item.name}` },
            position: { width: 480 },
            content: `<p>Pick the spell ${escape(item.actor?.name ?? "its owner")}'s spellgun mimics: type to find it, or drop a spell here. A hit affects the target as if it failed its save against the spell (a spell attack spell: as the spell's hit); a critical hit as if it critically failed.</p>${holds ? `
                <p>It holds ${escape(holds)} now: loading another spell makes it that spell's spellgun instead.</p>` : ""}
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
                if (dropped) {
                    input.value = dropped.name;
                    fit(lowestRank(dropped));
                }
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
    const loaded = await spellgunFor(spell, rank);
    if (!loaded) return false;
    // (A spellgun loaded before: its old plan goes first, so none of it stays in the new one.)
    if (item.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]?.spell) await item.update({ [`flags.${MODULE_ID}.-=${GENERIC_SPELLGUN}`]: null }, { render: false });
    await item.update(loadedUpdate(loaded.source, loaded.at, loaded.plan));
    ui.notifications.info(`${item.actor?.name ?? "The"} spellgun is loaded with ${spell.name} at rank ${loaded.at}.`);
    return true;
}

// The spellgun's plan for the spell at the rank → { source, at, plan }, or null (its user told) when a hit would carry nothing of it.
async function spellgunFor(spell, rank) {
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
        return null;
    }
    return { source, at, plan };
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
