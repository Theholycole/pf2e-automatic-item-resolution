// Live play for a cube of walls (2026-10-27, src/compiler/cube-faces.js, src/live/cube.js: Cube of Nex): its walls of force the environment
// module's structure round its user (its api.placeStructure: their Wall of Force numbers, its user not pushed out; gone again from its
// structure menu, or on command); and its other activation's cube made inert — the item flagged (scripts/activations.js refuses it), its
// activation's Effects and zones ended. On the active GM's client; the inert card's button is its own (this file's hook).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { createInertCard, inertCardHTML, namedInert, structureCardHTML } from "../src/live/cube.js";
import { ABILITY_ID, FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, stateOf } from "./foundry.js";

const ENV_ID = "pf2e-automatic-environment-resolution";
export const INERT = "inert";

// Its walls placed round its user, said in the chat.
export async function placeItemStructure({ plan, used, actor, token }) {
    const structure = plan.structure;
    const own = token?.document ?? token ?? null;
    const place = game.modules.get(ENV_ID)?.active ? game.modules.get(ENV_ID)?.api?.placeStructure : null;
    const user = entryOf(token, actor);
    const results = [];
    if (!own) results.push(`${user.name}'s token isn't on a scene: place the walls by hand.`);
    else if (!place) results.push("The environment module isn't active: draw the walls by hand.");
    else {
        const placed = await place(own.parent, { name: `${used.data.name}: ${structure.name}`, token: own, shape: structure.shape, feet: structure.feet, stats: structure.stats, pushOut: structure.pushOut ?? false, ...(structure.invisible ? { invisible: true } : {}), source: { actorUuid: actor?.uuid ?? null, itemUuid: used.data.uuid ?? null, name: used.data.name } });
        results.push(`${placed?.walls?.length ?? 0} walls placed round ${user.name}${placed?.id ? " (the environment module's structure: remove it from its menu once dismissed)" : ""}.`);
    }
    return ChatMessage.create({ content: structureCardHTML({ item: { name: used.data.name }, user, structure, results }), speaker: ChatMessage.getSpeaker({ actor }) });
}

// The items it can make inert near its user: each creature's within its feet holding one it names.
function inertCandidates(token, inert) {
    const own = token?.document ?? token;
    const scene = own?.parent;
    if (!scene) return [];
    const grid = { size: scene.grid.size, gridFeet: scene.grid.distance ?? 5 };
    const space = (doc) => ({ x: Number(doc.x), y: Number(doc.y), w: Math.max(1, Number(doc.width) || 1) * grid.size, h: Math.max(1, Number(doc.height) || 1) * grid.size, elevation: Number(doc.elevation ?? 0) });
    const out = [];
    for (const other of scene.tokens) {
        if (!other.actor || distanceFeet(space(own), space(other), grid) > inert.within) continue;
        for (const item of other.actor.items ?? []) if (namedInert(inert, item.name) && !out.some((entry) => entry.itemUuid === item.uuid)) out.push({ itemUuid: item.uuid, name: item.name, holder: other.name });
    }
    return out;
}

export async function postInertCard({ message, plan, used, actor, token }) {
    const state = createInertCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), candidates: inertCandidates(token, plan.inert) });
    return ChatMessage.create({ content: inertCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// The one picked made inert: flagged, its Effects (their origin it) and its zones (the ability module's, made from it) gone.
export async function applyInert(message, { pick = 0 } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "inert" || state.status !== "open") return null;
    const entry = state.candidates[Number(pick)] ?? state.candidates[0];
    const item = entry ? await fromUuid(entry.itemUuid).catch(() => null) : null;
    if (!item) throw new Error("That item isn't there any more.");
    await item.setFlag(MODULE_ID, INERT, { by: state.item.name, at: game.time.worldTime });
    const lines = [`${item.name} (${entry.holder}) is inert: it can't be activated.`];
    let ended = 0;
    for (const actor of game.actors?.contents ?? []) {
        const effects = (actor.itemTypes?.effect ?? []).filter((effect) => effect.system?.context?.origin?.item === item.uuid || effect.flags?.[MODULE_ID]?.item?.uuid === item.uuid);
        if (effects.length) await actor.deleteEmbeddedDocuments("Item", effects.map((effect) => effect.id));
        ended += effects.length;
    }
    for (const scene of game.scenes?.contents ?? []) {
        const regions = (scene.regions?.contents ?? []).filter((region) => region.flags?.[ABILITY_ID]?.zone?.itemUuid === item.uuid);
        if (regions.length) await scene.deleteEmbeddedDocuments("Region", regions.map((region) => region.id));
        ended += regions.length;
    }
    lines.push(ended ? `Its current activation ends (${ended} of its Effects and areas removed).` : "It had no activation going.");
    lines.push("Its constant abilities stop: none it has are PF2e's rules to switch off.");
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: lines };
    return message.update({ content: inertCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

function wireInert(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "inert") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    const button = root.querySelector("[data-air-inert]");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const pick = Number(root.querySelector("[data-air-field='pick']")?.value ?? 0);
        try {
            if (isActiveGM()) await applyInert(message, { pick });
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "inert", messageId: message.id, pick, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            button.disabled = false;
        }
    });
}

export function setUpCube() {
    Hooks.on("renderChatMessageHTML", (message, html) => wireInert(message, html));
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "inert" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "inert" || !sender) return;
        if (!(sender.isGM || fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"))) return;
        applyInert(message, { pick: Number(data.pick) || 0 }).catch((error) => console.error(`${MODULE_ID} | inert`, error));
    });
}

// (scripts/activations.js: an inert item's activation refused.)
export const inertOf = (item) => item?.getFlag?.(MODULE_ID, INERT) ?? null;
