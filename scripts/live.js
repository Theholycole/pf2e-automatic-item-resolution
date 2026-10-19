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

import { abilityState, applicationFor, cardHTML, chosenResistances, createItemCard, DRINKER_ID, effectSource, recipientOf, recoveryText, resistanceEffectSource, resistanceText, rolledHealing, runeEffectSource, runeText, senseEffectSource, lightEffectSource, lightText, levelTempText, untilRageEffectSource, untilRageText, senseText, speedEffectSource, speedText, rollFormula, USER_ID, weaponEffectSource, weaponText, attackEffectSource, attackText, fastHealingEffectSource, fastHealingText, shieldFormEffectSource, shieldFormText, strikeDamageEffectSource, strikeDamageText, skillPickEffectSource, firstDegreeEffectSource, firstDegreeText, suppressEffectSource, suppressText } from "../src/live/card.js";
import { ABILITY_ID, CORE_ID, FLAG, MODULE_ID, SOCKET, afflictionsOf, creatureOf, creaturesNear, entryOf, isActiveGM, lowerCondition, mayApply, ownerDCsOf, ownerOf, removeAfflictions, startInitiative, stateOf } from "./foundry.js";
import { fillOwnerDCs, hasOwnerDC } from "../src/compiler/item-data.js";
import { applyBombCard, cardForBomb, hideCoveredSplash, rememberDeletedBomb } from "./bombs.js";
import { applyExposureCard, applyPoisonCard, postExposureCard, postPoisonCard, strikeWithPoison } from "./poisons.js";
import { applyCastCard, postCastCard } from "./casts.js";
import { needsTargets } from "../src/live/cast-card.js";
import { startItemConjure, startItemZone } from "./zones.js";
import { applyFocusCard, loseUnspentFocus, postFocusCard } from "./focus.js";
import { applyFortuneCard, fortuneRolled, postFortuneCard } from "./fortune.js";
import { firstDegreeRolled } from "./first-degree.js";
import { applyWaysCard, postWaysCard } from "./ways.js";
import { applyStrikeCard, postStrikeCard, strikeWithRider } from "./strikes.js";
import { applyRerollCard, postRerollCard } from "./rerolls.js";
import { applyActionCard, postActionCard } from "./item-actions.js";
import { applyCounteractCard, postCounteractCard } from "./counteract.js";
import { applyToggleCard, postToggleCard, togglesAfterDamage, togglesAtTurnEnd, togglesOnMove } from "./toggle.js";
import { activate, indexOf, setUpActivations } from "./activations.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";
import { verifyEffectRules } from "../src/compiler/verify-effect.js";
import { isUnloadedSpellgun, restoreUnloaded } from "./generic-items.js";
import { strikeWithRunes } from "./rune-strikes.js";
import { chargeSpellstrike, strikeWithSpellstrike } from "./spellstrike.js";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

let compile = null;
// The last dose's item, kept as PF2e deletes it (its Use message can arrive after): uuid → { data, actor }.
const deleted = new Map();

export function setUpLivePlay({ compileItem, compileActivations = null, claims = null, runeRiders = null }) {
    compile = compileItem;
    setUpActivations({ compileActivations, postCardFor });
    Hooks.on("deleteItem", (item) => {
        rememberDeletedBomb(item);
        // (A Rage ends: what the item gave until then goes with it — Barbarians+ crowns' quickened.)
        if (isActiveGM() && item?.type === "effect" && (item.slug === "effect-rage" || item.name === "Effect: Rage") && item.actor) {
            const ids = (item.actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.untilRage).map((effect) => effect.id);
            if (ids.length) item.actor.deleteEmbeddedDocuments("Item", ids).catch((error) => console.error(`${MODULE_ID} | rage end`, error));
        }
        if (item?.type !== "consumable") return;
        deleted.set(item.uuid, { data: { ...item.toObject(false), uuid: item.uuid }, actor: item.actor ?? null });
        setTimeout(() => deleted.delete(item.uuid), 30_000);
    });
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM()) return;
        cardForUse(message).catch((error) => console.error(`${MODULE_ID} | item card`, error));
        cardForBomb(message, { claims }).catch((error) => console.error(`${MODULE_ID} | bomb card`, error));
        strikeWithPoison(message).catch((error) => console.error(`${MODULE_ID} | poisoned Strike`, error));
        strikeWithRider(message).catch((error) => console.error(`${MODULE_ID} | readied Strike`, error));
        // (A weapon's property runes on a critical hit: scripts/rune-strikes.js.)
        strikeWithRunes(message, runeRiders).catch((error) => console.error(`${MODULE_ID} | rune riders`, error));
        // (A spell cast into Spellstrike Ammunition, at the creature its Strike hits: scripts/spellstrike.js.)
        strikeWithSpellstrike(message).catch((error) => console.error(`${MODULE_ID} | spellstrike`, error));
        fortuneRolled(message).catch((error) => console.error(`${MODULE_ID} | roll twice`, error));
        // (A time's first critical failure made a failure, its Effect gone after: scripts/first-degree.js.)
        firstDegreeRolled(message).catch((error) => console.error(`${MODULE_ID} | first critical failure`, error));
        // (An item's toggle on until its next damage roll: scripts/toggle.js.)
        togglesAfterDamage(message).catch((error) => console.error(`${MODULE_ID} | toggle off`, error));
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
// (A consumable's after PF2e's Use; a permanent item's activation from its button on the sheet, scripts/activations.js.)
export async function postCardFor({ message, plan, used, actor, token, origin = {} }) {
    // (A save against its user's own class or spell DC, src/compiler/item-data.js: that DC, as it is now. Without one, the GM rolls it.)
    if (hasOwnerDC(plan)) {
        const filled = fillOwnerDCs(plan, ownerDCsOf(actor));
        if (filled.missing) {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${escapeHTML(used.data.name)}</strong>: its save is against ${escapeHTML(actor.name)}'s class DC or spell DC, and ${escapeHTML(actor.name)} has neither. Roll it by hand.</p>` });
            return;
        }
        plan = filled.plan;
    }
    const route = routeOf(plan, plainText(used.data.system?.description?.value));
    // (An item that also counteracts on its drinker — Panacea Fruit heals too: its counteract card beside its own.)
    if (route !== "counteract" && plan?.item?.counteract) await postCounteractCard({ message, plan, used, actor, token }).catch((error) => console.error(`${MODULE_ID} | counteract card`, error));
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
        weapons: plan.item?.rune && !plan.item.rune.own ? (actor.itemTypes?.weapon ?? []).filter((weapon) => !weapon.isOfType?.("bomb") && weapon.system?.group !== "bomb").map((weapon) => ({ id: weapon.id, name: weapon.name })) : []
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
    if (state.kind === "expose" || state.kind === "item-action" || state.kind === "reroll") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean), ...(state.kind === "item-action" && state.plan.action?.slugs ? { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) } : {}), ...(state.kind === "expose" ? { damageChoice: Number(root.querySelector("[data-air-field='damageChoice']")?.value ?? state.damageChoice ?? 0), attackChoice: Number(root.querySelector("[data-air-field='attackChoice']")?.value ?? state.attackChoice ?? 0), checkChoice: Number(root.querySelector("[data-air-field='checkChoice']")?.value ?? state.checkChoice ?? 0) } : {}) };
    if (state.kind === "toggle" || state.kind === "ways") return { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) };
    // (A bonus for the creature targeted: the presser's targets.)
    if (state.kind === "fortune") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    // (A spell at others: the presser's own targets.)
    if (state.kind === "cast") return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), ceremony: Boolean(root.querySelector("[data-air-field='ceremony']")?.checked), resistType: Number(root.querySelector("[data-air-field='resistType']")?.value ?? state.resistType ?? 0), recoveryType: Number(root.querySelector("[data-air-field='recoveryType']")?.value ?? state.recoveryType ?? 0), reduceChoice: Number(root.querySelector("[data-air-field='reduceChoice']")?.value ?? state.reduceChoice ?? 0), runeWeapon: Number(root.querySelector("[data-air-field='runeWeapon']")?.value ?? state.runeWeapon ?? 0), runeChoice: Number(root.querySelector("[data-air-field='runeChoice']")?.value ?? state.runeChoice ?? 0), skillPick: Number(root.querySelector("[data-air-field='skillPick']")?.value ?? state.skillPick ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
}

const APPLY = {
    bomb: (message, choices) => applyBombCard(message, choices),
    poison: (message, choices) => applyPoisonCard(message, choices),
    cast: (message, choices) => applyCastCard(message, choices),
    expose: (message, choices) => applyExposureCard(message, choices),
    focus: (message) => applyFocusCard(message),
    fortune: (message, choices) => applyFortuneCard(message, choices),
    strike: (message) => applyStrikeCard(message),
    reroll: (message, choices) => applyRerollCard(message, choices),
    "item-action": (message, choices) => applyActionCard(message, choices),
    counteract: (message, choices) => applyCounteractCard(message, choices),
    toggle: (message, choices) => applyToggleCard(message, choices),
    ways: (message, choices) => applyWaysCard(message, choices, postCardFor),
    item: (message, choices) => applyCard(message, choices)
};
const applyByKind = (message, state, choices) => APPLY[state.kind](message, choices);

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
    const owner = sender.isGM || !!(await fromUuid(state.user.actorUuid).catch(() => null))?.testUserPermission?.(sender, "OWNER");
    if (!owner) return;
    const choices = state.kind === "bomb" ? { included: Array.isArray(data.included) ? data.included.map(Number) : null }
        : state.kind === "poison" ? { weapon: data.weapon }
        : state.kind === "cast" ? { drinker: data.drinker, choice: Number.isInteger(data.choice) ? data.choice : null, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "expose" || state.kind === "item-action" || state.kind === "reroll" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [], ...(state.kind === "item-action" && Number.isInteger(data.choice) ? { choice: data.choice } : {}), ...(state.kind === "expose" && Number.isInteger(data.damageChoice) ? { damageChoice: data.damageChoice } : {}), ...(state.kind === "expose" && Number.isInteger(data.attackChoice) ? { attackChoice: data.attackChoice } : {}), ...(state.kind === "expose" && Number.isInteger(data.checkChoice) ? { checkChoice: data.checkChoice } : {}) }
        : state.kind === "toggle" || state.kind === "ways" ? { choice: Number.isInteger(data.choice) ? data.choice : null }
        : state.kind === "fortune" ? { targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }
        : state.kind === "counteract" ? { drinker: Number.isInteger(data.drinker) ? data.drinker : null, rows: Array.isArray(data.rows) ? data.rows.map((row) => ({ ticked: Boolean(row?.ticked), dc: row?.dc ?? null, rank: row?.rank ?? null })) : null, ...(data.ownRank !== undefined ? { ownRank: data.ownRank === null ? null : String(data.ownRank) } : {}) }
        : { drinker: data.drinker, ceremony: Boolean(data.ceremony), resistType: Number.isInteger(data.resistType) ? data.resistType : null, recoveryType: Number.isInteger(data.recoveryType) ? data.recoveryType : null, reduceChoice: Number.isInteger(data.reduceChoice) ? data.reduceChoice : null, runeWeapon: Number.isInteger(data.runeWeapon) ? data.runeWeapon : null, runeChoice: Number.isInteger(data.runeChoice) ? data.runeChoice : null, skillPick: Number.isInteger(data.skillPick) ? data.skillPick : null, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] };
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

async function applyCard(message, { drinker = null, ceremony = false, resistType = null, recoveryType = null, reduceChoice = null, runeWeapon = null, runeChoice = null, skillPick = null, targets = [] } = {}) {
    let state = stateOf(message);
    if (!state || state.status !== "open") return null;
    // (The weapon picked for the rune it lends.)
    if (Number.isInteger(runeWeapon) && state.weapons?.[runeWeapon]) state = { ...state, runeWeapon };
    // (The rune picked of several.)
    if (Number.isInteger(runeChoice) && state.plan.item?.rune?.choices?.[runeChoice]) state = { ...state, runeChoice };
    if (state.plan.item?.rune && !state.plan.item.rune.own && !state.weapons?.length) throw new Error(`${state.user.name} has no weapon for ${state.item.name}.`);
    // (A condition it lowers on others: the creatures the presser targets, before anything is applied.)
    const reduce = state.plan.item?.reduce ?? [];
    // (Or its flat check, the creature its user touches: Nettle Balm's.)
    const others = reduce.some((entry) => entry.who === "targets") || state.plan.item?.recovery?.who === "targets" || state.plan.item?.levelTemp?.length ? await targetedCreatures(targets) : [];
    // (Temporary Hit Points from a creature's level: that creature targeted.)
    if (state.plan.item?.levelTemp?.length && !others.length) throw new Error("Target the creature first (the one its trigger names), then press Apply.");
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
    // (Another's conditions once, when the Effect went to each ally.)
    if (allies) for (const entry of reduce.filter((candidate) => candidate.who === "targets")) {
        const slug = entry.choose ? entry.choose[state.reduceChoice ?? 0] ?? entry.choose[0] : entry.slug;
        for (const creature of others) lines.push(await lowerCondition(creature.actor, creature.name, slug, entry.by));
    }
    const next = { ...state, status: "applied", results: lines.length ? lines : ["Nothing to apply."] };
    return message.update({ content: cardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// What the item card does for its recipient (its user, the drinker, or one of the allies targeted): the core's changes,
// then its resistance, Speeds, senses, the conditions it lowers, its flat check and the Tea Ceremony. → lines for the card.
async function applyToRecipient(state, { core, others = [], reduce = [] }) {
    const recipient = recipientOf(state);
    const user = await creatureOf(state.user);
    const target = await creatureOf(recipient);
    if (!target.actor) throw new Error(`${recipient.name} isn't there any more.`);
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
    const result = await core.registry.resolve(state.plan, context, io);
    const lines = [...rolledLines];
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
        } catch (error) {
            lines.push(`Couldn't apply ${change.op} to ${name}: ${error.message}`);
        }
    }
    // (Its resistance: Armorskin Robes' 5 to slashing and piercing — an Effect with PF2e's Resistance rules.)
    if (state.plan.item?.resist?.length && target.actor) {
        const resist = chosenResistances(state.plan.item.resist, state.resistType ?? 0);
        await target.actor.createEmbeddedDocuments("Item", [resistanceEffectSource(resist, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${resistanceText(resist)}`);
    }
    // (A Speed of a new kind: Umbral Wings' fly Speed — an Effect with PF2e's BaseSpeed rule.)
    for (const speed of state.plan.item?.speeds ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [speedEffectSource(speed, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${speedText(speed)}`);
    }
    // (A vision: Obsidian Goggles' darkvision — an Effect with PF2e's Sense rule.)
    for (const sense of state.plan.item?.senses ?? []) {
        if (!target.actor) break;
        await target.actor.createEmbeddedDocuments("Item", [senseEffectSource(sense, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        lines.push(`${recipient.name}: ${senseText(sense)}`);
    }
    // (Temporary Hit Points from the targeted creature's level: Bloodthirsty's twice the level of the creature it reduced to 0 —
    // the ability module's own temporary Hit Points, with their time.)
    for (const entry of state.plan.item?.levelTemp ?? []) {
        const level = Number(others[0]?.actor?.level);
        const amount = Number.isFinite(level) ? Math.floor(entry.multiplier * level) : 0;
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        if (amount > 0 && ability?.applyChange && target.actor) {
            // (Or Hit Points regained: Holy's Holy Healing.)
            const said = await ability.applyChange(entry.heal ? { op: "heal", target: DRINKER_ID, amount } : { op: "tempHp", target: DRINKER_ID, amount, duration: entry.duration ?? null }, abilityState(state));
            lines.push(`${said ?? `${recipient.name}: ${amount} ${entry.heal ? "Hit Points regained" : "temporary Hit Points"}`} (from ${others[0].name}, level ${level})`);
        } else lines.push(`${recipient.name}: ${levelTempText(entry)} — ${others[0] ? `${others[0].name}'s level gives none` : "no creature targeted"}; apply it by hand.`);
    }
    // (A light its user sheds: Sprite Apple's — an Effect with PF2e's TokenLight rule.)
    for (const light of state.plan.item?.light ?? []) {
        if (!target.actor) break;
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
    const rune = picked ? { ...lent, key: picked.key, name: picked.name, picked: true } : lent;
    if (rune && user.actor) {
        // (The item itself: its name without its activation's, "Boughshatter: Absorb Corruption" → "Boughshatter".)
        const weapon = rune.own ? { id: state.item.uuid?.split(".Item.").at(-1) ?? null, name: String(state.item.name).replace(/: .*$/, "") } : state.weapons[state.runeWeapon ?? 0];
        const key = runeKeyOf(rune);
        if (!key) lines.push(`${state.item.name}: PF2e has no ${rune.name} rune; apply it by hand.`);
        else if (weapon?.id) {
            await user.actor.createEmbeddedDocuments("Item", [runeEffectSource(rune, { key, weapon, item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${state.user.name}: ${runeText(rune, weapon.name)}`);
        }
    }
    // (A condition until the end of the user's rage: an Effect granting it, gone when the Rage ends — only while raging.)
    const untilRage = state.plan.item?.untilRage;
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
    for (const entry of reduce) {
        const slug = entry.choose ? entry.choose[state.reduceChoice ?? 0] ?? entry.choose[0] : entry.slug;
        const creatures = entry.who === "targets" ? others : [{ actor: target.actor, name: recipient.name }];
        for (const creature of creatures) {
            const line = await lowerCondition(creature.actor, creature.name, slug, entry.by);
            // (Of a list it ends — Cayden's Tankard's six — only the ones there.)
            if (reduce.length <= 2 || !/: nothing to lower\.$/.test(line)) lines.push(line);
        }
    }
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

// Healing through PF2e (its healing bonuses, its "healed" message with undo), then
// Dying ends at 1 Hit Point or more (the core's api.dying; PF2e leaves it to the table).
async function heal({ token, actor }, name, amount, state) {
    if (!actor || !(amount > 0)) return null;
    const dying = game.modules.get(CORE_ID)?.api?.dying;
    const wasDying = dying?.isDying(actor) ?? actor.hasCondition?.("dying") ?? false;
    const before = Number(actor.system?.attributes?.hp?.value) || 0;
    await actor.applyDamage({ damage: -amount, token: token ?? actor.getActiveTokens?.(true, true)?.[0] ?? undefined });
    const healed = (Number(actor.system?.attributes?.hp?.value) || 0) - before;
    const parts = [`${name} regains ${healed} Hit Points${healed < amount ? ` (of ${amount})` : ""}${state.rolled?.kind === "healing" ? ", PF2e's roll" : ""}`];
    if (wasDying && dying) {
        // (Magical Medal (Phoenix's Fire)'s "Your Wounded value does not increase": the core's keepWounded.)
        const revived = await dying.recoverFromDying(actor, wasDying, { keepWounded: Boolean(state.plan?.item?.keepWounded) });
        if (revived) parts.push(dying.revivedNote(revived));
    } else if (wasDying) parts.push("It was dying: end Dying and raise Wounded by hand.");
    return parts.join(". ");
}

// The item's PF2e Effect on the creature: its grade, the spell's rank, the item's time.
// The recovery check for each persistent damage of the item's types: PF2e's condition.rollRecovery, which deletes it on a
// success (without waiting for that, so a moment is given for it). → lines for the card.
async function recover(actor, name, recovery) {
    const persistent = () => (actor?.itemTypes?.condition ?? []).filter((condition) => condition.slug === "persistent-damage" && recovery.types.includes(condition.system?.persistent?.damageType));
    const found = persistent();
    if (!found.length) return [`${name} has no persistent ${recoveryText(recovery).replace(/^.* persistent /, "")}: no flat check.`];
    const lines = [];
    for (const condition of found) {
        // (Its name before a lower DC renames it: "Persistent Damage (1d6 fire)".)
        const label = condition.name;
        const usual = Number(condition.system.persistent.dc) || 15;
        const dc = recovery.dc && recovery.dc < usual ? recovery.dc : usual;
        if (dc !== usual) await condition.update({ "system.persistent.dc": dc });
        await condition.rollRecovery();
        const stays = () => persistent().some((entry) => entry.id === condition.id);
        for (let wait = 0; wait < 20 && stays(); wait++) await new Promise((resolve) => setTimeout(resolve, 50));
        if (stays() && dc !== usual) await condition.update({ "system.persistent.dc": usual });
        lines.push(stays() ? `${name}: the flat check (DC ${dc}) didn't end ${label}` : `${name}: ${label} ended (flat check, DC ${dc})`);
    }
    return lines;
}

async function nativeEffect(actor, name, change, state) {
    if (!actor) return null;
    const template = await fromUuid(change.effect.uuid).catch(() => null);
    if (!template) return `${name}: ${change.effect.label ?? "the effect"} wasn't found; apply it by hand.`;
    // (A third-party module's own Effect: applied only when its rules are what the item's text says, src/compiler/verify-effect.js;
    // else a note of the text, for the Effect's time.)
    const linked = applicationFor(state.plan, change);
    if (linked?.verify) {
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
        flags: { [MODULE_ID]: { card: true } }
    });
    source._stats = { ...(source._stats ?? {}), compendiumSource: change.effect.uuid };
    await actor.createEmbeddedDocuments("Item", [source]);
    return `${name} gains ${template.name}`;
}
