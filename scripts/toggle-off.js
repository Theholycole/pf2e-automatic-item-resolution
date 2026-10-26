// Live play for a healing its item stops for a while (plan.toggleOff, src/compiler/toggle-off.js: Splithead Bow's Two-Headed Arrow): PF2e's own
// toggle on the item turned off as the activation is used, and an Effect on its user for that time — when it's gone (it ends, or the GM
// deletes it), the toggle is back on, on the active GM's client.

import { ruleEffectSource } from "../src/live/card.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

export async function toggleOff(plan, { actor, token, used }) {
    const itemId = used.data._id ?? String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? null;
    if (!itemId || !actor?.toggleRollOption) return;
    await actor.toggleRollOption("all", plan.toggleOff.option, itemId, false);
    const source = ruleEffectSource({ name: "toggled off", words: plan.toggleOff.words, rules: [], duration: plan.toggleOff.duration }, { item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: { actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID });
    source.flags[MODULE_ID].toggleOff = { option: plan.toggleOff.option, itemId };
    await actor.createEmbeddedDocuments("Item", [source]);
}

export function setUpToggleOff() {
    Hooks.on("deleteItem", (item) => {
        const flag = item?.flags?.[MODULE_ID]?.toggleOff;
        if (!flag || !item.parent?.toggleRollOption || !isActiveGM()) return;
        if (!item.parent.items?.get?.(flag.itemId)) return;
        item.parent.toggleRollOption("all", flag.option, flag.itemId, true).catch((error) => console.error(`${MODULE_ID} | toggle back on`, error));
    });
}
