// Live play for an item that counteracts what afflicts its drinker (src/compiler/counteract.js, src/live/counteract-card.js):
// on the active GM's client, step 1 finds on the chosen drinker what the item can counteract (PF2e's Effects, conditions
// and afflictions, with the DC and rank PF2e knows); step 2 rolls the item's counteract check for each row ticked, with the
// DC and rank the card shows (the GM's where PF2e didn't know), and removes what it counteracts.

import { DEGREE_WORDS, counteractCandidates, counteractCardHTML, counteractResult, createCounteractCard } from "../src/live/counteract-card.js";
import { FLAG, MODULE_ID, afflictionsOf, creatureOf, removeAfflictions, creaturesNear, entryOf, stateOf } from "./foundry.js";

export async function postCounteractCard({ message, plan, used, actor, token }) {
    const counteract = plan.item?.counteract;
    if (!counteract) return null;
    // (A spell on a creature within some distance: every creature there, foe or friend, for the GM to pick.)
    // (Its user's own, Determination's: no one else to pick.)
    const state = createCounteractCard({ counteract, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), drinkers: counteract.self ? [] : creaturesNear(token, counteract.within ?? 5) });
    return ChatMessage.create({ content: counteractCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// An Effect's DC, as the spell module reads it: its origin's class or spell DC.
function originDC(effect) {
    const uuid = effect.system?.context?.origin?.actor;
    let origin = null;
    try {
        origin = uuid ? fromUuidSync(uuid) : null;
    } catch {
        origin = null;
    }
    return Number(origin?.attributes?.classOrSpellDC?.value ?? origin?.system?.attributes?.spellDC?.value) || null;
}

// The creature as the card's search reads it.
function snapshot(actor) {
    return {
        // (A spell's Effect: PF2e's "Spell Effect: …", from its spell-effects pack, or an Effect a spell put on it.)
        // (Not an affliction's: Pseudo Afflictions' Effects are afflictions, below.)
        effects: (actor.itemTypes?.effect ?? []).filter((effect) => !effect.flags?.["pseudo-afflictions"]?.stages).map((effect) => ({ id: effect.id, name: effect.name, traits: effect.system?.traits?.value ?? [], level: Number(effect.system?.level?.value) || null, dc: originDC(effect), spell: /^Spell Effect:/i.test(effect.name) || /\.spell-effects\./.test(effect._stats?.compendiumSource ?? effect.flags?.core?.sourceId ?? "") || effect.system?.context?.origin?.item?.includes?.(".Item.") && /spell/i.test(String(effect.system?.context?.origin?.rollOptions ?? "")) })),
        conditions: (actor.itemTypes?.condition ?? []).map((condition) => ({ id: condition.id, slug: condition.slug, name: condition.name, value: Number.isFinite(condition.value) ? condition.value : null, grantedBy: condition.flags?.pf2e?.grantedBy?.id ?? null })),
        // (PF2e's affliction items, and the Effects Pseudo Afflictions tracks them with: scripts/foundry.js afflictionsOf.)
        afflictions: afflictionsOf(actor).map(({ id, name, traits, level, dc }) => ({ id, name, traits, level: level || null, dc }))
    };
}

// choices: { drinker } for step 1; { rows: [{ ticked, dc, rank }] } for step 2.
export async function applyCounteractCard(message, { drinker = null, rows = null, ownRank = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "counteract" || state.status !== "open") return null;
    if (state.step === "find") {
        if (Number.isInteger(drinker) && state.drinkers[drinker]) state = { ...state, drinker };
        const { actor } = await creatureOf(state.drinkers[state.drinker] ?? state.user);
        if (!actor) throw new Error("That creature isn't there any more.");
        const next = { ...state, step: "pick", rows: counteractCandidates(snapshot(actor), state.counteract) };
        return message.update({ content: counteractCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
    // (Step 2: the rows as the card's controls give them.)
    const chosen = state.rows.map((row, index) => {
        const given = Array.isArray(rows) ? rows[index] ?? {} : {};
        return { ...row, ticked: given.ticked ?? row.ticked, dc: Number.isFinite(Number(given.dc)) && given.dc !== "" && given.dc !== null ? Number(given.dc) : row.dc, rank: Number.isFinite(Number(given.rank)) && given.rank !== "" && given.rank !== null ? Number(given.rank) : row.rank };
    });
    let ticked = chosen.filter((row) => row.ticked);
    if (!ticked.length) throw new Error("Tick what to counteract.");
    if (state.counteract.pick !== "each" && ticked.length > 1) ticked = ticked.slice(0, 1);
    // (A condition that ends outright, Determination's, needs neither.)
    const missing = ticked.filter((row) => !row.ends && (!Number.isFinite(row.dc) || !Number.isFinite(row.rank)));
    if (missing.length) throw new Error(`Give the DC and rank for ${missing.map((row) => row.name).join(", ")}.`);
    // (Its own rank when the text leaves it to its stored spell: the card's.)
    const ours = Number.isFinite(state.counteract.rank) ? state.counteract.rank : Number(ownRank);
    if (!Number.isFinite(ours) || ownRank === "") throw new Error("Give the item's counteract rank (its stored spell's).");
    const target = state.drinkers[state.drinker] ?? state.user;
    const { actor } = await creatureOf(target);
    if (!actor) throw new Error(`${target.name} isn't there any more.`);
    const lines = [];
    for (const row of ticked) {
        if (row.ends) {
            await actor.decreaseCondition(row.slug, { forceRemove: true });
            lines.push(`${row.name}: ended.`);
            continue;
        }
        const roll = await new Roll(`1d20 + ${state.counteract.modifier}`).evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: counteract ${row.name} (DC ${row.dc}, rank ${row.rank})` });
        const natural = Number(roll.dice?.[0]?.total ?? NaN);
        const { degree, removed } = counteractResult({ total: roll.total, natural: Number.isFinite(natural) ? natural : null, dc: row.dc, ours, theirs: row.rank });
        const outcome = `${roll.total} against DC ${row.dc}: ${DEGREE_WORDS[degree] ?? "no result"}`;
        if (!removed) {
            lines.push(`${row.name}: ${outcome}, not counteracted.`);
            continue;
        }
        // (Not on a creature: the GM ends it.)
        if (row.kind === "free") {
            lines.push(`${row.name}: ${outcome}, counteracted (end it by hand).`);
            continue;
        }
        // (Moon Radish Soup lowers the condition rather than ending it.)
        if (row.kind === "condition" && state.counteract.reduce) {
            const by = degree === 3 ? state.counteract.reduce.criticalSuccess : state.counteract.reduce.success;
            for (let step = 0; step < by; step++) await actor.decreaseCondition(row.slug);
            lines.push(`${row.name}: ${outcome}, lowered by ${by}.`);
        } else if (row.kind === "condition") {
            await actor.decreaseCondition(row.slug, { forceRemove: true });
            lines.push(`${row.name}: ${outcome}, counteracted.`);
        } else if (row.kind === "affliction") {
            await removeAfflictions(actor, [row.id]);
            lines.push(`${row.name}: ${outcome}, counteracted.`);
        } else {
            await actor.deleteEmbeddedDocuments("Item", [row.id]);
            lines.push(`${row.name}: ${outcome}, counteracted.`);
        }
    }
    const next = { ...state, rows: chosen, status: "applied", results: lines };
    return message.update({ content: counteractCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
