// Live play for damage each time a creature moves farther than half its Speed (src/compiler/snares.js barbedRows: Poison Barbs Snare's barbs). Its
// note Effect carries PF2e's RollOption "air-move-damage:<dice>:<type>:half"; on the active GM's client, after Foundry moves a token (its
// "moveToken" hook, the movement's passed distance in feet), a creature with that Effect that went farther than half its land Speed takes that
// damage, rolled and applied through PF2e. A Stride split into several moves counts each by itself.

import { damageRollClass, isActiveGM, MODULE_ID } from "./foundry.js";

const OPTION = /^air-move-damage:(\d+d\d+):([a-z]+):(half|any)$/;

// The creature's move damages: [{ dice, type, half, effect }].
export function moveDamagesOf(actor) {
    const found = [];
    for (const effect of actor?.itemTypes?.effect ?? []) {
        for (const rule of effect.system?.rules ?? []) {
            const match = rule?.key === "RollOption" ? OPTION.exec(String(rule.option ?? "")) : null;
            if (match) found.push({ dice: match[1], type: match[2], half: match[3] === "half", effect });
        }
    }
    return found;
}

// Whether a move of that many feet sets it off for a creature of that Speed.
export const movedFarEnough = (feet, speed, half = true) => Number(feet) > (half ? Number(speed) / 2 : 0);

export function setUpMoveDamage() {
    Hooks.on("moveToken", (token, movement) => {
        if (!isActiveGM()) return;
        moveDamage(token, movement).catch((error) => console.error(`${MODULE_ID} | move damage`, error));
    });
}

async function moveDamage(token, movement) {
    const actor = token?.actor;
    const damages = moveDamagesOf(actor);
    if (!damages.length) return;
    const feet = Number(movement?.passed?.distance) || 0;
    // (PF2e 8.6's movement.speeds.land; before it, attributes.speed — as scripts/teleport.js reads it.)
    const speed = Number(actor.system?.movement?.speeds?.land?.value ?? actor.system?.attributes?.speed?.total ?? actor.system?.attributes?.speed?.value) || 0;
    if (!speed) return;
    const DamageRoll = damageRollClass();
    if (!DamageRoll) return;
    for (const { dice, type, half, effect } of damages) {
        if (!movedFarEnough(feet, speed, half)) continue;
        const roll = await new DamageRoll(`${dice}[${type}]`).evaluate();
        const from = String(effect.name ?? "").replace(/:.*$/, "");
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${from}</strong>: ${feet} feet moved, more than half its Speed (${speed} feet) — ${dice} ${type}` });
        await actor.applyDamage({ damage: roll, token });
    }
}
