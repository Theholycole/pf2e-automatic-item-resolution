// Live play for the "hp floor" Effect (src/live/hp-floor.js): Bewitching Bloom (Amaranth)'s ally kept at 1 Hit Point through the next damage
// a hazard or an enemy deals it. The core's applyDamage listener (its patches.damage.onApply) sees each damage before PF2e applies it, and its
// source; the creature is marked, and PF2e's own update of its Hit Points for that damage can't go below 1 (preUpdateActor, on the client
// applying it). After the damage the Effect is used up once its Hit Points or temporary Hit Points went down, and the GM and its owners are
// told, with whether it held.

import { HP_FLOOR } from "../src/compiler/chosen-ally.js";
import { belowOne, fromEnemyOrHazard, tookDamage } from "../src/live/hp-floor.js";
import { CORE_ID, MODULE_ID } from "./foundry.js";

const marked = new Map();
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const floorOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.getFlag?.(MODULE_ID, "ruleEffect") === HP_FLOOR) ?? null;
const hpOf = (actor) => ({ value: actor?.system?.attributes?.hp?.value, temp: actor?.system?.attributes?.hp?.temp });

export function setUpHPFloor() {
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) {
        console.warn(`${MODULE_ID} | The resolution core's damage listener isn't there: an "hp floor" Effect won't hold.`);
        return;
    }
    damage.onApply({ module: MODULE_ID, name: "hp-floor", before });
    Hooks.on("preUpdateActor", (actor, changes, options) => {
        const mark = marked.get(actor?.uuid);
        if (!mark || !(Number(options?.damageTaken) > 0) || belowOne(changes) === null) return;
        if ("system.attributes.hp.value" in changes) changes["system.attributes.hp.value"] = 1;
        else foundry.utils.setProperty(changes, "system.attributes.hp.value", 1);
        mark.held = true;
    });
}

// (PF2e applies the damage to a copy of the creature with the attack's context: its Hit Points afterwards are the creature's own.)
function before(actor, params) {
    const effect = floorOf(actor);
    if (!effect || !fromEnemyOrHazard({ target: actor, rollOptions: params?.rollOptions ?? [], source: params?.item?.actor ?? null })) return null;
    const mark = { held: false, hp: hpOf(actor) };
    marked.set(actor.uuid, mark);
    return async () => {
        if (marked.get(actor.uuid) === mark) marked.delete(actor.uuid);
        const live = fromUuidSync(actor.uuid) ?? actor;
        if (!tookDamage(mark.hp, hpOf(live))) return;
        await floorOf(live)?.delete();
        const whisper = (game.users?.filter?.((user) => user.isGM || live.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
        const name = escape(live.token?.name ?? live.name);
        const content = mark.held ? `<p><strong>${name}</strong> stays at 1 Hit Point: ${escape(effect.name)} kept the damage from reducing it lower, and is used up.</p>` : `<p>${escape(effect.name)} is used up: <strong>${name}</strong> took damage from a hazard or an enemy.</p>`;
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: live }), whisper, content });
    };
}
