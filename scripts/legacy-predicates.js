// Live play for items whose rules have old-form predicates (src/live/legacy-predicates.js, the user's answer to question 9, 2026-10-29):
// as such an item is added to an actor (PF2e's preCreateItem, on the client creating it), its rules are rewritten into the form PF2e reads.
// Only an item with an old-form predicate is touched; nothing else of it changes.

import { MODULE_ID } from "./foundry.js";
import { rulesWithoutOldPredicates } from "../src/live/legacy-predicates.js";

export function setUpLegacyPredicates() {
    Hooks.on("preCreateItem", (item) => {
        if (!(item?.parent instanceof Actor)) return;
        const rules = rulesWithoutOldPredicates(item._source?.system?.rules);
        if (!rules) return;
        item.updateSource({ "system.rules": rules });
        console.info(`${MODULE_ID} | ${item.name}: its rules' old-form predicates rewritten into PF2e's form`);
    });
}
