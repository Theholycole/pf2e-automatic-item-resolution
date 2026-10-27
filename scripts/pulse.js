// Live play for plan.item.pulse (src/live/pulse.js, 2026-10-27: Aroden's Hearthstone's cold): as it's used, the ability module's card of its
// damage at every creature within its radius of its user's token (its user's too, own), and the time it ends kept on its user (flag
// pulses). At the start of each of its user's turns (PF2e's pf2e.startTurn, the active GM's client), while it lasts, the card again; once
// its time is up, the blast's card at every creature within the blast's radius, and it's gone. Out of an encounter, the blast once the
// world's clock passes its end (Foundry's updateWorldTime).

import { pulseDamagePlan, pulseFlag, pulseStep, pulseText } from "../src/live/pulse.js";
import { ABILITY_ID, MODULE_ID, creaturesNear, encounterOf, isActiveGM } from "./foundry.js";

const PULSES = "pulses";

// The tokens within that many feet of its user's token (and its own, own), as the canvas has them.
function tokensAround(token, radius, own) {
    const placeable = token?.object ?? token;
    if (!placeable) return [];
    const near = creaturesNear(placeable, radius).map((entry) => canvas.tokens.placeables.find((other) => other.document.uuid === entry.tokenUuid)).filter(Boolean);
    return [...(own ? [placeable] : []), ...near];
}

// Its card of that damage at the creatures around its user → its line.
async function postDamage(entry, { actor, token, item, blast = false }) {
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const label = blast ? `${item.name}: the blast` : `${item.name}: this round`;
    const tokens = tokensAround(token, entry.radius, entry.own);
    if (!postCard || !token) return `${label}: ${entry.formula} ${entry.type} damage to every creature within ${entry.radius} feet${entry.own ? " (its user too)" : ""} (by hand).`;
    if (!tokens.length) return `${label}: no creature within ${entry.radius} feet.`;
    await postCard({ plan: pulseDamagePlan({ ...entry, name: label }), item: { name: item.name, uuid: item.uuid ?? null }, sourceActor: actor, sourceToken: token.object ?? token, tokens, cause: label });
    return `${label}: ${entry.formula} ${entry.type} damage for ${tokens.length} creature${tokens.length === 1 ? "" : "s"} within ${entry.radius} feet (its card follows).`;
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
    for (const flag of flags) {
        const step = pulseStep(flag, game.time.worldTime);
        if (step === "tick") {
            kept.push(flag);
            if (!blastOnly) due.push([flag, false]);
        } else if (step === "blast") due.push([flag, true]);
    }
    if (kept.length !== flags.length) await (kept.length ? actor.setFlag(MODULE_ID, PULSES, kept) : actor.unsetFlag(MODULE_ID, PULSES));
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
