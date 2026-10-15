// Live play for permanent items' activations (src/compiler/permanent.js): after PF2e posts an item to chat (its
// "send to chat"), the activations card lists the activations the module reads, each with an Activate button for the
// item's owner or the GM; pressing one posts that activation's own card (scripts/live.js postCardFor: the item card,
// a save at the targets, a cast, a zone…) and counts its use against its frequency, shown on the card (over it, a
// warning, not a refusal). (The user's call how activations are triggered is still to come: this is the default
// proposed in docs/design.md.)

import { activationsCardHTML, createActivationsCard, usesNow, withUse } from "../src/live/activations-card.js";
import { handlesPermanent } from "../src/compiler/permanent.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";
import { FLAG, MODULE_ID, entryOf, stateOf } from "./foundry.js";

const PERMANENT = new Set(["equipment", "weapon", "armor", "shield", "ammo", "backpack"]);
const USES = "activationUses";

let compileActivations = null;
let postCardFor = null;
export function setUpActivations(options) {
    compileActivations = options.compileActivations;
    postCardFor = options.postCardFor;
}

const now = () => ({ worldTime: game.time.worldTime, combatId: game.combat?.started ? game.combat.id : null });

// The activations with a card, of the item as it is now.
function playable(item) {
    const data = { ...item.toObject(false), uuid: item.uuid };
    return (compileActivations?.(data) ?? []).filter((entry) => entry.plan && routeOf(entry.plan, plainText(entry.activation.html))).map((entry) => ({ ...entry, data }));
}

export async function cardForItemPost(message) {
    const origin = message?.flags?.pf2e?.origin;
    if (!compileActivations || !PERMANENT.has(origin?.type) || message.flags?.pf2e?.context?.type || message.flags?.[MODULE_ID]) return;
    const item = origin.uuid ? await fromUuid(origin.uuid).catch(() => null) : null;
    if (!item?.actor || !handlesPermanent(item)) return;
    const list = playable(item);
    if (!list.length) return;
    const token = message.token?.object ?? item.actor.getActiveTokens?.(true)?.[0] ?? null;
    const state = createActivationsCard({
        item: { name: item.name, uuid: item.uuid, img: item.img ?? null },
        user: entryOf(token, item.actor),
        activations: list.map(({ activation, plan, index }) => ({ index, name: activation.name, time: activation.time, frequency: plan.trigger?.frequency ?? null }))
    });
    return ChatMessage.create({ content: activationsCardHTML(state, { canApply: true, record: item.getFlag(MODULE_ID, USES) ?? {}, now: now() }), speaker: message.speaker, flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// One activation pressed (on the active GM's client): its card, and its use counted on the item.
export async function applyActivationsCard(message, { activation = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "activations") return null;
    const item = await fromUuid(state.item.uuid).catch(() => null);
    if (!item?.actor) throw new Error("The item isn't there any more.");
    const entry = playable(item).find((candidate) => candidate.index === Number(activation));
    if (!entry) throw new Error("That activation isn't there any more.");
    const frequency = entry.plan.trigger?.frequency ?? null;
    const record = item.getFlag(MODULE_ID, USES) ?? {};
    const lines = [];
    if (frequency?.max && usesNow(record, entry.index, frequency, now()) >= frequency.max) lines.push(`${entry.activation.name ?? item.name}: already used ${frequency.max} time${frequency.max === 1 ? "" : "s"} this ${frequency.per.replace("-", " ")} (the GM's call).`);
    const token = state.user.tokenUuid ? (await fromUuid(state.user.tokenUuid).catch(() => null))?.object ?? null : null;
    // (The activation's card, named for it; its text the activation's own block.)
    const used = { data: { ...entry.data, name: entry.activation.name ? `${item.name}: ${entry.activation.name}` : item.name, system: { ...entry.data.system, description: { value: entry.activation.html } } }, actor: item.actor };
    await postCardFor({ message: null, plan: entry.plan, used, actor: item.actor, token });
    const next = withUse(record, entry.index, frequency, now());
    if (frequency?.max) await item.setFlag(MODULE_ID, USES, next);
    lines.push(`${entry.activation.name ?? item.name} activated.`);
    const updated = { ...state, results: [...state.results, ...lines] };
    return message.update({ content: activationsCardHTML(updated, { canApply: true, record: next, now: now() }), [`flags.${MODULE_ID}.${FLAG}`]: updated });
}
