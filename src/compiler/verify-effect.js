// A third-party module's own Effect, checked against its item's text before it's applied (the user's answer of
// 2026-10-15, as for the third-party spells of 2026-10-06): every rule that changes a number or a state must be stated in
// the text — a FlatModifier's value and type ("+2 item bonus"), a Resistance or Weakness ("resistance 5 to fire"), TempHP
// ("10 temporary Hit Points"), a Sense ("darkvision"), FastHealing ("fast healing 5"), DamageDice ("1d6 fire damage"), a
// GrantItem's condition ("frightened 1"). Rules that only label, toggle or ask (RollOption, ChoiceSet, Note) pass; any
// other rule, or a number from a formula, doesn't. Pure.

import { plainText } from "./rows.js";

const NEUTRAL = new Set(["RollOption", "ChoiceSet", "Note", "ItemAlteration"]);
const words = (value) => String(value ?? "").toLowerCase().replace(/-/g, " ");
// (The creature traits a predicate names as origin:trait:X, in "or" lists too.)
const originTraits = (predicate) => [].concat(predicate ?? []).flatMap((term) => typeof term === "string" ? [/^origin:trait:([\w-]+)$/.exec(term)?.[1]].filter(Boolean) : originTraits(term?.or ?? term?.and ?? []));

function checkRule(rule, text, rules = []) {
    const said = text.toLowerCase();
    if (NEUTRAL.has(rule?.key)) return { ok: true };
    const value = Number(rule?.value);
    switch (rule?.key) {
        case "FlatModifier": {
            if (!Number.isFinite(value)) return { ok: false, why: "a value from a formula" };
            const type = rule.type ?? "untyped";
            const size = Math.abs(value);
            const kind = value >= 0 ? "bonus" : "penalty";
            // ("+2 item bonus", "–1 status penalty", "a +10-foot status bonus to your Speed", "a +10-status bonus".)
            const pattern = type === "untyped" ? new RegExp(String.raw`[+\-–−]?\s*${size}(?:-foot)? ${kind}\b`, "i") : new RegExp(String.raw`[+\-–−]?\s*${size}(?:-foot)?[\s-]+${type}[\s-]+${kind}\b`, "i");
            return pattern.test(text) ? { ok: true } : { ok: false, why: `${value > 0 ? "+" : ""}${value} ${type} not stated` };
        }
        case "Resistance":
        case "Weakness": {
            if (!Number.isFinite(value)) return { ok: false, why: "a value from a formula" };
            const name = rule.key.toLowerCase();
            // (Its own predicate on the damage's source, origin:trait:X: tested on the creature itself, it never applies — PF2e's custom
            // type with a definition does that.)
            const origins = originTraits(rule.predicate);
            if (origins.length) return { ok: false, why: `${name} ${value} to damage from ${origins.join(", ")} never applies (a predicate, not a definition)` };
            // (A type its own ChoiceSet picks, "{item|flags.system.rulesSelections.<flag>}": each of the choices stated.)
            const picked = /^\{item\|flags\.system\.rulesSelections\.([\w-]+)\}$/.exec(String(rule.type ?? ""));
            const choiceSet = picked ? (rules ?? []).find((other) => other?.key === "ChoiceSet" && other.flag === picked[1] && Array.isArray(other.choices)) : null;
            const types = choiceSet ? choiceSet.choices.map((choice) => words(choice.value)) : [].concat(rule.type ?? []).map(words);
            // ("resistance 5 to fire", "fire resistance 5", "8 resistance to primal spells", "4 fire resistance".)
            const stated = types.every((type) => new RegExp(String.raw`\b${name} ${value}\b[^.]*\b${type}\b|\b${type} ${name} ${value}\b|\b${value} ${name}\b[^.]*\b${type}\b|\b${value} ${type} ${name}\b`, "i").test(said));
            return stated ? { ok: true } : { ok: false, why: `${name} ${value} to ${types.join(", ")} not stated` };
        }
        case "TempHP":
            return Number.isFinite(value) && new RegExp(String.raw`\b${value} temporary Hit Points\b`, "i").test(text) ? { ok: true } : { ok: false, why: "temporary Hit Points not stated" };
        case "FastHealing":
            return Number.isFinite(value) && new RegExp(String.raw`\b(?:fast healing|regeneration) ${value}\b`, "i").test(text) ? { ok: true } : { ok: false, why: "fast healing not stated" };
        case "Sense":
            return said.includes(words(rule.selector)) ? { ok: true } : { ok: false, why: `${rule.selector} not stated` };
        case "DamageDice": {
            const dice = rule.diceNumber && rule.dieSize ? `${rule.diceNumber}${rule.dieSize}` : null;
            return dice && said.includes(dice) ? { ok: true } : { ok: false, why: "its damage dice not stated" };
        }
        case "GrantItem": {
            // (A condition: checked by its name in the text, verifyEffectRules's conditionNames.)
            if (!/conditionitems\.(?:Item\.)?[A-Za-z0-9]+$/.test(String(rule.uuid ?? ""))) return { ok: false, why: "grants an item" };
            const condition = String(rule.uuid).split(".").at(-1);
            return { ok: false, why: `grants a condition (${condition}) not stated`, condition };
        }
        default:
            return { ok: false, why: `a ${rule?.key ?? "rule"} rule` };
    }
}

// The Effect's rules against the item's text (HTML or plain): { ok, failures: [{ key, why }] }. conditionNames: PF2e's
// condition items by uuid id → name, to check a GrantItem's condition by its name.
export function verifyEffectRules(rules, html, { conditionNames = {} } = {}) {
    const text = plainText(html);
    const failures = [];
    for (const rule of rules ?? []) {
        const result = checkRule(rule, text, rules);
        if (result.ok) continue;
        if (result.condition && conditionNames[result.condition] && new RegExp(String.raw`\b${conditionNames[result.condition]}\b`, "i").test(text)) continue;
        failures.push({ key: rule?.key ?? null, why: result.why });
    }
    return { ok: failures.length === 0 && (rules ?? []).length > 0, failures };
}
