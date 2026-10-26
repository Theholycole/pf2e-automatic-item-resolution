// Live play for plan.turnHeal (src/compiler/cast-riders.js: Enveloping Light's "At the end of each of your turns during this time, you regain
// 1d4 Hit Points"). Once the spell is cast, its user gets an Effect for the item's time (rememberTurnHeal); at the end of each of its turns
// (PF2e's pf2e.endTurn, on the active GM's client), while the Effect lasts, the dice are rolled and it's healed through PF2e (healCreature).

import { MODULE_ID, damageRollClass, healCreature, isActiveGM, startInitiative } from "./foundry.js";

const healsOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.turnHeal && !(effect.isExpired ?? effect.system?.expired));
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpTurnHeals() {
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isActiveGM()) return;
        turnEndHeal(combatant?.actor, combatant?.token ?? null).catch((error) => console.error(`${MODULE_ID} | turn heal`, error));
    });
}

// The Effect on its user once the spell's cast: the item's dice, for its time. → the card's line.
export async function rememberTurnHeal(actor, turnHeal, { item, duration }) {
    if (!actor?.createEmbeddedDocuments || !turnHeal?.formula || !duration) return null;
    await actor.createEmbeddedDocuments("Item", [{
        name: `${item.name}: ${turnHeal.formula} Hit Points at the end of each turn`,
        type: "effect",
        img: item.img ?? "icons/svg/regen.svg",
        flags: { [MODULE_ID]: { turnHeal: { formula: turnHeal.formula, name: item.name } } },
        system: { description: { value: `<p>At the end of each of your turns, you regain ${escape(turnHeal.formula)} Hit Points (${escape(item.name)}).</p>` }, duration: { value: duration.value, unit: duration.unit, expiry: "turn-start", sustained: false }, start: { value: game.time.worldTime, initiative: startInitiative(actor) }, tokenIcon: { show: true }, rules: [] }
    }]);
    return `${actor.name} regains ${turnHeal.formula} Hit Points at the end of each of their turns for ${duration.value} ${duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit}.`;
}

// The end of its turn: each Effect's dice, healed.
export async function turnEndHeal(actor, token = null) {
    const healed = [];
    for (const effect of healsOf(actor)) {
        const { formula, name } = effect.flags[MODULE_ID].turnHeal;
        const DamageRoll = damageRollClass();
        const roll = await (DamageRoll ? new DamageRoll(`${formula}[healing]`) : new Roll(formula)).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${escape(name)}</strong>: healing at the end of the turn` });
        const line = await healCreature({ token, actor }, actor.token?.name ?? actor.name, Number(roll.total));
        if (line) healed.push(line);
    }
    return healed;
}
