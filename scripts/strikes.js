// Live play for an item used by Striking (src/compiler/strikes.js, src/live/strike-card.js): Apply readies the user's next
// Strike this turn (an Effect marks it, until the end of the turn, with PF2e's rules for the extra dice or bonus it
// gives); that Strike's attack roll (PF2e's, on the active GM's client) then puts the riders for its degree on the target
// (scripts/foundry.js applyRiders) and posts the save the Strike calls for on a hit (the ability module's
// api.live.postCard); a miss spends it. With extra dice, a hit keeps the Effect for that Strike's damage roll, which
// spends it. A melee one waits for a melee Strike (PF2e's "item:melee" / "item:ranged" roll options), the item's own
// weapon for a Strike with it ("item:id:…").

import { MODULE_KEY, createStrikeCard, dieText, insteadDamagePlan, itemIdOf, riderFor, strikeCardHTML, strikeEffectSource, strikeHint, strikeWord } from "../src/live/strike-card.js";
import { saveText } from "../src/live/poison-card.js";
import { bombCardHTML, createBombCard } from "../src/live/bomb-card.js";
import { postActionCard } from "./item-actions.js";
import { USES, now } from "./activations.js";
import { withoutUse } from "../src/live/activations-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, creaturesNear, damageRollClass, entryOf, startInitiative, stateOf } from "./foundry.js";

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
    await actor.createEmbeddedDocuments("Item", [strikeEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID, weaponId, ammoId, ...(targets ? { uses: targets.length, targets } : {}) })]);
    const next = { ...state, status: "applied", results: [`${strikeHint(state.plan, state.user.name, { uses: targets ? targets.length : null })}${old.length ? " (The one readied before is gone.)" : ""}`] };
    return message.update({ content: strikeCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
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
        if (die && type) return strikeInstead({ message, context, actor, effect, rider: { ...rider, plan: { ...rider.plan, strike: { ...rider.plan.strike, instead: { hit: null, failure: { formula: `${rider.plan.strike.failDice}${die}`, type } } } } }, what });
        await useOne(actor, effect, rider);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${escape(rider.item.name)}</strong>: the Strike failed — ${rider.plan.strike.failDice} of the weapon's damage dice at its target (by hand).</p>` });
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
    if (!rider.plan.strike?.save && !rider.plan.strike?.cast && !(rider.plan.strike?.around ?? []).length && !(row?.effects ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement && !(row?.noteEffects ?? []).length) {
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
    const lines = await applyRiders({ plan: rider.plan, degree: context.outcome, user: rider.user, target, item: rider.item });
    // (A critical hit's harder save, Blister Ammunition's: its DC then.)
    const plain = rider.plan.strike?.save;
    const harder = plain && rider.plan.strike.criticalDC && context.outcome === "criticalSuccess" ? { ...plain, resolution: { ...plain.resolution, check: { ...plain.resolution.check, against: { ...plain.resolution.check.against, value: rider.plan.strike.criticalDC } } } } : plain;
    // (After a critical hit only its critical success escapes, Rhino Shot's: the failure's conditions on the success row too.)
    const worsened = harder && (rider.plan.strike.criticalWorse ?? []).length && context.outcome === "criticalSuccess" ? criticalWorse(harder, rider.plan.strike.criticalWorse) : harder;
    // (After a critical hit, a penalty to the save, Blindpepper Bolt's: the core's own save bonus.)
    const worse = worsened && rider.plan.strike.criticalSaveBonus && context.outcome === "criticalSuccess" ? { ...worsened, resolution: { ...worsened.resolution, check: { ...worsened.resolution.check, bonus: rider.plan.strike.criticalSaveBonus } } } : worsened;
    // (The save only for a creature its damage harms, Gravebane Ammunition's void healing: no card for another.)
    const fits = !rider.plan.strike?.saveOnly || voidHealed(targetToken.actor);
    if (worse && !fits) lines.push(`${target.name} hasn't void healing: no save.`);
    // (A square within the weapon's first range increment, Juxtaposition Ammunition's teleport: that weapon's, src/compiler/placed.js.)
    const weapon = worse?.placed?.nearSource === "weapon-range" ? message.item ?? (message.flags?.pf2e?.origin?.uuid ? await fromUuid(message.flags.pf2e.origin.uuid).catch(() => null) : null) : null;
    const ranged = worse?.placed?.nearSource === "weapon-range" ? { ...worse, placed: { ...worse.placed, nearSource: Number(weapon?.system?.range) || null } } : worse;
    const save = fits ? ranged : null;
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
            const result = await castFromItem({ actor, token: sourceToken ?? undefined, spell: cast.uuid, rank: cast.rank ?? undefined, dc: cast.dc ?? undefined, targets: [targetToken.object ?? targetToken], item: { name: rider.item.name, uuid: rider.item.uuid ?? null }, ...(cast.saveFirst ? { saveFirst: cast.saveFirst } : {}), ...(cast.attackFromHit ? { attackDegree: context.outcome } : {}) });
            lines.push(result?.resisted ? `${target.name} resists ${cast.name} (its ${cast.saveFirst?.statistic ?? ""} save)` : `${target.name}: ${cast.name} cast at it`);
        }
    }
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(rider.item.name)}</strong>: ${escape(lines.join("; ") || "the Strike hit")}.</p>` });
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
const addsToDamage = (plan) => Boolean((plan.strike?.damage ?? []).length || plan.strike?.alteration || plan.strike?.material || plan.strike?.runes?.striking || plan.strike?.splash);
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

// Whether vitality damage harms the creature: void healing, or the undead trait.
function voidHealed(actor) {
    const traits = new Set([...(actor?.traits ?? actor?.system?.traits?.value ?? [])]);
    return Boolean(actor?.attributes?.hp?.negativeHealing ?? actor?.system?.attributes?.hp?.negativeHealing) || traits.has("undead");
}
