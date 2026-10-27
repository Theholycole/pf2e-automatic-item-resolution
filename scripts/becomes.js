// Live play for plan.item.becomes (src/compiler/fuses.js: Sluggish Bracelet's fusing): once its card has applied, the item's own PF2e rules
// lose those it removes (by key and selector) and gain those it adds, and it's marked fused — once; used again, nothing more changes.

import { MODULE_ID } from "./foundry.js";

// Whether a rule is one the change removes: its key, and its selector among the rule's.
export const removedBy = (rule, removes) => (removes ?? []).some((gone) => rule?.key === gone.key && [].concat(rule.selector ?? []).includes(gone.selector));

// The item's uuid and the change → the card's line, or null.
export async function becomeItem(uuid, becomes) {
    const item = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!item?.update || item.getFlag?.(MODULE_ID, "became")) return null;
    const rules = [...(item.system?.rules ?? []).filter((rule) => !removedBy(rule, becomes.removes)), ...(becomes.adds ?? []).map((rule) => ({ ...rule }))];
    await item.update({ "system.rules": rules, [`flags.${MODULE_ID}.became`]: becomes.words });
    return `${item.name}: ${becomes.words}`;
}
