// Live play for a wearer's shields repaired at each turn's start (src/compiler/shield-repair.js: Forgefather's Seal). At the start of each of
// its turns (PF2e's pf2e.startTurn, on the active GM's client), a creature with such an item that wears armor has each shield it holds recover
// that many Hit Points, up to its maximum — unless the item's other use stopped it (src/live/shield-repair.js's Effect), which its next daily
// preparations end (pf2e.restForTheNight).
// (The seal in either form, src/compiler/worn-rune.js wornRunes — etched onto the worn armor, a key PF2e's rune items are matched to, or worn
// in the inventory: 2026-10-29, the etched one was never found before.)

import { shieldRepairs } from "../src/compiler/shield-repair.js";
import { wornRunes } from "../src/compiler/worn-rune.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const paused = (actor, what) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[MODULE_ID]?.pauses === what);

// runes: PF2e's rune items by key (src/compiler/runes.js runeIndex), read as it's needed (it's indexed at ready).
export function setUpShieldRepair({ runes = () => new Map() } = {}) {
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM()) return;
        repairShields(combatant?.actor, runes()).catch((error) => console.error(`${MODULE_ID} | shield repair`, error));
    });
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        const ended = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.pauses && effect.flags[MODULE_ID].untilRest).map((effect) => effect.id);
        if (ended.length) actor.deleteEmbeddedDocuments("Item", ended).catch((error) => console.error(`${MODULE_ID} | pauses at rest`, error));
    });
}

async function repairShields(actor, index) {
    if (!actor?.wornArmor || paused(actor, "shield-repair")) return;
    const rune = wornRunes({ armor: actor.wornArmor, items: actor.itemTypes?.equipment ?? [] }, index).find((entry) => entry.worn.repair);
    if (!rune) return;
    const source = { item: { name: rune.name }, repair: rune.worn.repair };
    const held = (actor.itemTypes?.shield ?? []).filter((shield) => shield.system?.equipped?.carryType === "held");
    const repairs = shieldRepairs(held.map((shield) => ({ id: shield.id, name: shield.name, hp: shield.system?.hp ?? {} })), source.repair);
    for (const entry of repairs) await actor.items.get(entry.id)?.update({ "system.hp.value": entry.to });
    if (!repairs.length) return;
    const whisper = (game.users?.filter?.((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper, content: `<p><strong>${escape(source.item.name)}</strong>: ${repairs.map((entry) => `${escape(entry.name)} recovers ${entry.to - entry.from} Hit Points (${entry.to}/${entry.max})`).join("; ")}.</p>` });
}
