// Another form of the polymorph its user is under, for half its time left (2026-10-27, docs/needs.md): Bestiary of Metamorphosis's Shifting
// Form, "Requirements You're under the effect of a polymorph spell that offers a choice of multiple forms Effect You transform into a different
// form allowed by the polymorph by bending and molding the spell's energy. This reduces the spell's remaining duration by half." →
// plan.item.reshape { halve: true }: the item card finds its user's polymorph Effect that has PF2e's choice of forms (a ChoiceSet beside its
// BattleForm), makes it again so PF2e asks for the form, its time half what was left (scripts/reshape.js). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const SHIFT = /\bYou transform into a different form allowed by the polymorph by bending and molding the spell's energy\. This reduces the spell's remaining duration by half\./i;
const NEEDS = /\bRequirements You're under the effect of a polymorph spell that offers a choice of multiple forms\b/i;

// The activation's plan (nothing read) and its html, the item and its activation → its item card's plan, or the same plan.
export function reshapePlan(plan, html, { item = null, activation = null } = {}) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (plan || !SHIFT.test(text) || !NEEDS.test(text)) return plan;
    const frequency = activation?.frequency?.max ? activation.frequency : null;
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${item?.name ?? "The item"}${activation?.name ? `: ${activation.name}` : ""}`, slug: item?.system?.slug ?? null, uuid: item?.uuid ?? null, type: item?.type ?? null },
        rank: 1,
        traits: [...(item?.system?.traits?.value ?? [])],
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] },
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(frequency ? { frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } },
        notes: ["Only while its user is under a polymorph spell that offers several forms."],
        item: { type: item?.type ?? null, level: Number(item?.system?.level?.value) || 0, recipient: "user", activation: { index: activation?.index ?? 0, name: activation?.name ?? null, time: activation?.time ?? null, frequency, trigger: activation?.trigger ?? null }, links: 0, reshape: { halve: true } }
    };
}
