// The item compiler: PF2e's items as plans for the resolution core. Pure:
// Node, Web Workers and Foundry.
//
// A consumable's text is read by the ability module's compiler (its saves,
// afflictions, PF2e effects and zones), as an action with the item's own
// activation; src/compiler/consumables.js adds what the item's own data says
// (the drinker, PF2e's healing roll, its linked Effect). Spell-casting items
// (scrolls, wands, catalysts, spell gems) stay with the spell module:
// handlesItem() leaves them out.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { readActivations } from "./activation.js";
import { asAbility } from "./ability-shape.js";
import { fitPlan, ownPlan, pf2eRoll, recipientOf } from "./consumables.js";
import { noteRow, ownRow, plainText } from "./rows.js";
import { snareZone } from "./snares.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { rerollOver, rerollPlan } from "./rerolls.js";
import { guardText, guardValues } from "./guards.js";
import { itemActionOver, itemActionPlan } from "./item-actions.js";

export { readActivations, actionTypeOf } from "./activation.js";
export { itemDuration, noteRow, ownRow, plainText } from "./rows.js";
export { isSnare, snareZone } from "./snares.js";
export { castPlan, effectLinks, fitPlan, grantedSpells, nativeHealing, ownPlan, pf2eRoll, recipientOf, spellEffectApplications } from "./consumables.js";

// The consumable categories the spell module resolves (the user's split, 2026-10-10).
export const SPELL_MODULE_CATEGORIES = Object.freeze(["scroll", "wand", "catalyst", "spell-gem"]);

// An item this module compiles: a consumable outside the spell module's categories, and not a catalyst by its trait
// either (20 of PF2e's 107 catalysts are filed as "other": Void Salts, Irritating Seedpod — the spell module's too).
// options.claims: the spell module's claims(item) when it's there (its api in Foundry, its src/compiler/item-claims.js in
// Node) — an item it acts on (Djezet Dose's spellshape) is left to it. Without it, the categories and trait alone.
export function handlesItem(item, options = {}) {
    return item?.type === "consumable" && !SPELL_MODULE_CATEGORIES.includes(item.system?.category) && !(item.system?.traits?.value ?? []).includes("catalyst") && !claimedBySpellModule(item, options);
}

// The spell module's claims (options.claims), false when it isn't given or fails.
export function claimedBySpellModule(item, { claims = null } = {}) {
    if (typeof claims !== "function") return false;
    try {
        return claims(item) === true;
    } catch {
        return false;
    }
}

export { asAbility } from "./ability-shape.js";

// One item → a plan, { builtin }, or null.
// options: the ability compiler's (basicActions, actor) and spellEffects, PF2e's spell Effects by spell name in lower case
// ({ "haste": { uuid, name } }; spellEffectIndex() builds it from the spell-effects pack's items); claims, the spell
// module's (handlesItem).
export function compileItem(item, options = {}) {
    if (!handlesItem(item, options)) return null;
    const read = compileAbility(asAbility(item), options);
    const base = basePlan(item);
    // (A snare: the ability module's zone, set off once by the first creature to enter its square.)
    const snare = snareZone(item, read);
    if (snare) return { ...snare, item: itemInfo(item) };
    // (The ability compiler's last fallback, "no-effect" — the GM's — gives way to a reading of the item's own: its
    // linked Effect, PF2e's healing, a spell's Effect, its row; not to a note alone.)
    const own = read?.builtin === "no-effect" ? ownPlan(item, base, options) ?? rowPlan(item, base) : null;
    let plan = own && !own.noteOnly ? own : (read ? fitPlan(item, read, base, options) : ownPlan(item, base, options)) ?? rowPlan(item, base);
    // (A Strike with riders, src/compiler/strikes.js: Fear Gem.)
    plan = strikeOver(plan, compileStrike(item, base));
    // (A reroll of the roll that triggered it, src/compiler/rerolls.js: Lucky Rabbit's Foot.)
    plan = rerollOver(plan, rerollPlan(item?.system?.description?.value, base));
    // (A skill action taken with it, src/compiler/item-actions.js: Onyx Panther's Sneak.)
    plan = itemActionOver(plan, itemActionPlan(item?.system?.description?.value, base, options));
    if (!plan) return null;
    const source = plan.source ? { ...plan.source, type: item.type, uuid: item.uuid ?? plan.source.uuid ?? null } : plan.source;
    const info = itemInfo(item);
    // (A valued condition read with no value: a note, not the condition, src/compiler/guards.js.)
    return guardText(guardValues({ ...plan, ...(source ? { source } : {}), item: plan.otherRecipient ? { ...info, recipient: "drinker" } : info }), plainText(item?.system?.description?.value));
}

// What the text does to the drinker or user, as the core's check family's automatic row (no roll: the success
// row): its conditions, temporary Hit Points, healing and modifiers; else a note of its text for its time
// (plan.item.noteOnly, counted apart in the census as the spell module counts its note-only spells).
// A row that reads only part of the text (Megaphone Mutagen's drawback, not its benefit for auditory actions) also
// carries the note, and counts as partial (plan.partial): "Effect + note", as the spell module counts its own.
function rowPlan(item, base) {
    const row = ownRow(item);
    const partial = Boolean(row?.unread?.length);
    const note = !row || partial ? noteRow(item) : null;
    if (!row && !note) return null;
    const success = { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: row?.effects ?? [], modifiers: row?.modifiers ?? [], noteEffects: note?.noteEffects ?? [] };
    return {
        ...base,
        automation: { level: row && !partial ? "automatic" : "guided" },
        targeting: { target: recipientOf(item) === "drinker" ? "the drinker" : null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success } },
        ...(!row ? { noteOnly: true } : {}),
        ...(partial ? { partial: true, unread: row.unread } : {}),
        ...(row?.other ? { otherRecipient: true } : {})
    };
}

// The skeleton of a plan the item module builds itself.
function basePlan(item) {
    const activation = readActivations(item?.system?.description?.value)[0] ?? null;
    const traits = [...(item.system?.traits?.value ?? [])];
    return {
        modelVersion: MODEL_VERSION,
        source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits,
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] }
    };
}

// What the live layer and the simulator need to know about the item itself.
function itemInfo(item) {
    return {
        type: item.type,
        category: item.system?.category ?? null,
        level: Number(item.system?.level?.value) || 0,
        uses: item.system?.uses ? { max: Number(item.system.uses.max) || 1, autoDestroy: Boolean(item.system.uses.autoDestroy) } : null,
        // "drinker": the creature who drinks or eats it (the user or an adjacent creature they feed it to); "user": its user.
        recipient: recipientOf(item),
        // How a poison (or another affliction item) reaches a creature: "injury" (on a weapon), "contact", "inhaled", "ingested".
        // (Its trait, else the text's "an uncommon injury poison": Darkening Poison has no trait for it.)
        delivery: ["injury", "contact", "inhaled", "ingested"].find((trait) => (item.system?.traits?.value ?? []).includes(trait))
            ?? (["poison", "drug"].includes(item.system?.category) ? /\b(injury|contact|inhaled|ingested) (?:poison|drug)\b/i.exec(String(item.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))?.[1]?.toLowerCase() ?? null : null),
        // What PF2e's own Use rolls (its healing or damage), so live play doesn't roll it again.
        pf2eRoll: pf2eRoll(item),
        activations: readActivations(item?.system?.description?.value)
    };
}

// PF2e's spell Effects by the spell's name in lower case, from the spell-effects pack's items ("Spell Effect: Haste" → "haste").
export function spellEffectIndex(effects) {
    const index = {};
    for (const effect of effects ?? []) {
        const name = /^Spell Effect:\s*(.+)$/i.exec(effect?.name ?? "")?.[1]?.trim();
        if (!name) continue;
        const uuid = effect.uuid ?? (effect._id ? `Compendium.pf2e.spell-effects.Item.${effect._id}` : null);
        if (uuid) index[name.toLowerCase()] ??= { uuid, name: effect.name };
    }
    return index;
}
