// What its user pays for the healing an item's card gave others (src/compiler/heart-cost.js plan.item.healCost, Iron Heart's): the
// ability module's applied card's changes — its heals to creatures other than its user —, the Hit Points its user loses for them, and
// whether that leaves it dying (at 0 Hit Points), when the creatures healed get the dice again. Pure.

// The applied card's changes and targets ({ id, actorUuid, tokenUuid, name }), its user's actor uuid → [{ target, amount }] (the heals to
// others, by creature).
export function healsToOthers(changes, targets, userUuid) {
    const byId = new Map((targets ?? []).map((target) => [target.id, target]));
    const out = [];
    for (const change of changes ?? []) {
        if (change?.op !== "heal" || !(Number(change.amount) > 0)) continue;
        const target = byId.get(change.target);
        if (!target || (userUuid && target.actorUuid === userUuid)) continue;
        const known = out.find((entry) => entry.target.id === target.id);
        if (known) known.amount += Number(change.amount);
        else out.push({ target, amount: Number(change.amount) });
    }
    return out;
}

// Whether the loss leaves its user dying: a creature at 0 Hit Points after it.
export const leftDying = (hp) => (Number(hp?.value) || 0) <= 0;
