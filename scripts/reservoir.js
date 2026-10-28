// Live play for a weapon's poison reservoir (2026-10-27, src/live/reservoir.js: Reaper's Lancet): its card fills the reservoir from its user's
// injury poisons (their doses taken from the inventory, one poison at a time, 3 at most) and poisons the creature its user targets — one dose
// spent, that poison's save card posted at it (the ability module's postCard, its affliction to Pseudo Afflictions), as a coated weapon's hit
// does. On the active GM's client; its buttons are its own (this file's hook).

import { compileItem } from "../src/compiler/index.js";
import { isInjuryPoison } from "../src/live/poison-card.js";
import { RESERVOIR, createReservoirCard, fillable, reservoirCardHTML } from "../src/live/reservoir.js";
import { ABILITY_ID, FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, stateOf } from "./foundry.js";

const poisonsOf = (actor) => (actor?.itemTypes?.consumable ?? []).filter((item) => (item.system?.traits?.value ?? []).includes("injury") && (item.system?.traits?.value ?? []).includes("poison")).map((item) => ({ id: item.id, name: item.name, quantity: Number(item.system?.quantity) || 1 }));

export async function postReservoirCard({ message, plan, used, actor, token }) {
    const weapon = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
    const state = createReservoirCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), record: weapon?.getFlag?.(MODULE_ID, RESERVOIR) ?? null, poisons: poisonsOf(actor) });
    return ChatMessage.create({ content: reservoirCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyReservoir(message, { action, pick = 0, targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "reservoir" || state.status !== "open") return null;
    const weapon = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!weapon || !actor) throw new Error("The weapon or its user isn't there any more.");
    const record = weapon.getFlag(MODULE_ID, RESERVOIR) ?? { poison: null, doses: 0 };
    const max = state.plan.reservoir.max;
    const lines = [];
    if (action === "fill") {
        const entry = state.poisons[Number(pick)];
        const poison = entry ? actor.items.get(entry.id) : null;
        if (!poison) throw new Error("That poison isn't there any more.");
        const count = fillable(record, { name: poison.name }, max, poison.system?.quantity);
        if (!count) throw new Error(record.doses ? `Its reservoir holds ${record.poison.name}: only more of it, up to ${max}.` : "Its reservoir is full.");
        const plan = compileItem({ ...poison.toObject(false), uuid: poison.uuid }, {});
        if (!isInjuryPoison(plan)) throw new Error(`${poison.name} isn't an injury poison the module reads.`);
        const left = (Number(poison.system?.quantity) || 1) - count;
        if (left > 0) await poison.update({ "system.quantity": left });
        else await poison.delete();
        await weapon.setFlag(MODULE_ID, RESERVOIR, { poison: { name: poison.name, uuid: poison.uuid, plan }, doses: (record.doses ?? 0) + count });
        lines.push(`${count} dose${count === 1 ? "" : "s"} of ${poison.name} into its reservoir (${(record.doses ?? 0) + count} in it).`);
    } else {
        if (!record.doses || !record.poison?.plan) throw new Error("Its reservoir is empty.");
        const target = targets[0] ? await fromUuid(targets[0]).catch(() => null) : null;
        if (!target) throw new Error("Target the creature it hit first.");
        await weapon.setFlag(MODULE_ID, RESERVOIR, { ...record, doses: record.doses - 1 });
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        const source = actor.getActiveTokens?.(true)?.[0] ?? null;
        if (postCard) await postCard({ plan: record.poison.plan, item: { name: record.poison.name, uuid: record.poison.uuid ?? null }, sourceActor: actor, sourceToken: source?.document ?? source, tokens: [target.object ?? target], cause: `${state.item.name}'s reservoir` });
        else lines.push(`${target.name} is exposed to ${record.poison.name}: roll its save by hand.`);
        lines.push(`${target.name} is poisoned with ${record.poison.name} (${record.doses - 1} dose${record.doses - 1 === 1 ? "" : "s"} left).`);
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: reservoirCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

function wireReservoir(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "reservoir") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    for (const button of root.querySelectorAll("[data-air-reservoir]")) button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const choices = { action: button.dataset.airReservoir, pick: Number(root.querySelector("[data-air-field='pick']")?.value ?? 0), targets: [...(game.user.targets ?? [])].map((token) => token.document?.uuid ?? token.uuid).filter(Boolean) };
        try {
            if (isActiveGM()) await applyReservoir(message, choices);
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "reservoir", messageId: message.id, step: choices.action, pick: choices.pick, targets: choices.targets, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            button.disabled = false;
        }
    });
}

export function setUpReservoir() {
    Hooks.on("renderChatMessageHTML", (message, html) => wireReservoir(message, html));
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "reservoir" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "reservoir" || !sender) return;
        if (!(sender.isGM || fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"))) return;
        applyReservoir(message, { action: data.step === "fill" ? "fill" : "poison", pick: Number(data.pick) || 0, targets: Array.isArray(data.targets) ? data.targets.map(String) : [] }).catch((error) => console.error(`${MODULE_ID} | reservoir`, error));
    });
}
