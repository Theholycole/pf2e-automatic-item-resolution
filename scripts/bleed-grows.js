// Live play for a persistent bleed that grows with each failure to stop it (src/compiler/growing-bleed.js: Bloodgorger Scythe's Root in Blood).
// Its note Effect carries PF2e's RollOption "air-bleed-grows:<type>:<by>:<max>". On the active GM's client: at the end of the creature's turn
// (PF2e's pf2e.endTurn — its persistent damage dealt, its recovery check to roll) the Effect is marked; at the start of its next turn
// (pf2e.startTurn) a marked Effect whose persistent damage of that type is still there — the check failed — raises it by that much, up to its
// maximum. The Effect itself goes with the damage (the ability module's whilePersistent).

import { MODULE_ID, isActiveGM } from "./foundry.js";

const OPTION = /^air-bleed-grows:([a-z]+):(\d+):(\d+)$/;

// The creature's growing persistent damages: [{ effect, type, by, max }].
export function growingOf(actor) {
    const found = [];
    for (const effect of actor?.itemTypes?.effect ?? []) {
        for (const rule of effect.system?.rules ?? []) {
            const match = rule?.key === "RollOption" ? OPTION.exec(String(rule.option ?? "")) : null;
            if (match) found.push({ effect, type: match[1], by: Number(match[2]), max: Number(match[3]) });
        }
    }
    return found;
}

// A persistent damage's formula raised: "1" → "2", at most its maximum; a formula that isn't a number stays.
export function grown(formula, by, max) {
    const value = Number(String(formula ?? "").trim());
    return Number.isFinite(value) ? String(Math.min(max, value + by)) : null;
}

export function setUpBleedGrows() {
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isActiveGM()) return;
        for (const { effect } of growingOf(combatant?.actor)) effect.setFlag(MODULE_ID, "bleedWaiting", true).catch(() => null);
    });
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM()) return;
        grow(combatant?.actor).catch((error) => console.error(`${MODULE_ID} | bleed grows`, error));
    });
}

async function grow(actor) {
    for (const { effect, type, by, max } of growingOf(actor)) {
        if (!effect.getFlag(MODULE_ID, "bleedWaiting")) continue;
        await effect.setFlag(MODULE_ID, "bleedWaiting", false);
        const condition = (actor.itemTypes?.condition ?? []).find((entry) => entry.slug === "persistent-damage" && entry.system?.persistent?.damageType === type);
        if (!condition) continue;
        const next = grown(condition.system.persistent.formula, by, max);
        if (!next || next === String(condition.system.persistent.formula).trim()) continue;
        await condition.update({ "system.persistent.formula": next });
        const from = String(effect.name ?? "").replace(/:.*$/, "");
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${from}</strong>: ${actor.name} failed to stop the bleeding — its persistent ${type} damage is now ${next}${Number(next) >= max ? " (its most)" : ""}.</p>` });
    }
}
