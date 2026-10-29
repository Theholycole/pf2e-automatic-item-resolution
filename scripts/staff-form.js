// Live play for an item a staff for a while (src/compiler/staff-form.js, src/live/staff-form.js; Sorshen's Sinuous Guisarme's Arcane Shift,
// 2026-10-29). As it's used, the item is made the staff — its Strikes the staff's, its runes off, its own kept on it (flag staffForm) — and
// its user gets the form's Effect, its badge the charges; then the staff card: a spell of the staff's list cast through the spell module
// (api.castFromItem) at its user's own spell DC — the best of their entries of a tradition the spell has —, its charges taken off the badge:
// its rank, 1 with a spontaneous caster's slot of that rank, or the mythic heightening's with a Mythic Point (its rank, its DC at mythic
// proficiency). Each cast posts the card again with the charges left. Its last charge spent, or the Effect deleted however it goes (its
// "Revert" pick, by hand), the item's own weapon comes back, on the active GM's client.

import { STAFF_FORM, chargesFor, createStaffCard, mythicDC, revertUpdate, staffCardHTML, staffFormEffectSource, staffSpellsOf, staffWeaponUpdate } from "../src/live/staff-form.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";
import { checkSpend, paySpend } from "./spend.js";

const SPELL_ID = "pf2e-automatic-resolution";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Its user's form Effect for the item, or null.
export const formEffectOf = (actor, itemId) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.[STAFF_FORM]?.itemId === itemId) ?? null;

// Its user's numbers for a spell from the staff: the best DC among their own entries of one of its traditions (a prepared or spontaneous
// caster's, an NPC's innate too; not the spell module's item entries) → { entry, dc, mythic } or null.
export function castNumbersOf(actor, traditions = []) {
    const kinds = ["prepared", "spontaneous", ...(actor?.type === "npc" ? ["innate"] : [])];
    const entries = (actor?.itemTypes?.spellcastingEntry ?? []).filter((entry) => !entry.flags?.[SPELL_ID]?.itemCastEntry && kinds.includes(entry.system?.prepared?.value) && (!traditions.length || traditions.includes(entry.system?.tradition?.value)));
    let best = null;
    for (const entry of entries) {
        const statistic = entry.statistic;
        const dc = Number(statistic?.dc?.value);
        if (!(dc > 0) || (best && best.dc >= dc)) continue;
        // (At mythic proficiency: the level + 10 in place of its proficiency bonus; an NPC's entry has none of its own, its DC then 10 + its level + 10
        // + its attribute's modifier when that's better.)
        const proficiency = Number((statistic.check?.modifiers ?? statistic.modifiers ?? []).find((modifier) => modifier.slug === "proficiency" && modifier.enabled !== false)?.modifier);
        const level = Number(actor.level) || 0;
        const attribute = Number(actor.abilities?.[entry.system?.ability?.value ?? entry.attribute]?.mod) || 0;
        const mythic = Number.isFinite(proficiency) ? mythicDC({ dc, proficiency, level }) : Math.max(dc, 20 + level + attribute);
        best = { entry, dc, mythic };
    }
    return best;
}

// A spontaneous entry with a slot of the rank left, or null.
const spontaneousSlot = (actor, rank) => (actor?.itemTypes?.spellcastingEntry ?? []).find((entry) => entry.system?.prepared?.value === "spontaneous" && Number(entry.system?.slots?.[`slot${rank}`]?.value) > 0) ?? null;

const formOf = (effect) => {
    const flag = effect.flags[MODULE_ID][STAFF_FORM];
    return { itemId: flag.itemId, staff: flag.staff, spells: flag.spells ?? [], mythic: flag.mythic ?? null, charges: Number(effect.system?.badge?.value) || 0 };
};

async function postStaffCard({ actor, speaker = null, plan, item, user, effect, results = [] }) {
    const state = { ...createStaffCard({ plan, item, user, form: formOf(effect) }), results };
    return ChatMessage.create({ content: staffCardHTML(state, { canApply: true }), speaker: speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

export async function postStaffFormCard({ message, plan, used, actor, token }) {
    const holder = used.data.uuid ? await fromUuid(used.data.uuid).catch(() => null) : null;
    if (!holder || !actor || holder.actor?.id !== actor.id) throw new Error(`${used.data.name} has to be in its user's inventory to change its form.`);
    const user = entryOf(token, actor);
    const item = { name: holder.name, uuid: holder.uuid, img: holder.img ?? null };
    let effect = formEffectOf(actor, holder.id);
    const results = [];
    // (Already a staff: its card again, as it is.)
    if (!effect) {
        const form = plan.staffForm;
        const staff = await fromUuid(form.staff.uuid).catch(() => null);
        if (!staff) throw new Error(`${form.staff.name} isn't in PF2e's items here.`);
        const spells = staffSpellsOf(staff.system?.description?.value);
        const { update, kept } = staffWeaponUpdate(holder.toObject(), staff.toObject(), { runesOff: form.runesOff });
        await holder.update({ ...update, [`flags.${MODULE_ID}.${STAFF_FORM}`]: { kept, staff: { uuid: staff.uuid, name: staff.name }, refuses: form.refuses ?? [] } });
        [effect] = await actor.createEmbeddedDocuments("Item", [staffFormEffectSource(form, { item, user, staff: { uuid: staff.uuid, name: staff.name, img: staff.img }, spells, rules: staff.system?.rules ?? [], worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        results.push(`${holder.name} is a ${staff.name} with ${form.charges} charges${form.runesOff ? ", its weapon runes off" : ""}${form.refuses?.length ? `; no ${form.refuses.join(" or ")} in this form` : ""}.`);
    }
    return postStaffCard({ actor, speaker: message?.speaker ?? null, plan, item, user, effect, results });
}

const close = (message, state, lines) => {
    const next = { ...state, status: "applied", results: [...state.results, ...lines] };
    return message.update({ content: staffCardHTML(next), [`flags.${MODULE_ID}.${FLAG}`]: next });
};

export async function applyStaffCard(message, { pick = 0, mythic = false, slot = false, targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "staff-form" || state.status !== "open") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    if (!actor) throw new Error(`${state.item.name}'s user isn't there any more.`);
    const effect = formEffectOf(actor, state.form.itemId);
    if (!effect) return close(message, state, [`${state.item.name} is its own form again.`]);
    if (Number(pick) < 0) {
        await effect.delete();
        return close(message, state, [`${actor.name} commands ${state.item.name} back to its own form.`]);
    }
    const form = formOf(effect);
    const spell = form.spells[Number(pick)] ?? null;
    if (!spell) throw new Error("Pick a spell of the staff's.");
    const heighten = Boolean(mythic) && Boolean(form.mythic);
    const cost = chargesFor(spell, { mythic: heighten, slot: Boolean(slot) }, form);
    if (cost > form.charges) throw new Error(`${state.item.name} has ${form.charges} charge${form.charges === 1 ? "" : "s"} left; ${spell.name}${heighten ? ` at rank ${form.mythic.rank}` : ""} takes ${cost}.`);
    const source = await fromUuid(spell.uuid).catch(() => null);
    if (!source) throw new Error(`${spell.name} isn't in PF2e's spells here.`);
    const traditions = source.system?.traits?.traditions ?? [];
    const numbers = castNumbersOf(actor, traditions);
    if (!numbers) throw new Error(`${actor.name} can't cast ${spell.name} from a staff: no ${traditions.join(", ") || "spellcasting"} entry of their own (it isn't on their spell list).`);
    if (heighten) checkSpend(actor, { mythicPoints: 1 }, state.item.name);
    const slotEntry = slot && !heighten && spell.rank > 0 ? spontaneousSlot(actor, spell.rank) : null;
    if (slot && !heighten && spell.rank > 0 && !slotEntry) throw new Error(`${actor.name} has no spontaneous rank ${spell.rank} slot left.`);
    const castFromItem = game.modules.get(SPELL_ID)?.api?.castFromItem;
    if (!castFromItem) throw new Error(`Cast ${spell.name} by hand (PF2e Automatic Spell Resolution isn't active).`);
    const tokens = (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor);
    const own = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const dc = heighten ? numbers.mythic : numbers.dc;
    const cast = await castFromItem({ actor, token: own?.object ?? undefined, spell: spell.uuid, rank: heighten ? form.mythic.rank : spell.rank || undefined, dc, targets: tokens.map((token) => token.object ?? token), item: { name: state.item.name, uuid: state.item.uuid, img: state.item.img ?? undefined } });
    const lines = [`${actor.name} casts ${spell.name}${cast?.rank ? ` at rank ${cast.rank}` : ""} from ${state.item.name} (DC ${dc}${heighten ? ", mythic proficiency" : ""}, ${numbers.entry.name})${tokens.length ? ` at ${tokens.map((token) => token.name).join(", ")}` : ""}.`];
    if (heighten) await paySpend(actor, { mythicPoints: 1 }, state.item.name);
    if (slotEntry) {
        const value = Number(slotEntry.system.slots[`slot${spell.rank}`].value) || 0;
        await slotEntry.update({ [`system.slots.slot${spell.rank}.value`]: Math.max(0, value - 1) });
        lines.push(`${actor.name} spends a rank ${spell.rank} slot (${slotEntry.name}) and 1 charge.`);
    }
    const left = form.charges - cost;
    if (cost > 0 && left <= 0) {
        await effect.delete();
        lines.push(`Its last charge spent: ${state.item.name} is its own form again.`);
        return close(message, state, lines);
    }
    if (cost > 0) await effect.update({ "system.badge.value": left });
    await close(message, state, lines);
    return postStaffCard({ actor, speaker: message.speaker, plan: state.plan, item: state.item, user: state.user, effect: actor.items.get(effect.id) ?? effect });
}

// Its own weapon back once the form's Effect is gone.
export async function revertStaffForm(actor, itemId) {
    const holder = itemId ? actor?.items?.get?.(itemId) : null;
    const flag = holder?.getFlag(MODULE_ID, STAFF_FORM);
    if (!flag?.kept) return null;
    await holder.update({ ...revertUpdate(flag.kept), [`flags.${MODULE_ID}.-=${STAFF_FORM}`]: null });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(holder.name)}</strong> is its own form again${flag.staff?.name ? `, no longer a ${escape(flag.staff.name)}` : ""}.</p>` });
}

// The activations it refuses in its staff form (Impose Will), or null.
export const staffFormRefusal = (data, activationName) => {
    const flag = data?.flags?.[MODULE_ID]?.[STAFF_FORM];
    return flag && activationName && (flag.refuses ?? []).includes(activationName) ? `${data.name} is a ${flag.staff?.name ?? "staff"} now: no ${activationName} until it's its own form again.` : null;
};

export function setUpStaffForms() {
    Hooks.on("deleteItem", (effect) => {
        const itemId = effect?.type === "effect" ? effect.flags?.[MODULE_ID]?.[STAFF_FORM]?.itemId : null;
        if (!itemId || !isActiveGM()) return;
        revertStaffForm(effect.actor, itemId).catch((error) => console.error(`${MODULE_ID} | staff form`, error));
    });
}
