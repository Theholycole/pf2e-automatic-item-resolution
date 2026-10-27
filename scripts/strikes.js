// Live play for an item used by Striking (src/compiler/strikes.js, src/live/strike-card.js): Apply readies the user's next
// Strike this turn (an Effect marks it, until the end of the turn, with PF2e's rules for the extra dice or bonus it
// gives); that Strike's attack roll (PF2e's, on the active GM's client) then puts the riders for its degree on the target
// (scripts/foundry.js applyRiders) and posts the save the Strike calls for on a hit (the ability module's
// api.live.postCard); a miss spends it. With extra dice, a hit keeps the Effect for that Strike's damage roll, which
// spends it. A melee one waits for a melee Strike (PF2e's "item:melee" / "item:ranged" roll options), the item's own
// weapon for a Strike with it ("item:id:…").

import { postEndEarlyAt } from "./end-early.js";
import { postCounteractAt } from "./counteract.js";
import { afterEndsEffectSource } from "../src/live/card.js";
import { MODULE_KEY, createStrikeCard, dieText, insteadDamagePlan, isMetalTarget, itemIdOf, riderFor, strikeCardHTML, strikeEffectSource, strikeHint, strikeWord } from "../src/live/strike-card.js";
import { saveText } from "../src/live/poison-card.js";
import { bombCardHTML, createBombCard } from "../src/live/bomb-card.js";
import { postActionCard } from "./item-actions.js";
import { USES, now } from "./activations.js";
import { withoutUse } from "../src/live/activations-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, creaturesNear, damageRollClass, entryOf, isActiveGM, startInitiative, stateOf } from "./foundry.js";
import { planFor, withoutAloftProne } from "../src/live/if-target.js";

const SPELL_ID = "pf2e-automatic-resolution";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The save with the failure's conditions of those slugs on its success row too (Rhino Shot's critical hit). Pure.
export function criticalWorse(save, slugs) {
    const outcomes = save.resolution.outcomes;
    const taken = (outcomes.failure?.effects ?? []).filter((effect) => slugs.includes(effect.slug));
    return { ...save, resolution: { ...save.resolution, outcomes: { ...outcomes, success: { ...outcomes.success, effects: [...(outcomes.success?.effects ?? []), ...taken] } } } };
}

export async function postStrikeCard({ message, plan, used, actor, token }) {
    const state = createStrikeCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: strikeCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// choices.targets: the presser's targets — a volley against each creature in an area readies one Strike at each (src/compiler/volley.js).
export async function applyStrikeCard(message, choices = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "strike" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const volley = state.plan.strike?.volley;
    const targets = volley?.each ? [...new Set(choices.targets ?? [])] : null;
    if (targets && !targets.length) throw new Error(`Target each ${volley.each} ${volley.area ? `in the ${volley.area}` : "in the area"} first, then ready the Strikes.`);
    // (One readied Strike at a time: a new one replaces the old.)
    const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
    const weaponId = state.plan.strike?.own ? itemIdOf(state.item.uuid) : null;
    const ammoId = state.plan.strike?.ammo ? itemIdOf(state.item.uuid) : null;
    // (A bonus only against metal, Lodestone Pellet's: whether the creature targeted now is made of metal or wears metal armor.)
    let ready = state;
    if (state.plan.strike?.attack?.against === "metal") {
        const aimed = choices.targets?.length ? await Promise.all(choices.targets.map((uuid) => fromUuid(uuid).catch(() => null))) : [...(game.user.targets ?? [])].map((token) => token.document ?? token);
        const actors = aimed.map((token) => token?.actor ?? null).filter(Boolean);
        ready = { ...state, plan: { ...state.plan, strike: { ...state.plan.strike, attack: { ...state.plan.strike.attack, metalTarget: actors.length ? actors.every(isMetalTarget) : null } } } };
    }
    await actor.createEmbeddedDocuments("Item", [strikeEffectSource({ state: ready, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID, weaponId, ammoId, ...(targets ? { uses: targets.length, targets } : {}) })]);
    const next = { ...ready, status: "applied", results: [`${strikeHint(ready.plan, state.user.name, { uses: targets ? targets.length : null })}${old.length ? " (The one readied before is gone.)" : ""}`] };
    return message.update({ content: strikeCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// (A readied Strike never made, Flashblade's Prepare Flash: its Effect gone with its time, the activation's use given back — on the active GM's
// client.)
export function setUpReadiedRefund() {
    Hooks.on("deleteItem", (item) => {
        const rider = item?.type === "effect" ? item.flags?.[MODULE_ID]?.[MODULE_KEY] : null;
        if (!rider?.plan?.strike?.readied || rider.made || !item.actor || !isActiveGM()) return;
        refundUse(rider, item.actor).then((refunded) => refunded && ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: item.actor }), content: `<p><strong>${escape(rider.item?.name ?? "The item")}</strong>: its readied Strike wasn't made, so the activation's use is given back.</p>` })).catch((error) => console.error(`${MODULE_ID} | readied refund`, error));
    });
}

// The activation's use given back on its item's record (scripts/activations.js): true when there was one.
async function refundUse(rider, actor) {
    const item = rider.item?.uuid ? await fromUuid(rider.item.uuid).catch(() => null) : null;
    const index = rider.plan.item?.activation?.index;
    const frequency = rider.plan.trigger?.frequency ?? rider.plan.item?.activation?.frequency ?? null;
    if (!item || index === undefined || index === null || !frequency?.max) return false;
    const record = item.getFlag(MODULE_ID, USES) ?? {};
    const next = withoutUse(record, index, frequency, now(actor));
    if (next === record || JSON.stringify(next) === JSON.stringify(record)) return false;
    await item.setFlag(MODULE_ID, USES, next);
    return true;
}

// The second Strike's damage, at the outcome of the one roll: PF2e's Strike of that weapon, its damage (or critical) roll and message.
export async function secondStrikeDamage(actor, message, outcome, rider) {
    const weaponId = rider.weaponId ?? message.item?.id ?? null;
    const strike = (actor?.system?.actions ?? []).find((action) => action?.type === "strike" && (weaponId ? action.item?.id === weaponId : true) && typeof action.damage === "function");
    if (!strike) {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(rider.item.name)}</strong>: roll the second Strike's damage by hand (no Strike of it on ${escape(actor?.name)}).</p>` });
        return null;
    }
    // (No damage dialog: PF2e reads it from the event, Shift flipping the user's setting.)
    const event = { shiftKey: Boolean(game.user?.settings?.showDamageDialogs), ctrlKey: false, metaKey: false };
    return outcome === "criticalSuccess" ? strike.critical({ event }) : strike.damage({ event });
}

// One Strike of the readied ones used: the Effect gone with the last, else one fewer left.
async function useOne(actor, effect, rider) {
    const left = (Number(rider.uses) || 1) - 1;
    // (A readied one made: marked so, so that its going isn't taken for its time running out — setUpReadiedRefund.)
    if (left <= 0 && rider.plan?.strike?.readied) await effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.made`]: true });
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
    // (Several at once, src/compiler/volley.js: each at a creature it hasn't struck — against each creature in an area, one of those targeted
    // when it was readied; a Strike at another isn't one of them. Each one made deals its user that damage, Caress of the Great Serpent's.)
    const volley = rider.plan.strike?.volley;
    if (volley) {
        const at = context.target?.token ?? message.flags?.pf2e?.target?.token ?? null;
        const struck = rider.struck ?? [];
        const outside = Boolean(at) && (rider.targets ?? []).length > 0 && !rider.targets.includes(at);
        const again = Boolean(at) && struck.includes(at) && Boolean(volley.different || volley.each);
        if (outside || again) {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(rider.item.name)}</strong>: ${again ? "that creature was already struck by it" : "that creature isn't one of those targeted for it"}, so this Strike isn't one of them (nothing spent).</p>` });
            return;
        }
        if (at) await effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.struck`]: [...struck, at] });
        if (volley.selfDamage) await volleyDamage(actor, rider, volley.selfDamage);
        // (Two Strikes on one roll, Coldstar Pistols': on a hit, the second Strike's damage rolled too — PF2e's own damage roll for that weapon.)
        if (volley.twin && what === "hit") await secondStrikeDamage(actor, message, context.outcome, rider);
    }
    // (Only a living creature carries it, Ghoul Stiletto's "the next living target struck", src/compiler/hit-auras.js: a hit at an undead or a
    // construct, PF2e's mode of being, isn't the one — nothing spent.)
    if (rider.plan.strike?.livingOnly && what === "hit") {
        const at = context.target?.token ?? message.flags?.pf2e?.target?.token ?? null;
        const struck = at ? await fromUuid(at).catch(() => null) : null;
        const mode = struck?.actor?.modeOfBeing;
        if (mode && mode !== "living") {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(struck.name ?? struck.actor.name)} isn't living (${escape(mode)}), so it doesn't take; the next living creature hit does (nothing spent).</p>` });
            return;
        }
    }
    // (Splash for this Strike, the splash trait's — Jistkan War Crossbow's, Drake Rifle's: the creatures within 5 feet of the target take it
    // on a hit, PF2e's damage roll giving the target its own, and the target too on a failure — the bomb card's splash list, ticked, its
    // Apply that splash damage.)
    if (rider.plan.strike?.splash && ["criticalSuccess", "success", "failure"].includes(context.outcome)) await postStrikeSplash({ message, context, rider });
    if (rider.plan.strike?.instead) return strikeInstead({ message, context, actor, effect, rider, what });
    // (A failure that deals the weapon's own dice, Brutal Finish's: that many of the Strike's weapon's dice, of its type, as damage in place.)
    // (Half its extra damage on a failure, Energizing Lattice's: the ability module's card at half.)
    if (what === "failure" && rider.plan.strike?.failHalf) return strikeInstead({ message, context, actor, effect, rider: { ...rider, plan: { ...rider.plan, strike: { ...rider.plan.strike, instead: { hit: null, failure: { ...rider.plan.strike.failHalf, multiplier: 0.5 } } } } }, what });
    if (what === "failure" && rider.plan.strike?.failDice) {
        const weapon = message.item ?? (message.flags?.pf2e?.origin?.uuid ? await fromUuid(message.flags.pf2e.origin.uuid).catch(() => null) : null);
        const die = weapon?.system?.damage?.die;
        const type = weapon?.system?.damage?.damageType;
        // (And a feat's own die, Iron Cudgel's with Brutal Finish: when its user has that feat.)
        const featDie = rider.plan.strike.featDie;
        const count = rider.plan.strike.failDice + (featDie && actor?.rollOptions?.all?.[`feat:${featDie.slug}`] ? featDie.diceNumber : 0);
        if (die && type) return strikeInstead({ message, context, actor, effect, rider: { ...rider, plan: { ...rider.plan, strike: { ...rider.plan.strike, instead: { hit: null, failure: { formula: `${count}${die}`, type } } } } }, what });
        await useOne(actor, effect, rider);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike failed — ${count} of the weapon's damage dice at its target (by hand).</p>` });
        return;
    }
    // (Weapon Shot's striking rune counts: the damage roll's dice are its; so does flat splash damage, Jistkan War Crossbow's, and
    // a precious material, Quicksilver Cloak's silver.)
    const rolled = addsToDamage(rider.plan);
    // (A hit whose damage roll the Effect adds to: kept for it.)
    if (what === "hit" && rolled) await effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.awaiting`]: true });
    else await useOne(actor, effect, rider);
    const speaker = ChatMessage.getSpeaker({ actor });
    if (what === "spend") {
        // (Hydra Head Club's: a miss gives the activation's use back on the item's record.)
        const refunded = rider.plan.strike?.missRefund ? await refundUse(rider, actor) : false;
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike missed; it's spent.${refunded ? " The activation doesn't count against its frequency: its use is given back." : ""}</p>` });
        return;
    }
    // (A maneuver after the hit, Iron Cube's Trip: its own card, PF2e's action at the creature the Strike hit — still targeted.)
    const follow = rider.plan.strike?.follow;
    if (follow) {
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        await postActionCard({ message: null, plan: follow, used: { data: { name: rider.item.name, uuid: rider.item.uuid ?? null } }, actor, token: sourceToken?.object ?? sourceToken });
    }
    // (Nothing for the target on this degree: the hit, and what its damage roll adds.)
    const row = rider.plan.resolution?.outcomes?.[context.outcome];
    // (A note for the creature hit counts: Magekiller Bullet's curse.)
    if (!rider.plan.strike?.save && !rider.plan.strike?.cast && !rider.plan.strike?.counteract && !(rider.plan.strike?.around ?? []).length && !(row?.effects ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement && !(row?.noteEffects ?? []).length) {
        const adds = (rider.plan.strike?.damage ?? []).map((entry) => `+${dieText(entry)}`).join(", ");
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike hit${adds ? `; its damage roll adds ${escape(adds)}` : ""}${follow ? `; its ${escape(follow.action?.name ?? "maneuver")} card follows` : ""}.</p>` });
        return;
    }
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    if (!targetToken?.actor) {
        await ChatMessage.create({ speaker, whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike hit, but had no target; apply its riders by hand.</p>` });
        return;
    }
    const target = entryOf(targetToken.object ?? targetToken, targetToken.actor);
    // (Its Prone only for a creature on the ground, Drake Shot's: src/live/if-target.js.)
    const elevation = Number(targetToken.document?.elevation ?? targetToken.elevation) || 0;
    const lines = await applyRiders({ plan: withoutAloftProne(rider.plan, elevation), degree: context.outcome, user: rider.user, target, item: rider.item });
    // (Pulled out of the creature it hit, Beacon Shot's Athletics check: the end-early card, scripts/end-early.js.)
    if (rider.plan.strike?.endEarly && ["success", "criticalSuccess"].includes(context.outcome)) await postEndEarlyAt({ endEarly: rider.plan.strike.endEarly, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, user: rider.user, creatures: [{ actorUuid: targetToken.actor.uuid, tokenUuid: targetToken.uuid, name: target.name }] }).catch((error) => console.error(`${MODULE_ID} | end early`, error));
    if (rider.plan.strike?.groundedProne && elevation > 0) lines.push(`${target.name} isn't on the ground: it doesn't fall Prone`);
    // (A critical hit's harder save, Blister Ammunition's: its DC then.)
    const plain = rider.plan.strike?.save;
    const harder = plain && rider.plan.strike.criticalDC && context.outcome === "criticalSuccess" ? { ...plain, resolution: { ...plain.resolution, check: { ...plain.resolution.check, against: { ...plain.resolution.check.against, value: rider.plan.strike.criticalDC } } } } : plain;
    // (Shot from a weapon with that property rune, Storm Arrow's shock: its DC then.)
    const runeDC = harder ? rider.plan.strike.runeDC : null;
    const bow = runeDC ? message.item ?? (message.flags?.pf2e?.origin?.uuid ? await fromUuid(message.flags.pf2e.origin.uuid).catch(() => null) : null) : null;
    const runed = runeDC && (bow?.system?.runes?.property ?? []).includes(runeDC.rune) ? { ...harder, resolution: { ...harder.resolution, check: { ...harder.resolution.check, against: { ...harder.resolution.check.against, value: runeDC.dc } } } } : harder;
    // (After a critical hit only its critical success escapes, Rhino Shot's: the failure's conditions on the success row too.)
    const worsened = runed && (rider.plan.strike.criticalWorse ?? []).length && context.outcome === "criticalSuccess" ? criticalWorse(runed, rider.plan.strike.criticalWorse) : runed;
    // (After a critical hit, a penalty to the save, Blindpepper Bolt's: the core's own save bonus.)
    const worse = worsened && rider.plan.strike.criticalSaveBonus && context.outcome === "criticalSuccess" ? { ...worsened, resolution: { ...worsened.resolution, check: { ...worsened.resolution.check, bonus: rider.plan.strike.criticalSaveBonus } } } : worsened;
    // (Its conditions longer after a critical hit, Rattling Bolt's 1 minute: each of the save's rows' times then, src/compiler/strikes.js.)
    const longer = worse && rider.plan.strike.criticalTime && context.outcome === "criticalSuccess" ? criticalTimed(worse, rider.plan.strike.criticalTime) : worse;
    // (Pulled free at a harder DC after a critical hit, Antler Arrow's: its end-early card's tick set, the archer's specialization the card's to untick.)
    const timed = longer?.endEarly?.how?.criticalDC && context.outcome === "criticalSuccess" ? { ...longer, endEarly: { ...longer.endEarly, critical: true } } : longer;
    // (The save only for a creature its damage harms, Gravebane Ammunition's void healing: no card for another.)
    const fits = !rider.plan.strike?.saveOnly || voidHealed(targetToken.actor);
    if (timed && !fits) lines.push(`${target.name} hasn't void healing: no save.`);
    // (A square within the weapon's first range increment, Juxtaposition Ammunition's teleport: that weapon's, src/compiler/placed.js.)
    const weapon = timed?.placed?.nearSource === "weapon-range" ? message.item ?? (message.flags?.pf2e?.origin?.uuid ? await fromUuid(message.flags.pf2e.origin.uuid).catch(() => null) : null) : null;
    const ranged = timed?.placed?.nearSource === "weapon-range" ? { ...timed, placed: { ...timed.placed, nearSource: Number(weapon?.system?.range) || null } } : timed;
    // (A rider only for some creatures, Rattling Bolt's undead's lifesense: the target's own plan, src/live/if-target.js.)
    const save = fits && ranged ? planFor(ranged, targetToken.actor) : null;
    // (No damage on the hit, Juxtaposition Ammunition's "it doesn't deal the Strike's normal damage": said, for its damage roll.)
    if (rider.plan.strike?.noDamage) lines.unshift(`${target.name} takes none of the Strike's damage (don't roll it)`);
    if (save) {
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        if (postCard) {
            await postCard({ plan: save, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens: [targetToken.object ?? targetToken], cause: `${rider.item.name} hit` });
            lines.push(`${target.name}: its save card follows.`);
        } else lines.push(`${target.name}: ${saveText(save)} (roll it by hand).`);
    }
    // (Saves for the creatures around the one hit, src/compiler/hit-around.js — Dispersing Bullet's push, Singularity Ammunition's pull and
    // blast: each save card at the creatures within that distance of it, and it too when the text says.)
    for (const entry of rider.plan.strike?.around ?? []) {
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const near = creaturesNear(targetToken, entry.radius).map((other) => canvas.tokens.placeables.find((placeable) => placeable.document.uuid === other.tokenUuid)).filter(Boolean);
        const tokens = [...(entry.includeTarget ? [targetToken.object ?? targetToken] : []), ...near];
        if (!tokens.length) {
            lines.push(`no creature within ${entry.radius} feet of ${target.name}`);
            continue;
        }
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        if (postCard) {
            // (Pushed from or pulled toward the creature hit, not its attacker: the ability module's moveFrom, ability 0.9.2.)
            await postCard({ plan: entry.plan, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens, cause: `${rider.item.name} hit ${target.name}`, ...(entry.moveFrom === "target" ? { moveFrom: targetToken.document?.uuid ?? targetToken.uuid } : {}) });
            lines.push(`${saveText(entry.plan)} for ${tokens.length} creature${tokens.length === 1 ? "" : "s"} within ${entry.radius} feet of ${target.name}`);
        } else lines.push(`${saveText(entry.plan)} for the creatures within ${entry.radius} feet of ${target.name} (roll it by hand)`);
    }
    // (An aura on the creature hit, src/compiler/hit-auras.js — Ghoul Stiletto's stench: the ability module's zone on its token.)
    const zone = rider.plan.strike?.zone;
    if (zone) {
        const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
        if (startZone) {
            await startZone({ item: { name: rider.item.name, uuid: rider.item.uuid ?? null, actor }, plan: { builtin: "zone", source: rider.plan.source, zone }, sourceToken: targetToken });
            lines.push(`${target.name}: its ${zone.area.value}-foot aura is on its token`);
        } else lines.push(`${target.name}: mark its ${zone.area.value}-foot aura by hand`);
    }
    // (A spell cast at the creature hit: the spell module's, its own save at the item's DC — Stone Bullet's Petrify.)
    const cast = rider.plan.strike?.cast;
    if (cast) {
        const castFromItem = game.modules.get(SPELL_ID)?.api?.castFromItem;
        const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
        // (Its save of its own first, its hit for the spell's attack: castFromItem's saveFirst and attackDegree, spell module 2026-10-16.)
        const options = game.modules.get(SPELL_ID)?.api?.castFromItemOptions ?? [];
        const needs = [cast.saveFirst ? "saveFirst" : null, cast.attackFromHit ? "attackDegree" : null].filter(Boolean);
        const byHand = `${target.name}: cast ${cast.name}${cast.rank ? ` at rank ${cast.rank}` : ""}${cast.dc ? `, DC ${cast.dc}` : ""}${cast.saveFirst ? ` if it fails a DC ${cast.saveFirst.dc} ${cast.saveFirst.statistic} save` : ""}${cast.attackFromHit ? ", the hit for its attack roll" : ""} by hand`;
        if (!castFromItem) lines.push(`${byHand} (PF2e Automatic Spell Resolution isn't active)`);
        else if (needs.some((need) => !options.includes(need))) lines.push(`${byHand} (this version of the spell module can't yet)`);
        else {
            // (Its save worse after a critical hit, Silencing Ammunition's -2 circumstance: an Effect on the creature for that save, gone after.)
            const penalty = cast.saveFirst?.criticalPenalty && context.outcome === "criticalSuccess" && targetToken.actor ? (await targetToken.actor.createEmbeddedDocuments("Item", [{ name: `${rider.item.name}: ${cast.saveFirst.criticalPenalty.value} to this save`, type: "effect", img: "icons/svg/downgrade.svg", system: { rules: [{ key: "FlatModifier", selector: cast.saveFirst.statistic, type: cast.saveFirst.criticalPenalty.type, value: cast.saveFirst.criticalPenalty.value, label: rider.item.name }], duration: { value: 1, unit: "rounds", expiry: "turn-start", sustained: false } }, flags: { [MODULE_ID]: { criticalSavePenalty: true } } }]).catch(() => []))[0] : null;
            // (Around the creature hit too, Blade of Fallen Stars' Faerie Fire in a 5-foot emanation: every creature within those feet of it.)
            const around = cast.around ? (await Promise.all(creaturesNear(targetToken, cast.around).map((entry) => fromUuid(entry.tokenUuid).catch(() => null)))).filter(Boolean).map((token) => token.object ?? token) : [];
            const result = await castFromItem({ actor, token: sourceToken ?? undefined, spell: cast.uuid, rank: cast.rank ?? undefined, dc: cast.dc ?? undefined, targets: [targetToken.object ?? targetToken, ...around], item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, ...(cast.saveFirst ? { saveFirst: cast.saveFirst } : {}), ...(cast.attackFromHit ? { attackDegree: context.outcome } : {}) });
            if (penalty) await penalty.delete().catch(() => null);
            lines.push(result?.resisted ? `${target.name} resists ${cast.name} (its ${cast.saveFirst?.statistic ?? ""} save${penalty ? `, ${cast.saveFirst.criticalPenalty.value} after the critical hit` : ""})` : `${target.name}: ${cast.name} cast at it${penalty ? ` (its save ${cast.saveFirst.criticalPenalty.value} after the critical hit)` : ""}`);
            // (Ended early by its creature, Silencing Ammunition's tug: the end-early card, scripts/end-early.js.)
            if (!result?.resisted && cast.endEarly) await postEndEarlyAt({ endEarly: cast.endEarly, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, user: { actorUuid: actor.uuid, tokenUuid: sourceToken?.uuid ?? null, name: actor.name }, creatures: [{ actorUuid: targetToken.actor.uuid, tokenUuid: targetToken.uuid, name: target.name }] }).catch((error) => console.error(`${MODULE_ID} | end early`, error));
        }
    }
    // (A counteract check at the hit, Awakened Silver and Cold Iron Shots': the counteract card, or the condition the creature hit gets instead —
    // src/compiler/strike-counteract.js.)
    const hitCounteract = rider.plan.strike?.counteract;
    if (hitCounteract) lines.push(await counteractOnHit(hitCounteract, { rider, actor, targetToken, message }));
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(lines.join("; ") || "the Strike hit")}.</p>` });
}

// An Effect's traits, its spell's too (a battle form's polymorph).
const traitsOf = (effect) => {
    const origin = effect.system?.context?.origin?.item ? fromUuidSync?.(effect.system.context.origin.item) : null;
    return [...(effect.system?.traits?.value ?? []), ...(origin?.system?.traits?.value ?? [])];
};

// { counteract, fallback } and the hit → the hit's line. The fallback first: the creature hit, of its traits, with nothing for the card to
// counteract — no polymorph Effect on it (silver), no Effect of its on another creature on the scene (cold iron) — gets its condition instead.
async function counteractOnHit({ counteract, fallback = null }, { rider, actor, targetToken, message }) {
    const struck = targetToken.actor;
    const traits = [...(struck.traits ?? new Set(struck.system?.traits?.value ?? []))];
    const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
    const item = { name: rider.item.name, uuid: rider.item.uuid ?? null };
    const user = { actorUuid: actor.uuid, tokenUuid: sourceToken?.uuid ?? null, name: actor.name };
    const kind = fallback ? fallback.traits.find((trait) => traits.includes(trait)) : null;
    if (kind) {
        const others = () => (canvas.scene?.tokens ?? []).some((token) => token.actor && token.actor.uuid !== struck.uuid && (token.actor.itemTypes?.effect ?? []).some((effect) => effect.system?.context?.origin?.actor === struck.uuid));
        const has = fallback.unless === "polymorph-on-it" ? (struck.itemTypes?.effect ?? []).some((effect) => traitsOf(effect).includes("polymorph")) : others();
        if (!has) {
            await struck.createEmbeddedDocuments("Item", [afterEndsEffectSource({ slug: fallback.slug, value: fallback.value, duration: fallback.duration }, { item, user, worldTime: game.time.worldTime, initiative: startInitiative(struck), moduleId: MODULE_ID })]);
            return `${struck.name} is ${fallback.slug} ${fallback.value} for ${fallback.duration.value} ${fallback.duration.value === 1 ? fallback.duration.unit.replace(/s$/, "") : fallback.duration.unit} instead (a ${kind} ${fallback.unless === "polymorph-on-it" ? "with no polymorph effect on it" : "with no effect on another creature"})`;
        }
    }
    const drinkers = counteract.at === "target" ? [entryOf(targetToken.object ?? targetToken, struck)] : creaturesNear(targetToken, 500).filter((entry) => entry.actorUuid !== struck.uuid);
    if (!drinkers.length) return `${struck.name}: no creature to counteract on (by hand)`;
    await postCounteractAt({ counteract: { ...counteract, struckTraits: traits, ...(counteract.origin === "target" ? { originActorUuid: struck.uuid } : {}) }, item, user, drinkers });
    return `${struck.name}: its counteract card follows`;
}

// A volley's damage to its user for a Strike made (Caress of the Great Serpent's 1d6 piercing): rolled and taken.
async function volleyDamage(actor, rider, damage) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const DamageRoll = damageRollClass();
    if (!DamageRoll) {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(actor.name)} takes ${escape(damage.formula)} ${escape(damage.type)} damage for that Strike (by hand).</p>` });
        return;
    }
    const roll = await new DamageRoll(`(${damage.formula})[${damage.type}]`).evaluate();
    await actor.applyDamage({ damage: roll, token: actor.getActiveTokens?.(true, true)?.[0] ?? undefined });
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(actor.name)} takes ${roll.total} ${escape(damage.type)} damage for that Strike.</p>` });
}

// Damage in place of the weapon's (Big Rock Bullet's): spent by the attack roll, which posts that degree's damage at the target on
// the ability module's card.
async function strikeInstead({ message, context, actor, effect, rider, what }) {
    await useOne(actor, effect, rider);
    const speaker = ChatMessage.getSpeaker({ actor });
    const plan = what === "spend" ? null : insteadDamagePlan(rider.plan, context.outcome);
    if (!plan) {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike critically missed; it's spent.</p>` });
        return;
    }
    const entry = context.outcome === "failure" ? rider.plan.strike.instead.failure : rider.plan.strike.instead.hit;
    const amount = `${entry.multiplier === 0.5 ? "half of " : ""}${entry.formula} ${entry.type}${context.outcome === "criticalSuccess" ? ", doubled" : ""}`;
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    if (!targetToken?.actor || !postCard) {
        await ChatMessage.create({ speaker, whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(amount)} damage in place of the weapon's${targetToken?.actor ? "" : ", but the Strike had no target"}; roll it by hand.</p>` });
        return;
    }
    const sourceToken = message.token ?? (rider.user.tokenUuid ? await fromUuid(rider.user.tokenUuid).catch(() => null) : null);
    await postCard({ plan, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, sourceActor: actor, sourceToken, tokens: [targetToken.object ?? targetToken], cause: `${rider.item.name} ${context.outcome === "failure" ? "missed" : "hit"}` });
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(targetToken.name ?? targetToken.actor.name)} takes ${escape(amount)} damage in place of the weapon's; its card follows.</p>` });
}

// PF2e's damage roll of a Strike by a creature whose readied Strike carries extra dice: that Strike's damage is rolled, so
// it's spent (with its Effect's rules in the roll). The item's own weapon must be the one rolled.
const addsToDamage = (plan) => Boolean((plan.strike?.damage ?? []).length || plan.strike?.alteration || plan.strike?.withoutRune || plan.strike?.material || plan.strike?.runes?.striking || plan.strike?.splash);
async function damageWithRider(message) {
    const context = message.flags.pf2e.context;
    if (context.sourceType !== "attack") return;
    const actor = message.actor;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.[MODULE_KEY]);
    if (!effect) return;
    const rider = effect.flags[MODULE_ID][MODULE_KEY];
    if (!addsToDamage(rider.plan)) return;
    const options = context.options ?? [];
    if (rider.weaponId && !options.includes(`item:id:${rider.weaponId}`)) return;
    if (rider.plan.strike?.unarmed && !options.includes("item:category:unarmed")) return;
    await useOne(actor, effect, rider);
}

// The bomb card for a Strike's splash: the creatures within 5 feet of its target (and the target, on a failure), the splash its Apply deals.
async function postStrikeSplash({ message, context, rider }) {
    const targetUuid = context.target?.token ?? message.flags?.pf2e?.target?.token ?? null;
    const targetToken = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    if (!targetToken?.actor) return;
    const near = creaturesNear(targetToken, 5);
    if (!near.length && context.outcome !== "failure") return;
    const splash = rider.plan.strike.splash;
    const state = createBombCard({ plan: { source: rider.plan.source ?? null }, item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, user: rider.user, target: entryOf(targetToken.object ?? targetToken, targetToken.actor), outcome: context.outcome, splash: [{ type: splash.damageType, total: splash.value }], near });
    await ChatMessage.create({ content: bombCardHTML(state, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor: message.actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// The save's rows with each condition and note Effect lasting the critical hit's time.
function criticalTimed(plan, time) {
    const lasting = { mode: "fixed", value: time.value, unit: time.unit, expiry: "turn-start", anchor: "effect-start" };
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row ? { ...row, effects: (row.effects ?? []).map((effect) => (effect?.duration?.mode === "fixed" ? { ...effect, duration: lasting } : effect)) } : row]));
    const ifTarget = (plan.ifTarget ?? []).map((entry) => (entry.noteEffects ? { ...entry, noteEffects: entry.noteEffects.map((note) => (note.duration?.mode === "fixed" ? { ...note, duration: lasting } : note)) } : entry));
    return { ...plan, resolution: { ...plan.resolution, outcomes }, ...(plan.ifTarget ? { ifTarget } : {}) };
}

// Whether vitality damage harms the creature: void healing, or the undead trait.
function voidHealed(actor) {
    const traits = new Set([...(actor?.traits ?? actor?.system?.traits?.value ?? [])]);
    return Boolean(actor?.attributes?.hp?.negativeHealing ?? actor?.system?.attributes?.hp?.negativeHealing) || traits.has("undead");
}
