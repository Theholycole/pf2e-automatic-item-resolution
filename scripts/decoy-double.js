// Live play for a double that takes what's aimed at its user (2026-10-27, src/compiler/decoy-double.js: Shadewither Key's Umbral Double): its
// user's note Effect carries PF2e's RollOption "air-decoy-double:<dc>". On the active GM's client, an attack roll that hits its user, or a
// save its user makes against another creature's targeted spell or effect, gets that creature's flat check, rolled in the chat; a failure hits
// the double instead — the Effect deleted, said so — and that creature's next damage to its user within the minute is none (the core's
// applyDamage listener).

import { CORE_ID, MODULE_ID } from "./foundry.js";

const OPTION = /^air-decoy-double:(\d+)$/;
const HIT = "decoyHit";
const WINDOW_MS = 60_000;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Its double's Effect on an actor and its DC: { effect, dc } or null.
export function doubleOf(actor) {
    for (const effect of actor?.itemTypes?.effect ?? []) {
        for (const rule of effect.system?.rules ?? []) {
            const found = rule?.key === "RollOption" ? OPTION.exec(String(rule.option ?? "")) : null;
            if (found) return { effect, dc: Number(found[1]) };
        }
    }
    return null;
}

async function flatCheck(message, target, from) {
    const held = doubleOf(target);
    if (!held) return;
    const roll = await new Roll("1d20").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: from }), flavor: `DC ${held.dc} flat check to reach ${escape(target.name)} past its double` });
    if (roll.total >= held.dc) return;
    const name = held.effect.name;
    await held.effect.delete();
    await target.setFlag(MODULE_ID, HIT, { from: from?.uuid ?? null, until: Date.now() + WINDOW_MS });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<p><strong>${escape(name)}</strong>: ${escape(from?.name ?? "the creature")} hits ${escape(target.name)}'s double instead, which is destroyed. ${escape(target.name)} takes none of it (its damage from that creature is none for the next minute; apply no other effect of it).</p>` });
}

async function onMessage(message) {
    if (!(game.users.activeGM?.isSelf ?? game.user.isGM)) return;
    const context = message?.flags?.pf2e?.context ?? null;
    if (!context?.type) return;
    // (An attack roll that hits its user: the attacker's flat check.)
    if (["attack-roll", "spell-attack-roll"].includes(context.type) && ["success", "criticalSuccess"].includes(context.outcome)) {
        const token = context.target?.token ? await fromUuid(context.target.token).catch(() => null) : null;
        if (token?.actor && doubleOf(token.actor)) await flatCheck(message, token.actor, message.actor);
        return;
    }
    // (A save its user makes against another's spell or effect aimed at it — not an area's.)
    if (context.type === "saving-throw" && message.actor && doubleOf(message.actor)) {
        const origin = context.origin?.actor ?? message.flags?.pf2e?.origin?.actor ?? null;
        const from = origin ? await fromUuid(origin).catch(() => null) : null;
        const item = context.origin?.item ?? message.flags?.pf2e?.origin?.uuid ?? null;
        const source = item ? await fromUuid(item).catch(() => null) : null;
        const area = Boolean(source?.system?.area?.value || source?.system?.area?.type);
        if (from && from.uuid !== message.actor.uuid && !area) await flatCheck(message, message.actor, from);
    }
}

export function setUpDecoyDouble() {
    Hooks.on("createChatMessage", (message) => {
        onMessage(message).catch((error) => console.error(`${MODULE_ID} | decoy double`, error));
    });
    const damage = game.modules.get(CORE_ID)?.api?.patches?.damage;
    if (!damage?.onApply) return;
    damage.onApply({
        module: MODULE_ID,
        name: "decoy-double",
        before(actor, params) {
            const hit = actor?.getFlag?.(MODULE_ID, HIT);
            // (Only that creature's: its damage roll's item its own.)
            if (!hit || Date.now() > Number(hit.until) || !params?.item?.actor?.uuid || (hit.from && params.item.actor.uuid !== hit.from)) return null;
            return { params: { ...params, damage: 0 }, after: () => actor.unsetFlag?.(MODULE_ID, HIT) };
        }
    });
}
