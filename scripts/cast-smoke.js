// Live play for plan.castSmoke (src/compiler/cast-smoke.js: Charlatan's Cape's and Blink Blade's Translocate): after the cast, the next move
// of its user's token (Foundry's "moveToken" hook — the spell's teleport, within two minutes) leaves the ability module's zone at the space it
// left and at the one it arrives in: Concealed inside, until the end of its user's next turn.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";

// The zone for one space: a square the size of the token's space, Concealed inside, for its time.
export function smokeZone(castSmoke, size) {
    return { area: { type: "square", value: 5 * Math.max(1, Number(size) || 1) }, centre: "snare", range: 0, lasts: castSmoke.lasts, untilReused: false, concealed: true, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: ["Puffs of smoke: anyone within is Concealed until it leaves.", ...(castSmoke.notes ?? [])] };
}

// The cast's user and item → the card's line; the zones come once its token moves.
export function smokeAfterMove(castSmoke, { actor, token, item }) {
    // (Its token, else its actor's on the scene.)
    const document = token?.document ?? token ?? actor?.getActiveTokens?.(true, true)?.[0] ?? null;
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    if (!document?.id || !startZone) return "Smoke at the space it leaves and the one it arrives in: Concealed inside until the end of its next turn (by hand).";
    let id = null;
    const stop = setTimeout(() => Hooks.off("moveToken", id), 120000);
    id = Hooks.on("moveToken", (moved, movement) => {
        if (moved.id !== document.id) return;
        Hooks.off("moveToken", id);
        clearTimeout(stop);
        const scene = moved.parent;
        const size = Math.max(moved.width ?? 1, moved.height ?? 1);
        const spaces = [movement?.origin, movement?.destination].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
        (async () => {
            for (const point of spaces) await startZone({ item: { name: item.name, uuid: item.uuid ?? null, actor }, plan: { builtin: "zone", source: { name: item.name }, zone: smokeZone(castSmoke, size) }, sourceToken: moved, at: { token: { id: null, x: point.x, y: point.y, width: size, height: size, shape: 0 }, scene } });
        })().catch((error) => console.error(`${MODULE_ID} | cast smoke`, error));
    });
    return "Smoke fills the space it leaves and the one it arrives in as it moves (Concealed inside until the end of its next turn).";
}
