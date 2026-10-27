// Live play for an item that counteracts what afflicts its drinker (src/compiler/counteract.js, src/live/counteract-card.js):
// on the active GM's client, step 1 finds on the chosen drinker what the item can counteract (PF2e's Effects, conditions
// and afflictions, with the DC and rank PF2e knows); step 2 rolls the item's counteract check for each row ticked, with the
// DC and rank the card shows (the GM's where PF2e didn't know), and removes what it counteracts.

import { rememberCastDuration } from "./cast-duration.js";
import { DEGREE_WORDS, counteractCandidates, counteractCardHTML, counteractResult, counteracts, createCounteractCard } from "../src/live/counteract-card.js";
import { itemNoteSource } from "../src/live/card.js";
import { FLAG, MODULE_ID, afflictionsOf, creatureOf, removeAfflictions, creaturesNear, entryOf, stateOf } from "./foundry.js";

export async function postCounteractCard({ message, plan, used, actor, token }) {
    const given = plan.item?.counteract;
    if (!given) return null;
    // (Its user's numbers, The Theater's and The Locksmith's: half their level, rounded up, as its rank; their class DC − 10 as its modifier
    // — the best of their class DCs, else the GM's note.)
    const classMod = Math.max(...[actor?.classDC?.mod, ...Object.values(actor?.classDCs ?? {}).map((entry) => entry?.mod), Number(actor?.system?.attributes?.classDC?.value) - 10].map(Number).filter(Number.isFinite));
    const counteract = given.fromUser ? {
        ...given,
        ...(given.fromUser.rank === "half-level" ? { rank: Math.max(1, Math.ceil((Number(actor?.level) || 0) / 2)) } : {}),
        ...(given.fromUser.modifier === "class-dc" ? (Number.isFinite(classMod) ? { modifier: classMod } : { modifier: 0, notes: [...(given.notes ?? []), `${actor?.name ?? "Its user"} has no class DC: its modifier is their class DC − 10 (by hand).`] }) : {}),
        // (Its user's skill, Reflecting Shard's Athletics; or its attack modifier with the weapon it's on, Spellslasher's — its best Strike's.)
        ...(given.fromUser.modifier && !["class-dc", "weapon-attack"].includes(given.fromUser.modifier) ? userModifier(given, `${given.fromUser.modifier.charAt(0).toUpperCase()}${given.fromUser.modifier.slice(1)}`, skillModifierOf(actor, given.fromUser.modifier), actor) : {}),
        ...(given.fromUser.modifier === "weapon-attack" ? userModifier(given, "attack modifier with the weapon it's on", bestStrikeOf(actor), actor, "its best Strike's here: the GM may change it to the weapon's") : {})
    } : given;
    // (A spell on a creature within some distance: every creature there, foe or friend, for the GM to pick.)
    // (Its user's own, Determination's: no one else to pick.)
    const state = createCounteractCard({ counteract, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), drinkers: counteract.self ? [] : creaturesNear(token, counteract.within ?? 5) });
    return ChatMessage.create({ content: counteractCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// (Its user's own modifier for it: a skill's, PF2e's statistic; its Strikes' best attack modifier.)
export const skillModifierOf = (actor, slug) => Number(actor?.skills?.[slug]?.mod ?? actor?.system?.skills?.[slug]?.totalModifier ?? actor?.system?.skills?.[slug]?.mod);
export const bestStrikeOf = (actor) => Math.max(...(actor?.system?.actions ?? []).filter((action) => action?.type === "strike" && action.ready !== false).map((action) => Number(action.totalModifier)).filter(Number.isFinite));
function userModifier(given, words, value, actor, note = null) {
    if (Number.isFinite(value)) return { modifier: value, ...(note ? { notes: [...(given.notes ?? []), `Its modifier +${value} is ${actor?.name ?? "its user"}'s ${words} (${note}).`] } : {}) };
    return { modifier: 0, notes: [...(given.notes ?? []), `${actor?.name ?? "Its user"} has no ${words}: give its modifier by hand.`] };
}

// The counteract card a Strike's hit posts (src/compiler/strike-counteract.js): { counteract, item, user, drinkers } — only those creatures to pick.
export async function postCounteractAt({ counteract, item, user, drinkers }) {
    const state = createCounteractCard({ counteract, item, user, drinkers, only: true });
    return ChatMessage.create({ content: counteractCardHTML(state, { canApply: true }), speaker: ChatMessage.getSpeaker(), flags: { [MODULE_ID]: { [FLAG]: state } } });
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

// An Effect's traits, and its spell's when PF2e left them off the Effect (a battle form's polymorph: Awakened Silver Shot's search).
function effectTraits(effect) {
    const own = effect.system?.traits?.value ?? [];
    const origin = effect.system?.context?.origin?.item ? fromUuidSync?.(effect.system.context.origin.item) : null;
    return [...new Set([...own, ...(origin?.system?.traits?.value ?? [])])];
}

// The creature as the card's search reads it.
function snapshot(actor) {
    return {
        // (A spell's Effect: PF2e's "Spell Effect: …", from its spell-effects pack, or an Effect a spell put on it.)
        // (Not an affliction's: Pseudo Afflictions' Effects are afflictions, below.)
        effects: (actor.itemTypes?.effect ?? []).filter((effect) => !effect.flags?.["pseudo-afflictions"]?.stages).map((effect) => ({ id: effect.id, name: effect.name, traits: effectTraits(effect), origin: effect.system?.context?.origin?.actor ?? null, level: Number(effect.system?.level?.value) || null, dc: originDC(effect), spell: /^Spell Effect:/i.test(effect.name) || /\.spell-effects\./.test(effect._stats?.compendiumSource ?? effect.flags?.core?.sourceId ?? "") || effect.system?.context?.origin?.item?.includes?.(".Item.") && /spell/i.test(String(effect.system?.context?.origin?.rollOptions ?? "")) })),
        conditions: (actor.itemTypes?.condition ?? []).map((condition) => ({ id: condition.id, slug: condition.slug, name: condition.name, value: Number.isFinite(condition.value) ? condition.value : null, grantedBy: condition.flags?.pf2e?.grantedBy?.id ?? null })),
        // (PF2e's affliction items, and the Effects Pseudo Afflictions tracks them with: scripts/foundry.js afflictionsOf.)
        afflictions: afflictionsOf(actor).map(({ id, name, traits, level, dc }) => ({ id, name, traits, level: level || null, dc }))
    };
}

// choices: { drinker } for step 1; { rows: [{ ticked, dc, rank }] } for step 2.
// The spell by its name in PF2e's spells, cast on the card's user by the spell module (its castFromItem), its Effects for the item's time
// (scripts/cast-duration.js). → the card's line.
async function castAfter(thenSpell, state) {
    const castFromItem = game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem;
    const pack = game.packs.get("pf2e.spells-srd");
    const entry = pack ? [...(await pack.getIndex())].find((one) => one.name.toLowerCase() === thenSpell.name.toLowerCase()) : null;
    const { actor, token } = await creatureOf(state.user);
    if (!castFromItem || !entry || !actor) return `Then ${actor?.name ?? state.user.name} gains the effects of ${thenSpell.name} for ${thenSpell.value} ${thenSpell.unit} (by hand${castFromItem ? "" : ": PF2e Automatic Spell Resolution isn't active"}).`;
    const tokenObject = token?.object ?? token ?? null;
    const cast = await castFromItem({ actor, token: tokenObject ?? undefined, spell: entry.uuid ?? `Compendium.pf2e.spells-srd.Item.${entry._id}`, targets: tokenObject ? [tokenObject] : [], item: { name: state.item.name, uuid: state.item.uuid ?? null } });
    const lasts = await rememberCastDuration(cast, { value: thenSpell.value, unit: thenSpell.unit }, { actor, targets: tokenObject ? [tokenObject] : [] });
    return `Then ${actor.name} gains the effects of ${entry.name}${lasts ? ` — ${lasts.replace(/^It lasts/, "it lasts").replace(/\.$/, "")}` : ""}.`;
}

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
        return { ...row, ticked: given.ticked ?? row.ticked, outright: Boolean(state.counteract.outrightBelow && row.kind === "condition" && given.outright), dc: Number.isFinite(Number(given.dc)) && given.dc !== "" && given.dc !== null ? Number(given.dc) : row.dc, rank: Number.isFinite(Number(given.rank)) && given.rank !== "" && given.rank !== null ? Number(given.rank) : row.rank };
    });
    let ticked = chosen.filter((row) => row.ticked);
    if (!ticked.length) throw new Error("Tick what to counteract.");
    if (state.counteract.pick !== "each" && ticked.length > 1) ticked = ticked.slice(0, 1);
    // (A condition that ends outright, Determination's, needs neither.)
    // (Nor one countered outright, its source far below its user's level: The Teamster's.)
    const missing = ticked.filter((row) => !row.ends && !row.outright && (!Number.isFinite(row.dc) || !Number.isFinite(row.rank)));
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
        if (row.outright) {
            await actor.decreaseCondition(row.slug, { forceRemove: true });
            lines.push(`${row.name}: countered outright (its source more than ${state.counteract.outrightBelow.levels} levels below its user's).`);
            continue;
        }
        const roll = await new Roll(`1d20 + ${state.counteract.modifier}`).evaluate();
        await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: counteract ${row.name} (DC ${row.dc}, rank ${row.rank})` });
        const natural = Number(roll.dice?.[0]?.total ?? NaN);
        let { degree, removed } = counteractResult({ total: roll.total, natural: Number.isFinite(natural) ? natural : null, dc: row.dc, ours, theirs: row.rank });
        // (A failure that's a success against some creatures, Awakened Silver Shot's devils and werecreatures: the creature hit's traits.)
        const upFor = state.counteract.failToSuccess?.traits ?? [];
        const raised = degree === 1 && upFor.some((trait) => (state.counteract.struckTraits ?? []).includes(trait));
        if (raised) ({ degree, removed } = { degree: 2, removed: counteracts(2, ours, row.rank) });
        const outcome = `${roll.total} against DC ${row.dc}: ${DEGREE_WORDS[degree] ?? "no result"}${raised ? " (a failure, a success against it)" : ""}`;
        if (!removed) {
            lines.push(`${row.name}: ${outcome}, not counteracted.`);
            continue;
        }
        // (Not on a creature: the GM ends it — or turns it back, Reflecting Shard's Spell Riposte.)
        if (row.kind === "free") {
            lines.push(`${row.name}: ${outcome}, counteracted (${state.counteract.free?.counteredWords ?? "end it by hand"}).`);
            // (What it keeps the creature picked from after, Devil's Trap's devil: a note Effect on it for that time, 2026-10-27.)
            const after = state.counteract.afterFree;
            if (after && target !== state.user) {
                await actor.createEmbeddedDocuments("Item", [itemNoteSource({ name: after.name, words: after.words, duration: after.duration }, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                lines.push(`${target.name}: ${after.words.charAt(0).toLowerCase()}${after.words.slice(1)} for ${after.duration.value} ${after.duration.value === 1 ? after.duration.unit.replace(/s$/, "") : after.duration.unit}.`);
            }
            // (What its user then has, Spell Duelist's Siphon's absorbed spell: a note Effect on it.)
            const kept = state.counteract.onCounter;
            if (kept) {
                const own = await creatureOf(state.user);
                await own.actor?.createEmbeddedDocuments?.("Item", [itemNoteSource({ name: kept.label, words: kept.text, duration: null }, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                lines.push(`${state.user.name}: ${kept.label.toLowerCase()} (a note Effect).`);
            }
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
            // (Change Shape counteracted, Awakened Silver Shot's: a note Effect on it for that time, a minute after a critical success.)
            const after = state.counteract.afterCounter;
            if (after && new RegExp(after.name, "i").test(row.name)) {
                const time = degree === 3 ? after.criticalSuccess : after.success;
                await actor.createEmbeddedDocuments("Item", [itemNoteSource({ name: `can't ${after.name}`, words: `${after.words} for ${time.value} ${time.unit === "minutes" ? (time.value === 1 ? "minute" : "minutes") : time.value === 1 ? "round" : "rounds"}`, duration: { mode: "fixed", value: time.value, unit: time.unit, expiry: "turn-start" } }, { item: state.item, user: state.user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
                lines.push(`${target.name} can't use ${after.name} for ${time.value} ${time.value === 1 ? time.unit.replace(/s$/, "") : time.unit}.`);
            }
        }
    }
    // (A spell's effects on its user after it, Draconal Mask's Truesight for 1 minute: the spell module casts it, its Effects set to that time.)
    const thenSpell = state.counteract.thenSpell;
    if (thenSpell) lines.push(await castAfter(thenSpell, state));
    // (A condition after it, whatever the result, Fu Water's "You're then Sickened 1": src/compiler/counteract.js counteract.then.)
    const then = state.counteract.then;
    if (then) {
        await actor.increaseCondition(then.slug, { value: then.value });
        lines.push(`${target.name} is then ${then.slug} ${then.value}.`);
    }
    // (A flat check each time it's used, the item spent on a failure: Aeon Stone (Pale Lavender Ellipsoid)'s, into an Aeon Stone (Consumed).)
    const burnout = state.counteract.burnout;
    if (burnout) lines.push(await burnOut(state, burnout));
    const next = { ...state, rows: chosen, status: "applied", results: lines };
    return message.update({ content: counteractCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The flat check, PF2e's own roll in the chat; on a failure the item is replaced on its owner by the one it becomes (its worn and invested
// state kept). → the card's line.
async function burnOut(state, burnout) {
    const item = state.item?.uuid ? await fromUuid(state.item.uuid).catch(() => null) : null;
    const roll = await new Roll("1d20").evaluate();
    await roll.toMessage({ speaker: item?.actor ? ChatMessage.getSpeaker({ actor: item.actor }) : undefined, flavor: `${state.item.name}: flat check (DC ${burnout.dc})` });
    if (roll.total >= burnout.dc) return `Its flat check: ${roll.total}, DC ${burnout.dc}, a success; ${state.item.name} keeps its power.`;
    const source = (await fromUuid(burnout.becomes.uuid).catch(() => null))?.toObject?.() ?? null;
    if (!item?.actor || !source) return `Its flat check: ${roll.total}, DC ${burnout.dc}, a failure: it turns into ${burnout.becomes.name} (by hand).`;
    delete source._id;
    source.system = { ...source.system, equipped: { ...(source.system?.equipped ?? {}), ...(item.system?.equipped ?? {}) } };
    await item.actor.createEmbeddedDocuments("Item", [source]);
    await item.delete();
    return `Its flat check: ${roll.total}, DC ${burnout.dc}, a failure: ${state.item.name} is now ${burnout.becomes.name}.`;
}
