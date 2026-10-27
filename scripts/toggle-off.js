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
    // (Until its user's next daily preparations, Splithead Bow's Five-Headed Arrow: the Effect gone then, togglesAtRest.)
    source.flags[MODULE_ID].toggleOff = { option: plan.toggleOff.option, itemId, ...(plan.toggleOff.untilRest ? { untilRest: true } : {}) };
    await actor.createEmbeddedDocuments("Item", [source]);
}

// (Its own toggle turned on as it's used, Golden Blade of Mzali's "used Elemental Form": plan.toggleOn. In its rule's own domain when that isn't
// "all", Zuhra's Gloves' "wall-of-metal" in saving-throw — 2026-10-27.)
export async function toggleOn(plan, { actor, used }) {
    const itemId = used.data._id ?? String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? null;
    if (!itemId || !actor?.toggleRollOption) return;
    await actor.toggleRollOption(plan.toggleOn.domain ?? "all", plan.toggleOn.option, itemId, true);
    // (Until its user's next daily preparations: remembered on the item, turned back then.)
    if (plan.toggleOn.untilRest) await actor.items.get(itemId)?.setFlag(MODULE_ID, "toggleUntilRest", plan.toggleOn.option);
}

// PF2e's Rest for the Night: each item's toggle turned on until then, back off (Golden Blade of Mzali's extra fire damage back).
export async function togglesAtRest(actor) {
    for (const item of (actor?.items?.contents ?? []).filter((one) => one.flags?.[MODULE_ID]?.toggleUntilRest)) {
        await actor.toggleRollOption("all", item.flags[MODULE_ID].toggleUntilRest, item.id, false);
        await item.unsetFlag(MODULE_ID, "toggleUntilRest");
    }
    // (And a toggle off until then, Splithead Bow's healing: its Effect deleted, the deleteItem hook turning it back on.)
    const until = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.toggleOff?.untilRest);
    if (until.length) await actor.deleteEmbeddedDocuments("Item", until.map((effect) => effect.id));
}

export function setUpToggleOff() {
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        togglesAtRest(actor).catch((error) => console.error(`${MODULE_ID} | toggles at rest`, error));
    });
    Hooks.on("deleteItem", (item) => {
        const flag = item?.flags?.[MODULE_ID]?.toggleOff;
        if (!flag || !item.parent?.toggleRollOption || !isActiveGM()) return;
        if (!item.parent.items?.get?.(flag.itemId)) return;
        item.parent.toggleRollOption("all", flag.option, flag.itemId, true).catch((error) => console.error(`${MODULE_ID} | toggle back on`, error));
    });
}
