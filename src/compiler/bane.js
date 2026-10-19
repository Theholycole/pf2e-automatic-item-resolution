// Ammunition made against one type of creature, the type chosen when it's crafted: Bane Ammunition's capsule "tailored to a particular type of
// creature—aberration, animal, beast, dragon, fey, giant, ooze, or both fungus and plant", whose activated hit on a target "that has a trait
// matching the selected type" adds persistent poison. The ways card's pick of that type (src/compiler/ways.js's builtin, scripts/ways.js),
// each way the ammunition's next Strike (src/compiler/strikes.js) with that damage only against a creature with the trait — PF2e's
// DamageDice with a target-trait predicate on the readied Strike's Effect. Pure.

import { compileStrike } from "./strikes.js";

const TAILORED = /\btailored to a particular type of creature\s*[—–-]\s*([^.]+?)\.\s*Each type requires a different formula\./i;
const MATCHING = /\b(When activated [\w ]+? hits a target) that has a trait matching the selected type(, it takes\b)/i;

// "aberration, animal, …, ooze, or both fungus and plant" → [{ name, traits }].
function typesOf(list) {
    return String(list).split(/,\s*(?:or\s+)?|\s+or\s+/).map((part) => part.trim()).filter(Boolean).map((part) => {
        const both = /^both (\w+) and (\w+)$/i.exec(part);
        const traits = both ? [both[1].toLowerCase(), both[2].toLowerCase()] : [part.toLowerCase()];
        return { name: traits.map((trait) => `${trait.charAt(0).toUpperCase()}${trait.slice(1)}`).join(" and "), traits };
    });
}

// The activation's html, its base, the item (its block as its description) → the ways plan, or null.
export function baneWaysPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const tailored = TAILORED.exec(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!tailored || !MATCHING.test(text)) return null;
    const plain = text.replace(MATCHING, "$1$2");
    const ways = [];
    for (const type of typesOf(tailored[1])) {
        const plan = compileStrike({ ...item, system: { ...(item?.system ?? {}), description: { value: plain } } }, base, options);
        if (!plan?.strike?.damage?.length) return null;
        const predicate = type.traits.length > 1 ? [{ or: type.traits.map((trait) => `target:trait:${trait}`) }] : [`target:trait:${type.traits[0]}`];
        ways.push({ name: type.name, html: plain, plan: { ...plan, strike: { ...plan.strike, damage: plan.strike.damage.map((entry) => ({ ...entry, predicate })) }, notes: [...(plan.notes ?? []), `Only against a creature with the ${type.traits.join(" or ")} trait.`] } });
    }
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways };
}

// An elixir made for one element, its ingredient chosen when it's distilled: Warding Element Draught's "+1 item bonus to AC and saving throws
// against alchemical effects, spells, and magic effects with the listed elemental trait for 10 minutes", its ingredients' elements listed
// after. The ways card's pick of the element, each way its drinker's bonus against effects with that trait (PF2e's item:trait roll option).
const ELEMENTS = ["air", "earth", "fire", "metal", "water", "wood"];
const WARDING = /\bchosen when the elixir is distilled, and grants an? \+(\d+) (item|status|circumstance) bonus to AC and saving throws against [^.]*?\bwith the listed elemental trait for (\d+) (minutes?|hours?)\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
export function elementWaysPlan(item, base) {
    const text = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const warding = WARDING.exec(text);
    if (!warding) return null;
    const listed = text.slice(warding.index + warding[0].length);
    const elements = ELEMENTS.filter((element) => new RegExp(String.raw`\b${element}\b`, "i").test(listed));
    if (elements.length < 2) return null;
    const duration = { mode: "fixed", value: Number(warding[3]), unit: /^hour/i.test(warding[4]) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const ways = elements.map((element) => {
        const predicate = [`item:trait:${element}`];
        const modifiers = ["ac", "saving-throw"].map((selector) => ({ selector, type: warding[2].toLowerCase(), value: Number(warding[1]), predicate, duration }));
        const plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers } } }, item: { category: item?.system?.category ?? null, level: Number(item?.system?.level?.value) || 0, recipient: "drinker", type: item?.type } };
        return { name: `${element.charAt(0).toUpperCase()}${element.slice(1)}`, html: `<p>+${warding[1]} ${warding[2].toLowerCase()} bonus to AC and saves against effects with the ${element} trait for ${warding[3]} ${warding[4]}.</p>`, plan };
    });
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, once: true };
}
