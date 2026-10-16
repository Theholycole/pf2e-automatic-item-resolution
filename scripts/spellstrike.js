// Live play for Spellstrike Ammunition (src/compiler/spellstrike.js; the spell module casts it, 2026-10-16). Its Activate on
// the sheet opens its user's own dialog, on their client: one of their spells and the rank it's cast at. PF2e's spellcasting
// entry spends the slot (or the Focus Point, or the innate use), and one piece of the ammunition holds the spell, split off
// a stack and named for it. What it holds is kept on its actor too, since PF2e's Strike uses the piece up. After PF2e's
// attack roll with that piece, on the active GM's client: a hit casts the spell at the creature hit through the spell
// module's castFromItem (the hit as a spell attack's degree, the caster's spell DC for a save); a miss loses it.

import { chargedName, firedAmmoId, isSpellAttack, spellstrikeProblem } from "../src/compiler/spellstrike.js";
import { MODULE_ID } from "./foundry.js";

const SPELL_ID = "pf2e-automatic-resolution";
const KEY = "spellstrike";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dataOf = (item) => ({ ...item.toObject(false), uuid: item.uuid });

// The spells its user could cast into it: [{ entry, spell, rank, label }], each at each rank it can be cast at up to maxRank.
function castable(actor, maxRank) {
    const found = [];
    for (const entry of actor?.spellcasting?.regular ?? []) {
        for (const spell of entry.spells ?? []) {
            if (spell.isRitual) continue;
            const lowest = spell.isCantrip ? Math.max(1, Math.ceil((Number(actor.level) || 1) / 2)) : Number(spell.baseRank ?? spell.rank) || 1;
            const ranks = spell.isCantrip ? [lowest] : Array.from({ length: Math.max(0, maxRank - lowest + 1) }, (_, index) => lowest + index);
            for (const rank of ranks) {
                if (spellstrikeProblem(dataOf(spell), rank, maxRank)) continue;
                found.push({ entry, spell, rank, label: `${spell.name} (rank ${rank}) — ${entry.name}` });
            }
        }
    }
    return found;
}

// The Activate: the spell and its rank picked, its slot spent, the ammunition holding it. true when it's done.
export async function chargeSpellstrike(ammo, { maxRank }) {
    const actor = ammo?.actor;
    if (!actor) throw new Error("The ammunition isn't in an inventory.");
    if (actor.flags?.[MODULE_ID]?.[KEY]?.[ammo.id]) {
        ui.notifications.warn(`${ammo.name} holds a spell already.`);
        return false;
    }
    const choices = castable(actor, maxRank);
    if (!choices.length) {
        ui.notifications.warn(`${actor.name} has no spell of rank ${maxRank} or lower that targets a creature other than its caster to cast into ${ammo.name}.`);
        return false;
    }
    const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: `Cast a spell into ${ammo.name}` },
        position: { width: 480 },
        content: `<p>Cast one of ${escape(actor.name)}'s spells into ${escape(ammo.name)} (rank ${maxRank} or lower, targeting a creature other than its caster). Its slot is spent now; it goes off at the creature the ammunition hits.</p>
            <div class="form-group"><label>Spell</label><div class="form-fields"><select name="choice">${choices.map((choice, index) => `<option value="${index}">${escape(choice.label)}</option>`).join("")}</select></div></div>`,
        buttons: [
            { action: "cast", label: "Cast it in", icon: "fa-solid fa-wand-sparkles", default: true, callback: (event, button) => Number(button.form.elements.choice.value) },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
    });
    const choice = Number.isInteger(picked) ? choices[picked] : null;
    if (!choice) return false;
    return loadSpellstrike(ammo, choice);
}

// The spell cast into one piece of the ammunition: { entry, spell, rank } (as castable gives them).
export async function loadSpellstrike(ammo, { entry, spell, rank }) {
    const actor = ammo.actor;
    let spent = false;
    try {
        spent = await entry.consume(spell, rank);
    } catch (error) {
        ui.notifications.warn(`${spell.name} can't be cast at rank ${rank} from ${entry.name}: ${error.message}`);
        return false;
    }
    if (!spent) return false;
    const name = chargedName(ammo, spell, rank);
    // (One piece of a stack holds it: split off, so the rest stay empty.)
    let piece = ammo;
    if ((Number(ammo.system?.quantity) || 1) > 1) {
        const source = ammo.toObject();
        delete source._id;
        await ammo.update({ "system.quantity": Number(ammo.system.quantity) - 1 });
        [piece] = await actor.createEmbeddedDocuments("Item", [{ ...source, name, system: { ...source.system, quantity: 1 } }]);
    } else await ammo.update({ name });
    await actor.setFlag(MODULE_ID, `${KEY}.${piece.id}`, { spell: spell.toObject(), name: spell.name, rank, dc: Number(entry.statistic?.dc?.value) || null, attack: isSpellAttack(dataOf(spell)), ammoName: ammo.name });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${escape(actor.name)} casts <strong>${escape(spell.name)}</strong> (rank ${rank}) into ${escape(ammo.name)}. It goes off at the creature the ammunition hits.</p>` });
    return true;
}

// PF2e's attack roll (on the active GM's client): the piece it fired, if it holds a spell — cast on a hit, lost on a miss.
export async function strikeWithSpellstrike(message) {
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || !context.outcome) return;
    const actor = message.actor;
    const held = actor?.flags?.[MODULE_ID]?.[KEY];
    const id = held ? firedAmmoId(context.options) : null;
    const stored = id ? held[id] : null;
    if (!stored) return;
    await actor.unsetFlag(MODULE_ID, `${KEY}.${id}`);
    const speaker = ChatMessage.getSpeaker({ actor });
    const ammoName = stored.ammoName ?? "The spellstrike ammunition";
    if (!["success", "criticalSuccess"].includes(context.outcome)) {
        await ChatMessage.create({ speaker, content: `<p><strong>${escape(ammoName)}</strong> misses: ${escape(stored.name)} is lost.</p>` });
        return;
    }
    const targetUuid = context.target?.token ?? message.flags.pf2e.target?.token ?? null;
    const target = targetUuid ? await fromUuid(targetUuid).catch(() => null) : null;
    const api = game.modules.get(SPELL_ID)?.api;
    const options = api?.castFromItemOptions ?? [];
    const byHand = `${target?.name ?? "the creature hit"}: cast ${stored.name} at rank ${stored.rank} by hand${stored.attack ? `, its spell attack a ${context.outcome === "criticalSuccess" ? "critical hit" : "hit"}` : ""}${stored.dc ? `, its save against DC ${stored.dc}` : ""}`;
    if (!target || !api?.castFromItem || (stored.attack && !options.includes("attackDegree"))) {
        await ChatMessage.create({ speaker, whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${escape(ammoName)}</strong>: ${escape(byHand)}${!api?.castFromItem ? " (PF2e Automatic Spell Resolution isn't active)" : !target ? " (no creature targeted)" : " (this version of the spell module can't yet)"}.</p>` });
        return;
    }
    await api.castFromItem({ actor, token: message.token?.object ?? message.token ?? undefined, spell: stored.spell, rank: stored.rank, dc: stored.dc ?? undefined, targets: [target.object ?? target], item: { name: ammoName, uuid: null }, ...(stored.attack ? { attackDegree: context.outcome } : {}) });
    await ChatMessage.create({ speaker, content: `<p><strong>${escape(ammoName)}</strong> hits ${escape(target.name)}: ${escape(stored.name)} is cast at it.</p>` });
}
