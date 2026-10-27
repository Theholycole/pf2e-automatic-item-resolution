// Live play for plan.possess (src/compiler/special-sentences.js: Emerald Fulcrum Lens's "On a hit, you force the splinter of Nhimbaloth's
// essence from the lens to possess the target. You're no longer invested in the lens … The lens doesn't have any magical abilities until the
// possession effect ends"). Once the ability module's card at the creature is applied with a hit (its "applied" hook, on the GM's client), the
// item is uninvested and flagged as possessing; its activations are refused meanwhile (scripts/activations.js). Once the possessed creature's
// Effect with that RollOption is deleted, the flag goes: the essence is back, its user may invest the lens again.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";

export const POSSESSING = "possessing";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function possessed({ state, targets }) {
    const possess = state?.plan?.possess;
    if (!possess || !state.ability?.uuid) return;
    const hit = (targets ?? []).find((target) => possess.degrees.includes(target.degree));
    if (!hit) return;
    const item = await fromUuid(state.ability.uuid).catch(() => null);
    if (!item?.actor) return;
    await item.update({ "system.equipped.invested": false, [`flags.${MODULE_ID}.${POSSESSING}`]: { actorUuid: hit.actorUuid, option: possess.option } });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: item.actor }), content: `<p><strong>${escape(item.name)}</strong>: its essence possesses another creature — ${escape(item.actor.name)} is no longer invested in it, and it has no magic until that ends.</p>` });
}

export function setUpPossession() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        possessed(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | possession`, error));
    });
    Hooks.on("deleteItem", (effect) => {
        if (!game.user.isGM || effect?.type !== "effect") return;
        const option = (effect.system?.rules ?? []).find((rule) => rule?.key === "RollOption" && String(rule.option ?? "").startsWith("air-possessed-by:"))?.option;
        if (!option) return;
        for (const actor of game.actors ?? []) for (const item of actor.items ?? []) {
            const flag = item.getFlag?.(MODULE_ID, POSSESSING);
            if (flag?.option === option && flag.actorUuid === effect.parent?.uuid) item.unsetFlag(MODULE_ID, POSSESSING).then(() => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(item.name)}</strong>: the possession has ended, and its essence is back (${escape(actor.name)} may invest it again).</p>` })).catch(() => null);
        }
    });
}
