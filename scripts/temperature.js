// What a creature's own items protect it from in heat and cold, for PF2e Automatic Environment Resolution (2026-10-25, its session's
// contract): api.temperatureProtections(actor) → [{ counts, fatigueHours?, source }], synchronous — it runs inside the environment module's
// creatureOf. Its items' passive words (src/compiler/temperature.js), each while it's in use as it says (worn, held, invested); a sheet
// toggle's picked passage (Shawl of Seasons' Summer or Winter); the auras of its allies' banners (Banner of the Restful) within their
// radius; Traveler's Cloak's fatigue hours only at the temperatures it works at. A consumable's or an activation's protection is the
// item card's Effect instead, with the environment module's flag (scripts/live.js).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { ENVIRONMENT_ID, auraOf, passiveOf, plainOf, readTemperature, whileOf } from "../src/compiler/temperature.js";

const STEPS = ["incredible-cold", "extreme-cold", "severe-cold", "mild-cold", "normal", "mild-heat", "severe-heat", "extreme-heat", "incredible-heat"];
const stepOf = (key) => Math.abs(STEPS.indexOf(key) - 4);
const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "treasure"]);
const cache = new Map();

// (A sheet toggle with a picked suboption, Shawl of Seasons' "Change of Seasons": the picked one's name, and all its names.)
export function picked(item) {
    for (const rule of item.system?.rules ?? []) {
        if (rule?.key !== "RollOption" || !Array.isArray(rule.suboptions) || !rule.suboptions.length) continue;
        const names = rule.suboptions.map((entry) => String(entry.value ?? "").replace(/^./, (letter) => letter.toUpperCase())).filter(Boolean);
        const value = rule.selection ?? null;
        if (value) return { name: String(value).replace(/^./, (letter) => letter.toUpperCase()), names };
    }
    return null;
}
// (Its passage: from its name to the next one's.)
export function passageOf(text, name, names) {
    const at = text.search(new RegExp(String.raw`\b${name}\b(?= [A-Z])`));
    if (at < 0) return null;
    const rest = text.slice(at + name.length);
    const ends = names.filter((other) => other !== name).map((other) => rest.search(new RegExp(String.raw`\b${other}\b(?= [A-Z])`))).filter((index) => index >= 0);
    return rest.slice(0, ends.length ? Math.min(...ends) : undefined);
}

// The item's protection when it's in use, read once (its text and its toggle the key).
export function readingOf(item) {
    const html = String(item?.system?.description?.value ?? "");
    const toggle = picked(item);
    const key = `${item?.uuid ?? item?.id}|${html.length}|${toggle?.name ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    const text = plainOf(html);
    const passive = passiveOf(text);
    const fromToggle = toggle ? passageOf(text, toggle.name, toggle.names) : null;
    const reading = (fromToggle ? readTemperature(fromToggle) : null) ?? readTemperature(passive);
    const result = reading && (Object.keys(reading.counts).length || reading.fatigueHours) ? { ...reading, while: fromToggle ? "equipped" : whileOf(passive), aura: auraOf(passive, item.system?.rules) } : null;
    cache.set(key, result);
    return result;
}

// In use as it says: held in a hand, invested, or as PF2e has it equipped (worn as its usage says, and invested when it's investable).
// ("While active", Heated Cloak's, worn; a machine that's switched on, Nightbreeze Machine's, isn't one a creature carries.)
export function inUse(item, how) {
    const equipped = item.system?.equipped ?? {};
    if (how === "held") return equipped.carryType === "held";
    if (how === "invested") return item.isInvested === true || equipped.invested === true;
    const isEquipped = typeof item.isEquipped === "boolean" ? item.isEquipped : equipped.carryType === "worn" || equipped.carryType === "held";
    const invested = item.isInvested ?? (item.system?.traits?.value?.includes("invested") ? equipped.invested === true : true);
    if (how === "active") return isEquipped && String(item.system?.usage?.value ?? "").startsWith("worn") && invested !== false;
    return isEquipped && invested !== false;
}

// The scene's temperature, as the environment module keeps it.
function sceneTemperature(scene) {
    try {
        const data = game.modules.get(ENVIRONMENT_ID)?.api?.weather?.(scene);
        return data?.state?.temperature ?? data?.temperature ?? "normal";
    } catch {
        return "normal";
    }
}

const entryOf = (reading, source, temperature) => {
    const fatigue = reading.fatigueHours && (!Number.isFinite(reading.fatigueUpTo) || stepOf(temperature()) <= reading.fatigueUpTo) ? reading.fatigueHours : null;
    if (!Object.keys(reading.counts).length && !fatigue) return null;
    return { counts: reading.counts, ...(fatigue ? { fatigueHours: fatigue } : {}), source };
};
const physicalOf = (actor) => [...(actor?.items ?? [])].filter((item) => PHYSICAL.has(item.type));

// (temperature: the scene's, given — else the environment module's for the scene, asked once and only when a fatigue limit needs it.)
export function temperatureProtections(actor, { temperature = null } = {}) {
    if (!actor) return [];
    const token = actor.getActiveTokens?.(true, true)?.[0] ?? null;
    const scene = token?.parent ?? globalThis.canvas?.scene ?? null;
    let known = temperature;
    const felt = () => (known ??= sceneTemperature(scene));
    const out = [];
    for (const item of physicalOf(actor)) {
        const reading = readingOf(item);
        if (!reading || reading.aura || !inUse(item, reading.while)) continue;
        const entry = entryOf(reading, item.name, felt);
        if (entry) out.push(entry);
    }
    // (Auras: its own banner, and its allies' within their radius.)
    if (token && scene) {
        const size = scene.grid?.size ?? 100;
        const spaceOf = (doc) => ({ x: Number(doc.x), y: Number(doc.y), w: (Number(doc.width) || 1) * size, h: (Number(doc.height) || 1) * size, elevation: Number(doc.elevation ?? 0) });
        for (const other of scene.tokens ?? []) {
            const holder = other.actor;
            if (!holder || other.hidden) continue;
            const self = other.id === token.id || holder.id === actor.id;
            for (const item of physicalOf(holder)) {
                const reading = readingOf(item);
                if (!reading?.aura || !inUse(item, reading.while)) continue;
                if (reading.aura.who === "allies" && !(self ? reading.aura.self : holder.isAllyOf?.(actor) ?? holder.alliance === actor.alliance)) continue;
                if (!self && distanceFeet(spaceOf(other), spaceOf(token), { size, gridFeet: scene.grid?.distance ?? 5 }) > reading.aura.radius) continue;
                const entry = entryOf(reading, `${item.name} (${self ? "its" : `${holder.name}'s`} aura)`, felt);
                if (entry) out.push(entry);
            }
        }
    }
    return out;
}
