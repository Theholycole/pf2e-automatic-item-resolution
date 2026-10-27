// What a creature's own items ease its falls by, for PF2e Automatic Environment Resolution (2026-10-26, its session's contract):
// api.fallEases(actor) → [{ shorter?, noDamage?, source }], synchronous — the environment module asks it as it rolls falling damage, beside
// the Effects flagged `fall` (an activation's or a consumable's, scripts/live.js). Its items' passive words (src/compiler/falls.js), while
// they're in use as PF2e has them equipped: Gliding Membranes' "Treat falls as 25 feet shorter", Angelic Opera Cloak's "never take falling
// damage"; a sheet toggle's picked passage, Shawl of Seasons' Fall; not Daredevil Boots' when its user has Cat Fall, which the boots improve
// instead.

import { foamUsed, passiveFallOf, plainOf, readFoam } from "../src/compiler/falls.js";
import { foamEffectSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID } from "./foundry.js";
import { inUse, passageOf, picked } from "./temperature.js";

const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "treasure"]);
const cache = new Map();

// The item's fall when it's in use, read once (its text and its toggle the key).
export function fallReadingOf(item) {
    const html = String(item?.system?.description?.value ?? "");
    const toggle = picked(item);
    const key = `${item?.uuid ?? item?.id}|${html.length}|${toggle?.name ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    const text = plainOf(html);
    const fromToggle = toggle ? passageOf(text, toggle.name, toggle.names) : null;
    const reading = fromToggle ? passiveFallOf(fromToggle) : toggle ? null : passiveFallOf(text);
    // (Daredevil Boots' "or, if you have the Cat Fall feat, …": the feat's, not the shorter fall.)
    const result = reading ? { ...reading, ...(/\bor, if you have the Cat Fall feat\b/i.test(text) ? { unlessFeat: "cat-fall" } : {}) } : null;
    cache.set(key, result);
    return result;
}

export function fallEases(actor) {
    if (!actor) return [];
    const feats = new Set((actor.itemTypes?.feat ?? []).map((feat) => feat.slug ?? feat.system?.slug).filter(Boolean));
    const out = [];
    for (const item of [...(actor.items ?? [])].filter((entry) => PHYSICAL.has(entry.type))) {
        const reading = fallReadingOf(item);
        if (!reading || !inUse(item, "equipped") || (reading.unlessFeat && feats.has(reading.unlessFeat))) continue;
        out.push({ ...(reading.shorter ? { shorter: reading.shorter } : {}), ...(reading.noDamage ? { noDamage: true } : {}), source: item.name });
    }
    // (A net spread below it, Invisible Net's zone: no falling damage — netsUnder.)
    for (const token of actor.getActiveTokens?.(true, true) ?? []) out.push(...netsUnder(token));
    // (A worn Impact Foam Chassis: the falling damage it takes off, its fall long enough — { reduceBy, minFeet, itemUuid }.)
    for (const { item, foam } of wornFoam(actor)) out.push({ reduceBy: foam.reduceBy, minFeet: foam.minFeet, itemUuid: item.uuid, source: item.name });
    return out;
}

// (2026-10-27) A net spread on the ground below the token, Invisible Net's: the ability module's zone flagged fall { noDamage } (src/compiler/
// moving-readings.js) whose area holds the token's centre, tested at the zone's own bottom (the token may be in the air still) → [{ noDamage,
// source }]. The zone gone when its minute is up, it eases nothing more.
export function netsUnder(token, abilityId = ABILITY_ID) {
    const doc = token?.document ?? token;
    const scene = doc?.parent ?? null;
    const size = Number(scene?.grid?.size) || 100;
    const centre = { x: Number(doc?.x) + (Number(doc?.width ?? 1) * size) / 2, y: Number(doc?.y) + (Number(doc?.height ?? 1) * size) / 2 };
    const out = [];
    for (const region of scene?.regions?.contents ?? [...(scene?.regions ?? [])]) {
        const flags = region?.flags?.[abilityId]?.zone;
        if (!flags?.zone?.fall?.noDamage || typeof region.testPoint !== "function") continue;
        const bottom = Number(region.elevation?.bottom);
        if (region.testPoint({ ...centre, elevation: Number.isFinite(bottom) ? bottom : 0 })) out.push({ noDamage: true, source: flags.itemName ?? region.name ?? "a net" });
    }
    return out;
}

// Its worn consumables that foam as it falls (src/compiler/falls.js readFoam), read once: [{ item, foam }].
export function wornFoam(actor) {
    const out = [];
    for (const item of actor?.itemTypes?.consumable ?? [...(actor?.items ?? [])].filter((entry) => entry.type === "consumable")) {
        const html = String(item?.system?.description?.value ?? "");
        const key = `foam|${item?.uuid ?? item?.id}|${html.length}`;
        if (!cache.has(key)) cache.set(key, readFoam(plainOf(html)));
        const foam = cache.get(key);
        if (foam && inUse(item, "equipped") && (Number(item.system?.quantity) || 0) > 0) out.push({ item, foam });
    }
    return out;
}

// (After the fall — the environment module's hook, on the GM's client that applied it: the chassis that activated is used up, and its foam
// stays around the creature with the Hit Points it has left, if any; the GM and its owners are told.)
export function setUpFoam() {
    Hooks.on("pf2e-automatic-environment-resolution.fell", (data) => {
        if (!game.user.isGM) return;
        foamAfterFall(data).catch((error) => console.error(`${MODULE_ID} | impact foam`, error));
    });
}

export async function foamAfterFall({ token, feet, reductions } = {}) {
    const actor = token?.actor;
    const worn = wornFoam(actor);
    if (!worn.length) return null;
    const used = foamUsed({ feet, reductions }, worn.map(({ item, foam }) => ({ uuid: item.uuid, ...foam })));
    if (!used) return null;
    const { item } = worn.find((one) => one.item.uuid === used.uuid);
    const user = { actorUuid: actor.uuid, tokenUuid: token.document?.uuid ?? token.uuid ?? null };
    const source = { name: item.name, uuid: item.uuid, img: item.img ?? null };
    const quantity = Number(item.system?.quantity) || 1;
    if (quantity > 1) await item.update({ "system.quantity": quantity - 1 });
    else await item.delete();
    if (used.left > 0) await actor.createEmbeddedDocuments("Item", [foamEffectSource(used.left, { item: source, user, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
    const whisper = game.users.filter((one) => one.isGM || actor.testUserPermission?.(one, "OWNER")).map((one) => one.id);
    const name = escape(token.name ?? actor.name);
    const took = used.amount > 0 ? `takes ${used.amount} off the falling damage` : "cushions the fall";
    const after = used.left > 0 ? `its foam (${used.left} Hit Points) surrounds <strong>${name}</strong> for up to 1 minute` : "the foam disperses";
    return ChatMessage.create({ content: `<p>${escape(item.name)} activates as <strong>${name}</strong> falls: it ${took}, and ${after}.</p>`, whisper, speaker: ChatMessage.getSpeaker({ actor }) });
}

// (Its fall reactions offered as it falls — the environment module's hook, called on the active GM's client as a creature's degree on one
// of its cards means a fall, before the GM applies it: a line whispered to the GMs and the creature's owners, naming the reactions its
// items have (Tumbler's Belt's Land With Grace, Aerial Cloak's Fall Gently, Dragonaut's Wingsuit's Descend, a Jade Cat), to use from the
// sheet before Apply, and what its worn items already ease.)
const FALLING = /\b(?:You're|You are) falling\b|\bYou (?:begin to )?fall\b/i;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// compile: { activations(item) → [{ activation, plan }], consumable(item) → plan }; isActiveGM, fallLine: the module's.
export function setUpFallOffers({ activations, consumable, isActiveGM, fallLine }) {
    Hooks.on("pf2e-automatic-environment-resolution.falling", (data) => {
        if (!isActiveGM()) return;
        offerFallReactions(data, { activations, consumable, fallLine }).catch((error) => console.error("pf2e-automatic-item-resolution | fall reactions", error));
    });
}

export async function offerFallReactions({ token, feet } = {}, { activations, consumable, fallLine }) {
    const actor = token?.actor;
    if (!actor) return null;
    const offers = [];
    for (const item of actor.items ?? []) {
        if (item.type === "consumable") {
            const plan = consumable(item);
            if (plan?.fall && FALLING.test(String(item.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))) offers.push(`${item.name}: ${fallLine(plan.fall)}`);
            continue;
        }
        for (const { activation, plan } of activations(item) ?? []) {
            if (plan?.fall && FALLING.test(String(activation?.trigger ?? ""))) offers.push(`${item.name}${activation?.name ? ` (${activation.name})` : ""}: ${fallLine(plan.fall)}`);
            // (Or one of its ways, Parachute Mail's by the height it's deployed at, 2026-10-27.)
            const ways = plan?.builtin === "ways" ? (plan.ways ?? []).filter((way) => way.plan?.fall) : [];
            if (ways.length && FALLING.test(String(activation?.trigger ?? ""))) offers.push(`${item.name}${activation?.name ? ` (${activation.name})` : ""}: ${ways.map((way) => way.name).join(", or ")}`);
        }
    }
    if (!offers.length) return null;
    const worn = fallEases(actor).map((entry) => `${entry.source} (${entry.noDamage ? "no damage" : entry.reduceBy ? `up to ${entry.reduceBy} less damage` : `${entry.shorter} feet shorter`})`);
    const whisper = game.users.filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")).map((user) => user.id);
    const name = token.name ?? actor.name;
    const content = `<p><strong>${escape(name)}</strong> is falling${Number(feet) > 0 ? ` ${Number(feet)} feet` : ""}. Its reactions: ${offers.map(escape).join("; ")}. Use one from the sheet's Activate before the GM applies the card.${worn.length ? ` Already eased by ${worn.map(escape).join(", ")}.` : ""}</p>`;
    return ChatMessage.create({ content, whisper, speaker: ChatMessage.getSpeaker({ actor }) });
}
