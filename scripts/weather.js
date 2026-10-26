// What of the weather a creature's own items let it ignore, for PF2e Automatic Environment Resolution (2026-10-26, its session's contract):
// api.weatherIgnores(actor) → [{ ignores, source, weapon?, windUpTo? }], synchronous — beside the Effects flagged weatherIgnores (Ixamè's
// Eye's, scripts/live.js). Its items' passive words (src/compiler/weather.js) while they're in use: a worn one as PF2e has it equipped (Cape
// of the Open Sky), a weapon while it's held, for that weapon's Strikes only (Wintershot: weapon, its item id).

import { passiveWeatherOf, plainOf } from "../src/compiler/weather.js";
import { inUse } from "./temperature.js";

const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "treasure"]);
const cache = new Map();

export function weatherReadingOf(item) {
    const html = String(item?.system?.description?.value ?? "");
    const key = `${item?.uuid ?? item?.id}|${html.length}`;
    if (!cache.has(key)) cache.set(key, passiveWeatherOf(plainOf(html)));
    return cache.get(key);
}

export function weatherIgnores(actor) {
    if (!actor) return [];
    const out = [];
    for (const item of [...(actor.items ?? [])].filter((entry) => PHYSICAL.has(entry.type))) {
        const reading = weatherReadingOf(item);
        if (!reading) continue;
        const { weapon, ...entry } = reading;
        if (weapon ? !inUse(item, "held") : !inUse(item, "equipped")) continue;
        out.push({ ...entry, source: item.name, ...(weapon ? { weapon: item.id } : {}) });
    }
    return out;
}
