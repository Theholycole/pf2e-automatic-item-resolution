// Live play for a creature its user picks before it's made (plan.pick, src/compiler/creature-readings.js: Dust of Corpse Animation's skeleton
// or zombie of level 3 or lower, Oil of Dynamism's animated object): a list of the compendiums' creatures that fit (PF2e's rulebook
// bestiaries, as the ability module's summons offer them — src/live/conjured.js pickCandidates), filtered by name, on the using client;
// what must be there first (plan.needs) said above it. { uuid, name }, or null when none is picked.
// (The use is played on the active GM's client — a consumable's PF2e Use, a sheet's Activate sent there —, so a player's pick is asked of
// their client over the module's socket and its answer awaited: pickFor, answerPick — 2026-10-27.)

import { CORE_PACKS } from "../../pf2e-automatic-ability-resolution/src/compiler/gm-fallback.js";
import { pickCandidates } from "../src/live/conjured.js";
import { MODULE_ID } from "./foundry.js";

const SOCKET = `module.${MODULE_ID}`;
// (An answer waited for no longer than this: none picked then.)
const ASK_MS = 300_000;

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

let indexCache = null;
async function creatureIndex() {
    if (indexCache) return indexCache;
    const packs = game.packs.filter((pack) => pack.documentName === "Actor" && pack.metadata.packageName === "pf2e" && CORE_PACKS.has(pack.metadata.name));
    const entries = [];
    for (const pack of packs) {
        const index = await pack.getIndex({ fields: ["system.details.level.value", "system.traits.value", "type"] });
        for (const entry of index) entries.push({ uuid: entry.uuid ?? `Compendium.${pack.collection}.Actor.${entry._id}`, name: entry.name, level: Number(entry.system?.details?.level?.value), traits: entry.system?.traits?.value ?? [], type: entry.type });
    }
    indexCache = entries;
    return entries;
}

export async function pickConjured(plan, itemName) {
    const entries = pickCandidates(await creatureIndex(), plan.pick);
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

// The pick of the user who used the item (userId; the item text's "you choose"): on this client for a GM's own use, a user not connected, or
// none known; else asked of theirs and awaited. Their answer counts only when it's one of the creatures that fit. → { uuid, name } or null.
const asks = new Map();
export async function pickFor(userId, plan, itemName) {
    const user = userId ? game.users?.get?.(userId) : null;
    if (!user || user.isGM || user.id === game.user?.id || !user.active) return pickConjured(plan, itemName);
    const ask = globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const answer = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            asks.delete(ask);
            resolve(null);
        }, ASK_MS);
        asks.set(ask, { from: user.id, done: (value) => {
            clearTimeout(timer);
            asks.delete(ask);
            resolve(value);
        } });
        game.socket.emit(SOCKET, { action: "pick-creature", ask, userId: user.id, pick: plan.pick, needs: plan.needs ?? null, itemName });
        ui.notifications?.info?.(`${itemName}: ${user.name ?? "its user"} picks the creature.`);
    });
    if (!answer?.uuid) return null;
    const chosen = pickCandidates(await creatureIndex(), plan.pick).find((entry) => entry.uuid === answer.uuid);
    return chosen ? { uuid: chosen.uuid, name: chosen.name } : null;
}

// The module's socket for it (scripts/live.js) → true when the message was one of these: on the asked user's client, the list shown and the
// pick sent back; on the asking client, its answer taken.
export function answerPick(data) {
    if (data?.action === "pick-creature") {
        if (data.userId !== game.user?.id) return true;
        const reply = (picked) => game.socket.emit(SOCKET, { action: "picked-creature", ask: data.ask, from: game.user.id, uuid: picked?.uuid ?? null });
        pickConjured({ pick: data.pick, needs: data.needs }, String(data.itemName ?? "Item")).then(reply).catch((error) => {
            console.error(`${MODULE_ID} | creature pick`, error);
            reply(null);
        });
        return true;
    }
    if (data?.action === "picked-creature") {
        const waiting = asks.get(data.ask);
        if (waiting && waiting.from === data.from) waiting.done({ uuid: data.uuid ?? null });
        return true;
    }
    return false;
}
