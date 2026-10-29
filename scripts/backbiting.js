// Live play for the backbiting curse on a weapon (2026-10-29, The Liar's: src/compiler/artifact-readings.js; the user's answer to question 6,
// the curse as Archives of Nethys' Curses 3 has it): a weapon flagged flags.<module>.backbiting turns on its wielder — a Strike with it that
// critically fails hits the one who made it instead, for the most damage that Strike could deal, with no roll. The weapon's flag is set by the
// drop card (a creature's weapon, once it failed its Will save) or the objects card (its user's own), and taken off the weapon the same item
// cursed before ("until you use this activation again": the item's flag backbit, the last weapon's uuid). On the active GM's client.

import { MODULE_ID, isActiveGM } from "./foundry.js";

export const BACKBITING = "backbiting";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The weapon cursed, the one this item cursed before freed of it → the card's line.
export async function curseWeapon(weapon, { item = null, owner = null } = {}) {
    const source = item?.uuid ? await fromUuid(item.uuid).catch(() => null) : null;
    const before = source?.getFlag?.(MODULE_ID, "backbit") ?? null;
    let freed = null;
    if (before && before !== weapon.uuid) {
        const old = await fromUuid(before).catch(() => null);
        if (old?.getFlag?.(MODULE_ID, BACKBITING)) {
            await old.unsetFlag(MODULE_ID, BACKBITING);
            freed = old.name;
        }
    }
    await weapon.setFlag(MODULE_ID, BACKBITING, { from: { name: item?.name ?? "a curse", uuid: item?.uuid ?? null } });
    if (source?.setFlag) await source.setFlag(MODULE_ID, "backbit", weapon.uuid);
    return `${owner ? `${owner}'s ` : ""}${weapon.name} gains the backbiting curse: a Strike with it that critically fails hits its wielder instead, for its most damage${freed ? ` (${freed} is free of it)` : ""}.`;
}

// A critically failed Strike with a cursed weapon: its damage, maximized, on the one who made it.
async function backbite(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || context.outcome !== "criticalFailure" || !(context.options ?? []).includes("action:strike")) return;
    const actor = message.actor;
    const weapon = message.flags.pf2e.origin?.uuid ? await fromUuid(message.flags.pf2e.origin.uuid).catch(() => null) : null;
    const curse = weapon?.getFlag?.(MODULE_ID, BACKBITING);
    if (!curse || !actor) return;
    const token = message.token ?? actor.getActiveTokens?.(true, true)?.[0]?.document ?? null;
    const strike = (actor.system?.actions ?? []).find((action) => action?.item?.id === weapon.id);
    const event = typeof KeyboardEvent === "function" ? new KeyboardEvent("keydown", { shiftKey: true }) : undefined;
    const rolled = strike?.damage ? await strike.damage({ ...(event ? { event } : {}), createMessage: false }).catch(() => null) : null;
    const speaker = ChatMessage.getSpeaker({ actor });
    if (!rolled?.clone) {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(curse.from?.name ?? "Backbiting")}</strong>: ${escape(actor.name)}'s ${escape(weapon.name)} turns on its wielder — roll its Strike's damage at its maximum against ${escape(actor.name)} by hand.</p>` });
        return;
    }
    const most = await rolled.clone().evaluate({ maximize: true });
    await most.toMessage({ speaker, flavor: `<strong>${escape(weapon.name)}</strong>: the backbiting curse — its critical failure hits ${escape(actor.name)} instead, at its most damage` });
    await actor.applyDamage({ damage: most, token: token ?? undefined });
}

export function setUpBackbiting() {
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM()) return;
        backbite(message).catch((error) => console.error(`${MODULE_ID} | backbiting`, error));
    });
}
