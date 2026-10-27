// Live play for the objects card (src/compiler/objects.js, src/live/objects-card.js): its user's items it can take, listed when it's posted;
// on the active GM's client, the picked item (or the item itself) updated as PF2e keeps items — into the container (its containerId, stowed),
// out of it into a hand, to a hand (held, its hands as its usage says), worn (Crushing Coils), repaired to its full Hit Points; or a weapon
// made in its user's hand (Boots of the Secret Blade's dagger): PF2e's own, with the text's runes, flagged as the item's — the next one made
// replaces it, or (Necklace of Knives') it goes once it's out of the hand.

import { storable } from "../src/compiler/stored-spell.js";
import { ruleEffectSource } from "../src/live/card.js";
import { anyItemChoices, createObjectsCard, douseable, objectsCardHTML } from "../src/live/objects-card.js";
import { fortuneEffectSource } from "../src/live/fortune-card.js";
import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { chargesOf } from "../src/live/charges.js";
import { FLAG, MODULE_ID, creaturesNear, entryOf, isActiveGM, spaceOf, stateOf } from "./foundry.js";
import { pauseEffectSource, pauseWords } from "../src/live/shield-repair.js";

const SPELL_ID = "pf2e-automatic-resolution";

const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "consumable", "treasure", "ammo", "book"]);
const bulkOf = (item) => Number(item?.system?.bulk?.value ?? 0) || 0;
// (And its level, Forgefather's Seal's "of its level or lower": objects.maxLevel, 2026-10-27.)
const fits = (item, objects) => (!Number.isFinite(objects.maxBulk) || bulkOf(item) <= objects.maxBulk) && (!Number.isFinite(objects.maxLevel) || (Number(item.system?.level?.value) || 0) <= objects.maxLevel);
const itemsOf = (actor) => [...(actor?.items ?? [])].filter((item) => PHYSICAL.has(item.type));
// (A weapon's rounds loaded — PF2e keeps them as its subitems — and how many it holds; its user's ammunition for it, PF2e's isAmmoFor.)
const loadedOf = (weapon) => [...(weapon?.subitems ?? [])].filter((entry) => entry.isOfType?.("ammo") || entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
const capacityOf = (weapon) => Number(weapon?.system?.ammo?.capacity) || 1;
const ammoFor = (actor, weapon) => [...(actor?.items ?? [])].find((item) => item.type === "ammo" && (Number(item.quantity ?? item.system?.quantity) || 0) > 0 && (item.isAmmoFor?.(weapon) ?? false)) ?? null;
// (Its user's ammunition for it run out — the missed round was its last: that stack, to give the round back to.)
const spentAmmoFor = (actor, weapon) => [...(actor?.items ?? [])].find((item) => item.type === "ammo" && (item.isAmmoFor?.(weapon) ?? false)) ?? null;

// (A spell an item holds, src/compiler/stored-spell.js: its flag, { source, rank, name }.)
export const storedOf = (item) => item?.flags?.[MODULE_ID]?.storedSpell ?? null;
// A spell's numbers for what an item stores: its rank, actions (1–3, the fewest of "1 to 3"; else none), traits and target.
const spellFacts = (spell) => ({ rank: Number(spell?.rank ?? spell?.system?.location?.heightenedLevel ?? spell?.system?.level?.value) || 1, actions: Number(/\d/.exec(String(spell?.system?.time?.value ?? ""))?.[0]) || 0, traits: [...(spell?.system?.traits?.value ?? [])], target: String(spell?.system?.target?.value ?? "") });
const scrollSpell = (item) => item?.type === "consumable" && item.system?.spell ? item.system.spell : null;
// Its user's spells, or scrolls, it can store: { id, name, kind, rank }.
function storableChoices(actor, store) {
    if (store?.from === "scroll") return [...(actor?.items ?? [])].filter((item) => {
        const spell = scrollSpell(item);
        return spell && storable(store, { ...spellFacts(spell), rank: Number(spell.system?.location?.heightenedLevel ?? spell.system?.level?.value) || 1 });
    }).map((item) => ({ id: item.id, name: item.name, kind: "scroll", rank: Number(scrollSpell(item).system?.location?.heightenedLevel ?? scrollSpell(item).system?.level?.value) || 1 }));
    // (A cantrip at its caster's rank, half its level rounded up — PF2e's own.)
    const rankOf = (spell) => ((spell.system?.traits?.value ?? []).includes("cantrip") ? Math.max(1, Math.ceil((Number(actor?.level) || 1) / 2)) : spellFacts(spell).rank);
    return (actor?.itemTypes?.spell ?? []).filter((spell) => !spell.isRitual && storable(store, spellFacts(spell))).map((spell) => ({ id: spell.id, name: `${spell.name} (rank ${rankOf(spell)})`, kind: "spell", rank: rankOf(spell) }));
}

// Its user's items the op can take: { id, name }.
export function objectChoices(actor, objects, holderId) {
    if (["cast-stored", "ready-stored", "expend-stored"].includes(objects.op)) return objects.op === "cast-stored" && !storedOf(actor?.items?.get?.(holderId)) ? storableChoices(actor, objects.store) : [];
    if (objects.self) return [];
    const items = itemsOf(actor).filter((item) => item.id !== holderId);
    const held = (item) => item.system?.equipped?.carryType === "held";
    const list = objects.op === "store" ? items.filter((item) => held(item) && fits(item, objects))
        : objects.op === "retrieve" ? items.filter((item) => item.system?.containerId === holderId)
            : objects.op === "hand" ? items.filter((item) => !held(item) && fits(item, objects) && (!objects.weapon || item.type === "weapon"))
                : objects.op === "repair" ? items.filter((item) => Number(item.system?.hp?.max) > 0 && Number(item.system?.hp?.value) < Number(item.system?.hp?.max) && fits(item, objects))
                    : objects.op === "reload" ? items.filter((item) => item.type === "weapon" && String(item.system?.reload?.value ?? "") === String(objects.reload) && loadedOf(item) < capacityOf(item) && (ammoFor(actor, item) || (objects.recalled && (spentAmmoFor(actor, item) || item.getFlag?.(MODULE_ID, "lastRound")))))
                        : [];
    return list.map((item) => ({ id: item.id, name: item.name }));
}

// The lights within its user's reach it can put out (op "douse"): each creature's light Effects that fit (src/live/objects-card.js douseable), a
// token's own light, and the scene's placed lights — { kind, id, name, actorUuid?, tokenUuid? }.
function lightChoices(token, actor, objects) {
    const placeable = token?.object ?? token ?? null;
    if (!placeable || !canvas?.ready) return [];
    const reach = Math.max(5, Number(actor?.system?.attributes?.reach?.base) || 5);
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    const from = spaceOf(placeable);
    const near = [placeable, ...canvas.tokens.placeables.filter((other) => other !== placeable && !other.document.hidden && distanceFeet(from, spaceOf(other), grid) <= reach)];
    const choices = [];
    for (const other of near) {
        for (const effect of other.actor?.itemTypes?.effect ?? []) {
            const facts = { level: effect.system?.level?.value, spell: fromSpell(effect), rules: effect.system?.rules ?? [] };
            if (douseable(facts, objects)) choices.push({ kind: "effect", id: effect.id, actorUuid: other.actor.uuid, name: `${other.name}: ${effect.name}` });
        }
        const light = other.document?.light ?? {};
        if ((Number(light.bright) || 0) > 0 || (Number(light.dim) || 0) > 0) choices.push({ kind: "token", id: other.document.id, tokenUuid: other.document.uuid, name: `${other.name}'s light` });
    }
    for (const light of canvas.lighting?.placeables ?? []) {
        const data = light.document;
        if (data.hidden || !((Number(data.config?.dim) || 0) > 0 || (Number(data.config?.bright) || 0) > 0)) continue;
        if (distanceFeet(from, { x: Number(data.x), y: Number(data.y), w: 1, h: 1, elevation: 0 }, grid) > reach) continue;
        choices.push({ kind: "ambient", id: data.id, sceneId: data.parent?.id ?? canvas.scene?.id, name: `A light on the scene (${Number(data.config?.bright) || 0}/${Number(data.config?.dim) || 0} feet)` });
    }
    return choices;
}

// (A spell's Effect: PF2e's "spell-effect-" slug, or its origin item a spell.)
function fromSpell(effect) {
    if (/^spell-effect-/.test(String(effect.slug ?? effect.system?.slug ?? ""))) return true;
    try {
        return fromUuidSync(effect.system?.context?.origin?.item ?? "")?.type === "spell";
    } catch {
        return false;
    }
}

// The picked light put out. → the card's line.
async function douseLight(choice) {
    if (!choice) throw new Error("No light within reach to put out.");
    if (choice.kind === "effect") {
        const owner = await fromUuid(choice.actorUuid).catch(() => null);
        const effect = owner?.items?.get?.(choice.id);
        if (!effect) throw new Error(`${choice.name} isn't there any more.`);
        await effect.delete();
        return `${choice.name}: put out.`;
    }
    if (choice.kind === "token") {
        const document = await fromUuid(choice.tokenUuid).catch(() => null);
        if (!document) throw new Error(`${choice.name} isn't there any more.`);
        await document.update({ "light.bright": 0, "light.dim": 0 });
        return `${choice.name}: put out.`;
    }
    const scene = game.scenes?.get?.(choice.sceneId) ?? canvas.scene;
    const light = scene?.lights?.get?.(choice.id);
    if (!light) throw new Error("That light isn't there any more.");
    await light.update({ hidden: true });
    return `${choice.name}: put out (hidden; the GM shows it again if it's relit).`;
}

// The items of the creatures within its user's reach the op can take: { id, name, actorUuid }.
function reachChoices(token, actor, objects) {
    const reach = Math.max(5, Number(actor?.system?.attributes?.reach?.base) || 5);
    return creaturesNear(token, reach).flatMap((entry) => {
        const other = fromUuidSync(entry.tokenUuid ?? "")?.actor ?? fromUuidSync(entry.actorUuid ?? "") ?? null;
        return other && other.uuid !== actor?.uuid ? objectChoices(other, objects, null).map((choice) => ({ ...choice, name: `${entry.name}: ${choice.name}`, actorUuid: other.uuid })) : [];
    });
}

// (The shapes a weapon can take, src/compiler/objects.js op "reshape": its other form — Anchor Spear's — or PF2e's base melee weapons held in as
// many hands as it is — the Shifting rune's —, by name, its own left out.)
const RESHAPE_FIELDS = ["system.baseItem", "system.slug", "system.usage.value", "system.range", "system.level.value"];
export async function reshapeChoices(holder, objects) {
    const pack = game.packs.get("pf2e.equipment-srd");
    if (!pack || !holder) return [];
    const index = await pack.getIndex({ fields: RESHAPE_FIELDS });
    const weapons = index.filter((row) => row.type === "weapon");
    const own = holder.system?.baseItem ?? null;
    if (objects.forms) return objects.forms.map((form) => weapons.find((row) => row.name.toLowerCase() === form && (row.system?.baseItem ?? row.system?.slug) === row.system?.slug)).filter((row) => row && row.system?.slug !== own).map((row) => ({ id: row._id, name: row.name }));
    const hands = holder.system?.usage?.value ?? null;
    return weapons.filter((row) => (Number(row.system?.level?.value) || 0) === 0 && !row.system?.range && row.system?.usage?.value === hands && row.system?.slug && row.system?.baseItem === row.system.slug && row.system.slug !== own)
        .sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({ id: row._id, name: row.name }));
}

// The weapon in that shape: its base weapon's own numbers and traits — the item's other traits, its runes, name and material kept.
export async function reshapeWeapon(holder, entryId) {
    const pack = game.packs.get("pf2e.equipment-srd");
    const shape = (await pack.getDocument(entryId))?.toObject();
    if (!shape) throw new Error("That weapon wasn't found in PF2e's equipment.");
    const index = await pack.getIndex({ fields: RESHAPE_FIELDS });
    const before = holder.system?.baseItem ? index.find((row) => row.type === "weapon" && row.system?.slug === holder.system.baseItem) : null;
    const old = before ? new Set((await pack.getDocument(before._id))?.system?.traits?.value ?? []) : new Set();
    const traits = [...new Set([...(holder.system?.traits?.value ?? []).filter((trait) => !old.has(trait)), ...(shape.system.traits?.value ?? [])])];
    await holder.update({
        "system.baseItem": shape.system.baseItem ?? shape.system.slug,
        "system.damage.die": shape.system.damage.die,
        "system.damage.damageType": shape.system.damage.damageType,
        "system.group": shape.system.group,
        "system.category": shape.system.category,
        "system.usage.value": shape.system.usage?.value ?? holder.system.usage?.value,
        "system.bulk.value": shape.system.bulk?.value ?? holder.system.bulk?.value,
        "system.reload.value": shape.system.reload?.value ?? null,
        "system.range": shape.system.range ?? null,
        "system.traits.value": traits
    });
    return shape.name;
}

// (A weapon of its user's choice from groups, Armory Bracelet's charm: PF2e's common base weapons of those groups, by name and group.)
export async function charmChoices(objects, actor = null) {
    const pack = game.packs.get("pf2e.equipment-srd");
    if (!pack) return [];
    // (Any item of PF2e's of a kind, The Wanderer's "any Common permanent magic item, weapon, or piece of gear of a level no higher than your level
    // -2" of Light Bulk: src/live/objects-card.js anyItemChoices, by its user's level.)
    if (objects.choose?.any) return anyItemChoices(await pack.getIndex({ fields: ["system.level.value", "system.traits.rarity", "system.traits.value", "system.bulk.value", "system.slug"] }), objects.choose.any, Number(actor?.level) || 0);
    const index = await pack.getIndex({ fields: [...RESHAPE_FIELDS, "system.group", "system.traits.rarity"] });
    const groups = new Set(objects.choose?.groups ?? []);
    return index.filter((row) => row.type === "weapon" && (Number(row.system?.level?.value) || 0) === 0 && groups.has(row.system?.group) && row.system?.slug && row.system?.baseItem === row.system.slug && (!objects.choose?.common || (row.system?.traits?.rarity ?? "common") === "common"))
        .sort((a, b) => String(a.system.group).localeCompare(String(b.system.group)) || a.name.localeCompare(b.name)).map((row) => ({ id: row._id, name: `${row.name} (${row.system.group})` }));
}

export async function postObjectsCard({ message, plan, used, actor, token }) {
    const holderId = String(used.data.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? used.data._id ?? null;
    const held = storedOf(actor?.items?.get?.(holderId));
    const own = plan.objects.op === "reshape" ? await reshapeChoices(actor?.items?.get?.(holderId), plan.objects) : plan.objects.op === "create" && plan.objects.choose ? await charmChoices(plan.objects, actor) : objectChoices(actor, plan.objects, holderId);
    // (And the items of the creatures within its user's reach, Forgefather's Seal's "an item within reach": each named with its owner, 2026-10-27.)
    const choices = plan.objects.op === "douse" ? lightChoices(token, actor, plan.objects) : plan.objects.reach ? [...own, ...reachChoices(token, actor, plan.objects)] : own;
    const state = createObjectsCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, id: holderId }, user: entryOf(token, actor), choices, stored: held ? { name: held.name, rank: held.rank } : null });
    return ChatMessage.create({ content: objectsCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

const handsFor = (item) => (/two-hands/.test(String(item.system?.usage?.value ?? "")) ? 2 : 1);

// On the active GM's client: { pick, targets } → the item updated, the card applied.
export async function applyObjectsCard(message, { pick = 0, targets = [], amount = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "objects" || state.status !== "open") return null;
    const actor = state.user.actorUuid ? await fromUuid(state.user.actorUuid).catch(() => null) : null;
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const objects = state.plan.objects;
    const holder = state.item.id ? actor.items.get(state.item.id) : null;
    if (["cast-stored", "ready-stored", "expend-stored"].includes(objects.op)) {
        const line = await storedSpellOp(state, { actor, holder, pick: Number(pick) || 0, targets });
        const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [line] };
        return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
    // (Another creature's item damaged, Rustbringer's disarmed weapon: src/compiler/objects.js op "damage".)
    if (objects.op === "damage") return damageTheirItem(message, state, { pick: Number(pick) || 0, targets });
    // (A light within its user's reach put out, Spellcutter's: src/compiler/unique-rules.js withDoused, 2026-10-27.)
    if (objects.op === "douse") {
        const line = await douseLight(state.choices[Number(pick) || 0]);
        const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [line] };
        return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
    // (Its own shape changed, Anchor Spear's and the Shifting rune's: the picked base weapon's numbers on it.)
    if (objects.op === "reshape") {
        const shape = state.choices[Number(pick) || 0];
        if (!holder) throw new Error(`${state.item.name} isn't on ${state.user.name} any more.`);
        if (!shape) throw new Error(`${state.item.name} has no other shape to take.`);
        const name = await reshapeWeapon(holder, shape.id);
        const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [`${holder.name} takes the shape of a ${name.toLowerCase()}, its runes kept`] };
        return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    }
    const choice = state.choices[Number(pick) || 0] ?? null;
    // (Another creature's within reach: its own item, src/compiler/unique-rules.js withMended.)
    const owner = choice?.actorUuid ? await fromUuid(choice.actorUuid).catch(() => null) : null;
    const chosen = objects.self ? holder : choice ? (owner ?? actor).items.get(choice.id) : null;
    // (A weapon made by a talisman used up as it's made, Chain of Stars': no holder needed.)
    const spentMaker = objects.op === "create" && objects.self && !holder && state.plan.item?.type === "consumable";
    if (!chosen && !spentMaker) throw new Error(objects.self ? `${state.item.name} isn't on ${state.user.name} any more.` : `Pick one of ${state.user.name}'s items first.`);
    // (Still fit for it: the item may have moved since the card was posted.)
    if (!objects.self && !objectChoices(owner ?? actor, objects, owner ? null : state.item.id).some((entry) => entry.id === chosen.id)) throw new Error(`${chosen.name} can't be taken now.`);
    let line;
    if (objects.op === "store") {
        if (!holder) throw new Error(`${state.item.name} isn't on ${state.user.name} any more.`);
        await chosen.update({ "system.containerId": holder.id, "system.equipped.carryType": "stowed", "system.equipped.handsHeld": 0 });
        line = `${chosen.name} vanishes into ${holder.name}`;
    } else if (objects.op === "retrieve" || objects.op === "hand") {
        await chosen.update({ "system.containerId": null, "system.equipped.carryType": "held", "system.equipped.handsHeld": handsFor(chosen) });
        line = `${chosen.name} is in ${state.user.name}'s ${handsFor(chosen) === 2 ? "hands" : "hand"}`;
        // (And loaded, Liquid Gold (Greater)'s: one round of its ammunition, PF2e's own attach — when it takes ammunition and has room.)
        if (objects.load && chosen.type === "weapon" && chosen.system?.reload?.value !== undefined && String(chosen.system.reload.value) !== "0" && loadedOf(chosen) < capacityOf(chosen)) {
            const ammo = ammoFor(actor, chosen);
            if (ammo) {
                await chosen.attach(ammo, { quantity: 1, stack: true });
                line += `, loaded with ${ammo.name}`;
            } else line += ` (no ammunition for it to load)`;
        }
    } else if (objects.op === "don") {
        await chosen.update({ "system.containerId": null, "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.handsHeld": 0 });
        line = `${state.user.name} wears ${chosen.name}`;
    } else if (objects.op === "charge") {
        // (Charges kept on it, Conflagration Club's: its flag, refused while it still has some — its Requirements.)
        const typed = Math.max(0, Math.floor(Number(amount) || 0));
        if (!typed) throw new Error(`Type ${objects.typed} first.`);
        const held = chargesOf(chosen.getFlag?.(MODULE_ID, "charges") ?? chosen.flags?.[MODULE_ID]?.charges);
        if (objects.onlyWhenEmpty && held) throw new Error(`${chosen.name} still has ${held.count} ${held.type ?? ""} charge${held.count === 1 ? "" : "s"}: it can't take more until they're spent.`);
        await chosen.setFlag(MODULE_ID, "charges", { count: typed, type: objects.attune ?? null });
        line = `${chosen.name} holds ${typed} ${objects.attune ?? ""} charge${typed === 1 ? "" : "s"} (its card that spends them takes them)`;
    } else if (objects.op === "repair" && objects.typed) {
        // (By the amount its user typed, at most its Hardness: Sanguine Klar's bleed damage.)
        const typed = Math.max(0, Math.floor(Number(amount) || 0));
        if (!typed) throw new Error(`Type ${objects.typed} first.`);
        const max = Number(chosen.system?.hp?.max) || 0;
        const before = Number(chosen.system?.hp?.value) || 0;
        const cap = objects.upTo === "hardness" ? Number(chosen.system?.hardness) || 0 : typed;
        const after = Math.min(max, before + Math.min(typed, cap));
        await chosen.update({ "system.hp.value": after });
        line = `${chosen.name} regains ${after - before} Hit Points (${typed} typed${objects.upTo === "hardness" ? `, at most its Hardness ${cap}` : ""}): ${after}/${max}`;
    } else if (objects.op === "repair" && objects.amount) {
        // (By an amount, Rust Scrub's 2d4: rolled, up to its maximum.)
        const max = Number(chosen.system?.hp?.max) || 0;
        const before = Number(chosen.system?.hp?.value) || 0;
        const roll = await new Roll(objects.amount).evaluate();
        const after = Math.min(max, before + Math.max(0, roll.total));
        await chosen.update({ "system.hp.value": after });
        line = `${chosen.name} regains ${after - before} Hit Points (rolled ${objects.amount} = ${roll.total}): ${after}/${max}`;
    } else if (objects.op === "repair" && objects.pf2eRepair) {
        // (PF2e's own Repair, Flawless Celestial Shawl's Reweave: its Crafting check one degree better — the readied card's AdjustDegreeOfSuccess on
        // its user first, spent by that roll (scripts/fortune.js) — 2026-10-27.)
        if (objects.degree) await actor.createEmbeddedDocuments("Item", [fortuneEffectSource({ state: { plan: { builtin: "readied-bonus", bonus: { modifiers: [], degree: objects.degree, spend: [objects.degree.selector], duration: { value: 1, unit: "minutes", expiry: "turn-start" } } }, item: state.item, user: state.user }, worldTime: game.time.worldTime, moduleId: MODULE_ID })]);
        if (!game.pf2e?.actions?.repair) throw new Error("PF2e's Repair action isn't there.");
        await game.pf2e.actions.repair({ item: chosen, actors: [actor] });
        line = `PF2e's Repair of ${owner ? `${owner.name}'s ` : ""}${chosen.name}: ${actor.name}'s Crafting check${objects.degree ? ", one degree of success better" : ""} (its card's buttons restore the Hit Points)`;
    } else if (objects.op === "repair") {
        const max = Number(chosen.system?.hp?.max) || 0;
        const destroyed = (Number(chosen.system?.hp?.value) || 0) <= 0;
        await chosen.update({ "system.hp.value": max });
        line = `${owner ? `${owner.name}'s ` : ""}${chosen.name} is ${destroyed ? "remade" : "repaired"} (${max} Hit Points), no longer broken${destroyed ? " or destroyed" : ""}`;
        // (What its use stops until its user's next daily preparations, Forgefather's Seal's shields' repair: an Effect on its user then,
        // scripts/shield-repair.js.)
        if (objects.pauses) {
            await actor.createEmbeddedDocuments("Item", [pauseEffectSource(objects.pauses, { item: state.item, user: state.user, worldTime: game.time.worldTime })]);
            line += `; ${pauseWords(objects.pauses)}`;
        }
    } else if (objects.op === "reload") {
        // (One round of its user's ammunition for it: PF2e's own attach, as the weapon's reload button does. Recalled, Persistent Lodestone's: the round
        // it missed with given back first, so none of its user's is spent.)
        let ammo = ammoFor(actor, chosen) ?? (objects.recalled ? spentAmmoFor(actor, chosen) : null);
        // (Its stack gone — the round it missed with was its last, PF2e deleting the empty stack —: that round, kept on the firearm as it was
        // spent (setUpMadeWeapons' preUpdateItem), its stack again — the live check's reading, 2026-10-27.)
        const last = !ammo && objects.recalled ? chosen.getFlag?.(MODULE_ID, "lastRound") : null;
        if (last) {
            const { _id, ...source } = foundry.utils.deepClone(last);
            [ammo] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...(source.system ?? {}), quantity: 0 } }]);
        }
        if (!ammo) throw new Error(`${state.user.name} has no ammunition for ${chosen.name}.`);
        if (objects.recalled) await ammo.update({ "system.quantity": (Number(ammo.quantity ?? ammo.system?.quantity) || 0) + 1 });
        await chosen.attach(ammo, { quantity: 1, stack: true });
        line = objects.recalled ? `${chosen.name} is loaded again with the ${ammo.name} it missed with` : `${chosen.name} is reloaded with ${ammo.name}`;
    } else if (objects.op === "create") {
        // (The last one this item made, gone first when a new one replaces it.)
        // (Its holder spent by then — a talisman used up, Chain of Stars': its name and id from the card.)
        const holderId = holder?.id ?? state.item.id;
        const holderName = holder?.name ?? state.item.name;
        const madeBy = (item) => item.flags?.[MODULE_ID]?.made?.by === holderId;
        const old = objects.replaces ? actor.items.filter(madeBy).map((item) => item.id) : [];
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
        // (Picked from its groups, Armory Bracelet's: PF2e's weapon by its id.)
        const picked = objects.choose ? state.choices[Number(pick) || 0] : null;
        if (objects.choose && !picked) throw new Error(`Pick the weapon first.`);
        const source = picked ? await weaponSourceById(picked.id) : await weaponSource(objects.weapon);
        source.name = `${source.name} (${holderName})`;
        // (Any item picked, The Wanderer's: as PF2e has it, its own runes kept.)
        if (!objects.choose?.any) source.system.runes = { ...(source.system.runes ?? {}), potency: Number(objects.potency) || 0, striking: Number(objects.striking) || 0 };
        // (Several of them, of another damage type: Chain of Stars' three force shuriken.)
        if (Number(objects.quantity) > 1) source.system.quantity = Number(objects.quantity);
        if (objects.damageType) source.system.damage = { ...(source.system.damage ?? {}), damageType: objects.damageType };
        source.system.equipped = { ...(source.system.equipped ?? {}), carryType: "held", handsHeld: /two-hands/.test(String(source.system.usage?.value ?? "")) ? 2 : 1 };
        // (Its runes lower after a time, and it crumbles at its user's next daily preparations: scripts/expiring.js, setUpMadeWeapons.)
        const then = objects.then ? { downgradeAt: game.time.worldTime + (Number(objects.then.after.value) || 1) * 60, downgrade: { potency: objects.then.potency, striking: objects.then.striking } } : {};
        // (For a time, The Wanderer's minute: scripts/expiring.js removes it then; gone too once it isn't attended — dropped —, whileAttended.)
        const lasts = objects.lasts ? { expiresAt: game.time.worldTime + (Number(objects.lasts.value) || 1) * ({ rounds: 6, minutes: 60, hours: 3600 }[objects.lasts.unit] ?? 60) } : {};
        source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { ...lasts, made: { by: holderId, from: holderName, ...(objects.whileHeld ? { whileHeld: true } : {}), ...(objects.whileAttended ? { whileAttended: true } : {}), ...(objects.untilRest ? { untilRest: true } : {}), ...(objects.vanishAfterAttack ? { vanishAfterAttack: true } : {}), ...then } } };
        const [made] = await actor.createEmbeddedDocuments("Item", [source]);
        // (Its ammunition with it, when it takes some: PF2e's ammunition of its kind.)
        const ammo = objects.ammo && made.system?.ammo?.baseType ? await ammoSource(made.system.ammo.baseType) : null;
        if (ammo) await actor.createEmbeddedDocuments("Item", [{ ...ammo, system: { ...ammo.system, quantity: objects.ammo }, flags: { ...(ammo.flags ?? {}), [MODULE_ID]: { made: { by: holderId, from: holderName, ...(objects.untilRest ? { untilRest: true } : {}) } } } }]);
        line = `${Number(objects.quantity) > 1 ? `${objects.quantity} ` : ""}${made.name} ${Number(objects.quantity) > 1 ? "are" : "is"} in ${state.user.name}'s hand${objects.damageType ? ` (${objects.damageType} damage${objects.vanishAfterAttack ? ", each gone after its attack" : ""})` : ""}${ammo ? `, with ${objects.ammo} ${ammo.name}` : ""}${old.length ? ", the last one gone" : ""}${objects.then ? `; after ${objects.then.after.value} minute it becomes ${objects.then.potency ? `+${objects.then.potency}${objects.then.striking ? ` ${["", "", "greater ", "major "][objects.then.striking]}striking` : ""}` : "non-magical"}` : ""}${objects.untilRest ? ", until its user's next daily preparations" : ""}: Strike with it`;
    } else throw new Error(`${state.item.name}: nothing to do (${objects.op}).`);
    const next = { ...state, status: "applied", pick: Number(pick) || 0, results: [line] };
    return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The targeted creature's items of that kind: the ones it dropped (PF2e's carryType "dropped") when there are any, else all — those PF2e keeps
// Hit Points for first (a plain weapon's are 0: its own material table's, which PF2e leaves out).
export function theirItems(actor, kind) {
    const all = itemsOf(actor).filter((item) => item.type === kind);
    const dropped = all.filter((item) => item.system?.equipped?.carryType === "dropped");
    const pool = dropped.length ? dropped : all;
    const kept = pool.filter((item) => Number(item.system?.hp?.max) > 0);
    return (kept.length ? kept : pool).map((item) => ({ id: item.id, name: item.name }));
}

// Its Hit Points after the damage, its Hardness ignored (or not), and what it is then: broken at its Broken Threshold, destroyed at 0. Pure.
export function damagedItem(hp, total, { hardness = 0, ignoresHardness = true } = {}) {
    const before = Number(hp?.value) || 0;
    const taken = Math.max(0, (Number(total) || 0) - (ignoresHardness ? 0 : Number(hardness) || 0));
    const after = Math.max(0, before - taken);
    return { before, after, taken, state: after === 0 ? "destroyed" : after <= (Number(hp?.brokenThreshold) || 0) ? "broken" : null };
}

// (The first Apply finds the targeted creature's item, or lists several for a second; then the roll, its Hit Points lowered.)
async function damageTheirItem(message, state, { pick, targets }) {
    const objects = state.plan.objects;
    let choices = state.choices ?? [];
    let owner = state.owner ?? null;
    if (!choices.length || !owner) {
        const token = targets?.[0] ? await fromUuid(targets[0]).catch(() => null) : null;
        const actor = token?.actor ?? null;
        if (!actor) throw new Error(`Target the creature whose ${objects.of} it is first.`);
        choices = theirItems(actor, objects.of);
        if (!choices.length) throw new Error(`${token.name ?? actor.name} has no ${objects.of}.`);
        owner = { actorUuid: actor.uuid, name: token.name ?? actor.name };
        if (choices.length > 1) {
            const listed = { ...state, choices, owner, pick: 0 };
            return message.update({ content: objectsCardHTML(listed, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: listed });
        }
    }
    const actor = await fromUuid(owner.actorUuid).catch(() => null);
    const chosen = actor?.items?.get?.(choices[pick]?.id ?? choices[0]?.id) ?? null;
    if (!chosen) throw new Error(`That ${objects.of} isn't on ${owner.name} any more.`);
    const roll = await new Roll(objects.formula).evaluate();
    const hp = chosen.system?.hp ?? {};
    const result = damagedItem(hp, roll.total, { hardness: chosen.system?.hardness, ignoresHardness: objects.ignoresHardness });
    const kept = Number(hp.max) > 0;
    if (kept) await chosen.update({ "system.hp.value": result.after });
    const taken = `${result.taken}${objects.type && objects.type !== "untyped" ? ` ${objects.type}` : ""} damage (rolled ${objects.formula} = ${roll.total}${objects.ignoresHardness ? ", its Hardness ignored" : ""})`;
    // (No Hit Points PF2e keeps for it: the damage said, the GM's to mark by its material.)
    const line = kept ? `${owner.name}'s ${chosen.name} takes ${taken}: ${result.after}/${Number(hp.max) || 0} Hit Points${result.state ? `, ${result.state}` : ""}` : `${owner.name}'s ${chosen.name} takes ${taken}; PF2e keeps no Hit Points for it, so the GM marks it by its material`;
    const next = { ...state, status: "applied", choices, owner, pick, results: [line] };
    return message.update({ content: objectsCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// PF2e's own weapon by its compendium id, as a new item's source.
async function weaponSourceById(id) {
    const pack = game.packs.get("pf2e.equipment-srd");
    const document = pack ? await pack.getDocument(id) : null;
    if (!document) throw new Error("That weapon wasn't found in PF2e's equipment.");
    const source = document.toObject();
    delete source._id;
    source._stats = { ...(source._stats ?? {}), compendiumSource: `Compendium.pf2e.equipment-srd.Item.${id}` };
    return source;
}

// PF2e's ammunition of a kind ("arrows", "bolts"), as a new item's source, or null.
async function ammoSource(kind) {
    const pack = game.packs.get("pf2e.equipment-srd");
    const index = pack ? await pack.getIndex({ fields: ["system.slug", "system.baseItem", "system.level.value"] }) : [];
    const entry = index.find((row) => row.type === "ammo" && (row.system?.slug === kind || row.system?.baseItem === kind) && !(Number(row.system?.level?.value) > 0));
    if (!entry) return null;
    const source = (await pack.getDocument(entry._id)).toObject();
    delete source._id;
    return source;
}

// PF2e's own weapon of that name ("dagger"), as a new item's source.
async function weaponSource(weapon) {
    const pack = game.packs.get("pf2e.equipment-srd");
    const name = String(weapon ?? "").replace(/^./, (letter) => letter.toUpperCase());
    const entry = pack ? (await pack.getIndex()).find((row) => row.name === name && row.type === "weapon") : null;
    if (!entry) throw new Error(`PF2e's ${name} wasn't found.`);
    const source = (await pack.getDocument(entry._id)).toObject();
    delete source._id;
    source._stats = { ...(source._stats ?? {}), compendiumSource: `Compendium.pf2e.equipment-srd.Item.${entry._id}` };
    return source;
}

// (A weapon made to last while it's held, Necklace of Knives': gone once it's out of the hand — dropped, stowed or worn.)
// (A made weapon gone after its attack, Chain of Stars' shuriken: one fewer after each attack with it — a miss's attack roll, a hit's damage roll, so
// that PF2e still has the weapon to roll the hit's damage with —, deleted after the last; on the active GM's client.)
export async function spendMadeAfterAttack(message) {
    const context = message?.flags?.pf2e?.context;
    const missed = context?.type === "attack-roll" && ["failure", "criticalFailure"].includes(context.outcome);
    const struck = context?.type === "damage-roll" && context.sourceType === "attack";
    if (!missed && !struck) return null;
    const uuid = message.flags.pf2e.origin?.uuid ?? null;
    const weapon = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!weapon?.flags?.[MODULE_ID]?.made?.vanishAfterAttack) return null;
    const quantity = Number(weapon.system?.quantity) || 1;
    if (quantity > 1) return weapon.update({ "system.quantity": quantity - 1 });
    return weapon.delete();
}

export function setUpMadeWeapons() {
    // (The round a firearm spends, kept on it as PF2e's update takes it from its loaded rounds: its stack may be gone after — Persistent
    // Lodestone's recalled round, scripts/objects.js reload. 2026-10-27.)
    Hooks.on("preUpdateItem", (item, changes) => {
        if (item?.type !== "weapon" || !foundry.utils.hasProperty(changes, "system.subitems")) return;
        const after = foundry.utils.getProperty(changes, "system.subitems") ?? [];
        const spent = (item._source?.system?.subitems ?? []).find((entry) => entry?.type === "ammo" && (Number(after.find((next) => next?._id === entry._id)?.system?.quantity) || 0) < (Number(entry.system?.quantity) || 0));
        if (spent) foundry.utils.setProperty(changes, `flags.${MODULE_ID}.lastRound`, { ...foundry.utils.deepClone(spent), system: { ...foundry.utils.deepClone(spent.system ?? {}), quantity: 1 } });
    });
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM()) return;
        spendMadeAfterAttack(message).catch((error) => console.error(`${MODULE_ID} | a made weapon after its attack`, error));
    });
    // (Made until its user's next daily preparations, Armory Bracelet's weapon and ammunition: gone at PF2e's Rest for the Night.)
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (!isActiveGM()) return;
        const ids = (actor?.items?.contents ?? []).filter((item) => item.flags?.[MODULE_ID]?.made?.untilRest).map((item) => item.id);
        if (ids.length) actor.deleteEmbeddedDocuments("Item", ids).catch((error) => console.error(`${MODULE_ID} | made items at rest`, error));
    });
    Hooks.on("updateItem", (item, changes) => {
        const made = item.flags?.[MODULE_ID]?.made;
        if (!isActiveGM() || !(made?.whileHeld || made?.whileAttended)) return;
        const carry = changes?.system?.equipped?.carryType;
        // (One kept while it's attended, The Wanderer's object: gone once dropped.)
        if (carry && (made.whileHeld ? carry !== "held" : carry === "dropped")) item.delete().catch((error) => console.error(`${MODULE_ID} | a made weapon out of the hand`, error));
    });
}

// (Its stored spell: stored from a pick, cast through the spell module, readied, or let go — src/compiler/stored-spell.js.)
async function storedSpellOp(state, { actor, holder, pick, targets }) {
    if (!holder) throw new Error(`${state.item.name} isn't on ${state.user.name} any more.`);
    const objects = state.plan.objects;
    const held = storedOf(holder);
    if (objects.op === "expend-stored") {
        if (!held) throw new Error(`${holder.name} holds no spell.`);
        await holder.unsetFlag(MODULE_ID, "storedSpell");
        return `${held.name} is let go: ${holder.name} is empty`;
    }
    if (objects.op === "ready-stored") {
        if (!held) throw new Error(`${holder.name} holds no spell to unleash.`);
        await actor.createEmbeddedDocuments("Item", [ruleEffectSource({ name: "ready to unleash", words: `Ready to unleash ${held.name} on a foe that hits it (its Shield Block's attacker), until its next turn`, rules: [], duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" } }, { item: { name: holder.name, uuid: holder.uuid }, user: { actorUuid: actor.uuid }, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
        return `${state.user.name} is ready to unleash ${held.name}, until its next turn`;
    }
    if (!held) {
        // (Nothing stored: the pick stored — a spell from its user's own, its casting its user's to spend; a scroll, burned.)
        const choice = objectChoices(actor, objects, holder.id)[pick];
        const chosen = choice ? actor.items.get(choice.id) : null;
        if (!chosen) throw new Error(`Pick one of ${state.user.name}'s ${objects.store?.from === "scroll" ? "scrolls" : "spells"} first.`);
        const spell = choice.kind === "scroll" ? scrollSpell(chosen) : chosen.toObject();
        const source = foundry.utils.deepClone(spell?.toObject?.() ?? spell);
        delete source._id;
        await holder.setFlag(MODULE_ID, "storedSpell", { source, rank: choice.rank, name: source.name });
        if (choice.kind === "scroll") {
            const quantity = Number(chosen.system?.quantity) || 1;
            if (quantity > 1) await chosen.update({ "system.quantity": quantity - 1 });
            else await chosen.delete();
            return `${chosen.name} is burned in ${holder.name}: ${source.name} (rank ${choice.rank}) is stored`;
        }
        return `${source.name} (rank ${choice.rank}) is stored in ${holder.name}: spend its casting (its slot and time) on ${state.user.name}'s sheet`;
    }
    // (Cast at the creatures its user targets — the attacker, for a Shield Block's —, at its user's own best spell DC, as a scroll's is.)
    const cast = game.modules.get(SPELL_ID)?.api?.castFromItem;
    if (!cast) throw new Error("The spell module isn't active to cast it.");
    const tokens = (await Promise.all((targets ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter(Boolean);
    if (objects.at === "attacker" && !tokens.length) throw new Error("Target the attacker first.");
    const dcs = (actor.spellcasting?.contents ?? [...(actor.spellcasting ?? [])]).map((entry) => Number(entry?.statistic?.dc?.value)).filter((dc) => dc > 0);
    const token = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    await cast({ actor, token: token?.object ?? token, spell: held.source, rank: held.rank, dc: dcs.length ? Math.max(...dcs) : null, targets: tokens, item: { name: holder.name, uuid: holder.uuid } });
    await holder.unsetFlag(MODULE_ID, "storedSpell");
    return `${held.name} is cast from ${holder.name}${tokens.length ? ` at ${tokens.map((one) => one.name).join(", ")}` : ""}: it's empty`;
}
