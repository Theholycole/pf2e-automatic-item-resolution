// Live play for two linked portals (2026-10-27, src/live/portals.js: Mountebank's Passage): the card's Pick has its user click a square within
// range on their canvas; on the active GM's client the old portal of that colour goes, the new one's Region is made with Foundry's teleportToken
// behaviour to the other colour's (and that one's pointed back at it), and both are gone at the next daily preparations of the actor whose item
// made them (PF2e's restForTheNight). Refused while the pistol is loaded.

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { PORTAL, createPortalCard, portalCardHTML, portalRegion } from "../src/live/portals.js";
import { FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, stateOf } from "./foundry.js";
import { pickTeleportSpace } from "./teleport.js";

const regionsOf = (scene) => scene?.regions?.contents ?? [...(scene?.regions ?? [])];
const portalsOf = (itemUuid) => [...(game.scenes?.contents ?? [])].flatMap((scene) => regionsOf(scene).filter((region) => region.flags?.[MODULE_ID]?.[PORTAL]?.itemUuid === itemUuid));
const loaded = (weapon) => [...(weapon?.subitems ?? [])].some((entry) => (entry.isOfType?.("ammo") || entry.type === "ammo") && (Number(entry.quantity ?? entry.system?.quantity) || 0) > 0);

export async function postPortalCard({ message, plan, used, actor, token }) {
    const weapon = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
    if (plan.portal.unloaded && loaded(weapon)) throw new Error(`${used.data.name}: it must not be loaded.`);
    const state = createPortalCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: portalCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyPortal(message, { square = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "portal" || state.status !== "open") return null;
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    if (!token?.parent) throw new Error(`${state.user.name}'s token isn't on a scene.`);
    if (!square) throw new Error("Pick the square first.");
    const scene = token.parent;
    const size = scene.grid.size;
    const grid = { size, gridFeet: scene.grid.distance ?? 5 };
    const far = distanceFeet({ x: Number(token.x), y: Number(token.y), w: (Number(token.width) || 1) * size, h: (Number(token.height) || 1) * size, elevation: Number(token.elevation ?? 0) }, { x: square.x, y: square.y, w: size, h: size, elevation: Number(token.elevation ?? 0) }, grid);
    const portal = state.plan.portal;
    if (far > portal.within) throw new Error(`That square is ${far} feet away (it reaches ${portal.within}).`);
    const all = portalsOf(state.item.uuid);
    const old = all.filter((region) => region.flags[MODULE_ID][PORTAL].color === portal.color);
    for (const region of old) await region.delete();
    const other = all.find((region) => region.flags[MODULE_ID][PORTAL].color === portal.other && region.parent?.id === scene.id) ?? null;
    const [made] = await scene.createEmbeddedDocuments("Region", [portalRegion({ name: `${state.item.name.replace(/:.*$/, "")}: ${portal.color} portal`, square, size, color: portal.color, other: other?.uuid ?? null, flags: { [MODULE_ID]: { [PORTAL]: { color: portal.color, itemUuid: state.item.uuid, actorUuid: state.user.actorUuid } } } })]);
    // (The other pointed back at it.)
    if (other) for (const behavior of other.behaviors?.contents ?? [...(other.behaviors ?? [])]) if (behavior.type === "teleportToken") await behavior.update({ "system.destinations": [made.uuid] });
    const lines = [`A ${portal.color} portal opens${old.length ? ` (the last ${portal.color} one is gone)` : ""}${other ? `, linked to the ${portal.other} one` : `; no ${portal.other} portal yet to come out of`}.`];
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: portalCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

function wirePortal(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "portal") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    const button = root.querySelector("[data-air-portal]");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        try {
            // (A square's size, the user's token's own grid: picked as a Tiny token's space would be.)
            const square = await pickTeleportSpace({ item: state.item, user: { name: "the portal", tokenUuid: state.user.tokenUuid }, plan: { teleport: { place: true } } });
            if (!square) {
                button.disabled = false;
                return;
            }
            if (isActiveGM()) await applyPortal(message, { square });
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "portal", messageId: message.id, square, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            button.disabled = false;
        }
    });
}

export function setUpPortals() {
    Hooks.on("renderChatMessageHTML", (message, html) => wirePortal(message, html));
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "portal" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "portal" || !sender) return;
        if (!(sender.isGM || fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"))) return;
        const square = data.square && Number.isFinite(Number(data.square.x)) && Number.isFinite(Number(data.square.y)) ? { x: Number(data.square.x), y: Number(data.square.y) } : null;
        applyPortal(message, { square }).catch((error) => console.error(`${MODULE_ID} | portal`, error));
    });
    // (Gone at the next daily preparations of the actor that made them.)
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        for (const scene of game.scenes?.contents ?? []) {
            const ids = regionsOf(scene).filter((region) => region.flags?.[MODULE_ID]?.[PORTAL]?.actorUuid === actor?.uuid).map((region) => region.id);
            if (ids.length) scene.deleteEmbeddedDocuments("Region", ids).catch((error) => console.error(`${MODULE_ID} | portals`, error));
        }
    });
}
