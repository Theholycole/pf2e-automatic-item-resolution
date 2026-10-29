// Live play for an item's own Bulk in its other form (2026-10-29, Staff of Sun Wukong's needle: src/live/item-form.js). PF2e's ItemAlteration
// on Bulk counts only while the item is equipped (prepareBulkData: a weapon worn or stowed weighs its own Bulk), and a needle is carried
// hidden — so the form also sets the item's own Bulk, the old one kept on it (flag formBulk), and puts it back once the form's Effect is gone,
// however it goes (activated again, deleted by hand). On the active GM's client.

import { MODULE_ID, isActiveGM } from "./foundry.js";

const FORM_BULK = "formBulk";

// The form's Bulk set on its item (its alteration of property "bulk"), its own kept.
export async function setFormBulk(actor, itemId, form) {
    const bulk = (form?.alterations ?? []).find((entry) => entry.property === "bulk" && entry.mode === "override");
    const item = itemId ? actor?.items?.get?.(itemId) : null;
    if (!bulk || !item || item.getFlag(MODULE_ID, FORM_BULK)) return;
    await item.update({ "system.bulk.value": Number(bulk.value) || 0, [`flags.${MODULE_ID}.${FORM_BULK}`]: { value: Number(item._source.system?.bulk?.value) || 0 } });
}

// Its own Bulk back.
export async function restoreFormBulk(actor, itemId) {
    const item = itemId ? actor?.items?.get?.(itemId) : null;
    const kept = item?.getFlag(MODULE_ID, FORM_BULK);
    if (!kept) return;
    await item.update({ "system.bulk.value": Number(kept.value) || 0, [`flags.${MODULE_ID}.-=${FORM_BULK}`]: null });
}

export function setUpItemForms() {
    Hooks.on("deleteItem", (effect) => {
        const itemId = effect?.type === "effect" ? effect.flags?.[MODULE_ID]?.itemForm : null;
        if (!itemId || !isActiveGM()) return;
        restoreFormBulk(effect.actor, itemId).catch((error) => console.error(`${MODULE_ID} | item form's Bulk`, error));
    });
}
