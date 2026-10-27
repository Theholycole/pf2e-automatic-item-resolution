// Live play for the Deck of Many Things (src/live/deck.js, 2026-10-27): the deck card. Declared (its user's count), its first card drawn from
// PF2e's own table (Foundry's draw, scripts/table.js drawLinked), each card's own card posted when the readers find one, and the deck's rule
// for it played on the active GM's client: XP (PF2e's details.xp), the Dullard's lowered Intelligence (an Effect, the GM may change it), the
// Gem's treasure, the Knight's Palace Guard (the ability module's conjured token beside its user), the GM's press removing what Talons,
// Ruin or the Donjon take, the draws ended or more of them. Its user marked on the deck (never again), the Jester and the Dullard gone from
// it. Once the hour is up (Foundry's updateWorldTime), the cards still to draw are drawn anyway.

import { DECK_RULES, afterChoice, afterDraw, afterLose, attributeDrop, cardName, createDeckCard, deckCardHTML, drawsLeft, lostItems, postsOwnCard } from "../src/live/deck.js";
import { drawLinked } from "./table.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";

const USERS = "deckUsers";
const GONE = "deckGone";
const holderOf = (actor, state) => (state.item.id ? actor?.items?.get(state.item.id) ?? null : null);

export async function postDeckCard({ message, plan, used, actor, token }) {
    const holderId = String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? used.data._id ?? null;
    const holder = holderId ? actor?.items?.get(holderId) : null;
    const state = createDeckCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, id: holderId, level: Number(used.data.system?.level?.value) || 0, data: used.data }, user: entryOf(token, actor), used: (holder?.getFlag(MODULE_ID, USERS) ?? []).includes(actor.uuid) });
    return ChatMessage.create({ content: deckCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

async function addXP(actor, formula) {
    if (actor?.type !== "character") return "no XP to change (not a character)";
    const roll = await new Roll(String(formula)).evaluate();
    const now = Number(actor.system?.details?.xp?.value) || 0;
    await actor.update({ "system.details.xp.value": Math.max(0, now + roll.total) });
    return `${roll.total >= 0 ? "+" : ""}${roll.total} XP (${Math.max(0, now + roll.total)} now)`;
}

// One card drawn → the lines; its own card posted.
async function drawOne(state, actor, { postCardFor, compileRow }) {
    const holder = holderOf(actor, state);
    const gone = holder?.getFlag(MODULE_ID, GONE) ?? [];
    let drawn = null;
    // (A card gone from this deck for good drawn again, the Jester or the Dullard: another drawn.)
    for (let tries = 0; tries < 8 && (!drawn || gone.includes(cardName(drawn.text))); tries++) drawn = await drawLinked({ ...state, plan: { ...state.plan, table: { uuid: state.plan.deck.uuid, name: state.plan.deck.name } } }, compileRow);
    const name = cardName(drawn.text);
    const rule = DECK_RULES[name] ?? {};
    const lines = [`${name}: ${drawn.text.replace(/^[^.]*\.\s*/, "")}`];
    if (drawn.plan && postsOwnCard(name)) {
        const data = state.item.data ?? { name: state.item.name, system: {} };
        await postCardFor({ message: null, plan: drawn.plan, used: { data: { ...data, name: `${state.item.name} (${name})`, system: { ...(data.system ?? {}), description: { value: `<p>${drawn.text}</p>` } } }, actor }, actor, token: actor.getActiveTokens?.(true)?.[0] ?? null });
        lines.push("Its card follows.");
    }
    if (rule.xp) lines.push(`${name}: ${await addXP(actor, rule.xp)}.`);
    if (rule.attribute) {
        const roll = await new Roll(rule.attribute.formula).evaluate();
        const drop = attributeDrop(roll.total);
        await actor.createEmbeddedDocuments("Item", [{ name: `${state.item.name}: the Dullard`, type: "effect", img: "icons/svg/downgrade.svg", system: { description: { value: `<p>Its Intelligence lowered by ${roll.total} (the deck's old score): its modifier −${drop} (the GM may change it).</p>` }, duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: [{ key: "ActiveEffectLike", mode: "add", path: `system.abilities.${rule.attribute.slug}.mod`, value: -drop }] }, flags: { [MODULE_ID]: { card: true } } }]);
        lines.push(`Dullard: Intelligence ${roll.total} lower (its modifier −${drop}; the GM may change it); one more card may be drawn.`);
    }
    if (rule.ally) {
        await postCardFor({ message: null, plan: { source: { name: `${state.item.name}: Knight` }, builtin: "conjure", automation: { level: "automatic" }, targeting: { target: "self", range: null, area: null }, trigger: { event: "use" }, creatures: [{ name: rule.ally.name, count: 1, size: null, stats: null, from: { uuid: rule.ally.uuid }, traits: [], initiative: "roll" }], max: 1, lasts: null, vanishAtZero: false, notes: ["Sworn to unfailing loyalty to its drawer."] }, used: { data: { ...(state.item.data ?? {}), name: `${state.item.name} (Knight)` }, actor }, actor, token: actor.getActiveTokens?.(true)?.[0] ?? null });
        lines.push(`Knight: a ${rule.ally.name} arrives, sworn to it (its token beside it).`);
    }
    if (rule.gm) lines.push(`${name}: ${rule.gm} (the GM's).`);
    if (rule.stop) lines.push("No more cards are drawn.");
    if (rule.gone && holder) {
        await holder.setFlag(MODULE_ID, GONE, [...gone, name]);
        lines.push(`The ${name} is gone from this deck for good.`);
    }
    return { name, lines };
}

// On the active GM's client: { count } to declare, { choice } for a card's choice, { gm } for the GM's press.
export async function applyDeckCard(message, { count = 1, choice = 0, gm = false } = {}, postCardFor = null, compileRow = null) {
    let state = stateOf(message);
    if (!state || state.kind !== "deck" || state.status !== "open") return null;
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const lines = [];
    if (state.step === "declare") {
        const declared = Math.max(1, Math.min(22, Math.round(Number(count) || 1)));
        const holder = holderOf(actor, state);
        if (holder) await holder.setFlag(MODULE_ID, USERS, [...(holder.getFlag(MODULE_ID, USERS) ?? []), actor.uuid]);
        state = { ...state, declared, deadline: game.time.worldTime + 3600 };
        lines.push(`${declared} card${declared === 1 ? "" : "s"} declared; the rest within the hour.`);
    } else if (state.step === "choice") {
        const option = DECK_RULES[state.choice]?.choice?.[Number(choice) || 0];
        if (option?.xp) lines.push(`${state.choice}: ${await addXP(actor, option.xp)}.`);
        if (option?.more) lines.push(`${state.choice}: two more cards to draw.`);
        if (option?.treasure) {
            await actor.createEmbeddedDocuments("Item", [{ name: option.treasure.name, type: "treasure", img: "icons/commodities/gems/gem-faceted-round-white.webp", system: { quantity: option.treasure.count, price: { value: { gp: option.treasure.gp } }, category: option.treasure.category } }]);
            lines.push(`${state.choice}: ${option.label} in ${state.user.name}'s inventory.`);
        }
        state = afterChoice(state, choice);
    } else if (state.step === "lose") {
        if (!gm) throw new Error("the GM removes what it loses.");
        const items = [...actor.items].filter((item) => item.isOfType?.("physical")).map((item) => ({ id: item.id, physical: true, magical: (item.system?.traits?.value ?? []).includes("magical") || Boolean(item.isMagical), level: Number(item.level ?? item.system?.level?.value) || 0, artifact: (item.system?.traits?.value ?? []).includes("artifact") }));
        const ids = lostItems(items, state.losing, { deckId: state.item.id, deckLevel: state.item.level });
        if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
        lines.push(`${ids.length} of ${state.user.name}'s items gone.`);
        state = afterLose(state);
    }
    // (The next card, unless a choice or the GM's press waits.)
    if (state.step === "draw" || (state.step === "declare" && state.declared)) {
        const { name, lines: said } = await drawOne(state, actor, { postCardFor, compileRow });
        lines.push(...said);
        state = afterDraw(state, name);
    }
    const next = { ...state, status: state.step === "done" || (!drawsLeft(state) && state.step === "draw") ? "applied" : "open", results: [...state.results, ...lines] };
    return message.update({ content: deckCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The hour up with cards still to draw: drawn anyway, one by one.
export function setUpDecks(postCardFor, compileRow) {
    Hooks.on("updateWorldTime", () => {
        if (!isActiveGM()) return;
        for (const message of game.messages?.contents ?? []) {
            const state = stateOf(message);
            if (state?.kind !== "deck" || state.status !== "open" || state.step !== "draw" || !state.deadline || game.time.worldTime < state.deadline || !drawsLeft(state)) continue;
            // (Each card still to draw, one after another, until a choice waits.)
            (async () => {
                for (let left = drawsLeft(state); left > 0; left--) {
                    const now = stateOf(game.messages.get(message.id));
                    if (now?.status !== "open" || now.step !== "draw") break;
                    await applyDeckCard(game.messages.get(message.id), {}, postCardFor, compileRow);
                }
            })().catch((error) => console.error(`${MODULE_ID} | deck`, error));
        }
    });
}
