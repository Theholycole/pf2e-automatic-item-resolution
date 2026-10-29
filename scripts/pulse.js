// Live play for plan.item.pulse (src/live/pulse.js, 2026-10-27: Aroden's Hearthstone's cold): as it's used, the ability module's card of its
// damage at every creature within its radius of its user's token (its user's too, own), and the time it ends kept on its user (flag
// pulses). At the start of each of its user's turns (PF2e's pf2e.startTurn, the active GM's client), while it lasts, the card again; once
// its time is up, the blast's card at every creature within the blast's radius, and it's gone. Out of an encounter, the blast once the
// world's clock passes its end (Foundry's updateWorldTime).

import { pulseCards, pulseFits, pulseFlag, pulseStep, pulseText } from "../src/live/pulse.js";
import { ABILITY_ID, MODULE_ID, creaturesNear, encounterOf, isActiveGM } from "./foundry.js";

const PULSES = "pulses";

// The tokens within that many feet of its user's token (and its own, own), as the canvas has them — only its foes' or its allies' (who).
function tokensAround(token, radius, own, who = null) {
    const placeable = token?.object ?? token;
    if (!placeable) return [];
    const user = placeable.actor;
    const allied = (other) => Boolean(user && other?.actor && (other.actor.isAllyOf?.(user) ?? other.actor.alliance === user.alliance));
    const near = creaturesNear(placeable, radius).map((entry) => canvas.tokens.placeables.find((other) => other.document.uuid === entry.tokenUuid)).filter(Boolean).filter((other) => pulseFits(who, allied(other)));
    return [...(own ? [placeable] : []), ...near];
}

const WHOM = { foes: "foe", allies: "ally" };
// Its cards at the creatures around its user → its line.
async function postDamage(entry, { actor, token, item, blast = false }) {
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const label = blast ? `${item.name}: the blast` : `${item.name}: this round`;
    if (!postCard || !token) return `${label}: ${entry.plan ? pulseText(entry) : `${entry.formula} ${entry.type} damage to every creature within ${entry.radius} feet${entry.own ? " (its user too)" : ""}`} (by hand).`;
    const lines = [];
    for (const { plan, who } of pulseCards(entry, label)) {
        const tokens = tokensAround(token, entry.radius, entry.own && who !== "foes", who);
        const whom = WHOM[who] ?? "creature";
        if (!tokens.length) {
            lines.push(`no ${whom} within ${entry.radius} feet`);
            continue;
        }
        await postCard({ plan, item: { name: item.name, uuid: item.uuid ?? null }, sourceActor: actor, sourceToken: token.object ?? token, tokens, cause: label });
        lines.push(entry.plan ? `its card for ${tokens.length} ${whom}${tokens.length === 1 ? "" : "s"} within ${entry.radius} feet follows` : `${entry.formula} ${entry.type} damage for ${tokens.length} creature${tokens.length === 1 ? "" : "s"} within ${entry.radius} feet (its card follows)`);
    }
    return `${label}: ${lines.join("; ")}.`;
}

// As it's used: its first card, and its time kept on its user → the card's line.
export async function startPulse(pulse, { actor, token, item }) {
    const own = token ?? actor?.getActiveTokens?.(true, true)?.[0] ?? null;
    const line = await postDamage(pulse, { actor, token: own, item });
    const flags = [...(actor.getFlag(MODULE_ID, PULSES) ?? []), pulseFlag(pulse, { item, worldTime: game.time.worldTime })];
    await actor.setFlag(MODULE_ID, PULSES, flags);
    const inCombat = Boolean(encounterOf(actor));
    return `${pulseText(pulse)}: ${line}${inCombat ? " Again at the start of each of its turns while it lasts." : " Out of an encounter: the next rounds' cards by hand; the blast's once the world's clock passes its time."}`;
}

// One step of each pulse on the actor: a tick, or the blast and it's gone.
async function stepPulses(actor, token, { blastOnly = false } = {}) {
    const flags = actor?.getFlag?.(MODULE_ID, PULSES) ?? [];
    if (!flags.length) return;
    const kept = [];
    const due = [];
    let counted = false;
    for (const flag of flags) {
        const step = pulseStep(flag, game.time.worldTime);
        if (step === "tick") {
            // (A counted pulse's turn used up as its card comes.)
            const ticked = Number.isInteger(flag.ticksLeft) && !blastOnly;
            counted ||= ticked;
            kept.push(ticked ? { ...flag, ticksLeft: flag.ticksLeft - 1 } : flag);
            if (!blastOnly) due.push([flag, false]);
        } else if (step === "blast") due.push([flag, true]);
    }
    if (kept.length !== flags.length || counted) await (kept.length ? actor.setFlag(MODULE_ID, PULSES, kept) : actor.unsetFlag(MODULE_ID, PULSES));
    for (const [flag, blast] of due) {
        const item = { name: flag.item ?? "The item", uuid: flag.uuid ?? null };
        const line = await postDamage(blast ? flag.pulse.then : flag.pulse, { actor, token, item, blast });
        if (blast) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${item.name}</strong>: its time is up. ${line}</p>` });
    }
}

export function setUpPulses() {
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM() || !combatant?.actor) return;
        stepPulses(combatant.actor, combatant.token ?? combatant.actor.getActiveTokens?.(true, true)?.[0] ?? null).catch((error) => console.error(`${MODULE_ID} | pulse`, error));
    });
    // (Out of an encounter: the blast once the world's clock passes its end.)
    Hooks.on("updateWorldTime", () => {
        if (!isActiveGM() || !canvas?.ready) return;
        for (const placeable of canvas.tokens.placeables) {
            const actor = placeable.actor;
            if (!actor?.getFlag?.(MODULE_ID, PULSES)?.length || encounterOf(actor)) continue;
            stepPulses(actor, placeable, { blastOnly: true }).catch((error) => console.error(`${MODULE_ID} | pulse`, error));
        }
    });
}
