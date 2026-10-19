// Live play for a weapon's property runes on a critical hit (src/compiler/rune-strikes.js; PF2e itself only notes them):
// after PF2e's attack roll critically hits with a weapon whose etched runes have riders, each one's card at the creature it
// hit — the ability module's save card (Thundering, Frost, Brilliant; Impactful's push, which its wielder may choose not to
// use, says so) or its card with no roll (Crushing, Fearsome, Flickering). A rider only against some creatures (the undead,
// giants, a bleeding or stupefied target) is checked against the creature hit. The weapon's own critical-hit sentences are read the
// same way (Mindlance, Serpent Dagger, Thundercrasher at its wielder's class DC). On the active GM's client.

import { ABILITY_ID, ownerDCsOf } from "./foundry.js";
import { riderFits } from "../src/compiler/rune-strikes.js";
import { fillOwnerDCs, hasOwnerDC } from "../src/compiler/item-data.js";
import { withUserDCs } from "./item-dcs.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// What a rider checks about the creature hit: its traits, its conditions, its persistent damage's types.
function creatureOf(actor) {
    const conditions = actor?.itemTypes?.condition ?? [];
    return {
        traits: [...(actor?.traits ?? [])],
        conditions: conditions.map((condition) => condition.slug),
        persistent: conditions.filter((condition) => condition.slug === "persistent-damage").map((condition) => condition.system?.persistent?.damageType).filter(Boolean)
    };
}

// message: PF2e's attack roll; ridersOf(weapon) → the riders of its etched runes (src/compiler/rune-strikes.js).
export async function strikeWithRunes(message, ridersOf) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || context.outcome !== "criticalSuccess" || typeof ridersOf !== "function") return;
    const weaponUuid = message.flags.pf2e.origin?.uuid ?? null;
    const weapon = weaponUuid ? await fromUuid(weaponUuid).catch(() => null) : null;
    if (weapon?.type !== "weapon") return;
    const riders = ridersOf(weapon) ?? [];
    if (!riders.length) return;
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const target = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const actor = message.actor ?? weapon.actor ?? null;
    if (!target?.actor || !actor) return;
    const creature = creatureOf(target.actor);
    const sourceToken = message.token ?? actor.getActiveTokens?.(true)?.[0]?.document ?? null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    for (const rider of riders.filter((entry) => riderFits(entry, creature))) {
        const name = rider.own ? weapon.name : `${weapon.name} (${rider.rune.name})`;
        // (A save against its wielder's class DC, Thundercrasher's: that DC as it is now; without one, by hand.)
        const owned = hasOwnerDC(rider.plan) ? fillOwnerDCs(rider.plan, ownerDCsOf(actor)) : { plan: rider.plan, missing: false };
        // (Its DCs its wielder's class or spell DC when higher, under the world setting: scripts/item-dcs.js.)
        const filled = { ...owned, plan: withUserDCs(owned.plan, actor) };
        if (!postCard || filled.missing) {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${escape(name)}</strong>, critical hit on ${escape(target.name)}: ${escape(rider.text)} Apply it by hand${filled.missing ? ` (${escape(actor.name)} has no class DC)` : ""}.</p>` });
            continue;
        }
        await postCard({
            plan: filled.plan,
            item: { name, uuid: weapon.uuid },
            sourceActor: actor,
            sourceToken,
            tokens: [target.object ?? target],
            cause: rider.optional ? "critical hit; its wielder may choose not to" : "critical hit",
            warning: rider.only?.note ?? null
        });
    }
}

