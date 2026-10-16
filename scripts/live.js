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

import { abilityState, applicationFor, cardHTML, chosenResistances, createItemCard, DRINKER_ID, effectSource, recipientOf, recoveryText, resistanceEffectSource, resistanceText, rolledHealing, runeEffectSource, runeText, senseEffectSource, senseText, speedEffectSource, speedText, rollFormula, USER_ID } from "../src/live/card.js";
import { ABILITY_ID, CORE_ID, FLAG, MODULE_ID, SOCKET, creatureOf, creaturesNear, entryOf, isActiveGM, mayApply, startInitiative, stateOf } from "./foundry.js";
import { applyBombCard, cardForBomb, hideCoveredSplash, rememberDeletedBomb } from "./bombs.js";
import { applyExposureCard, applyPoisonCard, postExposureCard, postPoisonCard, strikeWithPoison } from "./poisons.js";
import { applyCastCard, postCastCard } from "./casts.js";
import { needsTargets } from "../src/live/cast-card.js";
import { startItemZone } from "./zones.js";
import { applyFocusCard, loseUnspentFocus, postFocusCard } from "./focus.js";
import { applyFortuneCard, fortuneRolled, postFortuneCard } from "./fortune.js";
import { applyStrikeCard, postStrikeCard, strikeWithRider } from "./strikes.js";
import { applyRerollCard, postRerollCard } from "./rerolls.js";
import { applyActionCard, postActionCard } from "./item-actions.js";
import { applyCounteractCard, postCounteractCard } from "./counteract.js";
import { applyToggleCard, postToggleCard } from "./toggle.js";
import { activate, setUpActivations } from "./activations.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";
import { verifyEffectRules } from "../src/compiler/verify-effect.js";

let compile = null;
// The last dose's item, kept as PF2e deletes it (its Use message can arrive after): uuid → { data, actor }.
const deleted = new Map();

export function setUpLivePlay({ compileItem, compileActivations = null, claims = null }) {
    compile = compileItem;
    setUpActivations({ compileActivations, postCardFor });
    Hooks.on("deleteItem", (item) => {
        rememberDeletedBomb(item);
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
        fortuneRolled(message).catch((error) => console.error(`${MODULE_ID} | roll twice`, error));
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
        hideCovered(message, html);
        wireCard(message, html);
    });
    // (A Focus Point an activation gave, lost at the end of the turn if unspent: scripts/focus.js.)
    Hooks.on("pf2e.endTurn", (combatant, encounter) => {
        loseUnspentFocus(combatant, encounter).catch((error) => console.error(`${MODULE_ID} | unspent Focus Point`, error));
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
    const plan = compile(used.data);
    const actor = used.actor ?? message.actor;
    if (!actor) return;
    const token = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    return postCardFor({ message, plan, used, actor, token, origin });
}

// The card for a plan (src/live/route.js): an injury poison's weapon to coat (scripts/poisons.js); a contact, inhaled or
// ingested poison's exposure, or another item's save on its Use (Spark Wafer, Pyronite), for the creatures targeted; a spell
// PF2e has no Effect for, cast by the spell module (scripts/casts.js); a zone (scripts/zones.js); a Focus Point
// (scripts/focus.js); a readied Strike (scripts/strikes.js); a reroll (scripts/rerolls.js); a roll twice (scripts/fortune.js); a skill action
// (scripts/item-actions.js); else the item card below.
// (A consumable's after PF2e's Use; a permanent item's activation from its button on the sheet, scripts/activations.js.)
export async function postCardFor({ message, plan, used, actor, token, origin = {} }) {
    const route = routeOf(plan, plainText(used.data.system?.description?.value));
    // (An item that also counteracts on its drinker — Panacea Fruit heals too: its counteract card beside its own.)
    if (route !== "counteract" && plan?.item?.counteract) await postCounteractCard({ message, plan, used, actor, token }).catch((error) => console.error(`${MODULE_ID} | counteract card`, error));
    if (route === "counteract") return postCounteractCard({ message, plan, used, actor, token });
    if (route === "coat") return postPoisonCard({ message, plan, used, actor, token });
    if (route === "expose" || route === "save" || route === "later") return postExposureCard({ message, plan, used, actor, token, later: route === "later" });
    if (route === "cast") return postCastCard({ message, plan, used, actor, token });
    if (route === "zone") return startItemZone({ plan, used, actor, token });
    if (route === "focus") return postFocusCard({ message, plan, used, actor, token });
    if (route === "strike") return postStrikeCard({ message, plan, used, actor, token });
    if (route === "reroll") return postRerollCard({ message, plan, used, actor, token });
    if (route === "fortune") return postFortuneCard({ message, plan, used, actor, token });
    if (route === "action") return postActionCard({ message, plan, used, actor, token });
    if (route === "toggle") return postToggleCard({ message, plan, used, actor, token });
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
        : { rows: state.rows.map((row, index) => ({ ticked: Boolean(root.querySelector(`[data-air-row="${index}"]`)?.checked), dc: root.querySelector(`[data-air-dc="${index}"]`)?.value ?? null, rank: root.querySelector(`[data-air-rank="${index}"]`)?.value ?? null })) };
    if (state.kind === "poison") return { weapon: Number(root.querySelector("[data-air-field='weapon']")?.value ?? state.weapon ?? 0) };
    if (state.kind === "expose" || state.kind === "item-action" || state.kind === "reroll") return { targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean), ...(state.kind === "item-action" && state.plan.action?.slugs ? { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) } : {}), ...(state.kind === "expose" ? { damageChoice: Number(root.querySelector("[data-air-field='damageChoice']")?.value ?? state.damageChoice ?? 0), attackChoice: Number(root.querySelector("[data-air-field='attackChoice']")?.value ?? state.attackChoice ?? 0), checkChoice: Number(root.querySelector("[data-air-field='checkChoice']")?.value ?? state.checkChoice ?? 0) } : {}) };
    if (state.kind === "toggle") return { choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0) };
    // (A spell at others: the presser's own targets.)
    if (state.kind === "cast") return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), choice: Number(root.querySelector("[data-air-field='choice']")?.value ?? state.choice ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
    return { drinker: Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0), ceremony: Boolean(root.querySelector("[data-air-field='ceremony']")?.checked), resistType: Number(root.querySelector("[data-air-field='resistType']")?.value ?? state.resistType ?? 0), reduceChoice: Number(root.querySelector("[data-air-field='reduceChoice']")?.value ?? state.reduceChoice ?? 0), runeWeapon: Number(root.querySelector("[data-air-field='runeWeapon']")?.value ?? state.runeWeapon ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
}

const APPLY = {
    bomb: (message, choices) => applyBombCard(message, choices),
    poison: (message, choices) => applyPoisonCard(message, choices),
    cast: (message, choices) => applyCastCard(message, choices),
    expose: (message, choices) => applyExposureCard(message, choices),
    focus: (message) => applyFocusCard(message),
    fortune: (message) => applyFortuneCard(message),
    strike: (message) => applyStrikeCard(message),
    reroll: (message, choices) => applyRerollCard(message, choices),
    "item-action": (message, choices) => applyActionCard(message, choices),
    counteract: (message, choices) => applyCounteractCard(message, choices),
    toggle: (message, choices) => applyToggleCard(message, choices),
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
            if (((state.kind === "expose" && !state.own) || (state.kind === "cast" && needsTargets(state.plan, state.plan.choices?.[choices.choice ?? state.choice ?? 0])) || (state.kind === "item-action" && state.plan?.action?.targeted) || (state.kind === "reroll" && state.plan?.reroll?.who === "companion")) && !choices.targets?.length) throw new Error("Target the creatures first.");
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
        await activate(String(data.itemUuid ?? ""), Number(data.activation), data.userId).catch((error) => {
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
        : state.kind === "toggle" ? { choice: Number.isInteger(data.choice) ? data.choice : null }
        : state.kind === "counteract" ? { drinker: Number.isInteger(data.drinker) ? data.drinker : null, rows: Array.isArray(data.rows) ? data.rows.map((row) => ({ ticked: Boolean(row?.ticked), dc: row?.dc ?? null, rank: row?.rank ?? null })) : null }
        : { drinker: data.drinker, ceremony: Boolean(data.ceremony), resistType: Number.isInteger(data.resistType) ? data.resistType : null, reduceChoice: Number.isInteger(data.reduceChoice) ? data.reduceChoice : null, runeWeapon: Number.isInteger(data.runeWeapon) ? data.runeWeapon : null, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] };
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

// The creatures of the token uuids a presser targeted: [{ token, actor, name }].
async function targetedCreatures(uuids) {
    const tokens = await Promise.all((Array.isArray(uuids) ? uuids : []).map((uuid) => fromUuid(uuid).catch(() => null)));
    return tokens.filter((token) => token?.actor).map((token) => ({ token, actor: token.actor, name: token.name ?? token.actor.name }));
}

// A condition lowered by an amount (PF2e's decreaseCondition, once for each step), or removed ("all").
async function lowerCondition(actor, name, slug, by) {
    const before = Number(actor?.getCondition?.(slug)?.value) || 0;
    if (!before) return `${name} isn't ${slug}: nothing to lower.`;
    if (by === "all") await actor.decreaseCondition(slug, { forceRemove: true });
    else for (let step = 0; step < by; step++) await actor.decreaseCondition(slug);
    const after = Number(actor.getCondition?.(slug)?.value) || 0;
    return after ? `${name}'s ${slug} lowered to ${after}` : `${name} is no longer ${slug}`;
}

const voidHealing = (actor) => Boolean(actor?.attributes?.hp?.negativeHealing ?? actor?.system?.attributes?.hp?.negativeHealing);

async function applyCard(message, { drinker = null, ceremony = false, resistType = null, reduceChoice = null, runeWeapon = null, targets = [] } = {}) {
    let state = stateOf(message);
    if (!state || state.status !== "open") return null;
    // (The weapon picked for the rune it lends.)
    if (Number.isInteger(runeWeapon) && state.weapons?.[runeWeapon]) state = { ...state, runeWeapon };
    if (state.plan.item?.rune && !state.plan.item.rune.own && !state.weapons?.length) throw new Error(`${state.user.name} has no weapon for ${state.item.name}.`);
    // (A condition it lowers on others: the creatures the presser targets, before anything is applied.)
    const reduce = state.plan.item?.reduce ?? [];
    const others = reduce.some((entry) => entry.who === "targets") ? await targetedCreatures(targets) : [];
    if (reduce.some((entry) => entry.who === "targets") && !others.length) throw new Error("Target the creatures it helps first, then press Apply.");
    // (One of several conditions, as picked.)
    if (Number.isInteger(reduceChoice) && reduce.some((entry) => entry.choose?.[reduceChoice])) state = { ...state, reduceChoice };
    // (Its resistance's type, as picked.)
    if (Number.isInteger(resistType) && (state.plan.item?.resist ?? []).some((entry) => entry.choose?.[resistType])) state = { ...state, resistType };
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
    // (A rune it lends a weapon: Burial Oil's Vitalizing — an Effect with PF2e's AdjustStrike on that weapon.)
    const rune = state.plan.item?.rune;
    if (rune && user.actor) {
        const weapon = rune.own ? { id: state.item.uuid?.split(".Item.").at(-1) ?? null, name: state.item.name } : state.weapons[state.runeWeapon ?? 0];
        const key = runeKeyOf(rune);
        if (!key) lines.push(`${state.item.name}: PF2e has no ${rune.name} rune; apply it by hand.`);
        else if (weapon?.id) {
            await user.actor.createEmbeddedDocuments("Item", [runeEffectSource(rune, { key, weapon, item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            lines.push(`${state.user.name}: ${runeText(rune, weapon.name)}`);
        }
    }
    // (The conditions it lowers: Lion Badge's frightened, by 1 — PF2e's decreaseCondition, once for each, "to 0" removing it;
    // one of several as picked; another's on each creature the presser targets.)
    for (const entry of reduce) {
        const slug = entry.choose ? entry.choose[state.reduceChoice ?? 0] ?? entry.choose[0] : entry.slug;
        const creatures = entry.who === "targets" ? others : [{ actor: target.actor, name: recipient.name }];
        for (const creature of creatures) lines.push(await lowerCondition(creature.actor, creature.name, slug, entry.by));
    }
    // (Its flat check to end persistent damage: PF2e's own recovery roll for each of those types, at the text's DC when it's
    // lower — Quenching Potion's 10 — then the condition's own DC again if it stays.)
    if (state.plan.item?.recovery) lines.push(...await recover(target.actor, recipient.name, state.plan.item.recovery));
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
        const revived = await dying.recoverFromDying(actor, wasDying);
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
