// Strike damage for a while in place of the armor's own save bonus (2026-10-28, docs/needs.md "reader", "immunity"): Battlezoo's Runebranded
// Hide, whose activation moves its runes' power into its wearer's hands. For a minute its melee Strikes deal 1d6 electricity for each point
// of the armor's item bonus to saves against electricity — src/compiler/item-data.js writes that out by its resilient rune (1, and 1 more
// for each step of the rune, 4 at most), and the rows read it as plan.item.strikeDamage — and the hide's own bonus to those saves is off:
// an Effect on its user for the minute beside it (item.ruleEffects), PF2e's AdjustModifier suppressing the hide's own FlatModifier (its slug,
// from its label as PF2e makes it). The hide's own toggle does much the same from its sheet (its dice on every Strike, ranged too): a card
// line says to leave it off. Pure.

import { plainText } from "./rows.js";

const sluggify = (text) => String(text ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };

// Its activation's sentences, each read (or flavor), in order.
const SENTENCES = [
    /^Activate\s*1\s+The [\w' -]+?'s runes glow intensely,\s*then fade as the light\s+transfers from the armor\s+into your hands\.$/,
    // (As src/compiler/item-data.js writes it out.)
    /^Your melee Strikes deal (\d+)d(\d+) additional (\w+) damage for (\d+) minutes?\.$/,
    /^For (\d+) minutes?, the [\w' -]+? doesn't grant you its usual\s+resistance to \w+ or bonus\s+to saving throws\.$/
];
// (Its own words after the activation: its crafting, and the list of what its own rules do.)
const AFTER = /\s*\bCraft Requirements\b.*$/s;

// The plan, the activation's html and the item → the plan with that Effect, or the same plan.
export function withRunebrand(plan, html, item) {
    if (item?.type !== "armor") return plan;
    const sentences = plainText(html).replace(AFTER, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    if (sentences.length !== SENTENCES.length) return plan;
    const found = sentences.map((sentence, index) => SENTENCES[index].exec(sentence));
    if (!found.every(Boolean)) return plan;
    const [, [, count, faces, type]] = found;
    const extra = (plan.item?.strikeDamage ?? []).find((entry) => entry.damageType === type && entry.diceNumber === Number(count) && entry.dieSize === `d${faces}` && (entry.predicate ?? []).includes("item:melee"));
    if (!extra) return plan;
    // (The hide's own bonus to those saves: its FlatModifier on saving throws, predicated on the damage type. Its selector a string in the
    // pack's data, an array on a live item once PF2e has prepared its rules — 2026-10-29, found live.)
    const own = (item.system?.rules ?? []).find((rule) => rule?.key === "FlatModifier" && [].concat(rule.selector ?? []).includes("saving-throw") && rule.type === "item" && JSON.stringify(rule.predicate ?? []).includes(`"${type}"`));
    if (!own) return plan;
    const slug = own.slug ? sluggify(own.slug) : sluggify(own.label ?? item.name);
    const effect = { name: `${item.name}: save bonus off`, words: `The hide's own item bonus to saves against ${type} effects (and any ${type} resistance it gives) is off`, rules: [{ key: "AdjustModifier", selector: "saving-throw", slug, suppress: true }], duration: extra.duration ?? MINUTE };
    const toggle = (item.system?.rules ?? []).find((rule) => rule?.key === "RollOption" && rule.toggleable);
    const { unread, partial, ...rest } = plan;
    return {
        ...rest,
        activation: { ...(plan.activation ?? {}), time: plan.activation?.time ?? "1" },
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } },
        ...(toggle ? { notes: [`Leave the hide's own toggle (${toggle.label ?? toggle.option}) off: this card's Effect does its work for the minute.`] } : {}),
        item: { ...(plan.item ?? {}), activation: { ...(plan.item?.activation ?? {}), time: plan.item?.activation?.time ?? "1" }, ruleEffects: [...(plan.item?.ruleEffects ?? []), effect] }
    };
}
