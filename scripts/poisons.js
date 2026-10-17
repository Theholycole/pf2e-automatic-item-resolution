// Live play for injury poisons (src/live/poison-card.js): coat a weapon from the
// poison's card, then the weapon's next Strike that hits posts the poison's save
// card on the target (the ability module's api.live.postCard, the affliction
// handed to Pseudo Afflictions as for monster venom); a critical miss wastes it.

import { ATTACKER, MODULE_KEY, afterExposure, createExposureCard, isOwnSave, createPoisonCard, exposureCardHTML, poisonCardHTML, poisonEffectSource, poisonStrike, poisonableWeapons, coatableWeapons, repeatsLater, saveText, withAttackChoice, withCheckChoice } from "../src/live/poison-card.js";
import { itemDuration, plainText } from "../src/compiler/rows.js";
import { withDamageChoice } from "../src/compiler/beads.js";
import { ABILITY_ID, FLAG, MODULE_ID, entryOf, lowerCondition, stateOf } from "./foundry.js";

// The poison card, for an injury poison's Use (scripts/live.js has read the item and its plan).
export async function postPoisonCard({ message, plan, used, actor, token }) {
    // (A weapon's own poison or curse for its next hit, src/compiler/hit-delivery.js: that weapon; a talisman's, any of its user's.)
    const all = actor.itemTypes?.weapon ?? [];
    const own = plan.item?.coats === "self" ? all.filter((weapon) => weapon.id === used.data?._id) : [];
    const weapons = plan.item?.coats === "self" && own.length ? coatableWeapons(own) : plan.item?.coats === "any" ? coatableWeapons(all) : poisonableWeapons(all);
    const state = createPoisonCard({
        plan,
        item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null, description: used.data.system?.description?.value ?? "" },
        user: entryOf(token, actor),
        weapons
    });
    return ChatMessage.create({ content: poisonCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyPoisonCard(message, { weapon = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "poison" || state.status !== "open") return null;
    if (Number.isInteger(weapon) && state.weapons[weapon]) state = { ...state, weapon };
    const chosen = state.weapons[state.weapon];
    if (!chosen) throw new Error("There's no weapon to coat.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    // One poison on a weapon at a time: a new coat replaces the old.
    const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.weaponId === chosen.id);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
    const plain = String(state.item.description ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1");
    await actor.createEmbeddedDocuments("Item", [poisonEffectSource({ state, weapon: chosen, description: plain, img: state.item.img, worldTime: game.time.worldTime, moduleId: MODULE_ID })]);
    const lines = [`${state.user.name} coats ${chosen.name} with ${state.item.name}${old.length ? " (the poison on it before is gone)" : ""}.`];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: poisonCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A Strike with a coated weapon: on a hit, the target's save card and the poison spent; a critical miss spends it.
export async function strikeWithPoison(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || !context.outcome) return;
    const actor = message.actor;
    const weaponUuid = message.flags.pf2e.origin?.uuid ?? null;
    const weaponId = weaponUuid?.split(".").at(-1) ?? null;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]?.weaponId === weaponId);
    if (!effect) return;
    const poison = effect.flags[MODULE_ID][MODULE_KEY];
    const what = poisonStrike(context.outcome, { coats: poison.plan?.item?.coats ?? null });
    if (what === "keep") return;
    await actor.deleteEmbeddedDocuments("Item", [effect.id]);
    const speaker = ChatMessage.getSpeaker({ actor });
    if (what === "spend") {
        await ChatMessage.create({ speaker, content: `<p><strong>${poison.item.name}</strong>: the critical miss wastes the poison on ${poison.weaponName}.</p>` });
        return;
    }
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const sourceToken = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    if (postCard && targetToken) {
        await postCard({ plan: poison.plan, item: { name: poison.item.name, uuid: poison.item.uuid ?? null }, sourceActor: actor, sourceToken: sourceToken?.document ?? sourceToken, tokens: [targetToken.object ?? targetToken], cause: `${poison.weaponName} hit` });
        return;
    }
    // (Without the ability module's save card: the GM rolls it.)
    await ChatMessage.create({
        speaker,
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${poison.item.name}</strong>: ${targetToken?.name ?? targetToken?.actor?.name ?? "the target"} is exposed (${saveText(poison.plan)}). Roll its save and apply the stage by hand.</p>`
    });
}

// Contact, inhaled and ingested poisons: a card to expose the creatures its presser targets.
const SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400 };

export async function postExposureCard({ message, plan, used, actor, token, later = false }) {
    // (A later action used again: open until the item's time is up, "for 1 hour after you imbibe".)
    const text = plainText(used.data.system?.description?.value);
    const repeat = later && repeatsLater(text);
    const time = repeat ? itemDuration(text) : null;
    const until = time ? game.time.worldTime + time.value * (SECONDS[time.unit] ?? 3600) : null;
    const state = createExposureCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), later, repeat, until, own: isOwnSave(plan, text), attacker: /\bcreature (?:that|who) touches you\b/i.test(text) ? "touch" : ATTACKER.test(text), attackChoices: plan.ownCheck?.choose ? attackChoices(actor, plan.ownCheck.choose, { atLeast: plan.ownCheck.atLeast ?? null }) : null });
    return ChatMessage.create({ content: exposureCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// A spellgun's attack modifiers its user has: its best spellcasting entry's spell attack, its best firearm Strike's.
const sign = (value) => (value >= 0 ? `+${value}` : `${value}`);
// (atLeast: the item's own modifier when its text says "or your own spell attack modifier, whichever is higher" — Urn of
// Ashes' +15: the higher of the two, the item's alone with no spell attack.)
function attackChoices(actor, kinds, { atLeast = null } = {}) {
    const best = (values) => Math.max(...values.map(Number).filter(Number.isFinite));
    const spell = best((actor?.spellcasting?.contents ?? []).map((entry) => entry?.statistic?.check?.mod));
    const firearm = best((actor?.system?.actions ?? []).filter((action) => (action?.item?.group ?? action?.item?.system?.group) === "firearm").map((action) => action.totalModifier));
    // (Its best ranged Strike, for an item that takes "a spell or ranged attack roll", Clockwork Helm.)
    const ranged = best((actor?.system?.actions ?? []).filter((action) => action?.item?.isRanged === true).map((action) => action.totalModifier));
    const choices = [
        ...(kinds.includes("spell") && Number.isFinite(spell) ? [{ kind: "spell", label: `Spell attack ${sign(spell)}`, modifier: spell }] : []),
        ...(kinds.includes("firearm") && Number.isFinite(firearm) ? [{ kind: "firearm", label: `Firearm attack ${sign(firearm)}`, modifier: firearm }] : []),
        ...(kinds.includes("ranged") && Number.isFinite(ranged) ? [{ kind: "ranged", label: `Ranged attack ${sign(ranged)}`, modifier: ranged }] : [])
    ];
    if (!Number.isFinite(atLeast)) return choices;
    const own = { kind: "spell", label: `The item's ${sign(atLeast)}`, modifier: atLeast };
    return choices.some((choice) => choice.modifier >= atLeast) ? choices : [own];
}

// targets: the token uuids the presser had targeted.
export async function applyExposureCard(message, { targets = [], damageChoice = null, attackChoice = null, checkChoice = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "expose" || state.status !== "open") return null;
    // (The check picked: Twisting Twine's Disarm or Trip.)
    if (Number.isInteger(checkChoice) && state.plan?.checkChoices?.[checkChoice]) state = { ...state, checkChoice };
    // (A spellgun's attack, as picked; with none its user has, the GM rolls it.)
    if (Number.isInteger(attackChoice) && state.attackChoices?.[attackChoice]) state = { ...state, attackChoice };
    if (state.plan?.ownCheck?.choose && !(state.attackChoices ?? []).length) throw new Error(`${state.user.name} has no ${state.plan.ownCheck.choose.includes("ranged") ? "spell attack or ranged Strike" : "spell attack or firearm Strike"}: roll ${state.item.name}'s attack by hand.`);
    // (The damage picked: Necklace of Fireballs' bead.)
    if (Number.isInteger(damageChoice) && state.plan?.damageChoices?.[damageChoice]) state = { ...state, damageChoice };
    // (Its time is up: the card closes.)
    if (state.repeat && Number.isFinite(state.until) && game.time.worldTime >= state.until) {
        const over = { ...state, status: "applied", results: [...state.results, `${state.item.name}'s time is up.`] };
        await message.update({ content: exposureCardHTML(over, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: over });
        throw new Error(`${state.item.name}'s time is up.`);
    }
    // (The drinker's own save: its user's own token — else its token on the scene being viewed.)
    const ownToken = state.own ? state.user.tokenUuid ?? (await fromUuid(state.user.actorUuid).catch(() => null))?.getActiveTokens?.(false, true)?.[0]?.uuid ?? game.scenes?.viewed?.tokens?.find?.((token) => token.actor?.uuid === state.user.actorUuid || token.actorId === state.user.actorUuid?.split(".").at(-1))?.uuid ?? null : null;
    const chosen = state.own ? [ownToken].filter(Boolean) : Array.isArray(targets) ? targets : [];
    const tokens = (await Promise.all(chosen.map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
    if (!tokens.length) throw new Error(state.own ? `${state.user.name} has no token here.` : "Target the creatures first.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    const sourceToken = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const names = tokens.map((token) => token.name ?? token.actor?.name).join(", ");
    const lines = [];
    if (postCard && actor) {
        await postCard({ plan: withAttackChoice(withDamageChoice(withCheckChoice(state.plan, state.checkChoice ?? 0), state.damageChoice ?? 0), state), item: { name: state.item.name, uuid: state.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens: tokens.map((token) => token.object ?? token), cause: state.delivery ? `${state.delivery} poison` : undefined });
        lines.push(state.delivery ? `${names}: exposed to ${state.item.name} (its save card follows).` : `${names}: ${state.item.name}'s ${["automatic", "skill"].includes(state.plan?.resolution?.check?.roll) ? "" : "save "}card follows.`);
    } else lines.push(state.delivery ? `${names}: exposed to ${state.item.name} (${saveText(state.plan)}; roll it and apply the stage by hand).` : `${names}: ${saveText(state.plan)} against ${state.item.name} (roll it and apply the result by hand).`);
    // (The conditions it lowers on each creature in its area: Vambrace of Gorum's Blood of Iron's clumsy, enfeebled, frightened and
    // stupefied by 1, beside its temporary Hit Points.)
    if (state.plan?.allyArea) for (const entry of (state.plan.item?.reduce ?? []).filter((one) => one.who === "targets" && one.slug)) {
        for (const token of tokens) {
            const line = await lowerCondition(token.actor, token.name ?? token.actor?.name, entry.slug, entry.by);
            if (!/: nothing to lower\.$/.test(line)) lines.push(line);
        }
    }
    const next = afterExposure(state, lines, game.time.worldTime);
    return message.update({ content: exposureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

