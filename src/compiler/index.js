// The item compiler: PF2e's items as plans for the resolution core. Pure:
// Node, Web Workers and Foundry.
//
// A consumable's text is read by the ability module's compiler (its saves,
// afflictions, PF2e effects and zones), as an action with the item's own
// activation; src/compiler/consumables.js adds what the item's own data says
// (the drinker, PF2e's healing roll, its linked Effect). Spell-casting items
// (scrolls, wands, catalysts, spell gems) stay with the spell module:
// handlesItem() leaves them out.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { actionTypeOf, readActivations } from "./activation.js";
import { fitPlan, ownPlan, pf2eRoll, recipientOf } from "./consumables.js";

export { readActivations, actionTypeOf } from "./activation.js";
export { effectLinks, fitPlan, nativeHealing, ownPlan, pf2eRoll, recipientOf } from "./consumables.js";

// The consumable categories the spell module resolves (the user's split, 2026-10-10).
export const SPELL_MODULE_CATEGORIES = Object.freeze(["scroll", "wand", "catalyst", "spell-gem"]);

// An item this module compiles: a consumable outside the spell module's categories.
export function handlesItem(item) {
    return item?.type === "consumable" && !SPELL_MODULE_CATEGORIES.includes(item.system?.category);
}

// The item as the ability compiler reads an action: its first activation's actions.
export function asAbility(item) {
    const activation = readActivations(item?.system?.description?.value)[0] ?? null;
    const { actionType, actions } = actionTypeOf(activation?.time ?? null);
    return {
        ...item,
        type: "action",
        system: { ...(item?.system ?? {}), actionType: { value: actionType }, actions: { value: actions } }
    };
}

// One item → a plan, { builtin }, or null.
export function compileItem(item, options = {}) {
    if (!handlesItem(item)) return null;
    const read = compileAbility(asAbility(item), options);
    const plan = read ? fitPlan(item, read) : ownPlan(item, basePlan(item));
    if (!plan) return null;
    const source = plan.source ? { ...plan.source, type: item.type, uuid: item.uuid ?? plan.source.uuid ?? null } : plan.source;
    return { ...plan, ...(source ? { source } : {}), item: itemInfo(item) };
}

// The skeleton of a plan the item module builds itself.
function basePlan(item) {
    const activation = readActivations(item?.system?.description?.value)[0] ?? null;
    const traits = [...(item.system?.traits?.value ?? [])];
    return {
        modelVersion: MODEL_VERSION,
        source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits,
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] }
    };
}

// What the live layer and the simulator need to know about the item itself.
function itemInfo(item) {
    return {
        type: item.type,
        category: item.system?.category ?? null,
        level: Number(item.system?.level?.value) || 0,
        uses: item.system?.uses ? { max: Number(item.system.uses.max) || 1, autoDestroy: Boolean(item.system.uses.autoDestroy) } : null,
        // "drinker": the creature who drinks or eats it (the user or an adjacent creature they feed it to); "user": its user.
        recipient: recipientOf(item),
        // What PF2e's own Use rolls (its healing or damage), so live play doesn't roll it again.
        pf2eRoll: pf2eRoll(item),
        activations: readActivations(item?.system?.description?.value)
    };
}
