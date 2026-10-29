// Live play for a cast kept up by its user's Strikes (2026-10-29, plan.castSustain { by: "strike" }: Phoenix Fighting Fan's Quandary, "The fan
// automatically Sustains the Spell as long as you Strike a creature with it each round … The spell ends once … you fail to Strike a creature
// with the fan during a round"). Once cast in an encounter, its user is flagged with the cast's spell and the weapon; each attack roll of its
// with that weapon at a creature marks the round, and at the end of each of its turns after the cast's (PF2e's pf2e.endTurn, on the active GM's
// client) a round without one ends the spell: every Effect the cast made (its origin item the cast's spell, as scripts/cast-duration.js finds
// them) is removed. Out of an encounter there are no rounds: the card says so.

import { MODULE_ID, isActiveGM } from "./foundry.js";

const FLAG = "strikeSustain";
const originOf = (effect) => effect?.system?.context?.origin?.item ?? null;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// After the cast: its user flagged → a line.
export async function rememberStrikeSustain(cast, { actor, weaponId, name }) {
    const combat = game.combat?.started ? game.combat : null;
    if (!cast?.spellUuid || !actor) return null;
    if (!combat) return `Not in an encounter: end ${name} by hand when its user goes a round without a Strike with ${escape(name)}.`;
    await actor.setFlag(MODULE_ID, FLAG, { spellUuid: cast.spellUuid, weaponId, name, combatId: combat.id, from: combat.round, struck: null });
    return "Kept up while its user Strikes a creature with it each round: the end of a turn without one ends it.";
}

// The Effects a cast made, wherever they are (the scene's creatures and the world's).
function castEffects(spellUuid) {
    const actors = new Set([...(game.actors ?? []), ...(canvas?.scene?.tokens ?? []).map((token) => token.actor).filter(Boolean)]);
    return [...actors].flatMap((actor) => (actor.itemTypes?.effect ?? []).filter((effect) => originOf(effect) === spellUuid));
}

export function setUpStrikeSustain() {
    // (Its user's attack roll with the weapon at a creature: this round's Strike.)
    Hooks.on("createChatMessage", (message) => {
        const context = message?.flags?.pf2e?.context;
        if (!isActiveGM() || context?.type !== "attack-roll" || !context.target?.token) return;
        const actor = message.actor ?? null;
        const flag = actor?.getFlag?.(MODULE_ID, FLAG);
        const itemId = message.item?.id ?? String(message.flags?.pf2e?.origin?.uuid ?? "").split(".").at(-1);
        if (!flag || itemId !== flag.weaponId || game.combat?.id !== flag.combatId) return;
        actor.setFlag(MODULE_ID, FLAG, { ...flag, struck: game.combat.round }).catch((error) => console.error(`${MODULE_ID} | strike sustain`, error));
    });
    // (The end of its user's turn after the cast's: no Strike this round, the spell ends.)
    Hooks.on("pf2e.endTurn", (combatant, encounter) => {
        const actor = combatant?.actor;
        const flag = actor?.getFlag?.(MODULE_ID, FLAG);
        if (!isActiveGM() || !flag) return;
        endIfNotStruck(actor, flag, encounter).catch((error) => console.error(`${MODULE_ID} | strike sustain`, error));
    });
}

export async function endIfNotStruck(actor, flag, encounter) {
    if (encounter?.id !== flag.combatId) return actor.unsetFlag(MODULE_ID, FLAG);
    const effects = castEffects(flag.spellUuid);
    // (Ended already — escaped, its minute up —: nothing to keep up.)
    if (!effects.length) return actor.unsetFlag(MODULE_ID, FLAG);
    if (encounter.round <= flag.from || flag.struck === encounter.round) return null;
    for (const effect of effects) await effect.delete().catch(() => null);
    await actor.unsetFlag(MODULE_ID, FLAG);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(flag.name)}</strong>: ${escape(actor.name)} didn't Strike a creature with it this round — its spell ends.</p>` });
}
