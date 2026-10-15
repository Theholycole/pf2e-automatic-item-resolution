// Live play for an item used by Striking (src/compiler/strikes.js, src/live/strike-card.js): Apply readies the user's next
// Strike this turn (an Effect marks it, until the end of the turn); that Strike's attack roll (PF2e's, on the active GM's
// client) then puts the riders for its degree on the target (scripts/foundry.js applyRiders) and posts the save the
// Strike calls for on a hit (the ability module's api.live.postCard); a miss spends it. A melee one waits for a melee
// Strike (PF2e's "item:melee" / "item:ranged" roll options).

import { MODULE_KEY, createStrikeCard, riderFor, strikeCardHTML, strikeEffectSource, strikeWord } from "../src/live/strike-card.js";
import { saveText } from "../src/live/poison-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, entryOf, stateOf } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function postStrikeCard({ message, plan, used, actor, token }) {
    const state = createStrikeCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: strikeCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyStrikeCard(message) {
    const state = stateOf(message);
    if (!state || state.kind !== "strike" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    // (One readied Strike at a time: a new one replaces the old.)
    const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
    await actor.createEmbeddedDocuments("Item", [strikeEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
    const next = { ...state, status: "applied", results: [`${state.user.name}'s next ${strikeWord(state.plan)} this turn carries ${state.item.name}${old.length ? " (the one readied before is gone)" : ""}.`] };
    return message.update({ content: strikeCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// PF2e's attack roll by a creature with a readied Strike: its riders on a hit, spent either way.
export async function strikeWithRider(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || !context.outcome) return;
    const actor = message.actor;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (!effect) return;
    const rider = effect.flags[MODULE_ID][MODULE_KEY];
    const options = context.options ?? [];
    const what = riderFor(rider.plan, { ranged: options.includes("item:ranged") && !options.includes("item:melee"), outcome: context.outcome });
    if (!what) return;
    await actor.deleteEmbeddedDocuments("Item", [effect.id]);
    const speaker = ChatMessage.getSpeaker({ actor });
    if (what === "spend") {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike missed; it's spent.</p>` });
        return;
    }
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    if (!targetToken?.actor) {
        await ChatMessage.create({ speaker, whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike hit, but had no target; apply its riders by hand.</p>` });
        return;
    }
    const target = entryOf(targetToken.object ?? targetToken, targetToken.actor);
    const lines = await applyRiders({ plan: rider.plan, degree: context.outcome, user: rider.user, target, item: rider.item });
    const save = rider.plan.strike?.save;
    if (save) {
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        if (postCard) {
            await postCard({ plan: save, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens: [targetToken.object ?? targetToken], cause: `${rider.item.name} hit` });
            lines.push(`${target.name}: its save card follows.`);
        } else lines.push(`${target.name}: ${saveText(save)} (roll it by hand).`);
    }
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(lines.join("; ") || "the Strike hit")}.</p>` });
}
