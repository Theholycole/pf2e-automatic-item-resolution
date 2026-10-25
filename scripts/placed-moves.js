// A creature moved to a space its user picks (src/compiler/placed.js — Roc-Shaft Arrow's failed save, Whip-Tongue Sling's successful
// Tongue Twister), and a push or pull from the creature a Strike hit (src/compiler/hit-around.js — Dispersing Bullet, Singularity
// Ammunition): both need PF2e Automatic Ability Resolution 0.9.2, its "applied" hook and its postCard's moveFrom. Once its card at the
// creature is applied (on the client that pressed Apply), the teleport card for each creature whose degree has a row: the creature's token
// the one moved, its user the one who picks. Before 0.9.2, the plan as read before (withoutPlacedMoves: notes, the core's push).

import { withoutPlacedMoves } from "../src/compiler/placed.js";
import { createTeleportCard, teleportCardHTML } from "../src/live/teleport-card.js";
import { ABILITY_ID, FLAG, MODULE_ID } from "./foundry.js";

const MOVES_FROM = "0.9.2";

// Has the ability module the hook and moveFrom?
export function abilityMoves() {
    const version = game.modules.get(ABILITY_ID)?.version;
    if (!version) return false;
    return version === MOVES_FROM || Boolean(foundry.utils?.isNewerVersion?.(version, MOVES_FROM));
}

// The plan for live play: as it is with ability 0.9.2 or later, as read before without.
export const forAbility = (plan) => (abilityMoves() ? plan : withoutPlacedMoves(plan));

// The ability module's card applied: { message, state, targets: [{ id, tokenUuid, actorUuid, name, degree }] }.
export async function placeAfterApplied({ state, targets }) {
    const placed = state?.plan?.placed;
    if (!placed?.rows) return [];
    const posted = [];
    for (const target of targets ?? []) {
        const row = placed.rows[target.degree];
        if (!row || !target.tokenUuid) continue;
        const by = { actorUuid: state.source?.actorUuid ?? null, tokenUuid: state.source?.tokenUuid ?? null, name: state.source?.name ?? "its user" };
        const plan = {
            builtin: "teleport",
            source: state.plan.source ?? null,
            teleport: { within: row.within, from: "self", place: { by, ...(Number.isFinite(placed.nearSource) ? { nearSource: placed.nearSource } : {}), ...(placed.optional ? { optional: true } : {}), lines: placed.lines ?? [] } }
        };
        const card = createTeleportCard({ plan, item: { name: state.ability?.name ?? "The item", uuid: state.ability?.uuid ?? null }, user: { actorUuid: target.actorUuid, tokenUuid: target.tokenUuid, name: target.name }, presser: { actorUuid: by.actorUuid, name: by.name } });
        const sourceActor = by.actorUuid ? await fromUuid(by.actorUuid).catch(() => null) : null;
        posted.push(await ChatMessage.create({ content: teleportCardHTML(card, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor: sourceActor ?? undefined }), flags: { [MODULE_ID]: { [FLAG]: card } } }));
    }
    return posted;
}

export function setUpPlacedMoves() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        placeAfterApplied(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | placed move`, error));
    });
}
