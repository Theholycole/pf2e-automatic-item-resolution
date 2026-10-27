// Live play for transmogrifying mutagens (src/live/transmogrify.js, 2026-10-27: Philosopher's Extractor's Essence Transmogrification).
// Make (the active GM's client): the creature its presser targets — its body —, that many mutagens in its user's inventory. Drink (PF2e's
// Use of one, scripts/live.js): the card lists its creature's abilities for the GM, who picks one; Apply gives the drinker an Effect for the
// hour (PF2e's rule for a sense, Speed, immunity or resistance; for an action, a copy of it on the drinker with its own DCs, removed with the
// Effect), lengthens the same creature's Effects an hour, and — another active — rolls the flat check: failed, the drinker's transformation
// is the GM's (a note Effect, whispered).

import { abilityChoices, abilityRules, createTransmogrifyCard, mutagenSource, transformDC, transmogrifyCardHTML, withOwnDC } from "../src/live/transmogrify.js";
import { ABILITY_ID, FLAG, MODULE_ID, entryOf, isActiveGM, ownerDCsOf, startInitiative, stateOf } from "./foundry.js";

const GIVEN = "transmogrifyGiven";
const isMutagenEffect = (effect) => Boolean(effect?.flags?.[MODULE_ID]?.transmogrify);
const activeOf = (actor) => (actor?.itemTypes?.effect ?? []).filter(isMutagenEffect);
const sameKind = (effect, creature) => String(effect.flags[MODULE_ID].transmogrify.creature?.name ?? "").toLowerCase() === String(creature?.name ?? "").toLowerCase();

// What a creature's actor gives: { name, uuid, level, senses, speeds, immunities, resistances, actions }.
export function creatureData(actor) {
    const speeds = {};
    for (const [type, entry] of Object.entries(actor?.system?.movement?.speeds ?? {})) if (Number(entry?.value ?? entry) > 0) speeds[type] = Number(entry?.value ?? entry);
    for (const entry of actor?.system?.attributes?.speed?.otherSpeeds ?? []) if (Number(entry?.value) > 0) speeds[entry.type] ??= Number(entry.value);
    return {
        name: actor?.name ?? "creature",
        uuid: actor?.uuid ?? null,
        level: Number(actor?.level) || 0,
        senses: [...(actor?.system?.perception?.senses ?? [])].map((sense) => ({ type: sense.type, acuity: sense.acuity ?? null, range: sense.range ?? null, label: sense.label ?? null })),
        speeds,
        immunities: [...(actor?.system?.attributes?.immunities ?? [])].map((entry) => entry.type).filter(Boolean),
        resistances: [...(actor?.system?.attributes?.resistances ?? [])].map((entry) => ({ type: entry.type, value: entry.value })).filter((entry) => entry.type),
        actions: [...(actor?.itemTypes?.action ?? [])].map((action) => ({ name: action.name, uuid: action.uuid, id: action.id, type: action.type }))
    };
}

export async function postTransmogrifyCard({ message, plan, used, actor, token }) {
    const step = plan.transmogrify.step;
    let creature = null;
    let choices = [];
    let active = 0;
    let same = 0;
    if (step === "drink") {
        creature = plan.transmogrify.creature;
        const source = creature?.uuid ? await fromUuid(creature.uuid).catch(() => null) : null;
        choices = source ? abilityChoices(creatureData(source)) : [];
        const effects = activeOf(actor);
        active = effects.length;
        same = effects.filter((effect) => sameKind(effect, creature)).length;
    }
    const state = createTransmogrifyCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor), creature, choices, active, sameKind: same });
    return ChatMessage.create({ content: transmogrifyCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// The make step: { targets, count } → the mutagens in its user's inventory.
async function makeMutagens(state, actor, { targets = [], count = 1 }) {
    const body = targets.length ? await fromUuid(targets[0]).catch(() => null) : null;
    const creature = body?.actor ?? null;
    if (!creature) throw new Error("Target the creature whose body it filters first.");
    const most = Number(state.plan.transmogrify.most) || 10;
    const made = Math.max(1, Math.min(most, Math.round(Number(count) || 1)));
    const data = creatureData(creature);
    // (The creature's own entry where it came from a compendium, so it's found again once its token is gone.)
    const uuid = creature._stats?.compendiumSource ?? creature.uuid;
    await actor.createEmbeddedDocuments("Item", [mutagenSource({ name: data.name, uuid, level: data.level }, { count: made, level: Number(state.plan.item?.level) || 0, moduleId: MODULE_ID, from: state.item.name })]);
    return [`${made} Transmogrifying Mutagen${made === 1 ? "" : "s"} (${data.name}) in ${state.user.name}'s inventory (an hour's work; enough of its body for that many is the GM's call).`];
}

// The drink step: { pick } → its Effect, the same creature's lengthened, the flat check.
async function drinkMutagen(state, actor, { pick = 0 }) {
    const lines = [];
    const choice = state.choices[Number(pick) || 0] ?? null;
    const creature = state.creature;
    const hours = Number(state.plan.transmogrify.lasts?.value) || 1;
    const effects = activeOf(actor);
    // (Another of the same creature active: an hour more for each of them, this one ending with them.)
    const same = effects.filter((effect) => sameKind(effect, creature));
    for (const effect of same) await effect.update({ "system.duration.value": (Number(effect.system?.duration?.value) || 0) + (effect.system?.duration?.unit === "minutes" ? 60 : 1) });
    if (same.length) lines.push(`${creature.name}'s other abilities on ${state.user.name} last an hour longer.`);
    const remaining = same.map((effect) => Number(effect.remainingDuration?.remaining) || 0).filter((value) => value > 0);
    const seconds = Math.max(hours * 3600, ...remaining);
    const dcs = ownerDCsOf(actor);
    const dc = Math.max(...[dcs?.class, dcs?.spell].map(Number).filter(Number.isFinite), -Infinity);
    const name = `Transmogrifying Mutagen (${creature?.name ?? "creature"}): ${choice?.label ?? "the GM's ability"}`;
    const effect = {
        name,
        type: "effect",
        img: state.item.img ?? "icons/consumables/potions/potion-tube-corked-bubbling-green.webp",
        system: {
            description: { value: `<p>One of ${creature?.name ?? "the creature"}'s abilities, from a transmogrifying mutagen: ${choice?.label ?? "the GM's pick"}. It uses ${state.user.name}'s class DC or spell DC, the higher${Number.isFinite(dc) ? ` (DC ${dc})` : ""}, instead of the creature's.</p>` },
            duration: { value: Math.ceil(seconds / 60), unit: "minutes", expiry: "turn-start", sustained: false },
            start: { value: game.time.worldTime, initiative: startInitiative(actor) },
            rules: abilityRules(choice),
            tokenIcon: { show: true }
        },
        flags: { [MODULE_ID]: { card: true, transmogrify: { creature, ability: choice?.label ?? null } } }
    };
    const [made] = await actor.createEmbeddedDocuments("Item", [effect]);
    lines.unshift(`${state.user.name} gains ${choice?.label ?? "the ability the GM picks (by hand)"} from ${creature?.name ?? "the creature"} for ${Math.round(seconds / 360) / 10} hour${seconds === 3600 ? "" : "s"}.`);
    // (An action: its copy on the drinker, its DCs the drinker's, gone with the Effect — setUpTransmogrify.)
    if (choice?.kind === "action" && choice.uuid) {
        const action = await fromUuid(choice.uuid).catch(() => null);
        if (action) {
            const source = action.toObject();
            delete source._id;
            if (Number.isFinite(dc) && source.system?.description) source.system.description.value = withOwnDC(source.system.description.value, dc);
            source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { [GIVEN]: made?.id ?? null } };
            await actor.createEmbeddedDocuments("Item", [source]);
            lines.push(`${action.name} is on ${state.user.name}'s sheet while it lasts${Number.isFinite(dc) ? `, at DC ${dc}` : ""}.`);
        } else lines.push(`${choice.label} wasn't found: give it by hand.`);
    }
    // (Drunk while another is active: the flat check.)
    const flat = transformDC(effects.length);
    if (flat) {
        const roll = await new Roll("1d20").evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${state.item.name}: flat check DC ${flat}` });
        if (roll.total >= flat) lines.push(`Flat check DC ${flat}: ${roll.total}, a success.`);
        else {
            lines.push(`Flat check DC ${flat}: ${roll.total}, a failure — ${state.user.name} turns fully into a ${creature?.name ?? "creature"} of that kind, almost always berserk; how much of itself is left is the GM's call.`);
            const applyChange = game.modules.get(ABILITY_ID)?.api?.live?.applyChange;
            const abilityState = { plan: state.plan, ability: { name: state.item.name, uuid: state.item.uuid ?? null }, source: { actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }, targets: [{ id: "drinker", actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }] };
            if (applyChange) await applyChange({ op: "effect", target: "drinker", effect: { kind: "note", note: { label: `Transformed (${creature?.name ?? "creature"})`, text: `Fully transformed into a ${creature?.name ?? "creature"}, almost always berserk; how much personality and memory remains is the GM's call.`, duration: null } } }, abilityState).catch(() => null);
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${state.item.name}</strong>: ${actor.name} failed the flat check and turns into a ${creature?.name ?? "creature"} — the GM's to play.</p>` });
        }
    }
    return lines;
}

export async function applyTransmogrifyCard(message, choices = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "transmogrify" || state.status !== "open") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const step = state.plan.transmogrify.step;
    if (step === "drink" && !choices.gm) throw new Error("the GM picks the ability it gives.");
    const lines = step === "make" ? await makeMutagens(state, actor, choices) : await drinkMutagen(state, actor, choices);
    const next = { ...state, status: "applied", pick: Number(choices.pick) || 0, count: Number(choices.count) || 1, results: lines };
    return message.update({ content: transmogrifyCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The copies of actions a mutagen's Effect gave: gone with it.
export function setUpTransmogrify() {
    Hooks.on("deleteItem", (item) => {
        if (!isActiveGM() || item.type !== "effect" || !isMutagenEffect(item) || !item.actor) return;
        const given = item.actor.items.filter((other) => other.flags?.[MODULE_ID]?.[GIVEN] === item.id).map((other) => other.id);
        if (given.length) item.actor.deleteEmbeddedDocuments("Item", given).catch((error) => console.error(`${MODULE_ID} | transmogrify`, error));
    });
}
