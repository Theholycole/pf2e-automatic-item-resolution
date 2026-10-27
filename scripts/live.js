// Live play: a confirmation card after PF2e's own Use of a consumable
// (docs/design.md, the user's answers of 2026-10-15), and after a bomb's damage
// roll (scripts/bombs.js).
//
// - PF2e's Use posts its message (and rolls the item's healing): on the active
//   GM's client, the item's card follows it. Nothing changes until Apply.
// - The card names the drinker: the user, or a creature next to them to feed it to.
// - Apply: the item's owner or the GM. A player's press goes to the active GM's
//   client by socket, which makes the changes (an ally the player doesn't own too).
// - Healing uses PF2e's own roll, and PF2e's apply buttons are taken off that
//   message so it can't be healed twice. Dying ends through the core's api.dying.
// - PF2e Effects are made here (their grade, rank and time are the item's); every
//   other change goes through the ability module's api.live.applyChange.

import { applyEndEarlyCard } from "./end-early.js";
import { applyDropCard } from "./drop-held.js";
import { armedMarkSource } from "../src/live/card.js";
import { abilityState, installedEffectSource, installedText, picksWeapon, proficiencyEffectSource, proficiencyText, applicationFor, cardHTML, chosenResistances, createItemCard, createdItemSource, DRINKER_ID, effectSource, recipientOf, recoveryText, resistanceEffectSource, resistanceText, rolledHealing, runeEffectSource, runeText, senseEffectSource, lightEffectSource, lightText, levelTempText, untilRageEffectSource, untilRageText, senseText, speedEffectSource, speedText, rollFormula, USER_ID, weaponEffectSource, weaponText, attackEffectSource, attackText, fastHealingEffectSource, fastHealingText, markEffectSource, markText, modifierText, shieldFormEffectSource, shieldFormText, strikeDamageEffectSource, strikeDamageText, skillPickEffectSource, firstDegreeEffectSource, firstDegreeText, suppressEffectSource, suppressText, ruleEffectSource, temperatureEffectSource, fallEffectSource, fallLine, weatherEffectSource, weatherLine, temperatureLine } from "../src/live/card.js";
import { createExposureCard, exposureCardHTML } from "../src/live/poison-card.js";
import { ABILITY_ID, afflictionSaves, afflictionsOf, CORE_ID, creatureOf, creaturesNear, damageRollClass, entryOf, FLAG, healCreature as heal, isActiveGM, lowerCondition, mayApply, MODULE_ID, ownerDCsOf, ownerOf, presserUuid, recover, removeAfflictions, SOCKET, startInitiative, stateOf } from "./foundry.js";
import { fillOwnerDCs, hasOwnerDC } from "../src/compiler/item-data.js";
import { applyBombCard, cardForBomb, cloudOnMiss, hideCoveredSplash, rememberDeletedBomb } from "./bombs.js";
import { applyExposureCard, applyPoisonCard, postExposureCard, postPoisonCard, strikeWithPoison } from "./poisons.js";
import { applyCastCard, postCastCard } from "./casts.js";
import { needsTargets } from "../src/live/cast-card.js";
import { startItemConjure, startItemZone } from "./zones.js";
import { scaledByCondition, withConditionDC } from "../src/live/scaled.js";
import { applyFocusCard, loseUnspentFocus, postFocusCard } from "./focus.js";
import { againstRolled, applyFortuneCard, fortuneRolled, postFortuneCard } from "./fortune.js";
import { firstDegreeRolled } from "./first-degree.js";
import { attackRidersEffectSource, attackRidersRolled, weaponDamageDealt } from "./attack-riders.js";
import { withUserDCs } from "./item-dcs.js";
import { attackRidersText } from "../src/compiler/attack-riders.js";
import { lightAuraZone } from "../src/compiler/light-aura.js";
import { applyWaysCard, postWaysCard } from "./ways.js";
import { applyTeleportCard, pickTeleportSpace, postTeleportCard } from "./teleport.js";
import { forAbility } from "./placed-moves.js";
import { applyObjectsCard, postObjectsCard } from "./objects.js";
import { applyDisbeliefCard, postDisbeliefCard } from "./disbelief.js";
import { applyTakeCard, postTakeCard } from "./take.js";
import { checkSpend, payRegain, paySpend } from "./spend.js";
import { placeLight } from "./placed-light.js";
import { readProficiencyRequirement, requirementWarning } from "../src/compiler/requirement.js";
import { gateMet } from "../src/compiler/strike-gate.js";
import { applyTableCard, postTableCard } from "./table.js";
import { applyStrikeCard, postStrikeCard, strikeWithRider } from "./strikes.js";
import { applyRerollCard, postRerollCard } from "./rerolls.js";
import { applyActionCard, postActionCard } from "./item-actions.js";
import { applyCounteractCard, postCounteractCard } from "./counteract.js";
import { applyToggleCard, postToggleCard, togglesAfterDamage, togglesAtTurnEnd, togglesOnMove } from "./toggle.js";
import { USES, activate, indexOf, setUpActivations } from "./activations.js";
import { withImmunityGuard } from "./immunity.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";
import { appliedAnyway, verifyEffectRules } from "../src/compiler/verify-effect.js";
import { isUnloadedSpellgun, restoreUnloaded } from "./generic-items.js";
import { strikeWithRunes } from "./rune-strikes.js";
import { chargeSpellstrike, strikeWithSpellstrike } from "./spellstrike.js";
import { toggleOff, toggleOn } from "./toggle-off.js";
import { endOnStrike } from "./ends-on-strike.js";
import { plateShield } from "./shield-temp.js";
import { endSpeedPenalties, granterOf, sparedBy } from "./speed-penalties.js";
import { degreeOf } from "../src/compiler/consumables.js";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

let compile = null;
// The last dose's item, kept as PF2e deletes it (its Use message can arrive after): uuid → { data, actor }.
const deleted = new Map();

export function setUpLivePlay({ compileItem, compileActivations = null, claims = null, runeRiders = null }) {
    compile = compileItem;
    setUpActivations({ compileActivations, postCardFor });
    // (An item no longer invested: what lasted only while it was, Obsidian Goggles' darkvision, ends.)
    Hooks.on("updateItem", (item, changes) => {
        if (!isActiveGM() || changes?.system?.equipped?.invested !== false || !item.actor) return;
        const ids = (item.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.untilUninvested === item.id).map((effect) => effect.id);
        if (ids.length) item.actor.deleteEmbeddedDocuments("Item", ids).catch((error) => console.error(`${MODULE_ID} | uninvested`, error));
    });
    Hooks.on("deleteItem", (item) => {
        rememberDeletedBomb(item);
        // (A Rage ends: what the item gave until then goes with it — Barbarians+ crowns' quickened.)
        if (isActiveGM() && item?.type === "effect" && (item.slug === "effect-rage" || item.name === "Effect: Rage") && item.actor) {
            const ids = (item.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.untilRage).map((effect) => effect.id);
            if (ids.length) item.actor.deleteEmbeddedDocuments("Item", ids).catch((error) => console.error(`${MODULE_ID} | rage end`, error));
            // (And its retaliation cards kept open until then, Instinct Crown (Dragon)'s: closed — 2026-10-25.)
            closeRageCards(item.actor).catch((error) => console.error(`${MODULE_ID} | rage end cards`, error));
        }
        // (A persistent damage over: a card's Effect that lowered its flat check's DC until then goes — Horned Lion Amulet Recovery's, 2026-10-25.)
        if (isActiveGM() && item?.type === "condition" && item.slug === "persistent-damage" && item.actor) endRecoveryEffects(item.actor, item.system?.persistent?.damageType).catch((error) => console.error(`${MODULE_ID} | recovery Effect`, error));
        if (item?.type !== "consumable") return;
        deleted.set(item.uuid, { data: { ...item.toObject(false), uuid: item.uuid }, actor: item.actor ?? null });
        setTimeout(() => deleted.delete(item.uuid), 30_000);
    });
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM()) return;
        cardForUse(message).catch((error) => console.error(`${MODULE_ID} | item card`, error));
        cardForBomb(message, { claims }).catch((error) => console.error(`${MODULE_ID} | bomb card`, error));
        // (A bomb's cloud on a plain miss, when no damage is rolled: scripts/bombs.js.)
        cloudOnMiss(message).catch((error) => console.error(`${MODULE_ID} | bomb cloud`, error));
        strikeWithPoison(message).catch((error) => console.error(`${MODULE_ID} | poisoned Strike`, error));
        strikeWithRider(message).catch((error) => console.error(`${MODULE_ID} | readied Strike`, error));
        // (A weapon's property runes on a critical hit: scripts/rune-strikes.js.)
        strikeWithRunes(message, runeRiders).catch((error) => console.error(`${MODULE_ID} | rune riders`, error));
        // (A spell cast into Spellstrike Ammunition, at the creature its Strike hits: scripts/spellstrike.js.)
        strikeWithSpellstrike(message).catch((error) => console.error(`${MODULE_ID} | spellstrike`, error));
        fortuneRolled(message).catch((error) => console.error(`${MODULE_ID} | roll twice`, error));
        // (A bonus only against what triggered it, spent by that: scripts/fortune.js.)
        againstRolled(message).catch((error) => console.error(`${MODULE_ID} | against the trigger`, error));
        // (A time's first critical failure made a failure, its Effect gone after: scripts/first-degree.js.)
        firstDegreeRolled(message).catch((error) => console.error(`${MODULE_ID} | first critical failure`, error));
        // (What each melee attack roll sets off while an item lasts: scripts/attack-riders.js.)
        attackRidersRolled(message).catch((error) => console.error(`${MODULE_ID} | attack riders`, error));
        // (The damage a whetstone's weapon dealt: Leeching Fangs' healing, scripts/attack-riders.js.)
        weaponDamageDealt(message).catch((error) => console.error(`${MODULE_ID} | weapon damage dealt`, error));
        // (An item's toggle on until its next damage roll: scripts/toggle.js.)
        togglesAfterDamage(message).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
        // (An Effect its creature's next Strike ends, Amulet of the Hellcat's Invisible: scripts/ends-on-strike.js.)
        endOnStrike(message).catch((error) => console.error(`${MODULE_ID} | ends on Strike`, error));
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
        hideCovered(message, html);
        wireCard(message, html);
    });
    // (A Focus Point an activation gave, lost at the end of the turn if unspent: scripts/focus.js.)
    Hooks.on("pf2e.endTurn", (combatant, encounter) => {
        loseUnspentFocus(combatant, encounter).catch((error) => console.error(`${MODULE_ID} | unspent Focus Point`, error));
        // (An item's toggle on until the end of the turn: scripts/toggle.js.)
        togglesAtTurnEnd(combatant).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
    });
    // (An item's toggle on until its user moves: scripts/toggle.js.)
    Hooks.on("updateToken", (token, changes) => {
        togglesOnMove(token, changes).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
    });
    game.socket.on(SOCKET, (data) => {
        if (isActiveGM()) onRequest(data).catch((error) => console.error(`${MODULE_ID} | ${data?.action}`, error));
    });
    // The chat log drew the messages already there before "ready".
    for (const element of document.querySelectorAll("[data-message-id]")) {
        const message = game.messages.get(element.dataset.messageId);
        if (message) {
            hideCovered(message, element);
            wireCard(message, element);
        }
    }
}

// --- The card after PF2e's Use ----------------------------------------------------

// Its user's items of the kind installed in an item (src/compiler/installed.js): each one's level, item bonus (a bomb's, or an elixir's
// "+N item bonus"), splash damage and quantity.
function installedOf(actor, installed) {
    const items = actor?.items?.contents ?? [...(actor?.items ?? [])];
    return items
        .filter((entry) => ["consumable", "weapon"].includes(entry.type) && String(entry.name ?? "").toLowerCase().startsWith(installed.name))
        .map((entry) => ({ id: entry.id, name: entry.name, level: Number(entry.system?.level?.value) || 0, bonus: entry.type === "weapon" ? Number(entry.system?.bonus?.value) || 0 : Number(/\+(\d+) item bonus/.exec(entry.system?.description?.value ?? "")?.[1]) || 0, splash: Number(entry.system?.splashDamage?.value) || 0, quantity: Number(entry.system?.quantity) || 1 }));
}

// The used item: still on the actor, else as PF2e deleted it (the last dose), else its compendium source.
async function usedItem(origin, message) {
    const live = origin.uuid ? await fromUuid(origin.uuid).catch(() => null) : null;
    if (live) return { data: { ...live.toObject(false), uuid: live.uuid }, actor: live.actor };
    for (let wait = 0; wait < 15 && !deleted.has(origin.uuid); wait++) await new Promise((resolve) => setTimeout(resolve, 100));
    const gone = deleted.get(origin.uuid);
    if (gone) return gone;
    const source = origin.sourceId ? await fromUuid(origin.sourceId).catch(() => null) : null;
    return source ? { data: { ...source.toObject(false), uuid: origin.uuid ?? null }, actor: message.actor ?? null } : null;
}

// (PF2e's Use posts its origin as { sourceId, uuid, type }; its "send to chat" card as getOriginData(), with the actor
// and roll options: showing a potion in chat isn't drinking it.)
const isPostedCard = (origin) => Array.isArray(origin?.rollOptions);

async function cardForUse(message) {
    const origin = message?.flags?.pf2e?.origin;
    if (origin?.type !== "consumable" || isPostedCard(origin) || message.flags?.pf2e?.context?.type || message.flags?.[MODULE_ID]) return;
    const used = await usedItem(origin, message);
    if (!used) return;
    // (A generic spellgun with no spell in it: back in the inventory, as nothing happened.)
    if (isUnloadedSpellgun(used.data)) return restoreUnloaded(used, message);
    // (With its owner's numbers: Wolf Fang's damage of its user's Strength modifier.)
    const plan = compile({ ...used.data, ...ownerOf(used.actor ?? message.actor) });
    const actor = used.actor ?? message.actor;
    if (!actor) return;
    const token = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    return postCardFor({ message, plan, used, actor, token, origin });
}

// The card for a plan (src/live/route.js): an injury poison's weapon to coat (scripts/poisons.js); a contact, inhaled or
// ingested poison's exposure, or another item's save on its Use (Spark Wafer, Pyronite), for the creatures targeted; a spell
// PF2e has no Effect for, cast by the spell module (scripts/casts.js); a zone or a conjured creature (scripts/zones.js); a Focus Point
// (scripts/focus.js); a readied Strike (scripts/strikes.js); a reroll (scripts/rerolls.js); a roll twice (scripts/fortune.js); a skill action
// (scripts/item-actions.js); else the item card below.
// What an item tells its user (an information item, src/compiler/decided.js): whispered to the GM and the user's owners, the GM to fill in
// what it shows — the user's ruling, as for spells.
async function postWhisper({ plan, used, actor, token }) {
    const owners = (game.users ?? []).filter((user) => user.isGM || actor?.testUserPermission?.(user, "OWNER")).map((user) => user.id);
    const who = token?.name ?? actor?.name ?? "its user";
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor, token: token?.document ?? token ?? undefined }),
        whisper: owners,
        content: `<section class="pf2e-aar-card pf2e-air-card" data-air-status="applied"><header><strong>${escapeHTML(used.data.name)}</strong><span class="aar-check">used by ${escapeHTML(who)}</span></header><p>${escapeHTML(plan.whisper.text)}</p><p class="aar-hint">Whispered to the GM and ${escapeHTML(who)}'s player: the GM says what it tells.</p></section>`,
        flags: { [MODULE_ID]: { whisper: { item: used.data.name, actorUuid: actor?.uuid ?? null } } }
    });
}

// (A consumable's after PF2e's Use; a permanent item's activation from its button on the sheet, scripts/activations.js.)
export async function postCardFor({ message, plan, used, actor, token, origin = {} }) {
    // (Its moves with ability 0.9.2's hook and moveFrom, else as read before: scripts/placed-moves.js.)
    plan = forAbility(plan);
    // (A save against its user's own class or spell DC, src/compiler/item-data.js: that DC, as it is now. Without one, the GM rolls it.)
    if (hasOwnerDC(plan)) {
        const filled = fillOwnerDCs(plan, ownerDCsOf(actor));
        if (filled.missing) {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${escapeHTML(used.data.name)}</strong>: its save is against ${escapeHTML(actor.name)}'s class DC or spell DC, and ${escapeHTML(actor.name)} has neither. Roll it by hand.</p>` });
            return;
        }
        plan = filled.plan;
    }
    // (Its DCs its user's class or spell DC when higher, under the world setting: scripts/item-dcs.js.)
    plan = withUserDCs(plan, actor, plainText(used.data.system?.description?.value), used.data);
    // (A proficiency its Requirements need that its user lacks — a talisman's "You're an expert in Stealth": a whisper to the GM, not a refusal,
    // as for an activation used past its frequency; the item's been used already. src/compiler/requirement.js.)
    const unmet = requirementWarning(actor, readProficiencyRequirement(plainText(used.data.system?.description?.value)), used.data.name);
    if (unmet) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p>${escapeHTML(unmet)}</p>` }).catch((error) => console.error(`${MODULE_ID} | requirement warning`, error));
    const route = routeOf(plan, plainText(used.data.system?.description?.value));
    // (An item that also counteracts on its drinker — Panacea Fruit heals too: its counteract card beside its own.)
    // (Its cost, a Mythic Point, the main card's alone: src/compiler/spend.js.)
    if (route !== "counteract" && plan?.item?.counteract) await postCounteractCard({ message, plan: { ...plan, spend: undefined }, used, actor, token }).catch((error) => console.error(`${MODULE_ID} | counteract card`, error));
    // (A cost with no card to apply it on — a zone, a conjured creature, a spell cast into ammunition: spent now, or refused.)
    if (plan?.spend && ["zone", "conjure", "spellstrike"].includes(route)) {
        checkSpend(actor, plan.spend, used.data.name);
        await paySpend(actor, plan.spend, used.data.name);
    }
    // (Only after a hit with the weapon — Alghollthu Whip's "Your last action was a successful Strike, Grapple, or Trip with the alghollthu whip",
    // Rending Gauntlets' two unarmed hits on one creature: its user's latest rolls in the chat. Not met: refused, no card, no use counted; met:
    // its card at the creature struck when its presser targets none. src/compiler/strike-gate.js.)
    if (plan?.gate?.strike || plan?.gate?.twoUnarmed) {
        const rolls = (game.messages?.contents ?? []).slice(-12).map((entry) => {
            const context = entry.flags?.pf2e?.context ?? {};
            const options = context.options ?? [];
            return { actorUuid: entry.actor?.uuid ?? (entry.speaker?.actor ? `Actor.${entry.speaker.actor}` : null), type: context.type ?? null, outcome: context.outcome ?? null, itemUuid: entry.flags?.pf2e?.origin?.uuid ?? null, slug: options.find((option) => /^action:(?:grapple|trip)$/.test(option))?.slice(7) ?? null, targetUuid: context.target?.token ?? null, ranged: options.includes("item:ranged"), unarmed: options.includes("item:category:unarmed") };
        });
        const met = gateMet(plan.gate, rolls, { actorUuid: actor?.uuid, itemUuid: used.data.uuid ?? used.data._stats?.compendiumSource ?? null });
        if (!met.ok) throw new Error(`${used.data.name}: its Requirements need ${met.why}.`);
        if (met.struck) plan = { ...plan, struckToken: met.struck };
    }
    // (A condition its user takes beside the save, Pharasmin Visor's Dazzled: given as it's used, src/compiler/user-conditions.js.)
    if (plan?.userEffects?.length && actor) await giveUserConditions(plan.userEffects, { actor, token, used }).catch((error) => console.error(`${MODULE_ID} | user conditions`, error));
    // (A healing of the item's own stopped for a while, Splithead Bow's Two-Headed Arrow: its PF2e toggle off, scripts/toggle-off.js.)
    if (plan?.toggleOff && actor) await toggleOff(plan, { actor, token, used }).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
    if (plan?.toggleOn && actor) await toggleOn(plan, { actor, used }).catch((error) => console.error(`${MODULE_ID} | toggle on`, error));
    // (Its save's DC its user's conditions higher, Death Tusk Helm's doomed and wounded: src/live/scaled.js.)
    if (plan?.dcBy && actor) plan = withConditionDC(plan, (slug) => actor.getCondition?.(slug)?.value ?? 0);
    // (A light it puts in a square, Flare Beacon's: placed at its user's square as it's used, src/compiler/placed-light.js.)
    if (plan?.item?.placedLight) await placeLight(plan.item.placedLight, { token, actor, item: used.data }).catch((error) => console.error(`${MODULE_ID} | placed light`, error));
    // (A retaliation beside the rest, Thunder Mail's for the next minute: its later card too, kept open — src/compiler/direct-damage.js.)
    if (plan?.alsoRetaliation && route !== "later") await postExposureCard({ message, plan: { ...plan.alsoRetaliation, item: plan.item, spend: undefined }, used, actor, token, later: true }).catch((error) => console.error(`${MODULE_ID} | retaliation card`, error));
    // (Its user's move beside the rest, Phase Spike's Stride with its resistance: the teleport card's as a move, src/compiler/move.js.)
    if (plan?.item?.move && route !== "teleport") await postTeleportCard({ message, plan: { ...plan, builtin: "teleport", teleport: plan.item.move, spend: undefined }, used, actor, token }).catch((error) => console.error(`${MODULE_ID} | move card`, error));
    if (route === "counteract") return postCounteractCard({ message, plan, used, actor, token });
    if (route === "coat") return postPoisonCard({ message, plan, used, actor, token });
    if (route === "expose" || route === "save" || route === "later") return postExposureCard({ message, plan, used, actor, token, later: route === "later" });
    if (route === "cast") return postCastCard({ message, plan, used, actor, token });
    if (route === "zone") return startItemZone({ plan, used, actor, token });
    if (route === "conjure") return startItemConjure({ plan, used, actor, token });
    if (route === "focus") return postFocusCard({ message, plan, used, actor, token });
    // (Spellstrike Ammunition: the spell cast into it, on this client: scripts/spellstrike.js.)
    if (route === "spellstrike") {
        const ammo = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
        return ammo ? chargeSpellstrike(ammo, plan.spellstrike) : null;
    }
    if (route === "strike") return postStrikeCard({ message, plan, used, actor, token });
    if (route === "reroll") return postRerollCard({ message, plan, used, actor, token });
    if (route === "fortune") return postFortuneCard({ message, plan, used, actor, token });
    if (route === "action") return postActionCard({ message, plan, used, actor, token });
    if (route === "toggle") return postToggleCard({ message, plan, used, actor, token });
    if (route === "ways") return postWaysCard({ message, plan, used, actor, token });
    if (route === "teleport") return postTeleportCard({ message, plan, used, actor, token });
    if (route === "whisper") return postWhisper({ plan, used, actor, token });
    if (route === "objects") return postObjectsCard({ message, plan, used, actor, token });
    if (route === "table") return postTableCard({ message, plan, used, actor, token });
    if (route === "take") return postTakeCard({ message, plan, used, actor, token });
    if (route !== "item") return;
    const user = entryOf(token, actor);
    const roll = message?.rolls?.[0];
    const rolled = plan.item?.pf2eRoll && Number.isFinite(roll?.total) ? { total: roll.total, formula: plan.item.pf2eRoll.formula, kind: plan.item.pf2eRoll.kind, messageId: message.id } : null;
    const sourceId = used.data._stats?.compendiumSource ?? used.data.flags?.core?.sourceId ?? origin.sourceId ?? null;
    const state = createItemCard({
        plan,
        item: { name: used.data.name, uuid: used.data.uuid ?? origin.uuid ?? null, sourceId, slug: used.data.system?.slug ?? null, img: used.data.img ?? null },
        user,
        drinkers: plan.item?.recipient === "drinker" ? creaturesNear(token, 5) : [],
        rolled,
        // (A rune it lends a weapon: its user's weapons to pick from.)
        // (Or one it makes its user's best, up to a level: Blade Phantom's Guide.)
        // (Or a whetstone's: Frenzied Quintessence.)
        // (The alchemical item installed in it, Living Leaf Weave's elixir of life: its user's of that kind.)
        installed: plan.item?.installed ? installedOf(actor, plan.item.installed) : [],
        // (A condition of its user's choice it has now, Armbands of the Gorgon's: PF2e's conditions on its user.)
        held: (plan.item?.reduce ?? []).some((entry) => entry.held) ? [...new Set((actor.conditions?.active ?? actor.itemTypes?.condition ?? []).map((condition) => condition.slug))] : null,
        // (A potion it holds, Potion Patch's: its user's potions, up to its level.)
        potions: plan.item?.patch ? (actor.items?.contents ?? [...(actor.items ?? [])]).filter((entry) => entry.type === "consumable" && entry.system?.category === "potion" && entry.id !== used.data._id && !(plan.item.patch.maxLevel && Number(entry.system?.level?.value) > plan.item.patch.maxLevel)).map((entry) => ({ id: entry.id, name: entry.name, level: Number(entry.system?.level?.value) || 0 })) : [],
        weapons: picksWeapon(plan) ? (actor.itemTypes?.weapon ?? []).filter((weapon) => !weapon.isOfType?.("bomb") && weapon.system?.group !== "bomb" && !(plan.item?.proficiency?.maxLevel && Number(weapon.system?.level?.value) > plan.item.proficiency.maxLevel)).map((weapon) => ({ id: weapon.id, name: weapon.name })) : []
    });
    const card = await ChatMessage.create({
        content: cardHTML(state, { canApply: true }),
        speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }),
        flags: { [MODULE_ID]: { [FLAG]: state } }
    });
    // PF2e's roll is the card's: its own apply buttons come off that message.
    if (rolled && card) await message.update({ "flags.pf2e.suppressDamageButtons": true, [`flags.${MODULE_ID}.covered`]: card.id });
    return card;
}

// PF2e's message whose roll an item card applies: no apply buttons, a pointer to the card instead.
function hideCovered(message, html) {
    if (!message?.getFlag?.(MODULE_ID, "covered")) return;
    // (A bomb's: only its splash-only rolls' buttons; PF2e's main damage stays PF2e's.)
    if (!hideCoveredSplash(message, html)) for (const section of html.querySelectorAll(".damage-application")) section.remove();
    if (!html.querySelector(".pf2e-air-covered")) {
        const note = document.createElement("p");
        note.className = "pf2e-air-covered";
        note.style.cssText = "font-size: 0.85em; font-style: italic; margin: 0.25rem 0;";
        note.textContent = "Applied from the item's card below.";
        (html.querySelector(".message-content") ?? html).append(note);
    }
}

// --- Buttons ----------------------------------------------------------------------

// What a card's controls say on Apply: the item card's drinker, the bomb card's ticked splash.
function choicesOf(state, root) {
    if (state.kind === "bomb") return { included: [...root.querySelectorAll("[data-air-splash]")].filter((box) => box.checked).map((box) => Number(box.dataset.airSplash)) };
    // (The counteract card: its drinker, then its rows' ticks, DCs and ranks.)
    if (state.kind === "counteract") return state.step === "find"
        ? { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0) }
        : { rows: state.rows.map((row, index) => ({ ticked: Boolean(root.querySelector(`[data-air-row="${index}"]`)?.checked), dc: root.querySelector(`[data-air-dc="${index}"]`)?.value ?? null, rank: root.querySelector(`[data-air-rank="${index}"]`)?.value ?? null })), ...(root.querySelector("[data-air-ownrank]") ? { ownRank: root.querySelector("[data-air-ownrank]").value } : {}) };
    if (state.kind === "poison") return { weapon: Number(root.querySelector("[data-air-field='weapon']")?.value ?? state.weapon ?? 0) };
    if (state.kind === "expose" || state.kind === "item-action" || state.kind === "reroll") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean), ...(state.kind === "item-action" && state.plan.action?.slugs ? { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) } : {}), ...(state.kind === "expose" ? { damageChoice: Number(root.querySelector("[data-air-field='damageChoice']")?.value ?? state.damageChoice ?? 0), attackChoice: Number(root.querySelector("[data-air-field='attackChoice']")?.value ?? state.attackChoice ?? 0), checkChoice: Number(root.querySelector("[data-air-field='checkChoice']")?.value ?? state.checkChoice ?? 0), ...(root.querySelector("[data-air-field='scaled']") ? { scaled: root.querySelector("[data-air-field='scaled']").value } : {}) } : {}) };
    if (state.kind === "toggle" || state.kind === "ways") return { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) };
    // (A teleport: the creature targeted, when it's measured from one; the space is picked on Pick.)
    if (state.kind === "teleport") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean), critical: Boolean(root.querySelector("[data-air-field='critical']")?.checked) };
    // (One of its user's items, picked: scripts/objects.js.)
    // (A stored spell cast at the creatures targeted: src/compiler/stored-spell.js.)
    if (state.kind === "objects") return { pick: Number(root.querySelector("[data-air-field='pick']")?.value ?? state.pick ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    if (state.kind === "table") return {};
    // (The held items ticked to drop: scripts/drop-held.js.)
    if (state.kind === "drop") return { ticked: [...root.querySelectorAll("[data-air-drop]")].filter((box) => box.checked).map((box) => box.dataset.airDrop) };
    // (The creatures trying to disbelieve an illusion: the GM's targets.)
    if (state.kind === "disbelief") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    // (An ally's condition taken: the ally targeted.)
    if (state.kind === "take") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    // (A bonus for the creature targeted: the presser's targets.)
    if (state.kind === "fortune") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    // (A spell at others: the presser's own targets.)
    if (state.kind === "cast") return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), ceremony: Boolean(root.querySelector("[data-air-field='ceremony']")?.checked), resistType: Number(root.querySelector("[data-air-field='resistType']")?.value ?? state.resistType ?? 0), recoveryType: Number(root.querySelector("[data-air-field='recoveryType']")?.value ?? state.recoveryType ?? 0), reduceChoice: Number(root.querySelector("[data-air-field='reduceChoice']")?.value ?? state.reduceChoice ?? 0), runeWeapon: Number(root.querySelector("[data-air-field='runeWeapon']")?.value ?? state.runeWeapon ?? 0), runeChoice: Number(root.querySelector("[data-air-field='runeChoice']")?.value ?? state.runeChoice ?? 0), skillPick: Number(root.querySelector("[data-air-field='skillPick']")?.value ?? state.skillPick ?? 0), installedPick: Number(root.querySelector("[data-air-field='installedPick']")?.value ?? state.installedPick ?? 0), potionPick: Number(root.querySelector("[data-air-field='potionPick']")?.value ?? state.potionPick ?? 0), ...(root.querySelector("[data-air-field='amount']") ? { amount: root.querySelector("[data-air-field='amount']").value } : {}), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
}

const APPLY = {
    bomb: (message, choices) => applyBombCard(message, choices),
    poison: (message, choices) => applyPoisonCard(message, choices),
    cast: (message, choices) => applyCastCard(message, choices),
    expose: (message, choices) => applyExposureCard(message, choices),
    focus: (message) => applyFocusCard(message),
    fortune: (message, choices) => applyFortuneCard(message, choices),
    strike: (message, choices) => applyStrikeCard(message, choices),
    reroll: (message, choices) => applyRerollCard(message, choices),
    "item-action": (message, choices) => applyActionCard(message, choices),
    counteract: (message, choices) => applyCounteractCard(message, choices),
    toggle: (message, choices) => applyToggleCard(message, choices),
    ways: (message, choices) => applyWaysCard(message, choices, postCardFor),
    teleport: (message, choices) => applyTeleportCard(message, choices),
    objects: (message, choices) => applyObjectsCard(message, choices),
    disbelief: (message, choices) => applyDisbeliefCard(message, choices),
    take: (message, choices) => applyTakeCard(message, choices),
    // (An item's effect a creature ends early, Fire-Douse Snare's flat checks: scripts/end-early.js.)
    "end-early": (message, choices) => applyEndEarlyCard(message, choices),
    // (What a creature drops of what it holds, Deadweight Snare's metal: scripts/drop-held.js.)
    "drop": (message, choices) => applyDropCard(message, choices),
    // (A RollTable's row drawn: compiled as the item's use, a consumable's of that text.)
    table: (message, choices) => applyTableCard(message, choices, postCardFor, (html) => compile?.({ name: stateOf(message)?.item?.name ?? "Table", type: "consumable", system: { description: { value: `<p><strong>Activate</strong> <span class="action-glyph">2</span></p><p>${html}</p>` }, traits: { value: ["magical", "consumable"] }, level: { value: 1 }, category: "other" } }) ?? null),
    item: (message, choices) => applyCard(message, choices)
};
// (What its use costs — a Mythic Point, or a Hero Point under the world setting, src/compiler/spend.js and scripts/spend.js: checked before
// the card applies, refused without one, and spent once it has — once per card, whatever its steps. A cast's chosen spell's own, a mythic one.)
const spendOf = (state, choices) => state.plan?.spend ?? (state.kind === "cast" ? state.plan?.choices?.[Number.isInteger(choices?.choice) ? choices.choice : state.choice ?? 0]?.spend ?? null : null);
// (A temporary immunity after its use, scripts/immunity.js: the immune refused, the rest given its Effect once applied.)
const applyByKind = (message, state, choices) => withImmunityGuard(message, state, choices, (given) => applyPaid(message, state, given));
// (And what it gives back, a Mythic Point regained — plan.item.regain, src/compiler/reduce.js: once, after the card applies.)
const applyPaid = async (message, state, choices) => {
    const spend = state.spent ? null : spendOf(state, choices);
    const regain = state.regained ? null : state.plan?.item?.regain ?? null;
    if (!spend && !regain) return APPLY[state.kind](message, choices);
    const payer = await fromUuid(state.user?.actorUuid ?? "").catch(() => null);
    const name = state.item?.name ?? "The item";
    if (spend) checkSpend(payer, spend, name);
    const before = JSON.stringify(stateOf(message));
    const done = await APPLY[state.kind](message, choices);
    const now = game.messages.get(message.id) ?? message;
    if (JSON.stringify(stateOf(now)) === before) return done;
    if (spend) await paySpend(payer, spend, name);
    if (regain) await payRegain(payer, regain, name);
    await now.update({ ...(spend ? { [`flags.${MODULE_ID}.${FLAG}.spent`]: true } : {}), ...(regain ? { [`flags.${MODULE_ID}.${FLAG}.regained`]: true } : {}) });
    return done;
};

function wireCard(message, html) {
    const state = stateOf(message);
    if (!state || !APPLY[state.kind]) return;
    const root = html.querySelector(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        // The drinker as text, not a choice; the splash ticks read-only.
        for (const select of root.querySelectorAll("select[data-air-field]")) select.replaceWith(document.createTextNode(select.selectedOptions?.[0]?.textContent ?? ""));
        for (const box of root.querySelectorAll("[data-air-splash]")) box.disabled = true;
        const hint = document.createElement("p");
        hint.className = "aar-hint";
        hint.textContent = `Waiting for ${state.user.name}'s player or the GM to apply it.`;
        root.append(hint);
        return;
    }
    const button = root.querySelector("[data-air-action='apply']");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const choices = choicesOf(state, root);
        try {
            // (On the presser's own client: a card that acts on targets needs some.)
            // (A teleport's space: clicked on this client's canvas, then sent.)
            if (state.kind === "teleport") {
                if (state.plan.teleport?.from === "target" && !choices.targets?.length) throw new Error("Target the creature first.");
                const destination = await pickTeleportSpace(state);
                if (!destination) {
                    button.disabled = false;
                    return;
                }
                choices.destination = destination;
            }
            if (((state.kind === "expose" && !state.own) || (state.kind === "cast" && needsTargets(state.plan, state.plan.choices?.[choices.choice ?? state.choice ?? 0])) || (state.kind === "item-action" && state.plan?.action?.targeted) || (state.kind === "reroll" && state.plan?.reroll?.who === "companion") || (state.kind === "fortune" && state.plan?.bonus?.recipient === "target")) && !choices.targets?.length) throw new Error("Target the creatures first.");
            if (isActiveGM()) await applyByKind(message, state, choices);
            else if (!game.users.activeGM) throw new Error("No GM is connected to apply it.");
            else game.socket.emit(SOCKET, { action: "apply", messageId: message.id, ...choices, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            console.error(`${MODULE_ID} |`, error);
            button.disabled = false;
        }
    });
}

// Apply a card from code (the module api's live.apply: a harness or another module), on the active GM's client.
export async function applyMessage(messageId, choices = {}) {
    const message = game.messages.get(messageId);
    const state = stateOf(message);
    if (!state || !APPLY[state.kind]) throw new Error("Not an item card.");
    if (!isActiveGM()) throw new Error("Only the active GM's client applies cards.");
    return applyByKind(message, state, choices);
}

// A player's Apply, on the active GM's client: only the GM or the item user's owner may.
async function onRequest(data) {
    // (A permanent item's Activate button on a player's sheet: scripts/activations.js checks the sender owns the item.)
    if (data?.action === "activate") {
        await activate(String(data.itemUuid ?? ""), indexOf(data.activation), data.userId).catch((error) => {
            ui.notifications.error(`Activate: ${error.message}`);
            throw error;
        });
        return;
    }
    if (data?.action !== "apply") return;
    const message = game.messages.get(data.messageId);
    const state = stateOf(message);
    const sender = game.users.get(data.userId);
    if (!state || !sender) return;
    const owner = sender.isGM || !!(await fromUuid(presserUuid(state)).catch(() => null))?.testUserPermission?.(sender, "OWNER");
    if (!owner) return;
    const choices = state.kind === "bomb" ? { included: Array.isArray(data.included) ? data.included.map(Number) : null }
        : state.kind === "poison" ? { weapon: data.weapon }
        : state.kind === "cast" ? { drinker: data.drinker, choice: Number.isInteger(data.choice) ? data.choice : null, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "expose" || state.kind === "item-action" || state.kind === "reroll" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [], ...(state.kind === "item-action" && Number.isInteger(data.choice) ? { choice: data.choice } : {}), ...(state.kind === "expose" && Number.isInteger(data.damageChoice) ? { damageChoice: data.damageChoice } : {}), ...(state.kind === "expose" && Number.isInteger(data.attackChoice) ? { attackChoice: data.attackChoice } : {}), ...(state.kind === "expose" && Number.isInteger(data.checkChoice) ? { checkChoice: data.checkChoice } : {}), ...(state.kind === "expose" && data.scaled !== undefined && data.scaled !== null ? { scaled: String(data.scaled) } : {}) }
        : state.kind === "toggle" || state.kind === "ways" ? { choice: Number.isInteger(data.choice) ? data.choice : null }
        : state.kind === "table" ? {}
        : state.kind === "take" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "drop" ? { ticked: Array.isArray(data.ticked) ? data.ticked.map(String) : null }
        : state.kind === "end-early" ? { entry: Number.isFinite(Number(data.entry)) && data.entry !== null && data.entry !== "" ? Number(data.entry) : null }
        : state.kind === "objects" ? { pick: Number.isInteger(data.pick) ? data.pick : 0, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "disbelief" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "teleport" ? { destination: data.destination && Number.isFinite(Number(data.destination.x)) && Number.isFinite(Number(data.destination.y)) ? { x: Number(data.destination.x), y: Number(data.destination.y) } : null, targets: Array.isArray(data.targets) ? data.targets.map(String) : [], critical: Boolean(data.critical) }
        : state.kind === "fortune" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "counteract" ? { drinker: Number.isInteger(data.drinker) ? data.drinker : null, rows: Array.isArray(data.rows) ? data.rows.map((row) => ({ ticked: Boolean(row?.ticked), dc: row?.dc ?? null, rank: row?.rank ?? null })) : null, ...(data.ownRank !== undefined ? { ownRank: data.ownRank === null ? null : String(data.ownRank) } : {}) }
        : { drinker: data.drinker, ceremony: Boolean(data.ceremony), resistType: Number.isInteger(data.resistType) ? data.resistType : null, recoveryType: Number.isInteger(data.recoveryType) ? data.recoveryType : null, reduceChoice: Number.isInteger(data.reduceChoice) ? data.reduceChoice : null, runeWeapon: Number.isInteger(data.runeWeapon) ? data.runeWeapon : null, runeChoice: Number.isInteger(data.runeChoice) ? data.runeChoice : null, skillPick: Number.isInteger(data.skillPick) ? data.skillPick : null, installedPick: Number.isInteger(data.installedPick) ? data.installedPick : null, potionPick: Number.isInteger(data.potionPick) ? data.potionPick : null, ...(data.amount !== undefined && data.amount !== null ? { amount: String(data.amount) } : {}), targets: Array.isArray(data.targets) ? data.targets.map(String) : [] };
    await applyByKind(message, state, choices).catch((error) => {
        ui.notifications.error(`${state.item.name}: ${error.message}`);
        throw error;
    });
}

// --- Apply ------------------------------------------------------------------------

// PF2e's key for a rune by its name ("Vitalizing" → "disrupting"), kebab-case: its English rune names first, else the
// compiler's guess when PF2e's runes are out of reach (as in the tests); null when PF2e has no such rune.
function runeKeyOf(rune) {
    const names = game.i18n?._fallback?.PF2E?.WeaponPropertyRune ?? game.i18n?.translations?.PF2E?.WeaponPropertyRune ?? null;
    if (!names) return rune.key;
    const kebab = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const found = Object.entries(names).find(([, entry]) => String(entry?.Name ?? "").toLowerCase() === String(rune.name).toLowerCase());
    if (found) return kebab(found[0]);
    return Object.keys(names).some((key) => kebab(key) === rune.key) ? rune.key : null;
}

// Whether a creature is raging: PF2e's Effect: Rage on it.
const isRaging = (actor) => (actor?.itemTypes?.effect ?? []).some((effect) => effect.slug === "effect-rage" || effect.name === "Effect: Rage");

// A condition its user takes as it's used (plan.userEffects, src/compiler/user-conditions.js), through the ability module's applyChange, said in
// the chat.
async function giveUserConditions(effects, { actor, token, used }) {
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const name = token?.name ?? actor.name;
    const state = { plan: { item: {} }, ability: { name: used.data.name, uuid: used.data.uuid ?? null }, source: { actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null, name }, targets: [] };
    const lines = [];
    for (const effect of effects) {
        // (Its temporary Hit Points, Death Tusk Helm's 5 for a minute: the ability module's tempHp.)
        if (effect.kind === "temp-hp") {
            const line = ability?.applyChange ? await ability.applyChange({ op: "tempHp", target: "source", amount: effect.amount, duration: effect.duration ?? null }, state) : null;
            lines.push(line ?? `${name} gains ${effect.amount} temporary Hit Points${ability?.applyChange ? "" : " (add them by hand: the ability module isn't active)"}`);
            continue;
        }
        const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug: effect.slug, value: effect.value ?? null, target: "source", duration: effect.duration ?? null }, state) : null;
        lines.push(line ?? `${name} is ${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}${ability?.applyChange ? "" : " (apply it by hand: the ability module isn't active)"}`);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escapeHTML(used.data.name)}</strong>: ${lines.map(escapeHTML).join("; ")}.</p>` });
}

// Its persistent damage of a type over: the Effects an item card gave it that lower that type's flat-check DC with no time of their own (PF2e's
// ItemAlteration on pd-recovery-dc for item:damage:type:<type>), deleted — once none of that type is left.
async function endRecoveryEffects(actor, type) {
    if (!type || (actor.itemTypes?.condition ?? []).some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === type)) return;
    const lowers = (effect) => (effect.system?.rules ?? []).some((rule) => rule?.key === "ItemAlteration" && rule.property === "pd-recovery-dc" && [].concat(rule.predicate ?? []).includes(`item:damage:type:${type}`));
    const ids = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.card && effect.system?.duration?.unit === "unlimited" && lowers(effect)).map((effect) => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}

// A creature's rage over: its open cards that lasted until then (plan.retaliation.untilRage, src/compiler/direct-damage.js) closed, in the last
// 200 messages.
async function closeRageCards(actor) {
    for (const message of (game.messages?.contents ?? []).slice(-200)) {
        const state = stateOf(message);
        if (state?.kind !== "expose" || state.status !== "open" || !state.plan?.retaliation?.untilRage || state.user?.actorUuid !== actor.uuid) continue;
        const over = { ...state, status: "applied", results: [...(state.results ?? []), `${state.user.name}'s rage ended: ${state.item.name}'s retaliation is over.`].slice(-6) };
        await message.update({ content: exposureCardHTML(over, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: over });
    }
}

// A condition's PF2e uuid by its slug: PF2e's condition manager, else its conditions pack.
async function conditionUuid(slug) {
    const condition = game.pf2e?.ConditionManager?.getCondition?.(slug);
    if (condition?.uuid) return condition.uuid;
    const index = await game.packs?.get?.("pf2e.conditionitems")?.getIndex?.().catch?.(() => null);
    const entry = index?.find?.((row) => String(row.name).toLowerCase() === slug);
    return entry ? `Compendium.pf2e.conditionitems.Item.${entry._id}` : null;
}

// The creatures of the token uuids a presser targeted: [{ token, actor, name }].
async function targetedCreatures(uuids) {
    const tokens = await Promise.all((Array.isArray(uuids) ? uuids : []).map((uuid) => fromUuid(uuid).catch(() => null)));
    return tokens.filter((token) => token?.actor).map((token) => ({ token, actor: token.actor, name: token.name ?? token.actor.name }));
}

const voidHealing = (actor) => Boolean(actor?.attributes?.hp?.negativeHealing ?? actor?.system?.attributes?.hp?.negativeHealing);

async function applyCard(message, { drinker = null, ceremony = false, resistType = null, recoveryType = null, reduceChoice = null, runeWeapon = null, runeChoice = null, skillPick = null, installedPick = null, potionPick = null, amount = null, targets = [] } = {}) {
    let state = stateOf(message);
    if (!state || state.status !== "open") return null;
    // (An amount its trigger gave, typed on the card: Bloodknuckles' bleed damage.)
    const byAmount = (state.plan.item?.levelTemp ?? []).filter((entry) => entry.from === "amount");
    if (byAmount.length) {
        const typed = amount === null || amount === undefined || amount === "" ? NaN : Number(amount);
        if (!Number.isFinite(typed) || typed < 0) throw new Error(`Type the amount (${byAmount[0].of}) first, then press Apply.`);
        state = { ...state, amount: typed };
    }
    // (A light's radius typed on the card, Twilight Lantern's: between its bounds.)
    const radius = (state.plan.item?.light ?? []).find((entry) => entry.pick);
    if (radius) {
        const typed = amount === null || amount === undefined || amount === "" ? radius.dim : Number(amount);
        if (!Number.isFinite(typed) || typed < radius.pick.min || typed > radius.pick.max) throw new Error(`Type a radius from ${radius.pick.min} to ${radius.pick.max} feet, then press Apply.`);
        state = { ...state, amount: typed };
    }
    // (The weapon picked for the rune it lends.)
    if (Number.isInteger(runeWeapon) && state.weapons?.[runeWeapon]) state = { ...state, runeWeapon };
    // (The rune picked of several.)
    if (Number.isInteger(runeChoice) && state.plan.item?.rune?.choices?.[runeChoice]) state = { ...state, runeChoice };
    if (state.plan.item?.rune && !state.plan.item.rune.own && !state.weapons?.length) throw new Error(`${state.user.name} has no weapon for ${state.item.name}.`);
    // (A potion it holds, as picked: one its user has.)
    if (Number.isInteger(potionPick) && state.potions?.[potionPick]) state = { ...state, potionPick };
    if (state.plan.item?.patch && !state.potions?.[state.potionPick ?? 0]) throw new Error(`${state.user.name} has no potion for ${state.item.name}${state.plan.item.patch.maxLevel ? ` (level ${state.plan.item.patch.maxLevel} or lower)` : ""}.`);
    // (The alchemical item installed in it, as picked: one its user has, enough of them.)
    if (Number.isInteger(installedPick) && state.installed?.[installedPick]) state = { ...state, installedPick };
    const installing = state.plan.item?.installed;
    if (installing) {
        const entry = state.installed?.[state.installedPick ?? 0];
        const owner = entry ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
        const owned = owner?.items?.get?.(entry.id) ?? null;
        if (!entry || !owned) throw new Error(`${state.user.name} has no ${installing.name} to install in ${state.item.name}.`);
        if ((Number(owned.system?.quantity) || 1) < installing.count) throw new Error(`${state.item.name} needs ${installing.count} of ${owned.name} installed: ${state.user.name} has ${Number(owned.system?.quantity) || 1}.`);
    }
    // (Only after its user's check succeeds, Diplomat's Badge's Recall Knowledge at DC 20: its latest one in the chat, its total against the DC —
    // refused, nothing applied, when there's none or it fell short. src/compiler/consumables.js checkGated.)
    const gate = state.plan.checkGate;
    if (gate) {
        const option = `action:${gate.action}`;
        const latest = (game.messages?.contents ?? []).slice(-40).reverse().find((entry) => (entry.actor?.uuid ?? (entry.speaker?.actor ? `Actor.${entry.speaker.actor}` : null)) === state.user.actorUuid && (entry.flags?.pf2e?.context?.options ?? []).includes(option) && entry.rolls?.[0]);
        const words = gate.action.replace(/-/g, " ");
        if (!latest) throw new Error(`Roll ${state.user.name}'s ${words} first (DC ${gate.dc}), then press Apply.`);
        const roll = latest.rolls[0];
        const natural = roll.dice?.[0]?.total ?? null;
        if (degreeOf(Number(roll.total), gate.dc, natural) < 2) {
            const over = { ...state, status: "applied", results: [`${state.user.name}'s ${words} (${roll.total}) didn't reach DC ${gate.dc}: no Effect.`] };
            return message.update({ content: cardHTML(over, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: over });
        }
    }
    // (A condition it lowers on others: the creatures the presser targets, before anything is applied.)
    const reduce = state.plan.item?.reduce ?? [];
    // (Or its flat check, the creature its user touches: Nettle Balm's.)
    const byLevel = (state.plan.item?.levelTemp ?? []).some((entry) => entry.from !== "amount");
    const marks = Boolean(state.plan.item?.mark);
    const others = reduce.some((entry) => entry.who === "targets") || state.plan.item?.recovery?.who === "targets" || byLevel || marks ? await targetedCreatures(targets) : [];
    // (The creature its bonuses are against, src/compiler/marked.js: that one targeted.)
    if (marks && others.length !== 1) throw new Error("Target the one creature it's against first, then press Apply.");
    // (Temporary Hit Points from a creature's level: that creature targeted.)
    if (byLevel && !others.length) throw new Error("Target the creature first (the one its trigger names), then press Apply.");
    // ("Creatures of your choice": none targeted is its user alone.)
    if (reduce.some((entry) => entry.who === "targets" && !entry.optional) && !others.length) throw new Error("Target the creatures it helps first, then press Apply.");
    // (One of several conditions, as picked.)
    if (Number.isInteger(reduceChoice) && reduce.some((entry) => entry.choose?.[reduceChoice])) state = { ...state, reduceChoice };
    // (Its resistance's type, as picked.)
    if (Number.isInteger(resistType) && (state.plan.item?.resist ?? []).some((entry) => entry.choose?.[resistType])) state = { ...state, resistType };
    if (Number.isInteger(skillPick) && state.plan.item?.skillPick?.skills?.[skillPick]) state = { ...state, skillPick };
    // (Its flat check's type, as picked: Soothing Powder's.)
    if (Number.isInteger(recoveryType) && state.plan.item?.recovery?.choose && state.plan.item.recovery.types[recoveryType]) state = { ...state, recoveryType };
    // (A tea's Tea Ceremony, as ticked.)
    if (state.ceremony !== null && state.ceremony !== undefined) state = { ...state, ceremony: Boolean(ceremony) };
    const core = game.modules.get(CORE_ID)?.api;
    if (!core) throw new Error("The resolution core isn't active.");
    if (state.drinker !== null && Number.isInteger(drinker) && state.drinkers[drinker]) state = { ...state, drinker };
    // (Granted to allies: each creature the presser targets in turn, as the drinker — Warpipes' Effect on each.)
    const allies = state.plan.item?.recipient === "targets" ? await targetedCreatures(targets) : null;
    if (allies && !allies.length) throw new Error("Target the creatures it helps first, then press Apply.");
    const lines = [];
    const each = allies ? allies.map((creature) => ({ ...state, drinkers: [entryOf(creature.token, creature.actor)], drinker: 0 })) : [state];
    for (const one of each) lines.push(...await applyToRecipient(one, { core, others: allies ? [] : others, reduce: allies ? reduce.filter((entry) => entry.who !== "targets") : reduce }));
    // (Its user's shield raised, Shield of Snakes' Snap Up: PF2e's own Raise a Shield, src/compiler/raise-shield.js.)
    if (state.plan.raiseShield) lines.push(await raiseShieldFor(state));
    // (An illusion its user can be seen through, Possum's Play's: the GM's disbelief card for its time, scripts/disbelief.js.)
    if (state.plan.disbelief) lines.push(await postDisbeliefCard(state));
    // (Another's conditions once, when the Effect went to each ally.)
    if (allies) for (const entry of reduce.filter((candidate) => candidate.who === "targets")) {
        const slug = entry.choose ? entry.choose[state.reduceChoice ?? 0] ?? entry.choose[0] : entry.slug;
        for (const creature of others) lines.push(await lowerCondition(creature.actor, creature.name, slug, entry.by));
    }
    const next = { ...state, status: "applied", results: lines.length ? lines : ["Nothing to apply."] };
    return message.update({ content: cardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its user's held shield raised with PF2e's own Raise a Shield (its Effect: Raise a Shield): a line for the card.
async function raiseShieldFor(state) {
    const { actor } = await creatureOf(state.user);
    if (!actor) return `${state.user.name} isn't there any more.`;
    const shield = actor.heldShield ?? null;
    if (!shield) return `${state.user.name} holds no shield to raise.`;
    if (typeof game.pf2e?.actions?.raiseAShield !== "function") return `${state.user.name}: raise ${shield.name} by hand (PF2e's Raise a Shield isn't here).`;
    await game.pf2e.actions.raiseAShield({ actors: [actor] });
    return `${state.user.name} raises ${shield.name}`;
}

// What the item card does for its recipient (its user, the drinker, or one of the allies targeted): the core's changes,
// then its resistance, Speeds, senses, the conditions it lowers, its flat check and the Tea Ceremony. → lines for the card.
// (World time in seconds of a duration's unit: plan.again's time.)
const SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400 };

async function applyToRecipient(state, { core, others = [], reduce = [] }) {
    const recipient = recipientOf(state);
    const user = await creatureOf(state.user);
    const target = await creatureOf(recipient);
    if (!target.actor) throw new Error(`${recipient.name} isn't there any more.`);
    // (A shield's own temporary Hit Points, Ablative Shield Plating's: the Effect for the shield it plates, scripts/shield-temp.js.)
    if (state.plan.item?.shieldTemp) return [await plateShield(state, target.actor, recipient.name)];
    // (Its wait for a kind of damage, Flame Layer Balm's: the mark on the wearer for its time, scripts/armed.js.)
    if (state.plan.item?.armed) {
        await target.actor.createEmbeddedDocuments("Item", [armedMarkSource(state.plan.item.armed, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: startInitiative(target.actor), moduleId: MODULE_ID })]);
        return [`${recipient.name}: ${state.item.name} waits for the first ${state.plan.item.armed.damageType} damage it takes, for ${state.plan.item.armed.lasts.value} ${state.plan.item.armed.lasts.unit}`];
    }
    // (A drinker it fails for, Elysian Dew's unholy one: none of its results, its save card at that drinker instead — src/compiler/drinker-kind.js.)
    const unless = state.plan.item?.unlessKind;
    const kinds = new Set([...(target.actor.system?.traits?.value ?? []), ...(target.actor.traits ?? [])].map((trait) => String(trait).toLowerCase()));
    if (unless?.traits?.some((trait) => kinds.has(trait))) {
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const tokens = [target.token?.object ?? target.token].filter(Boolean);
        if (postCard && tokens.length) await postCard({ plan: unless.save, item: { name: state.item.name, uuid: state.item.uuid ?? null }, sourceActor: user.actor ?? target.actor, sourceToken: user.token ?? null, tokens });
        return [`${recipient.name} is ${unless.traits.join(" or ")}: ${state.item.name} fails to work${postCard && tokens.length ? ", and its save card follows" : `; roll its ${unless.save.resolution.check.statistic} save (DC ${unless.save.resolution.check.against.value}) by hand`}`];
    }
    const wrappers = { [USER_ID]: user.actor, [DRINKER_ID]: target.actor };
    const context = {
        caster: { id: USER_ID },
        targets: [{ id: DRINKER_ID }],
        id: (creature) => creature.id,
        statistic: () => ({ modifier: 0, dc: 10 }),
        allied: () => true,
        voidHealing: (creature) => voidHealing(wrappers[creature?.id])
    };
    const fromPF2e = rolledHealing(state);
    const rolledLines = [];
    const io = {
        roll: () => ({ degree: "success", total: null, natural: null }),
        damage: async (instance) => {
            const given = fromPF2e(instance);
            if (given !== null) return given;
            const roll = await new Roll(rollFormula(instance)).evaluate();
            rolledLines.push(`Rolled ${rollFormula(instance)} = ${roll.total}`);
            return roll.total;
        },
        choose: () => undefined
    };
    // (Healing by its user's condition value, Oracular Crown's cursebound: that value's formula, src/live/scaled.js.)
    const scaled = scaledByCondition(state.plan, (slug) => user.actor?.getCondition?.(slug)?.value ?? user.actor?.conditions?.bySlug?.(slug)?.[0]?.value ?? 0);
    const result = await core.registry.resolve(scaled, context, io);
    const lines = [...rolledLines];
    // (Left at 1 Hit Point instead of 0, The Survivor's and Immortal Bastion's: its Hit Points to 1, the Dying PF2e gave it ended with no Wounded
    // for it — before the healing or temporary Hit Points.)
    if (state.plan.item?.dropToOne && target.actor) {
        const dying = game.modules.get(CORE_ID)?.api?.dying;
        const wasDying = dying?.isDying(target.actor) ?? target.actor.hasCondition?.("dying") ?? false;
        if ((Number(target.actor.system?.attributes?.hp?.value) || 0) < 1) await target.actor.update({ "system.attributes.hp.value": 1 });
        const revived = wasDying && dying ? await dying.recoverFromDying(target.actor, wasDying, { keepWounded: true }) : null;
        lines.push(`${recipient.name} drops to 1 Hit Point instead of 0${revived ? `. ${dying.revivedNote(revived).replace(/\bthis spell\b/, "this item")}` : wasDying ? ". It was dying: end Dying by hand (no Wounded for it)" : ""}`);
    }
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    for (const change of result.changes) {
        const creature = change.target === USER_ID ? user : target;
        const name = change.target === USER_ID ? state.user.name : recipient.name;
        try {
            const line = change.op === "heal" ? await heal(creature, name, change.amount, state)
                : change.op === "effect" && change.effect?.kind === "native" ? await nativeEffect(creature.actor, name, change, state)
                : ability?.applyChange ? await ability.applyChange(change, abilityState(state))
                : `${name}: ${change.op} to apply by hand (the ability module isn't active).`;
            if (line) lines.push(line);
            // (A bonus the ability module applied without a line of its own: said here, so the card doesn't read "Nothing to apply".)
            else if (change.op === "effect" && change.effect?.kind === "modifier" && change.effect.modifier) lines.push(`${name}: ${modifierText(change.effect.modifier)}`);
        } catch (error) {
            lines.push(`Couldn't apply ${change.op} to ${name}: ${error.message}`);
        }
    }
    // (Its allies' own Effect beside its user's, Belt of the Five Kings' "(Allies)": each ally within that many feet of its user, plan.allyLinks
    // — src/compiler/consumables.js. Not its user, nor a creature of another side.)
    for (const link of state.plan.allyLinks ?? []) {
        const userToken = user.token?.object ?? user.token ?? canvas.tokens?.placeables?.find((placeable) => placeable.actor?.uuid === state.user.actorUuid) ?? null;
        const near = userToken ? creaturesNear(userToken, link.radius) : [];
        const allies = [];
        for (const entry of near) {
            const { actor } = await creatureOf(entry);
            if (actor && user.actor && actor.uuid !== user.actor.uuid && (actor.isAllyOf?.(user.actor) ?? actor.alliance === user.actor.alliance)) allies.push({ entry, actor });
        }
        if (!allies.length) lines.push(`No ally within ${link.radius} feet of ${state.user.name}: no ${link.label}.`);
        for (const { entry, actor } of allies) {
            const line = await nativeEffect(actor, entry.name, { op: "effect", target: "ally", effect: { kind: "native", uuid: link.uuid, label: link.label } }, state);
            if (line) lines.push(line);
        }
    }
    // (Its resistance: Armorskin Robes' 5 to slashing and piercing — an Effect with PF2e's Resistance rules.)
    if (state.plan.item?.resist?.length && target.actor) {
        const resist = chosenResistances(state.plan.item.resist, state.resistType ?? 0);
        // (One a new use replaces, Chromatic Robe's: the last one this item gave, gone first.)
        if (resist.some((entry) => entry.replaces)) {
            const old = (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.resist && effect.system?.context?.origin?.item === (state.item.uuid ?? null)).map((effect) => effect.id);
            if (old.length) await target.actor.deleteEmbeddedDocuments("Item", old);
        }
        await target.actor.createEmbeddedDocuments("Item", [resistanceEffectSource(resist, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${resistanceText(resist)}`);
    }
    // (Retaliation while its resistance lasts, for creatures of one trait — a third-party salve's damage at an ooze that hits it: a "later" attack
    // card kept open that long, for the creature it gave the resistance to, src/compiler/direct-damage.js withRetaliateAfter.)
    const retaliate = state.plan.item?.retaliate;
    if (retaliate && target.actor) {
        const seconds = (Number(retaliate.retaliation?.rounds) || 10) * 6;
        const card = createExposureCard({ plan: retaliate, item: state.item, user: recipient, later: true, repeat: true, until: (Number(game.time.worldTime) || 0) + seconds, attacker: "touch" });
        await ChatMessage.create({ content: exposureCardHTML(card, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor: target.actor }), flags: { [MODULE_ID]: { [FLAG]: card } } });
        lines.push(`${recipient.name}: its retaliation card follows`);
    }
    // (The save card after its Effect — plan.again: Phoenix Flask's feathers once each round while its Effect lasts, src/compiler/round-burst.js;
    // the breath potions' exhale, Vermin Repellent Agent's attackers, Matsuki's Medicinal Wine's own save, src/compiler/effect-then-card.js —
    // for the creature that drank it: kept for later, open for the item's time, or its own.)
    const again = state.plan.again;
    if (again?.plan && target.actor) {
        const later = again.later !== false && (again.later || again.rounds || again.when);
        const seconds = again.rounds ? Number(again.rounds) * 6 : again.time ? Number(again.time.value) * (SECONDS[again.time.unit] ?? 3600) : null;
        const repeat = Boolean(later && (again.repeat || again.rounds));
        const card = createExposureCard({ plan: again.plan, item: state.item, user: recipient, later: Boolean(later), repeat, until: repeat && seconds ? (Number(game.time.worldTime) || 0) + seconds : null, own: Boolean(again.own), attacker: again.attacker ?? false, when: again.when ?? null, ends: again.ends ?? null });
        await ChatMessage.create({ content: exposureCardHTML(card, { canApply: true }), speaker: ChatMessage.getSpeaker({ actor: target.actor }), flags: { [MODULE_ID]: { [FLAG]: card } } });
        lines.push(`${recipient.name}: ${again.own ? "its own save's card" : later ? "its save card for later" : "its save card"} follows`);
    }
    // (PF2e's own rules on it: Mirrorblade's flanking — an Effect with them.)
    for (const entry of state.plan.item?.ruleEffects ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [ruleEffectSource(entry, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${entry.words}`);
    }
    // (A second dose in a day, Iron Wine's and Rainbow Vinegar's weakness: PF2e's own Effect for it on a creature that had a dose within the last
    // day of world time — the doses counted on it, flags.<module>.doses.<item>.)
    const dose = state.plan.dose;
    if (dose && target.actor) {
        const now = Number(game.time.worldTime) || 0;
        const taken = ((target.actor.getFlag?.(MODULE_ID, "doses") ?? {})[dose.key] ?? []).filter((time) => now - Number(time) < 86400);
        if (taken.length) lines.push(`${(await nativeEffect(target.actor, recipient.name, { op: "effect", target: DRINKER_ID, effect: { kind: "native", uuid: dose.uuid, label: dose.label } }, state)) ?? `${recipient.name}: ${dose.label}`} (more than one dose today)`);
        await target.actor.update({ [`flags.${MODULE_ID}.doses.${dose.key}`]: [...taken, now] });
    }
    // (A Speed of a new kind: Umbral Wings' fly Speed — an Effect with PF2e's BaseSpeed rule.)
    for (const speed of state.plan.item?.speeds ?? []) {
        if (!target.actor) break;
        // (One its switch turns off, Steamflight Pack's: the item's next activation ends it — its Effect gone, no new one.)
        // (Either of its activations: the Effect's origin is the item, else its name.)
        const fromItem = (effect) => (state.item.uuid ? effect.system?.context?.origin?.item === state.item.uuid : String(effect.name).startsWith(`${state.item.name}:`));
        const on = speed.toggle ? (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.speed === speed.type && fromItem(effect)) : [];
        if (on.length) {
            await target.actor.deleteEmbeddedDocuments("Item", on.map((effect) => effect.id));
            lines.push(`${recipient.name}: ${state.item.name}'s ${speed.type} Speed turned off`);
            continue;
        }
        await target.actor.createEmbeddedDocuments("Item", [speedEffectSource(speed, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${speedText(speed)}`);
    }
    // (A vision: Obsidian Goggles' darkvision — an Effect with PF2e's Sense rule.)
    for (const sense of state.plan.item?.senses ?? []) {
        if (!target.actor) break;
        // (One its user ends, Obsidian Goggles': the item's next activation deactivates it — its Effect gone, no new one.)
        const on = sense.toggle ? (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.sense === sense.selector && effect.flags[MODULE_ID].from === state.item.name) : [];
        if (on.length) {
            await target.actor.deleteEmbeddedDocuments("Item", on.map((effect) => effect.id));
            lines.push(`${recipient.name}: ${state.item.name}'s ${senseText({ selector: sense.selector }).toLowerCase()} deactivated`);
            continue;
        }
        await target.actor.createEmbeddedDocuments("Item", [senseEffectSource(sense, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${senseText(sense)}`);
    }
    // (Protection from heat or cold for its time, src/compiler/temperature.js: an Effect the environment module reads.)
    const temperature = state.plan.temperature;
    if (temperature?.counts && target.actor) {
        await target.actor.createEmbeddedDocuments("Item", [temperatureEffectSource(temperature, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${temperatureLine(temperature)}`);
    }
    // (What of the weather it ignores for its time, src/compiler/weather.js: an Effect the environment module reads.)
    if (state.plan.weatherIgnores && target.actor) {
        await target.actor.createEmbeddedDocuments("Item", [weatherEffectSource(state.plan.weatherIgnores, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${weatherLine(state.plan.weatherIgnores)}`);
    }
    // (A fall it eases for its time, src/compiler/falls.js: an Effect the environment module reads.)
    if (state.plan.fall && target.actor) {
        await target.actor.createEmbeddedDocuments("Item", [fallEffectSource(state.plan.fall, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${fallLine(state.plan.fall)}`);
    }
    // (Temporary Hit Points from the targeted creature's level: Bloodthirsty's twice the level of the creature it reduced to 0 —
    // the ability module's own temporary Hit Points, with their time.)
    for (const entry of state.plan.item?.levelTemp ?? []) {
        // (From the amount typed: its multiple, rounded down, at most its maximum.)
        if (entry.from === "amount") {
            const amount = Math.min(Math.floor(entry.multiplier * state.amount), entry.max ?? Infinity);
            const ability = game.modules.get(ABILITY_ID)?.api?.live;
            if (amount > 0 && ability?.applyChange && target.actor) {
                const said = await ability.applyChange(entry.heal ? { op: "heal", target: DRINKER_ID, amount } : { op: "tempHp", target: DRINKER_ID, amount, duration: entry.duration ?? null }, abilityState(state));
                lines.push(`${said ?? `${recipient.name}: ${amount} ${entry.heal ? "Hit Points regained" : "temporary Hit Points"}`} (from ${entry.of}: ${state.amount})`);
            } else lines.push(`${recipient.name}: ${levelTempText(entry)} — ${amount > 0 ? "apply it by hand" : "none from that amount"}.`);
            continue;
        }
        const level = Number(others[0]?.actor?.level);
        const amount = Number.isFinite(level) ? Math.floor(entry.multiplier * level) : 0;
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        if (amount > 0 && ability?.applyChange && target.actor) {
            // (Or Hit Points regained: Holy's Holy Healing.)
            const said = await ability.applyChange(entry.heal ? { op: "heal", target: DRINKER_ID, amount } : { op: "tempHp", target: DRINKER_ID, amount, duration: entry.duration ?? null }, abilityState(state));
            lines.push(`${said ?? `${recipient.name}: ${amount} ${entry.heal ? "Hit Points regained" : "temporary Hit Points"}`} (from ${others[0].name}, level ${level})`);
        } else lines.push(`${recipient.name}: ${levelTempText(entry)} — ${others[0] ? `${others[0].name}'s level gives none` : "no creature targeted"}; apply it by hand.`);
    }
    // (Fruit it grows, Verdant Branch's: consumables in its user's inventory, each eaten for its healing — the module's own heal then.)
    if (state.plan.item?.creates && target.actor) {
        const creates = state.plan.item.creates;
        const count = /d/.test(String(creates.count)) ? (await new Roll(String(creates.count)).evaluate()).total : Number(creates.count) || 1;
        await target.actor.createEmbeddedDocuments("Item", [createdItemSource(creates, { count, level: Number(state.plan.item?.level) || 0, worldTime: game.time.worldTime, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${count} ${creates.name} in the inventory`);
    }
    // (A light its user sheds: Sprite Apple's — an Effect with PF2e's TokenLight rule. One with no time is put out by the item's next
    // activation, Candlecap's "Activating the candlecap again douses the light": its lit Effect gone, no new one.)
    for (const picked of state.plan.item?.light ?? []) {
        if (!target.actor) break;
        // (Its radius picked, Twilight Lantern's: the light it sheds now replaced by one of the radius typed, not put out.)
        const light = picked.pick && Number.isFinite(state.amount) ? { ...picked, dim: state.amount } : picked;
        const lit = light.duration?.mode === "fixed" ? [] : (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.light && effect.flags[MODULE_ID].from === state.item.name);
        if (lit.length && light.pick) await target.actor.deleteEmbeddedDocuments("Item", lit.map((effect) => effect.id));
        else if (lit.length) {
            await target.actor.deleteEmbeddedDocuments("Item", lit.map((effect) => effect.id));
            lines.push(`${recipient.name}: ${state.item.name}'s light put out`);
            continue;
        }
        await target.actor.createEmbeddedDocuments("Item", [lightEffectSource(light, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${lightText(light)}`);
    }
    // (A skill its user picked when the item was made: Words of Wisdom's phrase — its bonus and better degree, an Effect.)
    if (state.plan.item?.skillPick && target.actor) {
        await target.actor.createEmbeddedDocuments("Item", [skillPickEffectSource(state.plan.item.skillPick, state.skillPick ?? 0, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${state.plan.item.skillPick.skills[state.skillPick ?? 0]} too`);
    }
    // (A condition's penalty ignored for a while: Chilled Fire Noodles' Fatigued — an Effect with PF2e's AdjustModifier suppressing it.)
    for (const entry of state.plan.item?.suppress ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [suppressEffectSource(entry, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${suppressText(entry)}`);
    }
    // (A time's first critical failure made a failure: Lockpicker's Oil — an Effect the first roll it changes removes.)
    if (state.plan.item?.firstDegree && target.actor) {
        await target.actor.createEmbeddedDocuments("Item", [firstDegreeEffectSource(state.plan.item.firstDegree, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${firstDegreeText(state.plan.item.firstDegree)}`);
    }
    // (Extra damage on its user's Strikes: Martial Mayhem Mutagen's precision damage against off-guard creatures — PF2e's DamageDice.)
    // (A bonus for the creatures in the light it sheds, Sprite Apple's: the ability module's zone on the recipient's token for the light's time.)
    if (state.plan.item?.lightAura && target.actor) {
        const aura = state.plan.item.lightAura;
        const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
        const words = aura.modifiers.map((modifier) => modifierText({ ...modifier, duration: null })).join(", ");
        if (startZone && target.token) {
            await startZone({ item: { name: state.item.name, uuid: state.item.uuid ?? null, actor: target.actor }, plan: { builtin: "zone", source: state.plan.source, zone: lightAuraZone(aura) }, sourceToken: target.token });
            lines.push(`${recipient.name}'s light, ${aura.radius} feet: each creature in it gets ${words}`);
        } else lines.push(`${recipient.name}'s light, ${aura.radius} feet: ${words} for each creature in it (by hand).`);
    }
    // (What each melee attack roll sets off while it lasts, Martial Mayhem Mutagen's: a watch Effect on the recipient, its earlier one gone.)
    if (state.plan.item?.attackRiders && target.actor) {
        const old = (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.attackRiders?.item?.name === state.item.name);
        if (old.length) await target.actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
        // (A whetstone's: the weapon picked on the card.)
        const weapon = state.plan.item.attackRiders.riders.some((rider) => rider.weapon) ? state.weapons?.[state.runeWeapon ?? 0] ?? null : null;
        if (state.plan.item.attackRiders.riders.some((rider) => rider.weapon) && !weapon?.id) lines.push(`${recipient.name}: no weapon for ${state.item.name}.`);
        else {
            await target.actor.createEmbeddedDocuments("Item", [attackRidersEffectSource(state.plan.item.attackRiders, { item: state.item, user: state.user, weapon, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null })]);
            lines.push(`${recipient.name}: ${attackRidersText(state.plan.item.attackRiders.riders, weapon?.name ?? null)}`);
        }
    }
    // (The creature its bonuses are against: a TokenMark Effect at it, the item's earlier mark gone.)
    if (state.plan.item?.mark && others[0]?.token && target.actor) {
        const mark = state.plan.item.mark;
        const old = (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.mark === mark.slug);
        if (old.length) await target.actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
        await target.actor.createEmbeddedDocuments("Item", [markEffectSource(mark, { token: others[0].token.uuid, name: others[0].name, item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${markText(mark, others[0].name)}`);
    }
    for (const extra of state.plan.item?.strikeDamage ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [strikeDamageEffectSource(extra, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${strikeDamageText(extra)}`);
    }
    // (A change to its user's weapons: Magnifying Scope's range increment — an Effect with PF2e's AdjustStrike.)
    for (const adjust of state.plan.item?.weapon ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [weaponEffectSource(adjust, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${weaponText(adjust)}`);
    }
    // (An unarmed attack it grants: Ring of the Tiger's claw — an Effect with PF2e's Strike rule.)
    for (const attack of state.plan.item?.attacks ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [attackEffectSource(attack, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID, actor: target.actor })]);
        lines.push(`${recipient.name}: ${attackText(attack)}`);
    }
    // (A shield's other form, Sapling Shield's tower shield — an Effect with PF2e's ItemAlteration; activated again, back to its own form.)
    const form = state.plan.item?.shieldForm;
    if (form && target.actor) {
        const shieldId = /\.Item\.([A-Za-z0-9]+)$/.exec(String(state.item.uuid ?? ""))?.[1] ?? null;
        const current = (target.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.shieldForm === shieldId);
        if (current.length) {
            await target.actor.deleteEmbeddedDocuments("Item", current.map((effect) => effect.id));
            lines.push(`${recipient.name}: the shield is its own form again`);
        } else {
            await target.actor.createEmbeddedDocuments("Item", [shieldFormEffectSource(form, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${recipient.name}: ${shieldFormText(form)}`);
        }
    }
    // (Fast healing: Infernal Health's 25 a turn — an Effect with PF2e's FastHealing rule.)
    for (const healing of state.plan.item?.fastHealing ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [fastHealingEffectSource(healing, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${fastHealingText(healing)}`);
    }
    // (A rune it lends a weapon: Burial Oil's Vitalizing — an Effect with PF2e's AdjustStrike on that weapon.)
    const lent = state.plan.item?.rune;
    const picked = lent?.choices?.length ? lent.choices[state.runeChoice ?? 0] ?? lent.choices[0] : null;
    const rune = picked ? { ...lent, key: picked.key, name: picked.name, ...(picked.traits ? { traits: picked.traits } : {}), picked: true } : lent;
    if (rune && user.actor) {
        // (The item itself: its name without its activation's, "Boughshatter: Absorb Corruption" → "Boughshatter".)
        const weapon = rune.own ? { id: state.item.uuid?.split(".Item.").at(-1) ?? null, name: String(state.item.name).replace(/: .*$/, "") } : state.weapons[state.runeWeapon ?? 0];
        const key = runeKeyOf(rune);
        if (!key) lines.push(`${state.item.name}: PF2e has no ${rune.name} rune; apply it by hand.`);
        else if (weapon?.id) {
            // (A new coat in place of the last, Bane Oil's "Any new application of this oil supersedes any previous one": that weapon's earlier one gone.)
            const earlier = rune.supersedes ? (user.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.rune === key && effect.flags[MODULE_ID].weaponId === weapon.id).map((effect) => effect.id) : [];
            if (earlier.length) await user.actor.deleteEmbeddedDocuments("Item", earlier);
            await user.actor.createEmbeddedDocuments("Item", [runeEffectSource(rune, { key, weapon, item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${state.user.name}: ${runeText(rune, weapon.name)}`);
        }
    }
    // (A weapon its user treats as their best: Blade Phantom's Guide — an Effect with PF2e's MartialProficiency for that weapon at the user's
    // highest weapon proficiency rank.)
    const loan = state.plan.item?.proficiency;
    if (loan && user.actor) {
        const weapon = state.weapons?.[state.runeWeapon ?? 0];
        const rank = Math.max(0, ...Object.values(user.actor.system?.proficiencies?.attacks ?? {}).map((entry) => Number(entry?.rank) || 0));
        if (!weapon?.id) lines.push(`${state.user.name}: no weapon for ${state.item.name}.`);
        else {
            await user.actor.createEmbeddedDocuments("Item", [proficiencyEffectSource(loan, { weapon, rank, item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${state.user.name}: ${proficiencyText(loan, weapon.name)} (rank ${rank})`);
        }
    }
    // (A potion it holds: PF2e's own use of it — its card follows, the potion used up.)
    const patch = state.plan.item?.patch;
    if (patch && user.actor) {
        const entry = state.potions[state.potionPick ?? 0];
        const potion = user.actor.items?.get?.(entry.id) ?? null;
        if (!potion?.consume) lines.push(`${state.user.name}: ${entry.name} isn't there to use any more.`);
        else {
            await potion.consume();
            lines.push(`${state.user.name}: ${entry.name} used through the patch (its card follows)`);
        }
    }
    // (Another of its activations recharged, Smoldering Armor's Fire Shield: that one's uses given back on the item's record.)
    const recharges = state.plan.item?.recharges;
    if (recharges) {
        const owner = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
        const record = owner?.getFlag?.(MODULE_ID, USES) ?? {};
        if (owner && record[recharges.index]) {
            // (Foundry merges a flag's object, so the key is deleted by name.)
            await owner.update({ [`flags.${MODULE_ID}.${USES}.-=${recharges.index}`]: null });
            lines.push(`${state.item.name}: the ${recharges.name} activation recharges`);
        } else lines.push(`${state.item.name}: the ${recharges.name} activation hasn't been used, nothing to recharge`);
    }
    // (The alchemical item installed in it: an Effect with its numbers, its damage to the creatures around, the item used up.)
    const installed = state.plan.item?.installed;
    if (installed && user.actor) {
        const entry = state.installed[state.installedPick ?? 0];
        const owned = user.actor.items?.get?.(entry.id) ?? null;
        await user.actor.createEmbeddedDocuments("Item", [installedEffectSource(installed, entry, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${state.user.name}: ${installedText(installed, entry)}`);
        if (installed.damage && entry.splash > 0) {
            const DamageRoll = damageRollClass();
            const around = user.token ? creaturesNear(user.token, installed.damage.radius) : [];
            for (const other of around) {
                const { token, actor } = await creatureOf(other);
                if (!actor) continue;
                await actor.applyDamage({ damage: await new DamageRoll(`${entry.splash}[${installed.damage.type}]`).evaluate(), token: token ?? undefined });
            }
            lines.push(around.length ? `${entry.splash} ${installed.damage.type} damage to ${around.map((other) => other.name).join(", ")}` : `no other creature within ${installed.damage.radius} feet`);
        }
        const quantity = Number(owned?.system?.quantity) || 1;
        if (owned) await (quantity > installed.count ? owned.update({ "system.quantity": quantity - installed.count }) : owned.delete());
    }
    // (A condition until the end of the user's rage: an Effect granting it, gone when the Rage ends — only while raging.)
    // (Fast healing at half its user's level: that level's, now.)
    const rageItem = state.plan.item?.untilRage;
    const untilRage = rageItem?.fastHealing?.half && target.actor ? { ...rageItem, fastHealing: { value: Math.max(1, Math.floor((Number(target.actor.level) || 0) / 2)) } } : rageItem;
    if (untilRage && target.actor) {
        if (!isRaging(target.actor)) lines.push(`${recipient.name} isn't raging: no ${untilRageText(untilRage)}.`);
        else {
            const uuids = await Promise.all(untilRage.conditions.map((entry) => conditionUuid(entry.slug)));
            await target.actor.createEmbeddedDocuments("Item", [untilRageEffectSource(untilRage, uuids, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${recipient.name}: ${untilRageText(untilRage)}`);
        }
    }
    // (The conditions it lowers: Lion Badge's frightened, by 1 — PF2e's decreaseCondition, once for each, "to 0" removing it;
    // one of several as picked; another's on each creature the presser targets.)
    // (One a condition it also ends was overriding — Restrained over Grabbed — is ended on a second pass, once it shows.)
    const unmasked = [];
    const still = [];
    for (const entry of reduce) {
        // (Of those its user has, none: Armbands of the Gorgon with no condition on it.)
        if (entry.held && !(entry.choose ?? []).length) {
            lines.push(`${recipient.name} has no condition to remove.`);
            continue;
        }
        const slug = entry.choose ? entry.choose[state.reduceChoice ?? 0] ?? entry.choose[0] : entry.slug;
        const creatures = entry.who === "targets" ? others : [{ actor: target.actor, name: recipient.name }];
        for (const creature of creatures) {
            // (One a magical Effect of that level or higher gives, Break Bonds' exception: it stays.)
            if (entry.unlessMagical && sparedBy(granterOf(creature.actor, slug), entry.unlessMagical)) {
                lines.push(`${creature.name} stays ${slug} (${granterOf(creature.actor, slug).name}: magical, level ${entry.unlessMagical} or higher)`);
                continue;
            }
            const line = await lowerCondition(creature.actor, creature.name, slug, entry.by);
            // (Of a list it ends — Cayden's Tankard's six — only the ones there.)
            if (reduce.length <= 2 || !/: nothing to lower\.$/.test(line)) lines.push(line);
            else if (entry.by === "all") unmasked.push([creature, slug]);
            // (One another condition gave — Immobilized from Restrained — looked at again once the rest are done.)
            if (entry.by === "all" && / is still \S+$/.test(line)) still.push([creature, slug, lines.length - 1]);
        }
    }
    for (const [creature, slug] of unmasked) {
        if (!creature.actor?.hasCondition?.(slug)) continue;
        lines.push(await lowerCondition(creature.actor, creature.name, slug, "all"));
    }
    for (const [creature, slug, at] of still) if (!creature.actor?.hasCondition?.(slug)) lines[at] = `${creature.name} is no longer ${slug}`;
    // (The Speed penalties it ends with them, scripts/speed-penalties.js: its user's, and the creatures targeted when the text says so.)
    const speedEnds = state.plan.item?.speedPenaltiesEnd;
    if (speedEnds) for (const creature of [{ actor: target.actor, name: recipient.name }, ...(speedEnds.targets ? others : [])]) lines.push(...await endSpeedPenalties(creature.actor, creature.name, speedEnds));
    // (Its flat check to end persistent damage: PF2e's own recovery roll for each of those types, at the text's DC when it's
    // lower — Quenching Potion's 10 — then the condition's own DC again if it stays.)
    if (state.plan.item?.recovery) {
        const recovery = state.plan.item.recovery;
        const picked = recovery.choose ? { ...recovery, choose: false, types: [recovery.types[state.recoveryType ?? 0] ?? recovery.types[0]] } : recovery;
        // (Another creature's, when the card's recipient is its user: each creature targeted.)
        const theirs = recovery.who === "targets" && state.plan.item?.recipient !== "targets";
        const creatures = theirs ? others : [{ actor: target.actor, name: recipient.name }];
        if (!creatures.length) lines.push("Its flat check is for the creature touched: target it and use the card again, or roll it by hand.");
        for (const creature of creatures) lines.push(...await recover(creature.actor, creature.name, picked));
        // (A new save against its kind of affliction too, Quenching Potion's poisons: scripts/foundry.js.)
        if (recovery.afflictionSave) for (const creature of creatures) lines.push(...await afflictionSaves(creature.actor, creature.name, recovery.afflictionSave));
    }
    // (Restored outright: Elixir of Rejuvenation's maximum Hit Points — PF2e's healing of what's missing — and its afflictions of a
    // level or lower, PF2e's affliction items, deleted.)
    const restore = state.plan.item?.restore;
    if (restore?.hp === "max") {
        const hp = target.actor.system?.attributes?.hp ?? {};
        const missing = (Number(hp.max) || 0) - (Number(hp.value) || 0);
        lines.push(missing > 0 ? await heal(target, recipient.name, missing, state) : `${recipient.name} is at its maximum Hit Points already`);
    }
    // (PF2e's affliction items and Pseudo Afflictions' Effects: scripts/foundry.js afflictionsOf.)
    if (restore?.afflictions) {
        const gone = afflictionsOf(target.actor).filter((affliction) => affliction.level <= restore.afflictions.level);
        await removeAfflictions(target.actor, gone.map((affliction) => affliction.id));
        lines.push(gone.length ? `${recipient.name}: ${gone.map((affliction) => affliction.name).join(", ")} removed` : `${recipient.name} has no afflictions to remove`);
    }
    // (The Tea Ceremony's removed conditions: Longnight Tea's fatigued.)
    if (state.ceremony) for (const slug of state.plan.item?.ceremony?.removes ?? []) {
        if (!target.actor?.hasCondition?.(slug)) continue;
        await target.actor.decreaseCondition(slug, { forceRemove: true });
        lines.push(`${recipient.name} is no longer ${slug} (the Tea Ceremony)`);
    }
    return lines;
}


// The item's PF2e Effect on the creature: its grade, the spell's rank, the item's time.
async function nativeEffect(actor, name, change, state) {
    if (!actor) return null;
    const template = await fromUuid(change.effect.uuid).catch(() => null);
    if (!template) return `${name}: ${change.effect.label ?? "the effect"} wasn't found; apply it by hand.`;
    // (A third-party module's own Effect: applied only when its rules are what the item's text says, src/compiler/verify-effect.js;
    // else a note of the text, for the Effect's time.)
    const linked = applicationFor(state.plan, change);
    // (Or whatever the check says, the Effects the user chose to have applied: src/compiler/verify-effect.js APPLIED_ANYWAY.)
    if (linked?.verify && !appliedAnyway(change.effect.uuid)) {
        const data = template.toObject?.() ?? template;
        const conditionNames = Object.fromEntries((data.system?.rules ?? []).filter((rule) => rule.key === "GrantItem" && rule.uuid).map((rule) => {
            let granted = null;
            try {
                granted = fromUuidSync(rule.uuid);
            } catch {
                granted = null;
            }
            return [String(rule.uuid).split(".").at(-1), granted?.name ?? null];
        }).filter(([, value]) => value));
        const verdict = verifyEffectRules(data.system?.rules ?? [], linked.verify, { conditionNames });
        if (!verdict.ok) {
            const ability = game.modules.get(ABILITY_ID)?.api?.live;
            const time = data.system?.duration;
            const duration = time?.unit && time.unit !== "unlimited" ? { mode: "fixed", value: Number(time.value) || 1, unit: time.unit, expiry: time.expiry ?? "turn-start", anchor: "effect-start" } : null;
            if (ability?.applyChange) await ability.applyChange({ op: "effect", target: DRINKER_ID, effect: { kind: "note", note: { label: state.item.name, text: plainText(linked.verify), duration } } }, abilityState(state));
            return `${name}: ${template.name} wasn't applied, since its rules don't match the item's text (${verdict.failures.map((failure) => failure.why).join("; ")}). A note of the text instead.`;
        }
    }
    // (Rage, src/compiler/rage.js: only a creature with PF2e's Rage action, not raging already.)
    if (linked?.rage) {
        if (!(actor.itemTypes?.action ?? []).some((action) => action.slug === "rage")) return `${name} has no Rage action: no Rage.`;
        if ((actor.itemTypes?.effect ?? []).some((effect) => effect.slug === "effect-rage" || effect._stats?.compendiumSource === change.effect.uuid)) return `${name} is already raging: no new Rage.`;
    }
    // (A tea's Tea Ceremony: its longer time, and PF2e's ceremony choice preset either way.)
    const ceremony = state.ceremony === null || state.ceremony === undefined ? null : Boolean(state.ceremony);
    const application = applicationFor(state.plan, change);
    const time = ceremony ? state.plan.item?.ceremony?.duration ?? null : null;
    const source = effectSource(template.toObject(), {
        application: time ? { ...(application ?? {}), duration: time } : application,
        ceremony,
        item: state.item,
        user: state.user,
        worldTime: game.time.worldTime,
        initiative: startInitiative(actor),
        // (Its temporary immunity from when this Effect ends, Starsong Nectar's: given then, scripts/immunity.js.)
        flags: { [MODULE_ID]: { card: true, ...(state.plan.item?.immunity?.after ? { immunityAfter: state.plan.item.immunity } : {}) } }
    });
    source._stats = { ...(source._stats ?? {}), compendiumSource: change.effect.uuid };
    await actor.createEmbeddedDocuments("Item", [source]);
    return `${name} gains ${template.name}`;
}
