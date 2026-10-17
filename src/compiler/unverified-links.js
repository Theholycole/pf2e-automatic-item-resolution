// A third-party module's own Effect whose rules its item's text doesn't bear out (src/compiler/verify-effect.js), left out when the
// item is read, so its text is read instead: an Effect a grade off (a Greater item linking its Major Effect), a status bonus where
// the text says item, other numbers than the text's. Live play checks each such Effect before applying it and makes a note of the
// text when it fails; with the Effects' rules known when the item is compiled (options.moduleEffect), the item gets what its text
// reads to instead — a readied bonus, an item action, its own Effect — when that is more than a note. Pure.

import { verifyEffectRules } from "./verify-effect.js";

const MODULE_EFFECT_LINK = /@UUID\[Compendium\.((?!pf2e\.)[\w-]+)\.([\w-]+)\.(?:Item\.)?([A-Za-z0-9]{16})\]\{(Effect:[^}]*)\}/g;

// The item without its module Effects that fail the check, or null when none does. options.moduleEffect(uuid) → { name, rules }
// or null (unknown: kept, live play checks it); options.conditionNames, PF2e's condition names by id (a GrantItem's condition is
// checked by its name; without them, an Effect that grants one is kept).
export function withoutUnverifiedLinks(item, options = {}) {
    if (typeof options.moduleEffect !== "function") return null;
    const html = String(item?.system?.description?.value ?? "");
    const dropped = [];
    const kept = html.replace(MODULE_EFFECT_LINK, (link, module, pack, id, label) => {
        const effect = options.moduleEffect(`Compendium.${module}.${pack}.Item.${id}`);
        if (!effect?.rules) return link;
        const conditionNames = options.conditionNames ?? null;
        if (!conditionNames && effect.rules.some((rule) => rule?.key === "GrantItem" && /conditionitems/.test(String(rule.uuid ?? "")))) return link;
        const verdict = verifyEffectRules(effect.rules, html, { conditionNames: conditionNames ?? {} });
        if (verdict.ok) return link;
        dropped.push({ label: label.trim(), why: verdict.failures.map((failure) => failure.why) });
        return "";
    });
    if (!dropped.length) return null;
    return { item: { ...item, system: { ...item.system, description: { ...(item.system?.description ?? {}), value: kept.replace(/<p>\s*<\/p>/g, "") } } }, dropped };
}

// The plan its text reads to, when that is more than the note live play would make: not a note only, not nothing — and not for
// an item made in one of several kinds, its effect the kind's, which its text lists side by side (a leech's additive chosen when
// it's made: read together, they'd all apply).
const MADE_AS = /\bchosen (?:when (?:the|it) \w* ?(?:is|was) (?:created|crafted|made)|at the time of (?:creation|crafting))\b/i;
export function overUnverified(plan, dropped, html = "") {
    if (!plan || plan.noteOnly || plan.builtin === "no-effect" || MADE_AS.test(String(html).replace(/<[^>]+>/g, " "))) return null;
    const why = dropped.map((entry) => `${entry.label} (its module's) isn't applied: its rules don't match the item's text (${entry.why.join("; ")}).`);
    return { ...plan, notes: [...(plan.notes ?? []), ...why] };
}
