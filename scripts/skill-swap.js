// Live play for two skills' ranks swapped (2026-10-27, src/live/skill-swap.js: The Trader): the card's two picks, then on the active GM's client
// its user's Effect for the time, each skill's rank overridden with the other's as they are now.

import { SKILLS, createSwapCard, swapCardHTML, swapRules, swapWords } from "../src/live/skill-swap.js";
import { FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, startInitiative, stateOf } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function postSwapCard({ message, plan, used, actor, token }) {
    const state = createSwapCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: swapCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applySwap(message, { first = 0, second = 1 } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "skill-swap" || state.status !== "open") return null;
    const [a, b] = [SKILLS[Number(first)], SKILLS[Number(second)]];
    if (!a || !b || a === b) throw new Error("Pick two different skills.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const [rankA, rankB] = [Number(actor.skills?.[a]?.rank) || 0, Number(actor.skills?.[b]?.rank) || 0];
    const duration = state.plan.swap.duration;
    await actor.createEmbeddedDocuments("Item", [{
        name: `${state.item.name}: skills swapped`,
        type: "effect",
        img: state.item.img ?? "icons/svg/switch.svg",
        flags: { [MODULE_ID]: { skillSwap: { a, b } } },
        system: {
            description: { value: `<p>${escape(swapWords(a, b, rankA, rankB))}. ${escape(state.plan.swap.words ?? "")}</p>` },
            duration: { value: duration.value, unit: duration.unit, expiry: "turn-start", sustained: false },
            start: { value: game.time.worldTime, initiative: startInitiative(actor) },
            context: { origin: { actor: actor.uuid, token: state.user.tokenUuid ?? null, item: state.item.uuid ?? null } },
            tokenIcon: { show: true },
            rules: swapRules(a, b, rankA, rankB)
        }
    }]);
    const next = { ...state, status: "applied", first: Number(first), second: Number(second), results: [`${state.user.name}: ${swapWords(a, b, rankA, rankB)}, for ${duration.value} ${duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit}.`] };
    return message.update({ content: swapCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

function wireSwap(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "skill-swap") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    const button = root.querySelector("[data-air-swap]");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const choices = { first: Number(root.querySelector("[data-air-field='first']")?.value ?? 0), second: Number(root.querySelector("[data-air-field='second']")?.value ?? 1) };
        try {
            if (isActiveGM()) await applySwap(message, choices);
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "skill-swap", messageId: message.id, ...choices, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            button.disabled = false;
        }
    });
}

export function setUpSkillSwap() {
    Hooks.on("renderChatMessageHTML", (message, html) => wireSwap(message, html));
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "skill-swap" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "skill-swap" || !sender) return;
        if (!(sender.isGM || fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"))) return;
        applySwap(message, { first: Number(data.first) || 0, second: Number(data.second) || 0 }).catch((error) => console.error(`${MODULE_ID} | skill swap`, error));
    });
}
