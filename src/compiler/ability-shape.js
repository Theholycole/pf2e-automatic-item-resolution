// An item as the ability compiler reads an action: its first activation's actions. Pure.

import { actionTypeOf, readActivations } from "./activation.js";

export function asAbility(item) {
    const activation = readActivations(item?.system?.description?.value)[0] ?? null;
    const { actionType, actions } = actionTypeOf(activation?.time ?? null);
    return {
        ...item,
        type: "action",
        system: { ...(item?.system ?? {}), actionType: { value: actionType }, actions: { value: actions } }
    };
}
