// An item's other form until it's activated again (2026-10-27, src/compiler/relic-readings.js plan.item.itemForm: Staff of Sun Wukong's Close at
// Hand, "the Staff of Sun Wukong shrinks to the size and weight of a needle or toothpick … In this form, the item has negligible Bulk. You can
// Activate this ability again to return the staff to its normal size"): { name, alterations: [{ property, mode, value }], rules, words } —
// an Effect on its user with PF2e's ItemAlteration on the item itself (its Bulk) and the form's own rules (a toggle and its bonus); the
// item card, activated again, removes it (scripts/live.js), as Sapling Shield's tower shield. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const itemIdOf = (uuid) => /\.Item\.([A-Za-z0-9]+)$/.exec(String(uuid ?? ""))?.[1] ?? null;

export const itemFormText = (form) => `${form.words} (activated again, its own form)`;

export function itemFormEffectSource(form, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const itemId = itemIdOf(item.uuid);
    return {
        name: `${item.name}: ${form.name}`,
        type: "effect",
        img: item.img ?? "icons/svg/item-bag.svg",
        flags: { [moduleId]: { itemForm: itemId } },
        system: {
            description: { value: `<p>${escape(itemFormText(form))}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules: [...(form.alterations ?? []).map((entry) => ({ key: "ItemAlteration", itemId, mode: entry.mode, property: entry.property, value: entry.value })), ...(form.rules ?? [])]
        }
    };
}
