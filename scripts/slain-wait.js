// Live play for plan.slainWait (src/compiler/conjured.js: a Wondrous Figurine's "If the figurine is slain while in animal form, it reverts to
// its statue shape and cannot be activated again until 1 week has passed"): once a creature the ability module conjured from the item drops to
// 0 Hit Points, on the active GM's client, the item's activation waits that long — its recharge flag, which scripts/activations.js warns of
// when it's used sooner. Golden Lions' each lion its own (slainWait.each): the slain one kept on the item with its time, and one fewer called
// while it waits (scripts/zones.js startItemConjure). Its owners and the GM are told.

import { WAITS } from "./activations.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";
import { slainUntil, stillSlain } from "../src/live/conjured.js";

export const SLAIN = "conjuredSlain";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const counted = new Set();

export function setUpSlainWait(compileActivations) {
    Hooks.on("updateActor", (actor, changed) => {
        const hp = changed?.system?.attributes?.hp?.value;
        const conjured = actor?.flags?.[ABILITY_ID]?.conjured;
        if (hp === undefined || hp > 0 || !conjured?.itemUuid || !isActiveGM() || counted.has(actor.id)) return;
        counted.add(actor.id);
        onSlain(actor, conjured, compileActivations).catch((error) => console.error(`${MODULE_ID} | slain wait`, error));
    });
}

async function onSlain(actor, conjured, compileActivations) {
    const item = await fromUuid(conjured.itemUuid).catch(() => null);
    if (!item?.actor) return;
    const worldTime = Number(game.time.worldTime) || 0;
    for (const { index, plan } of compileActivations(item).filter((entry) => entry.plan?.slainWait)) {
        const until = slainUntil(plan.slainWait, worldTime);
        if (plan.slainWait.each) await item.setFlag(MODULE_ID, SLAIN, [...stillSlain(item.getFlag(MODULE_ID, SLAIN), worldTime), { until, name: actor.name }]);
        else await item.setFlag(MODULE_ID, WAITS, { ...(item.getFlag(MODULE_ID, WAITS) ?? {}), [index]: until });
        const when = `${plan.slainWait.value} ${plan.slainWait.value === 1 ? plan.slainWait.unit.replace(/s$/, "") : plan.slainWait.unit}`;
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: item.actor }),
            whisper: (game.users?.filter?.((user) => user.isGM || item.actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id),
            content: `<p><strong>${escape(item.name)}</strong>: ${escape(actor.name)} is slain — ${plan.slainWait.each ? `it can't be called again for ${when}` : `the item can't be activated again for ${when}`}.</p>`
        });
    }
}
