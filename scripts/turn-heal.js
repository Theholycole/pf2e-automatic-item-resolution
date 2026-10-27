// Live play for plan.turnHeal (src/compiler/cast-riders.js: Enveloping Light's "At the end of each of your turns during this time, you regain
// 1d4 Hit Points"). Once the spell is cast, its user gets an Effect for the item's time (rememberTurnHeal); at the end of each of its turns
// (PF2e's pf2e.endTurn, on the active GM's client), while the Effect lasts, the dice are rolled and it's healed through PF2e (healCreature).
// And at each turn's start for an item's own Effect (src/compiler/turn-heals.js: Infernal Health), unless a damage of its type came since.

import { CORE_ID, MODULE_ID, damageRollClass, healCreature, isActiveGM, startInitiative } from "./foundry.js";

// (At a turn's end, Enveloping Light's; at its start, Infernal Health's — turnHeal.at "start".)
const healsOf = (actor, at = "end") => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.turnHeal && (effect.flags[MODULE_ID].turnHeal.at ?? "end") === at && !(effect.isExpired ?? effect.system?.expired));
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpTurnHeals() {
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isActiveGM()) return;
        turnEndHeal(combatant?.actor, combatant?.token ?? null).catch((error) => console.error(`${MODULE_ID} | turn heal`, error));
    });
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM()) return;
        turnStartHeal(combatant?.actor, combatant?.token ?? null).catch((error) => console.error(`${MODULE_ID} | turn heal`, error));
    });
    // (A damage of the type that stops it, Infernal Health's spirit: its Effect marked, so the next start heals none. The core's damage listener
    // sees each damage as PF2e applies it.)
    game.modules.get(CORE_ID)?.api?.patches?.damage?.onApply?.({ module: MODULE_ID, name: "turn-heal", before: (actor, params) => {
        const watched = healsOf(actor, "start").filter((effect) => effect.flags[MODULE_ID].turnHeal.unless);
        if (!watched.length) return null;
        const types = damageTypes(params?.damage);
        return async () => {
            for (const effect of watched) if (types.includes(effect.flags[MODULE_ID].turnHeal.unless)) await effect.update({ [`flags.${MODULE_ID}.turnHeal.stopped`]: true }).catch(() => null);
        };
    } });
}

// The damage types in a damage PF2e applies: its roll's instances (a number has none).
export const damageTypes = (damage) => [...new Set((damage?.instances ?? []).map((instance) => String(instance.type ?? "").toLowerCase()).filter(Boolean))];

// The start of its turn: each Effect's healing, unless a damage of its type came since the last start (then none, and it's ready again).
export async function turnStartHeal(actor, token = null) {
    const healed = [];
    for (const effect of healsOf(actor, "start")) {
        const { formula, name, unless, stopped } = effect.flags[MODULE_ID].turnHeal;
        if (stopped) {
            await effect.update({ [`flags.${MODULE_ID}.turnHeal.stopped`]: false });
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(name)}</strong>: no healing this turn (${escape(unless)} damage since the last).</p>` });
            continue;
        }
        const DamageRoll = damageRollClass();
        const roll = await (DamageRoll ? new DamageRoll(`${formula}[healing]`) : new Roll(formula)).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${escape(name)}</strong>: healing at the start of the turn` });
        const line = await healCreature({ token, actor }, actor.token?.name ?? actor.name, Number(roll.total));
        if (line) healed.push(line);
    }
    return healed;
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
