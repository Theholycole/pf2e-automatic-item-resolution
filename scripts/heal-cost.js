// Live play for plan.item.healCost (src/compiler/heart-cost.js, src/live/heal-cost.js: Iron Heart's): once the ability module's card for the
// item has healed the creatures targeted (its "applied" hook, on the GM's client), its user loses as many Hit Points — PF2e's final damage, no
// resistance nor immunity, its temporary Hit Points set aside meanwhile (noTemp) —; left at 0 Hit Points by it, each creature healed regains
// the dice again (dying.heal). A chat line says it.

import { healsToOthers, leftDying } from "../src/live/heal-cost.js";
import { ABILITY_ID, MODULE_ID, healCreature, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpHealCost() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!isActiveGM() || !payload?.state?.plan?.item?.healCost) return;
        payHealing(payload).catch((error) => console.error(`${MODULE_ID} | heal cost`, error));
    });
}

export async function payHealing({ state, targets, changes }) {
    const cost = state.plan.item.healCost;
    const userUuid = state.source?.actorUuid ?? null;
    const user = userUuid ? await fromUuid(userUuid).catch(() => null) : null;
    const heals = healsToOthers(changes, targets, userUuid);
    const amount = heals.reduce((sum, entry) => sum + entry.amount, 0);
    if (!user?.applyDamage || !(amount > 0)) return null;
    const name = state.source?.name ?? user.name;
    const temp = Number(user.system?.attributes?.hp?.temp) || 0;
    const token = state.source?.tokenUuid ? await fromUuid(state.source.tokenUuid).catch(() => null) : null;
    if (cost.noTemp && temp > 0) await user.update({ "system.attributes.hp.temp": 0 });
    await user.applyDamage({ damage: amount, token: token ?? undefined, final: true });
    if (cost.noTemp && temp > 0) await user.update({ "system.attributes.hp.temp": temp });
    const lines = [`${name} loses ${amount} Hit Points for the healing it gave (nothing lowers that)`];
    if (cost.dying?.heal && leftDying(user.system?.attributes?.hp)) {
        for (const { target } of heals) {
            const healed = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
            if (!healed) continue;
            const roll = await new Roll(String(cost.dying.heal)).evaluate();
            const place = target.tokenUuid ? await fromUuid(target.tokenUuid).catch(() => null) : null;
            lines.push(`${name} is left dying: ${target.name ?? healed.name} regains ${cost.dying.heal} more (${roll.total})`);
            const line = await healCreature({ token: place ?? undefined, actor: healed }, target.name ?? healed.name, roll.total, state);
            if (line) lines.push(line);
        }
    }
    const itemName = state.ability?.name ?? state.plan.source?.name ?? "The item";
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user }), content: `<p><strong>${escape(itemName)}</strong>: ${lines.map(escape).join("; ")}.</p>` });
}
