// Live play for plan.structure (src/live/structure-card.js: the Guiding Chisel's building): the card posted on use; on Place it, its presser
// clicks where it stands (on their own client), and the active GM's client has the environment module place it (api.placeStructure), the
// last building this item made — its id kept on the item — removed first (api.removeStructure).

import { createStructureCard, sizeText, structureCardHTML, structureTemplate } from "../src/live/structure-card.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";

export async function postStructureCard({ message, plan, used, actor, token }) {
    const state = createStructureCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: structureCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// On the presser's client: the point clicked on the canvas → { x, y } (pixels), or null when cancelled.
export function pickStructurePoint(state) {
    if (!canvas?.ready) throw new Error("No scene is open to place it on.");
    return new Promise((resolve) => {
        ui.notifications?.info?.(`${state.item.name}: click where the building's middle stands (right-click or Escape cancels).`);
        const stage = canvas.stage;
        const finish = (value) => {
            stage.off("pointerdown", down);
            document.removeEventListener("keydown", key);
            resolve(value);
        };
        const down = (event) => {
            if (event.button === 2) return finish(null);
            const point = event.getLocalPosition?.(canvas.tokens) ?? event.data?.getLocalPosition?.(canvas.tokens);
            finish(point ? { x: point.x, y: point.y } : null);
        };
        const key = (event) => {
            if (event.key === "Escape") finish(null);
        };
        stage.on("pointerdown", down);
        document.addEventListener("keydown", key);
    });
}

// On the active GM's client: { destination, choice } → the building placed, the card applied.
export async function applyStructureCard(message, { destination = null, choice = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "structure" || state.status !== "open") return null;
    if (!destination) throw new Error("Click where it stands first.");
    const api = game.modules.get(ENVIRONMENT_ID)?.active ? game.modules.get(ENVIRONMENT_ID)?.api : null;
    const index = Number.isInteger(choice) && state.plan.structure.sizes[choice] ? choice : state.choice ?? 0;
    const size = state.plan.structure.sizes[index];
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const scene = token?.parent ?? canvas?.scene ?? null;
    const lines = [];
    if (!api?.placeStructure) lines.push(`${sizeText(size)}: draw its walls by hand (PF2e Automatic Environment Resolution isn't active).`);
    else {
        // (The last one this item made gone first: "The building lasts until you use the chisel to create another building".)
        const item = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
        const last = item?.getFlag?.(MODULE_ID, "structure") ?? null;
        if (state.plan.structure.replaces && last?.id) {
            const lastScene = game.scenes?.get?.(last.sceneId) ?? null;
            if (lastScene && api.removeStructure) {
                await api.removeStructure(lastScene, last.id);
                lines.push("Its last building is gone.");
            }
        }
        const placed = await api.placeStructure(scene, structureTemplate(state, destination, index));
        if (item?.setFlag && placed?.id) await item.setFlag(MODULE_ID, "structure", { id: placed.id, sceneId: scene.id });
        lines.push(`${sizeText(size)} stands there${placed?.pushed?.length ? `; ${placed.pushed.length} creature${placed.pushed.length === 1 ? "" : "s"} moved out of it` : ""}.`);
    }
    const next = { ...state, status: "applied", choice: index, results: lines };
    return message.update({ content: structureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
