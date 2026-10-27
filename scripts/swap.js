// Live play for plan.swap (2026-10-27, src/compiler/relic-readings.js: Planar Ribbon's "you exchange positions with the target and all of that
// creature's allies are off-guard to you until the end of your turn"): once the ability module's save card at the creature is applied (its
// "applied" hook, the GM's client), for a creature of the degrees it names its user's token and its own trade places (Foundry's teleport,
// no animation), then the ability module's card of Off-Guard to its user alone, until the end of its user's turn (the core's scope), at
// every ally of that creature on the scene.

import { swapOffGuardPlan } from "../src/live/swap.js";
import { ABILITY_ID, MODULE_ID } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const allied = (one, two) => (one?.isAllyOf?.(two) ?? (one?.alliance && one.alliance === two?.alliance)) === true;

export async function swapAfterSave({ state, targets }) {
    const swap = state?.plan?.swap;
    if (!swap) return;
    const source = state.source?.tokenUuid ? await fromUuid(state.source.tokenUuid).catch(() => null) : null;
    const name = state.ability?.name ?? state.plan?.source?.name ?? "The item";
    for (const target of targets ?? []) {
        if (!swap.degrees.includes(target.degree)) continue;
        const token = target.tokenUuid ? await fromUuid(target.tokenUuid).catch(() => null) : null;
        if (!source || !token || source.parent?.id !== token.parent?.id) {
            await ChatMessage.create({ content: `<p><strong>${escape(name)}</strong>: ${escape(target.name)} failed — trade its place with ${escape(state.source?.name ?? "its user")}'s by hand.</p>` });
            continue;
        }
        const [from, to] = [{ x: source.x, y: source.y, elevation: source.elevation }, { x: token.x, y: token.y, elevation: token.elevation }];
        await source.parent.updateEmbeddedDocuments("Token", [{ _id: source.id, ...to }, { _id: token.id, ...from }], { teleport: true, animate: false, [MODULE_ID]: { swapped: true } });
        // (Its allies Off-Guard to its user until the end of its user's turn.)
        const allies = token.parent.tokens.contents.filter((other) => other.id !== token.id && other.id !== source.id && other.actor && allied(other.actor, token.actor)).map((other) => other.object ?? other).filter(Boolean);
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        if (allies.length && postCard) await postCard({ plan: swapOffGuardPlan(name), item: { name, uuid: state.ability?.uuid ?? null }, sourceActor: source.actor, sourceToken: source.object ?? source, tokens: allies, cause: `${name}: ${target.name}'s allies` });
        await ChatMessage.create({ content: `<p><strong>${escape(name)}</strong>: ${escape(state.source?.name ?? "its user")} and ${escape(target.name)} trade places${allies.length ? `; ${allies.length} of its allies Off-Guard to ${escape(state.source?.name ?? "its user")} until the end of its turn (their card follows)` : ""}.</p>` });
    }
}

export function setUpSwaps() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM || !payload?.state?.plan?.swap) return;
        swapAfterSave(payload).catch((error) => console.error(`${MODULE_ID} | swap`, error));
    });
}
