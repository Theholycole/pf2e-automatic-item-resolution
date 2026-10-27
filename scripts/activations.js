// Live play for permanent items' activations (src/compiler/permanent.js), from the character and NPC sheets (the user's
// choice, 2026-10-15): on each inventory row whose item has activations the module reads, an Activate button per
// activation, for the item's owner or the GM. Pressing one has the active GM's client post that activation's own card
// (scripts/live.js postCardFor: the item card, a save at the targets, a cast, a zone, a Focus Point…) and count its use
// against its frequency on the item (flag activationUses); over it, the GM gets a whispered warning, not a refusal.

import { activationButtonsHTML, frequencyText, overLimit, perWord, rechargeLeft, rechargeSeconds, usesNow, waitText, withUse } from "../src/live/activations-card.js";
import { handlesPermanent } from "../src/compiler/permanent.js";
import { etchedKeys, isRuneItem } from "../src/compiler/runes.js";
import { chargeSpellstrike } from "./spellstrike.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";
import { MODULE_ID, SOCKET, encounterOf, isActiveGM, ownerOf } from "./foundry.js";
import { endOnActivate } from "./ends-on.js";

export const USES = "activationUses";
// (When each activation is usable again after its own wait, trigger.recharge: { [index]: worldTime }.)
export const WAITS = "activationRecharges";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

let compileActivations = null;
let postCardFor = null;
export function setUpActivations(options) {
    compileActivations = options.compileActivations;
    postCardFor = options.postCardFor;
    Hooks.on("renderCreatureSheetPF2e", (sheet, html) => {
        try {
            addButtons(sheet, html);
        } catch (error) {
            console.error(`${MODULE_ID} | activation buttons`, error);
        }
    });
}

// An activation's name: an etched rune's with the rune's ("Vorpal: Snicker-Snack", "Hauling").
const activationName = (activation, rune = null) => (rune ? `${rune.name}${activation.name ? `: ${activation.name}` : ""}` : activation.name);
// A button's activation: an item's own by its number, an etched rune's by "rune:<key>:<n>".
export const indexOf = (raw) => (/^rune:/.test(String(raw)) ? String(raw) : Number(raw));

// (An encounter's uses count in the started encounter the item's user is in.)
export const now = (actor = null) => ({ worldTime: game.time.worldTime, combatId: encounterOf(actor)?.combat.id ?? null });

// The activations with a card, of the item as it is now (compiled once per version of its text).
const compiled = new Map();
function playable(item) {
    const data = { ...item.toObject(false), uuid: item.uuid, ...ownerOf(item.actor) };
    const key = `${item.uuid}:${data._stats?.modifiedTime ?? ""}:${String(data.system?.description?.value ?? "").length}:${etchedKeys(data).join(",")}:${data.ownerLevel ?? ""}:${Object.values(data.ownerAbilities ?? {}).join(",")}:${(data.ownerFeats ?? []).length}`;
    if (!compiled.has(key)) compiled.set(key, (compileActivations?.(data) ?? []).filter((entry) => entry.plan && routeOf(entry.plan, plainText(entry.activation.html))));
    return compiled.get(key).map((entry) => ({ ...entry, data }));
}

// The sheet's inventory rows: an Activate button per activation, after the item's name.
function addButtons(sheet, html) {
    const actor = sheet.actor;
    if (!compileActivations || !actor || !(game.user.isGM || actor.isOwner)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    for (const row of root.querySelectorAll("li[data-item-id]")) {
        const item = actor.items.get(row.dataset.itemId);
        // (Its own activations, or its etched runes': src/compiler/runes.js. Not a runestone's: its rune's are the etched item's.)
        if (!item || isRuneItem(item) || !(handlesPermanent(item) || etchedKeys(item).length) || row.querySelector(".air-activate")) continue;
        const list = playable(item);
        if (!list.length) continue;
        // (Right after the item's name, inside PF2e's name heading, which fills the row.)
        const anchor = row.querySelector('.item-name h4 [data-action="toggle-summary"]') ?? row.querySelector(".item-name h4") ?? row.querySelector(".item-name");
        if (!anchor) continue;
        const holder = document.createElement("span");
        holder.className = "air-activations";
        holder.innerHTML = activationButtonsHTML(list.map(({ activation, plan, index, rune }) => ({ index, name: activationName(activation, rune), time: activation.time, frequency: plan.trigger?.frequency ?? null })), { itemName: item.name, record: item.getFlag(MODULE_ID, USES) ?? {}, waits: item.getFlag(MODULE_ID, WAITS) ?? {}, now: now(actor) });
        anchor.after(holder);
        for (const button of holder.querySelectorAll("[data-air-activate]")) button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            activateFromSheet(item, indexOf(button.dataset.airActivate)).catch((error) => {
                ui.notifications.error(`${item.name}: ${error.message}`);
                console.error(`${MODULE_ID} |`, error);
            });
        });
    }
}

// A button pressed: on the active GM's client, else sent there. (Spellstrike Ammunition's: its user's own dialog, here.)
async function activateFromSheet(item, index) {
    const entry = playable(item).find((candidate) => String(candidate.index) === String(index));
    if (entry?.plan?.builtin === "spellstrike") return chargeSpellstrike(item, entry.plan.spellstrike);
    if (isActiveGM()) return activate(item.uuid, index, game.user.id);
    if (!game.users.activeGM) throw new Error("No GM is connected to activate it.");
    game.socket.emit(SOCKET, { action: "activate", itemUuid: item.uuid, activation: index, userId: game.user.id });
    return null;
}

// One activation (on the active GM's client): its card, and its use counted on the item. userId: who pressed it (the GM
// or an owner of the item's actor, checked by the socket's handler).
export async function activate(itemUuid, index, userId = game.user.id) {
    const item = await fromUuid(itemUuid).catch(() => null);
    if (!item?.actor) throw new Error("The item isn't there any more.");
    const sender = game.users.get(userId);
    if (!sender || !(sender.isGM || item.actor.testUserPermission?.(sender, "OWNER"))) return null;
    const entry = playable(item).find((candidate) => String(candidate.index) === String(index));
    if (!entry) throw new Error("That activation isn't there any more.");
    // (Its essence possessing another creature, Emerald Fulcrum Lens's: no magic until that ends — scripts/possession.js.)
    if (item.getFlag?.(MODULE_ID, "possessing")) throw new Error(`${item.name}: its essence possesses another creature, and it has no magic until that ends.`);
    // (Full, Mindsponge's four memories: none of its activations but squeezing it out — the ways card's own, scripts/live.js storeAfter.)
    const full = entry.plan?.item?.storeFull ?? null;
    if (full && Number(item.getFlag?.(MODULE_ID, "stored")) >= full) throw new Error(`${item.name} is full: squeeze it out first (its Absorb Memories card's last way).`);
    const frequency = entry.plan.trigger?.frequency ?? null;
    const record = item.getFlag(MODULE_ID, USES) ?? {};
    const name = entry.rune ? `${item.name} (${activationName(entry.activation, entry.rune)})` : entry.activation.name ? `${item.name}: ${entry.activation.name}` : item.name;
    const at = now(item.actor);
    if (overLimit(record, entry.index, frequency, at)) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: item.actor }),
            whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
            content: `<p><strong>${escape(name)}</strong>: activated again, though it's ${frequencyText(frequency)} (used ${usesNow(record, entry.index, frequency, at)} this ${perWord(frequency)}). The GM's call.</p>`
        });
    }
    // (Used before its own wait is over: the GM's warning too, not a refusal.)
    const recharge = entry.plan.trigger?.recharge ?? null;
    const waits = item.getFlag(MODULE_ID, WAITS) ?? {};
    const left = rechargeLeft(waits, entry.index, at.worldTime);
    if (left) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: item.actor }),
            whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
            content: `<p><strong>${escape(name)}</strong>: activated again, though it's usable again only in ${waitText(left)}. The GM's call.</p>`
        });
    }
    const token = item.actor.getActiveTokens?.(true)?.[0] ?? null;
    // (A readied bonus its creature's other activations end, Scale of Igroon's: scripts/ends-on.js.)
    await endOnActivate(item.actor);
    // (The activation's card, named for it; its text the activation's own block.)
    const used = { data: { ...entry.data, name, system: { ...entry.data.system, description: { value: entry.activation.html } } }, actor: item.actor };
    const card = await postCardFor({ message: null, plan: entry.plan, used, actor: item.actor, token });
    if (frequency?.max) await item.setFlag(MODULE_ID, USES, withUse(record, entry.index, frequency, at));
    // (Its wait from now — rolled when it's dice, "1d4 rounds" — for it and the activations it shares the wait with.)
    if (recharge) {
        const rolled = recharge.formula ? (await new Roll(recharge.formula).evaluate()).total : null;
        const until = at.worldTime + rechargeSeconds(recharge, rolled);
        const shared = (recharge.shared ?? []).map((one) => playable(item).find((other) => String(other.activation?.name ?? "").toLowerCase() === String(one).toLowerCase())?.index).filter((index) => index !== undefined);
        const next = { ...waits };
        for (const index of [entry.index, ...shared]) next[index] = until;
        await item.setFlag(MODULE_ID, WAITS, next);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: item.actor }), whisper: (game.users?.filter?.((user) => user.isGM || item.actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id), content: `<p><strong>${escape(name)}</strong>: usable again in ${waitText(until - at.worldTime)}${recharge.formula ? ` (rolled ${escape(recharge.formula)} = ${rolled})` : ""}${shared.length ? `, and so is ${escape(recharge.shared.join(" and "))}` : ""}.</p>` });
    }
    return card;
}
