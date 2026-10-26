// Live play for plan.afflictedTurns (src/compiler/afflicted-turns.js: Blackfinger Blight's, Astringent Venom's "at the beginning of their turn,
// a creature affected … must succeed at a flat DC 5 check or drop one random item they're holding"). Once the ability module's card hands the
// affliction over (its "applied" hook, on the GM's client), each creature of a degree that afflicts it is marked for the affliction's maximum
// duration. At the start of each of its turns (PF2e's pf2e.startTurn, on the active GM's client), while Pseudo Afflictions still has the
// affliction on it (with that module off, while the mark lasts), the flat check is rolled; on a failure one random item it holds is dropped.

import { afflictedTurnsMarkSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

const AFFLICTIONS = "pseudo-afflictions";
const marksOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.afflictedTurns && !(effect.isExpired ?? effect.system?.expired));
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function setUpAfflictedTurns() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        markAfflicted(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | afflicted turns mark`, error));
    });
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM()) return;
        afflictedTurnStart(combatant?.actor).catch((error) => console.error(`${MODULE_ID} | afflicted turn`, error));
    });
}

// The card applied: { state, targets: [{ actorUuid, degree }] } — a mark on each creature whose row hands it the affliction.
export async function markAfflicted({ state, targets }) {
    const rule = state?.plan?.afflictedTurns;
    if (!rule) return [];
    const outcomes = state.plan.resolution?.outcomes ?? {};
    const item = { name: state.ability?.name ?? state.plan.source?.name ?? rule.name, uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
    const marked = [];
    for (const target of targets ?? []) {
        if (!outcomes[target.degree]?.affliction) continue;
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor?.createEmbeddedDocuments) continue;
        for (const old of marksOf(actor).filter((mark) => mark.flags[MODULE_ID].afflictedTurns.name === rule.name)) await old.delete();
        const [mark] = await actor.createEmbeddedDocuments("Item", [afflictedTurnsMarkSource(rule, { item, user: { actorUuid: state.source?.actorUuid ?? actor.uuid, tokenUuid: state.source?.tokenUuid ?? null }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        marked.push(mark);
    }
    return marked;
}

// Whether Pseudo Afflictions still has the affliction on the creature (its Effect by that name); true with that module off.
export function stillAfflicted(actor, name) {
    if (game.modules.get(AFFLICTIONS)?.active !== true) return true;
    const wanted = String(name ?? "").toLowerCase();
    return (actor?.itemTypes?.effect ?? []).some((effect) => effect.flags?.[AFFLICTIONS] && String(effect.name ?? "").toLowerCase().includes(wanted));
}

// The start of the creature's turn: each mark's flat check, an item dropped on a failure; a mark whose affliction is gone, gone too.
export async function afflictedTurnStart(actor) {
    const rolled = [];
    for (const mark of marksOf(actor)) {
        const rule = mark.flags[MODULE_ID].afflictedTurns;
        if (!stillAfflicted(actor, rule.name)) {
            await mark.delete();
            continue;
        }
        const roll = await new Roll("1d20").evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${escape(rule.name)}: DC ${rule.flatDC} flat check to keep hold` });
        rolled.push(roll.total);
        if (roll.total >= rule.flatDC) continue;
        const held = (actor.inventory?.contents ?? actor.items?.contents ?? []).filter((item) => item.system?.equipped?.carryType === "held");
        const name = escape(actor.token?.name ?? actor.name);
        if (!held.length) {
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${name}</strong> fails the flat check (${roll.total}) but holds nothing to drop.</p>` });
            continue;
        }
        const dropped = held[Math.floor(Math.random() * held.length)];
        await dropped.update({ "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 });
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${name}</strong> fails the flat check (${roll.total}) and drops <strong>${escape(dropped.name)}</strong> (${escape(rule.name)}).</p>` });
    }
    return rolled;
}
