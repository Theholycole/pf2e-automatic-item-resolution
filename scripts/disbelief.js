// Live play for the disbelief card (src/compiler/disbelief.js, src/live/disbelief-card.js): posted, whispered to the GMs, once the item card
// that makes the illusion applies; on the GM's Disbelieve, each creature targeted rolls its Perception against the item's DC (PF2e's own
// roll), and one that succeeds sees through it — named on the card, and an Effect on it saying so for the rest of the illusion's time. The
// card closes when that time is up.

import { createDisbeliefCard, disbeliefCardHTML, withAttempt } from "../src/live/disbelief-card.js";
import { FLAG, MODULE_ID, stateOf } from "./foundry.js";

const DEGREES = ["criticalFailure", "failure", "success", "criticalSuccess"];

// state: the item card's, as it applies → a line for that card.
export async function postDisbeliefCard(state) {
    // (Spoken as its user, so its card goes with its user's messages.)
    const actor = state.user?.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    // (A DC its user's, Wooden Nickel's Deception DC: read now, 2026-10-27.)
    const against = [state.plan.disbelief.against, state.plan.disbelief.also?.against].filter(Boolean);
    const userDCs = Object.fromEntries(against.map((slug) => [slug, Number(actor?.skills?.[slug]?.dc?.value ?? actor?.getStatistic?.(slug)?.dc?.value)]));
    const card = createDisbeliefCard({ plan: state.plan, item: { name: state.item.name, uuid: state.item.uuid ?? null }, user: state.user, worldTime: game.time.worldTime, userDCs });
    const whisper = game.users.filter((user) => user.isGM).map((user) => user.id);
    await ChatMessage.create({ content: disbeliefCardHTML(card, { canApply: true }), whisper, speaker: ChatMessage.getSpeaker(actor ? { actor } : {}), flags: { [MODULE_ID]: { [FLAG]: card } } });
    return `Its illusion: the GM's disbelief card follows (${Number.isFinite(card.plan.disbelief.dc) ? `DC ${card.plan.disbelief.dc}` : "its DC by hand"}).`;
}

// On the active GM's client: { targets } (token uuids), check (1: the second check, disbelief.also) → each one's attempt.
export async function applyDisbeliefCard(message, { targets = [], check = 0 } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "disbelief" || state.status !== "open") return null;
    if (Number.isFinite(state.until) && game.time.worldTime >= state.until) {
        const over = { ...state, status: "applied", results: [...state.results, "The illusion's time is up."] };
        await message.update({ content: disbeliefCardHTML(over, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: over });
        throw new Error(`${state.item.name}: the illusion's time is up.`);
    }
    const tokens = (await Promise.all((Array.isArray(targets) ? targets : []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor);
    if (!tokens.length) throw new Error("Target the creatures trying to disbelieve it first.");
    const disbelief = state.plan.disbelief;
    const also = check === 1 && disbelief.also ? disbelief.also : null;
    const dc = also ? also.dc : disbelief.dc;
    if (!Number.isFinite(dc)) throw new Error("Its DC (its user's) wasn't found: roll it by hand.");
    for (const token of tokens) {
        const actor = token.actor;
        const name = token.name ?? actor.name;
        const statistic = also ? actor.skills?.[also.statistic] ?? actor.getStatistic?.(also.statistic) : disbelief.statistic === "will" ? actor.saves?.will : actor.perception;
        const roll = await statistic?.roll?.({ dc: { value: dc }, label: `${also ? also.what.replace(/^./, (letter) => letter.toUpperCase()) : "Disbelieve"}: ${state.item.name}`, extraRollOptions: also ? [] : ["disbelieve"], skipDialog: true });
        const degree = DEGREES[roll?.degreeOfSuccess] ?? null;
        if (!degree) {
            state = { ...state, results: [...state.results, `${name}: no roll (roll it by hand)`].slice(-8) };
            continue;
        }
        const before = state.saw.includes(name);
        state = withAttempt(state, { name, degree, also: Boolean(also) });
        // (Seen through: an Effect on it saying so, for the rest of the illusion's time.)
        if (!before && state.saw.includes(name)) {
            const seconds = Number.isFinite(state.until) ? Math.max(6, state.until - game.time.worldTime) : null;
            await actor.createEmbeddedDocuments("Item", [{
                name: `Saw through: ${state.item.name}`,
                type: "effect",
                img: "icons/svg/eye.svg",
                flags: { [MODULE_ID]: { disbelieved: { item: state.item.name, message: message.id } } },
                system: {
                    description: { value: `<p>${name} saw through ${state.user.name}'s illusion (${state.item.name}).</p>` },
                    duration: seconds ? { value: Math.ceil(seconds / 6), unit: "rounds", expiry: "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false },
                    start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null },
                    rules: []
                }
            }]);
        }
    }
    return message.update({ content: disbeliefCardHTML(state, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: state });
}
