// Live play for a check that changes its user's last cast (src/compiler/cast-boost.js; Starless Scope's reaction, 2026-10-29). Its card names
// its user's last spell cast (PF2e's cast message) with its DC by rank and rarity; Apply rolls the check (PF2e's skill) and plays the degree's row
// on that cast: a status bonus to its attack rolls on its user and a status penalty to the saves against it on each foe its user targets (PF2e
// FlatModifiers for that spell only, a minute); its slot given back and its spell lost through the spell module (api.casting); a flat check; the
// item's lens shattered — the item inert until its user puts in a new lens (the card's second Apply, a lens of its from its user's inventory).

import { castBoostCardHTML, createCastBoostCard, DEGREE_KEYS, spellDC } from "../src/live/cast-boost.js";
import { ruleEffectSource } from "../src/live/card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

const SPELL_ID = "pf2e-automatic-resolution";
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const slugOf = (name) => String(name ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Its user's last cast: PF2e's cast message of a spell by it, among the latest messages → { messageId, name, rank, slug, rarity, dc } or null.
export function lastCastOf(actor, messages = game.messages.contents) {
    const message = messages.slice(-40).reverse().find((entry) => entry?.flags?.pf2e?.casting && entry.flags.pf2e.origin?.type === "spell" && (entry.actor?.id === actor?.id || entry.speaker?.actor === actor?.id));
    if (!message) return null;
    const spell = message.item ?? null;
    const name = spell?.name ?? "the spell";
    const rank = Number(message.flags.pf2e.origin?.castRank ?? message.flags.pf2e.casting?.rank ?? spell?.rank ?? 1) || 1;
    const rarity = spell?.rarity ?? spell?.system?.traits?.rarity ?? "common";
    return { messageId: message.id, name, rank, slug: spell?.slug ?? slugOf(name), rarity, dc: spellDC(rank, rarity) };
}

export async function postCastBoostCard({ message, plan, used, actor, token }) {
    const state = createCastBoostCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), cast: lastCastOf(actor) });
    return ChatMessage.create({ content: castBoostCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

const effectOf = (name, words, rules, { item, user }) => ruleEffectSource({ name, words, rules, duration: MINUTE }, { item, user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID });

export async function applyCastBoostCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "cast-boost") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    const holder = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    if (!actor || !holder) throw new Error(`${state.item.name} or its user isn't there any more.`);
    // (A shattered lens: a new one from its user's inventory put in, the item working again.)
    if (state.status !== "open") return state.shattered ? replaceLens(message, state, { actor, holder }) : null;
    const cast = lastCastOf(actor) ?? state.cast;
    if (!cast) throw new Error(`${actor.name} hasn't cast a spell yet: cast it, then Apply.`);
    const boost = state.plan.castBoost;
    const statistic = actor.skills?.[boost.skill] ?? actor.getStatistic?.(boost.skill);
    if (!statistic) throw new Error(`${actor.name} has no ${boost.skill} to roll.`);
    const roll = await statistic.roll({ dc: { value: cast.dc, label: `${cast.name}'s DC` }, skipDialog: true });
    const degree = DEGREE_KEYS[Number(roll?.degreeOfSuccess ?? -1)] ?? null;
    if (!degree) throw new Error("The check wasn't rolled.");
    const row = boost.rows[degree] ?? {};
    const lines = [`${boost.skill.charAt(0).toUpperCase() + boost.skill.slice(1)} ${roll.total} against ${cast.name}'s DC ${cast.dc}: ${degree.replace(/([A-Z])/g, " $1").toLowerCase()}.`];
    const record = { item: { name: holder.name, uuid: holder.uuid }, user: { actorUuid: actor.uuid, tokenUuid: state.user.tokenUuid ?? null } };
    const predicate = [`item:slug:${cast.slug}`];
    if (row.attack) {
        await actor.createEmbeddedDocuments("Item", [effectOf(`+${row.attack} to ${cast.name}'s attacks`, `+${row.attack} status bonus to the attack rolls of ${cast.name}`, [{ key: "FlatModifier", selector: "spell-attack-roll", type: "status", value: row.attack, predicate }], record)]);
        lines.push(`${actor.name}: +${row.attack} status to ${cast.name}'s attack rolls.`);
    }
    if (row.save) {
        const tokens = (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor && token.actor.id !== actor.id && token.actor.alliance !== actor.alliance);
        for (const token of tokens) await token.actor.createEmbeddedDocuments("Item", [effectOf(`${row.save} to saves against ${cast.name}`, `${row.save} status penalty to its saves against ${cast.name}`, [{ key: "FlatModifier", selector: "saving-throw", type: "status", value: row.save, predicate }], record)]);
        lines.push(tokens.length ? `${tokens.map((token) => token.name).join(", ")}: ${row.save} status to saves against ${cast.name}.` : `No foe targeted: give the foes it's cast at their ${row.save} to saves against ${cast.name} by hand.`);
    }
    const casting = game.modules.get(SPELL_ID)?.api?.casting ?? null;
    if (row.refund) {
        if (cast.rank > row.refund.maxRank) lines.push(`${cast.name} is rank ${cast.rank}: its slot is spent as usual.`);
        else if (casting?.refundSlot) lines.push(String((await casting.refundSlot(cast.messageId, holder.name).catch((error) => ({ label: error.message })))?.label ?? ""));
        else lines.push(`Give back ${cast.name}'s slot by hand (the spell module isn't active).`);
    }
    let shatter = Boolean(row.shatter);
    if (row.flat) {
        const flat = await new Roll("1d20").evaluate();
        await flat.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${holder.name}: DC ${row.flat.dc} flat check` });
        const failed = flat.total < row.flat.dc;
        lines.push(`Flat check ${flat.total} against DC ${row.flat.dc}: ${failed ? "a failure" : "a success"}.`);
        if (failed && row.flat.shatter) shatter = true;
    }
    if (row.lose) {
        if (casting?.lose) await casting.lose(cast.messageId, `${holder.name}'s critical failure disrupts it`);
        else lines.push(`${cast.name} is disrupted: it has no effect (by hand, the spell module isn't active).`);
        lines.push(`${cast.name} is disrupted.`);
    }
    if (shatter) {
        await holder.setFlag(MODULE_ID, "inert", { by: "its lens shattered" });
        lines.push(`${holder.name}'s lens shatters: it does nothing until a new lens is put in.`);
    }
    const next = { ...state, status: "applied", cast, degree, shattered: shatter, results: lines };
    return message.update({ content: castBoostCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A new lens put in: one of its user's items named for the item's lens ("<item> Lens"), used up; the item no longer inert.
async function replaceLens(message, state, { actor, holder }) {
    const lens = actor.items.find((entry) => entry.id !== holder.id && entry.name.toLowerCase() === `${holder.name} lens`.toLowerCase());
    if (!lens) throw new Error(`${actor.name} has no ${holder.name} Lens to put in.`);
    const quantity = Number(lens.system?.quantity) || 1;
    if (quantity > 1) await lens.update({ "system.quantity": quantity - 1 });
    else await lens.delete();
    await holder.unsetFlag(MODULE_ID, "inert");
    const next = { ...state, shattered: false, results: [...state.results, `${actor.name} puts in a new lens: ${holder.name} works again.`] };
    return message.update({ content: castBoostCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
