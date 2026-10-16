// Live play for an item used by Striking (src/compiler/strikes.js, src/live/strike-card.js): Apply readies the user's next
// Strike this turn (an Effect marks it, until the end of the turn, with PF2e's rules for the extra dice or bonus it
// gives); that Strike's attack roll (PF2e's, on the active GM's client) then puts the riders for its degree on the target
// (scripts/foundry.js applyRiders) and posts the save the Strike calls for on a hit (the ability module's
// api.live.postCard); a miss spends it. With extra dice, a hit keeps the Effect for that Strike's damage roll, which
// spends it. A melee one waits for a melee Strike (PF2e's "item:melee" / "item:ranged" roll options), the item's own
// weapon for a Strike with it ("item:id:…").

import { MODULE_KEY, createStrikeCard, dieText, itemIdOf, riderFor, strikeCardHTML, strikeEffectSource, strikeHint, strikeWord } from "../src/live/strike-card.js";
import { saveText } from "../src/live/poison-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, entryOf, startInitiative, stateOf } from "./foundry.js";

const SPELL_ID = "pf2e-automatic-resolution";

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
    const weaponId = state.plan.strike?.own ? itemIdOf(state.item.uuid) : null;
    const ammoId = state.plan.strike?.ammo ? itemIdOf(state.item.uuid) : null;
    await actor.createEmbeddedDocuments("Item", [strikeEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID, weaponId, ammoId })]);
    const next = { ...state, status: "applied", results: [`${strikeHint(state.plan, state.user.name)}${old.length ? " (The one readied before is gone.)" : ""}`] };
    return message.update({ content: strikeCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// One Strike of the readied ones used: the Effect gone with the last, else one fewer left.
async function useOne(actor, effect, rider) {
    const left = (Number(rider.uses) || 1) - 1;
    if (left <= 0) return actor.deleteEmbeddedDocuments("Item", [effect.id]);
    return effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.uses`]: left, [`flags.${MODULE_ID}.${MODULE_KEY}.awaiting`]: false });
}

// PF2e's attack roll by a creature with a readied Strike: its riders on a hit, spent either way — after the hit's damage
// roll when its Effect gives that roll something. PF2e's damage roll then spends it (an item whose Strike already hit
// readies the damage roll alone).
export async function strikeWithRider(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type === "damage-roll") return damageWithRider(message);
    if (context?.type !== "attack-roll" || !context.outcome) return;
    const actor = message.actor;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (!effect) return;
    const rider = effect.flags[MODULE_ID][MODULE_KEY];
    const options = context.options ?? [];
    const what = riderFor(rider.plan, { ranged: options.includes("item:ranged") && !options.includes("item:melee"), outcome: context.outcome, options, weaponId: rider.weaponId ?? null, ammoId: rider.ammoId ?? null });
    if (!what || what === "keep") return;
    // (Weapon Shot's striking rune counts: the damage roll's dice are its.)
    const rolled = (rider.plan.strike?.damage ?? []).length || rider.plan.strike?.alteration || rider.plan.strike?.runes?.striking;
    // (A hit whose damage roll the Effect adds to: kept for it.)
    if (what === "hit" && rolled) await effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.awaiting`]: true });
    else await useOne(actor, effect, rider);
    const speaker = ChatMessage.getSpeaker({ actor });
    if (what === "spend") {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike missed; it's spent.</p>` });
        return;
    }
    // (Nothing for the target on this degree: the hit, and what its damage roll adds.)
    const row = rider.plan.resolution?.outcomes?.[context.outcome];
    if (!rider.plan.strike?.save && !rider.plan.strike?.cast && !(row?.effects ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement) {
        const adds = (rider.plan.strike?.damage ?? []).map((entry) => `+${dieText(entry)}`).join(", ");
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike hit${adds ? `; its damage roll adds ${escape(adds)}` : ""}.</p>` });
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
    // (A spell cast at the creature hit: the spell module's, its own save at the item's DC — Stone Bullet's Petrify.)
    const cast = rider.plan.strike?.cast;
    if (cast) {
        const castFromItem = game.modules.get(SPELL_ID)?.api?.castFromItem;
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        if (!castFromItem) lines.push(`${target.name}: cast ${cast.name}${cast.rank ? ` at rank ${cast.rank}` : ""}${cast.dc ? `, DC ${cast.dc}` : ""} by hand (PF2e Automatic Spell Resolution isn't active)`);
        else {
            await castFromItem({ actor, token: sourceToken ?? undefined, spell: cast.uuid, rank: cast.rank ?? undefined, dc: cast.dc ?? undefined, targets: [targetToken.object ?? targetToken], item: { name: rider.item.name, uuid: rider.item.uuid ?? null } });
            lines.push(`${target.name}: ${cast.name} cast at it`);
        }
    }
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(lines.join("; ") || "the Strike hit")}.</p>` });
}

// PF2e's damage roll of a Strike by a creature whose readied Strike carries extra dice: that Strike's damage is rolled, so
// it's spent (with its Effect's rules in the roll). The item's own weapon must be the one rolled.
async function damageWithRider(message) {
    const context = message.flags.pf2e.context;
    if (context.sourceType !== "attack") return;
    const actor = message.actor;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (!effect) return;
    const rider = effect.flags[MODULE_ID][MODULE_KEY];
    if (!(rider.plan.strike?.damage ?? []).length && !rider.plan.strike?.alteration && !rider.plan.strike?.runes?.striking) return;
    const options = context.options ?? [];
    if (rider.weaponId && !options.includes(`item:id:${rider.weaponId}`)) return;
    if (rider.plan.strike?.unarmed && !options.includes("item:category:unarmed")) return;
    await useOne(actor, effect, rider);
}
