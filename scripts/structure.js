// Live play for plan.structure (src/live/structure-card.js: the Guiding Chisel's building): the card posted on use; on Place it, its presser
// clicks where it stands (on their own client), and the active GM's client has the environment module place it (api.placeStructure), the
// last building this item made — its id kept on the item — removed first (api.removeStructure).
// (2026-10-28: Instant Fortress, Warding Escutcheon's door, Testudo Shield's barrier — once placed, the card's commands on the GM's client:
// its door opened, or shut and locked, within its feet of its user; the structure ended, its activation's wait from then (the item's
// activationRecharges, scripts/activations.js). And on its own: after its time (the world's clock) or as its door is opened or broken.)

import { rechargeSeconds, waitText } from "../src/live/activations-card.js";
import { commandsOf, createStructureCard, keepsWatch, opensOrBreaks, placedRecord, sizeText, structureCardHTML, structureTemplate, whatOf } from "../src/live/structure-card.js";
import { WAITS } from "./activations.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";

const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";
const RECORD = "structure";
const envApi = () => (game.modules.get(ENVIRONMENT_ID)?.active ? game.modules.get(ENVIRONMENT_ID)?.api ?? null : null);

export async function postStructureCard({ message, plan, used, actor, token }) {
    const state = createStructureCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: structureCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// On the presser's client: the point clicked on the canvas → { x, y } (pixels), or null when cancelled. (Nothing to click once it's placed.)
export function pickStructurePoint(state) {
    if (state.step === "placed") return Promise.resolve({ x: 0, y: 0 });
    if (!canvas?.ready) throw new Error("No scene is open to place it on.");
    return new Promise((resolve) => {
        ui.notifications?.info?.(`${state.item.name}: click where the ${whatOf(state.plan.structure)}'s middle stands (right-click or Escape cancels).`);
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

// A token's middle (pixels).
const middleOf = (token) => {
    const doc = token?.document ?? token;
    const size = doc?.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
    return doc ? { x: doc.x + ((Number(doc.width) || 1) * size) / 2, y: doc.y + ((Number(doc.height) || 1) * size) / 2 } : null;
};

// On the active GM's client: { destination, choice } → the building placed, the card applied (or kept open for its commands).
export async function applyStructureCard(message, { destination = null, choice = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "structure" || state.status !== "open") return null;
    if (state.step === "placed") return commandStructure(message, state, Number.isInteger(choice) ? choice : state.choice ?? 0);
    if (!destination) throw new Error("Click where it stands first.");
    const api = envApi();
    const index = Number.isInteger(choice) && state.plan.structure.sizes[choice] ? choice : state.choice ?? 0;
    const size = state.plan.structure.sizes[index];
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const scene = token?.parent ?? canvas?.scene ?? null;
    const lines = [];
    let watching = false;
    if (!api?.placeStructure) lines.push(`${sizeText(size)}: draw its walls by hand (PF2e Automatic Environment Resolution isn't active).`);
    else {
        // (The last one this item made gone first: "The building lasts until you use the chisel to create another building".)
        const item = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
        const last = item?.getFlag?.(MODULE_ID, RECORD) ?? null;
        if ((state.plan.structure.replaces || state.plan.structure.ends || state.plan.structure.lasts) && last?.id) {
            const lastScene = game.scenes?.get?.(last.sceneId) ?? null;
            if (lastScene && api.removeStructure) {
                await api.removeStructure(lastScene, last.id);
                lines.push(`Its last ${whatOf(state.plan.structure)} is gone.`);
            }
        }
        const placed = await api.placeStructure(scene, structureTemplate(state, destination, index, { from: middleOf(token) }));
        if (item?.setFlag && placed?.id) await item.setFlag(MODULE_ID, RECORD, placedRecord(state.plan.structure, { id: placed.id, sceneId: scene.id, door: placed.door, messageId: message.id, worldTime: game.time.worldTime }));
        watching = Boolean(placed?.id) && keepsWatch(state.plan.structure);
        const lasts = state.plan.structure.lasts;
        lines.push(`${sizeText(size)} stands there${placed?.pushed?.length ? `; ${placed.pushed.length} creature${placed.pushed.length === 1 ? "" : "s"} moved out of it` : ""}${lasts ? `, for ${lasts.value} ${lasts.value === 1 ? lasts.unit.replace(/s$/, "") : lasts.unit}` : ""}.`);
    }
    const next = { ...state, status: watching ? "open" : "applied", ...(watching ? { step: "placed" } : {}), choice: watching ? 0 : index, size: index, results: lines };
    return message.update({ content: structureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// A command of the placed one: its door opened, or shut and locked (its user within the door's feet), or its end.
async function commandStructure(message, state, choice) {
    const command = commandsOf(state.plan.structure)[choice] ?? commandsOf(state.plan.structure)[0];
    const item = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    const record = item?.getFlag?.(MODULE_ID, RECORD) ?? null;
    if (command?.key === "end") return endPlaced(item, record, { message, why: null });
    const scene = record?.sceneId ? game.scenes?.get?.(record.sceneId) : null;
    const wall = record?.door ? scene?.walls?.get?.(record.door) : null;
    if (!wall) throw new Error("Its door isn't on the scene any more.");
    const within = Number(state.plan.structure.door?.command?.within) || null;
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const from = middleOf(token);
    if (within && from) {
        const [x0, y0, x1, y1] = wall.c;
        const feet = (Math.hypot(from.x - (x0 + x1) / 2, from.y - (y0 + y1) / 2) / scene.grid.size) * scene.grid.distance;
        if (feet > within + scene.grid.distance / 2) throw new Error(`${state.user.name} is more than ${within} feet from its door.`);
    }
    const open = command?.key === "open";
    await wall.update(open ? { ds: 1 } : { ds: 2, [`flags.${ENVIRONMENT_ID}.structure.unlocked`]: false, [`flags.${ENVIRONMENT_ID}.structure.successes`]: 0 });
    const next = { ...state, choice, results: [...state.results, open ? "Its door opens." : "Its door slams shut and locks."] };
    return message.update({ content: structureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its end: its walls removed, the item's record gone, its activation's wait started (Instant Fortress's 4 hours), and the card applied —
// or a chat line, when it ends on its own and its card is gone or applied. why: null (commanded), "time", "opened", "broken", "destroyed".
const ending = new Set();
async function endPlaced(item, record, { message = null, why = null } = {}) {
    // (Once: the world's clock ticks again while it's being removed.)
    if (record?.id && ending.has(record.id)) return null;
    if (record?.id) ending.add(record.id);
    try {
        return await ended(item, record, { message, why });
    } finally {
        if (record?.id) ending.delete(record.id);
    }
}
async function ended(item, record, { message, why }) {
    const card = message ?? (record?.messageId ? game.messages?.get?.(record.messageId) : null);
    const state = stateOf(card);
    const plan = state?.kind === "structure" ? state.plan : null;
    const structure = plan?.structure ?? null;
    const api = envApi();
    const scene = record?.sceneId ? game.scenes?.get?.(record.sceneId) : null;
    if (record?.id && scene && api?.removeStructure) await api.removeStructure(scene, record.id);
    if (item?.unsetFlag) await item.unsetFlag(MODULE_ID, RECORD);
    const name = state?.item?.name ?? item?.name ?? "The item";
    const lines = [{ time: "Its time is up: it's gone.", opened: "Its door was opened: it's gone.", broken: "Its door is broken: it's gone.", destroyed: "It's destroyed: it's gone." }[why] ?? "It's gone.", ...(structure?.ends?.words ? [structure.ends.words] : [])];
    const wait = structure?.ends?.wait ?? null;
    const index = plan?.item?.activation?.index;
    if (wait && item?.setFlag && Number.isInteger(index)) {
        const seconds = rechargeSeconds(wait, null);
        await item.setFlag(MODULE_ID, WAITS, { ...(item.getFlag(MODULE_ID, WAITS) ?? {}), [index]: game.time.worldTime + seconds });
        lines.push(`It can't be activated again for ${waitText(seconds)}.`);
    }
    if (state?.kind === "structure" && state.status === "open") {
        const next = { ...state, status: "applied", results: [...state.results, ...lines] };
        return card.update({ content: structureCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
    return ChatMessage.create({ content: `<p><strong>${foundry.utils.escapeHTML?.(name) ?? name}</strong>: ${lines.join(" ")}</p>`, speaker: { alias: name } });
}

// The items holding a record of a placed one: the world's actors' and the scenes' unlinked tokens'.
function holders() {
    const actors = [...(game.actors ?? []), ...[...(game.scenes ?? [])].flatMap((scene) => [...(scene.tokens ?? [])].filter((token) => !token.actorLink && token.actor).map((token) => token.actor))];
    return actors.flatMap((actor) => [...(actor.items ?? [])].filter((item) => item.getFlag?.(MODULE_ID, RECORD)?.id));
}

export function setUpStructures() {
    // (Its time up: Warding Escutcheon's hour, Testudo Shield's minute.)
    Hooks.on("updateWorldTime", (worldTime) => {
        if (!isActiveGM()) return;
        for (const item of holders()) {
            const record = item.getFlag(MODULE_ID, RECORD);
            if (Number.isFinite(Number(record?.endsAt)) && worldTime >= Number(record.endsAt)) endPlaced(item, record, { why: "time" }).catch((error) => console.error(`${MODULE_ID} | structure ends`, error));
        }
    });
    // (Its door opened or broken: Warding Escutcheon's "until it's opened or broken".)
    Hooks.on("updateWall", (wall, change) => {
        if (!isActiveGM()) return;
        const placed = wall.flags?.[ENVIRONMENT_ID]?.structure?.placed ?? null;
        const why = placed?.source?.itemUuid ? opensOrBreaks(change, ENVIRONMENT_ID) : null;
        if (!why) return;
        const item = fromUuidSync(placed.source.itemUuid);
        const record = item?.getFlag?.(MODULE_ID, RECORD) ?? null;
        if (record?.id === placed.id && record.whenOpened) endPlaced(item, record, { why }).catch((error) => console.error(`${MODULE_ID} | structure ends`, error));
    });
}
