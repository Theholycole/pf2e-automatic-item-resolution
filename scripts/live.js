// Live play: a confirmation card after PF2e's own Use of a consumable
// (docs/design.md, the user's answers of 2026-10-15).
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

import { abilityState, applicationFor, cardHTML, createItemCard, DRINKER_ID, effectSource, recipientOf, rolledHealing, rollFormula, USER_ID } from "../src/live/card.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const CORE_ID = "pf2e-resolution-core";
const ABILITY_ID = "pf2e-automatic-ability-resolution";
const FLAG = "card";
const SOCKET = `module.${MODULE_ID}`;
// The kinds of plan batch 1 plays on its card (potions, elixirs, mutagens).
const PLAYED = new Set(["healing", "effect"]);

const isActiveGM = () => game.users.activeGM?.isSelf ?? game.user.isGM;
const stateOf = (message) => message?.getFlag?.(MODULE_ID, FLAG) ?? null;

let compile = null;
// The last dose's item, kept as PF2e deletes it (its Use message can arrive after): uuid → { data, actor }.
const deleted = new Map();

export function setUpLivePlay({ compileItem }) {
    compile = compileItem;
    Hooks.on("deleteItem", (item) => {
        if (item?.type !== "consumable") return;
        deleted.set(item.uuid, { data: { ...item.toObject(false), uuid: item.uuid }, actor: item.actor ?? null });
        setTimeout(() => deleted.delete(item.uuid), 30_000);
    });
    Hooks.on("createChatMessage", (message) => {
        if (isActiveGM()) cardForUse(message).catch((error) => console.error(`${MODULE_ID} | item card`, error));
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
        hideCovered(message, html);
        wireCard(message, html);
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

const entryOf = (token, actor) => ({ actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null, name: token?.name ?? actor.name });

// A token's space for the core's distance (as the ability module measures auras).
function spaceOf(token) {
    const size = canvas.grid.size;
    const document = token.document ?? token;
    return { x: Number(document.x), y: Number(document.y), w: Math.max(1, Number(document.width ?? 1)) * size, h: Math.max(1, Number(document.height ?? 1)) * size, elevation: Number(document.elevation ?? 0) };
}

// The creatures next to the user it can be fed to: adjacent (5 feet), on the same scene, visible.
function adjacentCreatures(userToken) {
    if (!userToken || !canvas?.ready || userToken.document?.parent?.id !== canvas.scene?.id) return [];
    const from = spaceOf(userToken);
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    return canvas.tokens.placeables
        .filter((token) => token !== userToken && token.actor?.isOfType?.("creature") && !token.document.hidden && distanceFeet(from, spaceOf(token), grid) <= 5)
        .map((token) => entryOf(token, token.actor));
}

async function cardForUse(message) {
    const origin = message?.flags?.pf2e?.origin;
    if (origin?.type !== "consumable" || message.flags?.pf2e?.context?.type || message.flags?.[MODULE_ID]) return;
    const used = await usedItem(origin, message);
    if (!used) return;
    const plan = compile(used.data);
    if (!plan?.resolution || !PLAYED.has(plan.resolution.kind)) return;
    const actor = used.actor ?? message.actor;
    if (!actor) return;
    const token = message.token?.object ?? actor.getActiveTokens?.(true)?.[0] ?? null;
    const user = entryOf(token, actor);
    const roll = message.rolls?.[0];
    const rolled = plan.item?.pf2eRoll && Number.isFinite(roll?.total) ? { total: roll.total, formula: plan.item.pf2eRoll.formula, kind: plan.item.pf2eRoll.kind, messageId: message.id } : null;
    const sourceId = used.data._stats?.compendiumSource ?? used.data.flags?.core?.sourceId ?? origin.sourceId ?? null;
    const state = createItemCard({
        plan,
        item: { name: used.data.name, uuid: used.data.uuid ?? origin.uuid ?? null, sourceId, slug: used.data.system?.slug ?? null, img: used.data.img ?? null },
        user,
        drinkers: plan.item?.recipient === "drinker" ? adjacentCreatures(token) : [],
        rolled
    });
    const card = await ChatMessage.create({
        content: cardHTML(state, { canApply: true }),
        speaker: message.speaker,
        flags: { [MODULE_ID]: { [FLAG]: state } }
    });
    // PF2e's roll is the card's: its own apply buttons come off that message.
    if (rolled && card) await message.update({ "flags.pf2e.suppressDamageButtons": true, [`flags.${MODULE_ID}.covered`]: card.id });
}

// PF2e's message whose roll an item card applies: no apply buttons, a pointer to the card instead.
function hideCovered(message, html) {
    if (!message?.getFlag?.(MODULE_ID, "covered")) return;
    for (const section of html.querySelectorAll(".damage-application")) section.remove();
    if (!html.querySelector(".pf2e-air-covered")) {
        const note = document.createElement("p");
        note.className = "pf2e-air-covered";
        note.style.cssText = "font-size: 0.85em; font-style: italic; margin: 0.25rem 0;";
        note.textContent = "Applied from the item's card below.";
        (html.querySelector(".message-content") ?? html).append(note);
    }
}

// --- Buttons ----------------------------------------------------------------------

function mayApply(state) {
    if (game.user.isGM) return true;
    try {
        return !!fromUuidSync(state.user.actorUuid)?.testUserPermission?.(game.user, "OWNER");
    } catch {
        return false;
    }
}

function wireCard(message, html) {
    const state = stateOf(message);
    if (!state || state.kind !== "item") return;
    const root = html.querySelector(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        // The drinker as text, not a choice.
        for (const select of root.querySelectorAll("select[data-air-field]")) select.replaceWith(document.createTextNode(select.selectedOptions?.[0]?.textContent ?? ""));
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
        const drinker = Number(root.querySelector("[data-air-field='drinker']")?.value ?? state.drinker ?? 0);
        try {
            if (isActiveGM()) await applyCard(message, { drinker });
            else if (!game.users.activeGM) throw new Error("No GM is connected to apply it.");
            else game.socket.emit(SOCKET, { action: "apply", messageId: message.id, drinker, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            console.error(`${MODULE_ID} |`, error);
            button.disabled = false;
        }
    });
}

// A player's Apply, on the active GM's client: only the GM or the item user's owner may.
async function onRequest(data) {
    if (data?.action !== "apply") return;
    const message = game.messages.get(data.messageId);
    const state = stateOf(message);
    const sender = game.users.get(data.userId);
    if (!state || !sender) return;
    const owner = sender.isGM || !!(await fromUuid(state.user.actorUuid).catch(() => null))?.testUserPermission?.(sender, "OWNER");
    if (!owner) return;
    await applyCard(message, { drinker: data.drinker }).catch((error) => {
        ui.notifications.error(`${state.item.name}: ${error.message}`);
        throw error;
    });
}

// --- Apply ------------------------------------------------------------------------

async function creatureOf(entry) {
    const token = entry?.tokenUuid ? await fromUuid(entry.tokenUuid).catch(() => null) : null;
    return { token, actor: token?.actor ?? (entry?.actorUuid ? await fromUuid(entry.actorUuid).catch(() => null) : null) };
}

const voidHealing = (actor) => Boolean(actor?.attributes?.hp?.negativeHealing ?? actor?.system?.attributes?.hp?.negativeHealing);

async function applyCard(message, { drinker = null } = {}) {
    let state = stateOf(message);
    if (!state || state.status !== "open") return null;
    const core = game.modules.get(CORE_ID)?.api;
    if (!core) throw new Error("The resolution core isn't active.");
    if (state.drinker !== null && Number.isInteger(drinker) && state.drinkers[drinker]) state = { ...state, drinker };
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
    const next = { ...state, status: "applied", results: lines.length ? lines : ["Nothing to apply."] };
    return message.update({ content: cardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
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
async function nativeEffect(actor, name, change, state) {
    if (!actor) return null;
    const template = await fromUuid(change.effect.uuid).catch(() => null);
    if (!template) return `${name}: ${change.effect.label ?? "the effect"} wasn't found; apply it by hand.`;
    const source = effectSource(template.toObject(), {
        application: applicationFor(state.plan, change),
        item: state.item,
        user: state.user,
        worldTime: game.time.worldTime,
        initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null,
        flags: { [MODULE_ID]: { card: true } }
    });
    source._stats = { ...(source._stats ?? {}), compendiumSource: change.effect.uuid };
    await actor.createEmbeddedDocuments("Item", [source]);
    return `${name} gains ${template.name}`;
}
