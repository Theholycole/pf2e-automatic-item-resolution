// Live play for a time's first critical failure made a failure (src/compiler/first-degree.js: Lockpicker's Oil): the item card
// gives its user an Effect with PF2e's AdjustDegreeOfSuccess; on the active GM's client, the first check of that kind its user
// rolls a critical failure on (before PF2e's change) removes it. PF2e's own duration ends it otherwise.

import { MODULE_ID, isActiveGM } from "./foundry.js";

export async function firstDegreeRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (!context?.type || context.type === "damage-roll") return;
    const unadjusted = context.unadjustedOutcome ?? context.outcome;
    const actor = message.actor;
    const domains = context.domains ?? [];
    const options = new Set(context.options ?? []);
    const spent = (actor?.itemTypes?.effect ?? []).filter((effect) => {
        const flag = effect.flags?.[MODULE_ID]?.firstDegree;
        if (!flag || !domains.includes(flag.selector) || !flag.adjustment?.[unadjusted]) return false;
        // (The roll its rule is for: Pick a Lock, not every Thievery check.)
        const rule = (effect.system?.rules ?? []).find((each) => each.key === "AdjustDegreeOfSuccess");
        return [].concat(rule?.predicate ?? []).every((term) => typeof term !== "string" || options.has(term));
    });
    if (spent.length) await actor.deleteEmbeddedDocuments("Item", spent.map((effect) => effect.id)).catch(() => null);
}
