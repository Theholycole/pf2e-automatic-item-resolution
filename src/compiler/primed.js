// What a failed save primes for later, and a fulu's affixed target. Thousand-Pains Fulu's "On a failure or critical failure, if
// the target then takes an action with the move trait, it takes 2d6 persistent piercing damage": a consequence that waits on
// something the creature does later, a note Effect on it from the failure and critical failure rows for the item's time (what
// follows in the text about it with it). "A creature to which the fulu is affixed": the one creature touched, not an area a later
// sentence names. Pure.

import { itemDuration } from "./rows.js";

const PRIMED = /^On a (?:failure or critical failure|failure|critical failure), (?:if|whenever|each time|the next time)\b/i;

// The save plan and the item's plain text → the plan with those notes, or the plan as it was.
export function withPrimedNotes(plan, text) {
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    if (!outcomes?.failure) return plan;
    const sentences = String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const at = sentences.findIndex((sentence) => PRIMED.test(sentence));
    if (at < 0) return plan;
    const duration = itemDuration(String(text ?? ""));
    const note = { text: sentences.slice(at).join(" "), ...(duration ? { duration } : {}) };
    const rows = { ...outcomes };
    for (const degree of /^On a failure or critical failure\b/i.test(sentences[at]) ? ["failure", "criticalFailure"] : /^On a critical failure\b/i.test(sentences[at]) ? ["criticalFailure"] : ["failure"]) {
        if (rows[degree]) rows[degree] = { ...rows[degree], noteEffects: [...(rows[degree].noteEffects ?? []), note] };
    }
    return { ...plan, resolution: { ...plan.resolution, outcomes: rows }, automation: { ...(plan.automation ?? {}), level: "guided" } };
}

// What happens if its damage drops the creature, Meloth's Lifedrinker's "If the target is reduced to 0 HP by this effect, the vision
// becomes reality and kills the target instantly": the GM's, a note on the save's card.
const AT_ZERO = /^If the (?:target|creature) is reduced to 0 (?:HP|Hit Points) by this\b/i;
export function withZeroHPNote(plan, text) {
    if (plan?.resolution?.kind !== "save") return plan;
    const sentence = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).find((one) => AT_ZERO.test(one));
    return sentence && !(plan.notes ?? []).includes(sentence) ? { ...plan, notes: [...(plan.notes ?? []), sentence], automation: { ...(plan.automation ?? {}), level: "guided" } } : plan;
}

// A fulu affixed to a creature: that creature, touched.
export function affixedTargeting(plan, text) {
    if (!plan?.resolution || !/\bA creature to which the fulu is affixed\b/i.test(String(text ?? ""))) return plan;
    return { ...plan, targeting: { target: "1 creature", range: "touch", area: null } };
}

// A condition for as long as a persistent damage lasts, Freezing Embrace Snare's "It is clumsy 1 for as long as it takes this persistent
// damage", Spider Satchel's "fascinates the target while the persistent damage lasts": the ability module's condition while that
// damage lasts, duration { mode: "while", persistent: <type> } (ability 17daa23) — the type the row's own persistent damage, else the
// one the text names (a bomb's, PF2e's own damage roll). Only a condition with no time of its own that its sentence names.
const WHILE_PERSISTENT = /\b(?:while the persistent (?:\w+ )?damage lasts|for as long as it takes (?:this|the) persistent damage|until the persistent (?:\w+ )?damage ends|as long as it (?:continues taking|takes) (?:the|this) persistent (?:\w+ )?damage)\b/i;
const PERSISTENT_IN = /\[persistent,\s*(\w+)\]|\[(\w+),\s*persistent\]/i;
// (Its one persistent damage type; none when the row's are several — Bloodburn Censer's fire or poison, its user's pick.)
function rowPersistent(row, components = []) {
    const ids = [...(row?.damage?.sourceComponentIds ?? []), ...(row?.damage?.shared?.sourceComponentIds ?? [])];
    const types = new Set();
    for (const component of components.filter((entry) => ids.includes(entry.id))) {
        const match = PERSISTENT_IN.exec(component.formula ?? "");
        if (component.category === "persistent" && component.type) types.add(component.type.toLowerCase());
        else if (match) types.add((match[1] ?? match[2]).toLowerCase());
    }
    for (const entry of row?.damage?.formulas ?? []) {
        const match = PERSISTENT_IN.exec(entry.formula ?? "");
        if (match) types.add((match[1] ?? match[2]).toLowerCase());
    }
    // (undefined: none at all — the text's own, a bomb's; null: several.)
    return types.size === 1 ? [...types][0] : types.size ? null : undefined;
}
function lastingRows(resolution, names, fallback) {
    if (!resolution?.outcomes) return resolution;
    const outcomes = {};
    for (const [degree, row] of Object.entries(resolution.outcomes)) {
        const found = rowPersistent(row, resolution.sharedDamage?.components ?? []);
        const type = found === undefined ? fallback : found;
        // (Not a condition whose floor is what lasts, Tallow Bomb's "can't reduce its sickened value below 1 while the persistent fire
        // damage lasts": the floor's, the condition itself stays.)
        const named = (effect) => names.some((sentence) => (sentence.includes(effect.slug.replace(/-/g, " ")) || sentence.includes(effect.slug)) && !/\bcan't reduce (?:its|the|their) \w+ (?:value|condition)\b/.test(sentence));
        outcomes[degree] = type ? { ...row, effects: (row.effects ?? []).map((effect) => (effect?.kind === "condition" && !effect.duration && row.conditionFloor?.slug !== effect.slug && named(effect) ? { ...effect, duration: { mode: "while", persistent: type } } : effect)) } : row;
    }
    return { ...resolution, outcomes };
}
export function withWhilePersistent(plan, text) {
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => WHILE_PERSISTENT.test(sentence)).map((sentence) => sentence.toLowerCase());
    if (!plan || !sentences.length) return plan;
    // (A bomb's own persistent damage, in the text: "The bomb deals 1d6 persistent poison damage".)
    const named = new Set([...String(text ?? "").matchAll(/\b(?:\d+d\d+|\d+) persistent (\w+) damage\b/gi)].map((match) => match[1].toLowerCase()));
    const fallback = named.size === 1 ? [...named][0] : null;
    const out = { ...plan, resolution: lastingRows(plan.resolution, sentences, fallback) };
    if (plan.zone?.saves) out.zone = { ...plan.zone, saves: plan.zone.saves.map((entry) => (entry.plan ? { ...entry, plan: { ...entry.plan, resolution: lastingRows(entry.plan.resolution, sentences, fallback) } } : entry)) };
    if (plan.strike?.save) out.strike = { ...plan.strike, save: { ...plan.strike.save, resolution: lastingRows(plan.strike.save.resolution, sentences, fallback) } };
    return out;
}

