// Live play for plan.later, a row's later conditions (src/compiler/guards.js delayedConditions: Nap Gas Dispenser's "At the end of their next turn, they
// fall Prone and fall Unconscious for 1 minute"). Once the ability module's card at the creature is applied (its "applied" hook, on the GM's
// client), each creature of that degree is marked; at the end of its next turn (PF2e's pf2e.endTurn, on the active GM's client) it gets
// those conditions — one with a time as an Effect for that time, one without as PF2e's condition — the mark used up. A mark made during the
// creature's own turn waits for the end of the turn after.

import { afterEndsEffectSource, laterMarkSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

const marksOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.later);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpLater() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markLater(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | later mark`, error));
    });
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isActiveGM()) return;
        laterAtTurnEnd(combatant?.actor).catch((error) => console.error(`${MODULE_ID} | later`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, degree }] } — a mark on each creature whose degree has later conditions.
export async function markLater({ state, targets }) {
    const entries = state?.plan?.later ?? [];
    const item = { name: state?.ability?.name ?? state?.plan?.source?.name ?? "The item", uuid: state?.ability?.uuid ?? null, img: state?.ability?.img ?? null };
    const marked = [];
    for (const target of targets ?? []) {
        const later = entries.find((entry) => entry.degree === (target.degree ?? "success"));
        const actor = later && target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor?.createEmbeddedDocuments) continue;
        const skip = Boolean(game.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid);
        const [mark] = await actor.createEmbeddedDocuments("Item", [laterMarkSource(later, { item, user: { actorUuid: state.source?.actorUuid ?? actor.uuid, tokenUuid: state.source?.tokenUuid ?? null }, worldTime: game.time.worldTime, skip, moduleId: MODULE_ID })]);
        marked.push(mark);
    }
    return marked;
}

// The end of the creature's turn: each mark's conditions, or the mark readied for the next turn's end.
export async function laterAtTurnEnd(actor) {
    const given = [];
    for (const mark of marksOf(actor)) {
        const later = mark.flags[MODULE_ID].later;
        if (later.skip) {
            await mark.update({ [`flags.${MODULE_ID}.later.skip`]: false });
            continue;
        }
        const item = { name: mark.name.replace(/: at its next turn's end$/, ""), uuid: mark.system?.context?.origin?.item ?? null, img: mark.img ?? null };
        await mark.delete();
        const names = [];
        for (const condition of later.conditions ?? []) {
            if (condition.duration?.mode === "fixed") {
                const source = afterEndsEffectSource(condition, { item, user: { actorUuid: mark.system?.context?.origin?.actor ?? actor.uuid }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID });
                // (Waking it harder, the critical failure's three Interact actions: said on its Unconscious.)
                if (later.wake && condition.slug === "unconscious") source.system.description.value = source.system.description.value.replace(/<\/p>$/, ` Waking it takes ${later.wake} Interact actions.</p>`);
                given.push(...(await actor.createEmbeddedDocuments("Item", [source])));
            } else {
                await actor.increaseCondition?.(condition.slug, condition.value ? { value: condition.value } : {});
            }
            names.push(condition.slug);
        }
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(actor.token?.name ?? actor.name)}</strong>: ${escape(item.name)} at the end of its turn — ${names.map(escape).join(" and ")}.</p>` });
    }
    return given;
}
