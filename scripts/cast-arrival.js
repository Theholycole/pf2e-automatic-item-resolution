// Live play for plan.castArrival (src/compiler/cast-arrival.js: Fiendish Teleportation's brimstone): after the cast, the next move of its user's
// token (Foundry's "moveToken" hook — the spell's teleport, within two minutes) sends the ability module's card of its damage to every other
// token adjacent to the space it left or the one it arrived in.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";
import { adjacentTo } from "../src/live/arrival.js";

// The cast's user and item → the card's line; the damage comes once its token moves.
export function arrivalAfterMove(castArrival, { actor, token, item }) {
    const document = token?.document ?? token ?? actor?.getActiveTokens?.(true, true)?.[0] ?? null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    if (!document?.id || !postCard) return `Brimstone: ${castArrival.words} (by hand).`;
    let id = null;
    const stop = setTimeout(() => Hooks.off("moveToken", id), 120000);
    id = Hooks.on("moveToken", (moved, movement) => {
        if (moved.id !== document.id) return;
        Hooks.off("moveToken", id);
        clearTimeout(stop);
        const scene = moved.parent;
        const grid = scene?.grid?.size ?? canvas?.grid?.size ?? 100;
        const size = Math.max(moved.width ?? 1, moved.height ?? 1);
        const spaces = [movement?.origin, movement?.destination].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
        const others = (scene?.tokens?.contents ?? []).filter((other) => other.id !== moved.id && other.actor).map((other) => ({ token: other, x: other.x, y: other.y, width: other.width ?? 1, height: other.height ?? 1 }));
        const near = adjacentTo(spaces.map((point) => ({ x: point.x, y: point.y, width: size, height: size })), others, grid).map((entry) => entry.token.object ?? entry.token);
        if (!near.length) return;
        postCard({ plan: castArrival.plan, item: { name: item.name, uuid: item.uuid ?? null }, sourceActor: actor, sourceToken: moved.object ?? moved, tokens: near, cause: `${item.name}: brimstone` }).catch((error) => console.error(`${MODULE_ID} | cast arrival`, error));
    });
    return `Brimstone as it moves: ${castArrival.words} (its card follows).`;
}
