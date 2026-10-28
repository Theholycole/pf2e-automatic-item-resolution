// Live play for souls a weapon keeps (2026-10-27, src/live/souls.js: Reaper's Grasp): each kill with it of a sapient living or undead creature
// stores that creature's name and level on the weapon (the core's applyDamage listener, after the damage: its Hit Points at 0), up to its
// maximum; Soul Shot's and Devour Captured Soul's card picks one, releases it and gives its user the Effect: the weapon's void damage on its next
// Strike this turn (gone after that Strike, scripts/ends-on-strike.js), or temporary Hit Points till the end of its next turn.

import { SOULS, createSoulsCard, soulAmount, soulCounts, soulRules, soulsCardHTML, withSoul, withoutSoul } from "../src/live/souls.js";
import { CORE_ID, FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, startInitiative, stateOf } from "./foundry.js";

const SLUG = "reapers-grasp";
const MAX = 10;

export async function postSoulsCard({ message, plan, used, actor, token }) {
    const weapon = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
    const souls = weapon?.getFlag?.(MODULE_ID, SOULS) ?? [];
    if (!souls.length) throw new Error(`${used.data.name}: no soul is stored in it.`);
    const state = createSoulsCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor), souls });
    return ChatMessage.create({ content: soulsCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applySouls(message, { pick = 0 } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "souls" || state.status !== "open") return null;
    const weapon = state.item.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!weapon || !actor) throw new Error("The weapon or its user isn't there any more.");
    const record = weapon.getFlag(MODULE_ID, SOULS) ?? [];
    const soul = record[Number(pick)];
    if (!soul) throw new Error("That soul isn't stored in it any more.");
    const souls = state.plan.souls;
    const amount = soulAmount(souls, soul);
    await weapon.setFlag(MODULE_ID, SOULS, withoutSoul(record, pick));
    const strike = souls.op === "strike";
    await actor.createEmbeddedDocuments("Item", [{
        name: `${state.item.name}: ${soul.name}'s soul`,
        type: "effect",
        img: state.item.img ?? "icons/svg/skull.svg",
        flags: { [MODULE_ID]: strike ? { endsOnStrike: { slug: weapon.system?.slug ?? SLUG } } : {} },
        system: {
            description: { value: `<p>${strike ? `+${amount} ${souls.type} damage on its next Strike with ${weapon.name} this turn` : `${amount} temporary Hit Points till the end of its next turn`} (${soul.name}'s soul, level ${soul.level}).</p>` },
            duration: strike ? { value: 0, unit: "rounds", expiry: "turn-end", sustained: false } : { value: 1, unit: "rounds", expiry: "turn-end", sustained: false },
            start: { value: game.time.worldTime, initiative: startInitiative(actor) },
            tokenIcon: { show: true },
            rules: soulRules(souls, amount, weapon.id)
        }
    }]);
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [`${soul.name}'s soul (level ${soul.level}) is released: ${strike ? `+${amount} ${souls.type} damage on the next Strike with it this turn` : `${amount} temporary Hit Points`}. ${record.length - 1} left.`] };
    return message.update({ content: soulsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

function wireSouls(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "souls") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    const button = root.querySelector("[data-air-souls]");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const pick = Number(root.querySelector("[data-air-field='pick']")?.value ?? 0);
        try {
            if (isActiveGM()) await applySouls(message, { pick });
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "souls", messageId: message.id, pick, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            button.disabled = false;
        }
    });
}

export function setUpSouls() {
    Hooks.on("renderChatMessageHTML", (message, html) => wireSouls(message, html));
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "souls" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "souls" || !sender) return;
        if (!(sender.isGM || fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"))) return;
        applySouls(message, { pick: Number(data.pick) || 0 }).catch((error) => console.error(`${MODULE_ID} | souls`, error));
    });
    // (A kill with it: the soul stored, after the damage.)
    game.modules.get(CORE_ID)?.api?.patches?.damage?.onApply?.({
        module: MODULE_ID,
        name: "souls",
        before(actor, params) {
            const weapon = params?.item;
            if (weapon?.system?.slug !== SLUG || !actor?.isOfType?.("creature")) return null;
            return async () => {
                const live = fromUuidSync(actor.uuid) ?? actor;
                if (Number(live.system?.attributes?.hp?.value) > 0 || !isActiveGM()) return;
                const creature = { name: live.name, level: live.level, traits: [...(live.traits ?? new Set(live.system?.traits?.value ?? []))], modeOfBeing: live.modeOfBeing };
                const record = weapon.getFlag?.(MODULE_ID, SOULS) ?? [];
                if (!soulCounts(creature, record, MAX)) return;
                await weapon.setFlag(MODULE_ID, SOULS, withSoul(record, creature, MAX));
                await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: weapon.actor }), content: `<p><strong>${weapon.name}</strong>: part of ${live.name}'s soul is drawn into it (level ${creature.level}; ${record.length + 1} stored). A soul kept safe elsewhere, as by a lich's soul cage, isn't taken (the GM's).</p>` });
            };
        }
    });
}
