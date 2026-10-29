// Live play for an activation that gives its user a Focus Point (src/compiler/focus.js, src/live/focus-card.js).
// - Apply (the active GM's client): the point is added, up to the pool's maximum. A note Effect says what it's only for,
//   through the ability module's api.live.applyChange.
// - "If not used by the end of your turn, this Focus Point is lost": in a started encounter, the gain is kept on the actor
//   (flag focusGrant), and at the end of that creature's next turn (PF2e's pf2e.endTurn, on the active GM's client) the
//   points still above the pool's old value are taken back. Out of an encounter there's no turn to end: the note says it.

import { createFocusCard, focusCardHTML, focusText, poolAfter, unspent } from "../src/live/focus-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, creatureOf, encounterOf, entryOf, isActiveGM, stateOf } from "./foundry.js";
import { costResource } from "./spend.js";

const GRANT = "focusGrant";
const USER_ID = "source";

// The resource the point is: a Focus Point, or a Mythic Point — a Hero Point under the world setting (scripts/spend.js). → { key, word }.
// (Or an alchemist's versatile vials, PF2e's special resource: { key, word, slug }, its slug for PF2e's updateResource.)
// (Or its infused reagents, PF2e's crafting resource: system.resources.crafting.infusedReagents — Red Hand's Satchel, 2026-10-27.)
const resourceOf = (focus) => (focus?.resource === "mythic" ? costResource() : focus?.resource === "versatile-vials" ? { key: "versatileVials", word: "versatile vial", slug: "versatile-vials" } : focus?.resource === "infused-reagents" ? { key: "crafting.infusedReagents", word: "batch of infused reagents" } : { key: "focus", word: "Focus Point" });
const poolOf = (actor, key) => String(key).split(".").reduce((value, part) => value?.[part], actor?.system?.resources ?? {}) ?? null;

export async function postFocusCard({ message, plan, used, actor, token }) {
    const state = { ...createFocusCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) }), word: resourceOf(plan.focus).word };
    return ChatMessage.create({ content: focusCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function applyFocusCard(message) {
    const state = stateOf(message);
    if (!state || state.kind !== "focus" || state.status !== "open") return null;
    const { actor } = await creatureOf(state.user);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const focus = state.plan.focus;
    const { key, word, slug } = resourceOf(focus);
    const pool = poolOf(actor, key);
    const after = poolAfter(pool, focus.amount, { overMax: Boolean(focus.overMax) });
    const lines = [];
    if (after.reason === "no-pool") lines.push(key === "focus" ? `${state.user.name} has no focus pool: nothing gained.` : `${state.user.name} can't have ${word}s: nothing gained.`);
    else if (after.reason === "full") lines.push(key === "focus" ? `${state.user.name}'s focus pool is full (${after.value} of ${after.max}): no Focus Point gained.` : `${state.user.name}'s ${word}s are full (${after.value} of ${after.max}): no ${word} gained.`);
    else {
        const before = Number(pool.value) || 0;
        // (Past its maximum, Red Hand's Satchel's extra batch: PF2e keeps a resource's value to its maximum, so an Effect raises that by the
        // extra while it lasts — taken off with it, loseUnspentFocus. 2026-10-29.)
        const extra = Math.max(0, after.value - (Number(pool.max) || 0));
        const [over] = extra > 0 ? await actor.createEmbeddedDocuments("Item", [overMaxSource(state, { key, word, extra })]) : [];
        // (A special resource, the versatile vials, through PF2e's own updateResource: its value isn't the actor's data to update.)
        if (slug && typeof actor.updateResource === "function") await actor.updateResource(slug, after.value);
        else await actor.update({ [`system.resources.${key}.value`]: after.value });
        lines.push(`${state.user.name} gains ${after.gained} ${word}${after.gained === 1 ? "" : "s"} (${after.value} of ${after.max})${focus.only ? `, only to ${focus.only}` : ""}.`);
        // (The started encounter the creature is in, whichever one the GM is viewing.)
        // (Or at the end of its next turn, Red Hand's Satchel's reagents: one turn's end passed over when it's gained on its own turn.)
        const found = ["turn-end", "next-turn-end"].includes(focus.lost) ? encounterOf(actor) : null;
        if (found) {
            const skip = focus.lost === "next-turn-end" && found.combat.combatant?.id === found.combatant.id ? 1 : 0;
            await actor.setFlag(MODULE_ID, GRANT, { before, gained: after.gained, combatId: found.combat.id, combatantId: found.combatant.id, item: state.item.name, key, word, ...(skip ? { skip } : {}), ...(over ? { overId: over.id } : {}) });
            lines.push(focus.lost === "next-turn-end" ? "Unused at the end of its next turn, it's taken back." : "Unspent at the end of the turn, it's taken back.");
        } else if (focus.lost === "turn-end") lines.push("Not in an encounter: take it back by hand if it isn't spent this turn.");
        else if (focus.lost === "next-turn-end") lines.push(`Not in an encounter: take it back by hand if it isn't used by the end of its next turn${over ? ` (and delete ${over.name})` : ""}.`);
        // (Its reminder, until the end of the turn when it's lost then, else for the round.)
        const applyChange = game.modules.get(ABILITY_ID)?.api?.live?.applyChange;
        if (applyChange && focus.only) {
            const duration = focus.lost === "turn-end" ? { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } : null;
            const abilityState = { plan: state.plan, ability: { name: state.item.name, uuid: state.item.uuid ?? null }, source: { actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }, targets: [{ id: USER_ID, actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }] };
            await applyChange({ op: "effect", target: USER_ID, effect: { kind: "note", note: { label: word, text: focusText(focus, word), duration } } }, abilityState).catch((error) => lines.push(`Couldn't add its note: ${error.message}`));
        }
    }
    const next = { ...state, status: "applied", results: lines };
    return message.update({ content: focusCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The Effect raising the resource's maximum by the extra gained past it, while it lasts.
const overMaxSource = (state, { key, word, extra }) => ({
    name: `${state.item.name}: ${extra} ${word}${extra === 1 ? "" : "s"} past the maximum`,
    type: "effect",
    img: state.item.img ?? "icons/svg/upgrade.svg",
    flags: { [MODULE_ID]: { overMax: key } },
    system: {
        description: { value: `<p>${extra} ${word}${extra === 1 ? "" : "s"} past the day's maximum, from ${state.item.name}, until ${extra === 1 ? "it's" : "they're"} used or lost.</p>` },
        duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
        start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null },
        rules: [{ key: "ActiveEffectLike", mode: "add", path: `system.resources.${key}.max`, value: extra }]
    }
});

// PF2e's pf2e.endTurn (combatant, encounter): that creature's unspent point is lost.
export async function loseUnspentFocus(combatant, encounter) {
    if (!isActiveGM()) return null;
    const actor = combatant?.actor;
    const grant = actor?.getFlag?.(MODULE_ID, GRANT);
    if (!grant) return null;
    // (Kept past this turn's end, the one it was gained in: lost at the next — Red Hand's Satchel's.)
    if (Number(grant.skip) > 0 && grant.combatId === encounter?.id) return actor.setFlag(MODULE_ID, GRANT, { ...grant, skip: Number(grant.skip) - 1 });
    await actor.unsetFlag(MODULE_ID, GRANT);
    // (Another encounter's: its turn is gone, nothing to take back now.)
    if (grant.combatId !== encounter?.id) return null;
    // (A Mythic or Hero Point's: its own resource.)
    const key = grant.key ?? "focus";
    const pool = poolOf(actor, key);
    const lost = unspent(grant, pool);
    // (The raised maximum gone with it, the value taken back first: PF2e would keep it to the lower maximum anyway.)
    const over = grant.overId ? actor.items.get(grant.overId) : null;
    if (lost) await actor.update({ [`system.resources.${key}.value`]: (Number(pool.value) || 0) - lost });
    if (over) await over.delete();
    if (!lost) return null;
    const owners = (game.users?.filter?.((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")) ?? []).map((user) => user.id);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: owners, content: `<p><strong>${grant.item}</strong>: ${actor.name}'s unspent ${grant.word ?? "Focus Point"} is lost at the end of the turn.</p>` });
}
