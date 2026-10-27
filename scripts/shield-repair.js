// Live play for a wearer's shields repaired at each turn's start (src/compiler/shield-repair.js: Forgefather's Seal). At the start of each of
// its turns (PF2e's pf2e.startTurn, on the active GM's client), a creature with such an item that wears armor has each shield it holds recover
// that many Hit Points, up to its maximum — unless the item's other use stopped it (src/live/shield-repair.js's Effect), which its next daily
// preparations end (pf2e.restForTheNight).

import { readShieldRepair, shieldRepairs } from "../src/compiler/shield-repair.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const paused = (actor, what) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.pauses === what);

export function setUpShieldRepair() {
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM()) return;
        repairShields(combatant?.actor).catch((error) => console.error(`${MODULE_ID} | shield repair`, error));
    });
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        const ended = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.pauses && effect.flags[MODULE_ID].untilRest).map((effect) => effect.id);
        if (ended.length) actor.deleteEmbeddedDocuments("Item", ended).catch((error) => console.error(`${MODULE_ID} | pauses at rest`, error));
    });
}

async function repairShields(actor) {
    if (!actor?.wornArmor || paused(actor, "shield-repair")) return;
    const source = (actor.itemTypes?.equipment ?? []).map((item) => ({ item, repair: readShieldRepair(item.system?.description?.value) })).find((entry) => entry.repair);
    if (!source) return;
    const held = (actor.itemTypes?.shield ?? []).filter((shield) => shield.system?.equipped?.carryType === "held");
    const repairs = shieldRepairs(held.map((shield) => ({ id: shield.id, name: shield.name, hp: shield.system?.hp ?? {} })), source.repair);
    for (const entry of repairs) await actor.items.get(entry.id)?.update({ "system.hp.value": entry.to });
    if (!repairs.length) return;
    const whisper = (game.users?.filter?.((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper, content: `<p><strong>${escape(source.item.name)}</strong>: ${repairs.map((entry) => `${escape(entry.name)} recovers ${entry.to - entry.from} Hit Points (${entry.to}/${entry.max})`).join("; ")}.</p>` });
}
