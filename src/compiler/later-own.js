// A consumable's second activation for later, its own PF2e Effect (2026-10-27, docs/needs.md): Aurochs Jerky's "Aurochs' Endurance [free]
// (concentrate) Trigger You begin your turn and are Fatigued Effect You suppress the fatigued condition for 10 minutes. … Effect: Aurochs'
// Endurance" beside the jerky's own hour. → plan.again { plan, later, repeat, time, own, when }: once eaten, the card for that Effect on its
// eater, kept for the jerky's time and pressed each time its trigger comes (scripts/live.js again, the exposure card). The note "is linked
// too: the GM's" gone. Pure.

import { itemDuration } from "./rows.js";

const LATER = /\b([A-Z][\w' -]+?) \[?(?:f|free-action)\]? \(concentrate\) Trigger You begin your turn and are (?:@UUID\[[^\]]*\]\{)?(Fatigued|Sickened|Frightened|Slowed|Clumsy|Enfeebled|Stupefied)\}? Effect ([^@]*?)@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}/;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan and its item → the plan with the later card, or the same plan.
export function withLaterOwnEffect(plan, item) {
    if (!plan || plan.again || plan.builtin) return plan;
    const html = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const later = LATER.exec(html);
    if (!later) return plan;
    const [, name, condition, , uuid, label] = later;
    const linked = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").includes(`${label} is linked too`);
    if (!(plan.notes ?? []).some(linked)) return plan;
    const time = itemDuration(html.slice(0, later.index));
    const own = {
        modelVersion: plan.modelVersion,
        source: { ...(plan.source ?? {}), name: `${item.name}: ${name}` },
        rank: plan.rank ?? 1,
        traits: ["concentrate"],
        activation: { time: "free", traits: ["concentrate"] },
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), nativeEffects: [{ uuid, label }] }, failure: none(), criticalFailure: none() } }
    };
    const notes = plan.notes.filter((entry) => !linked(entry));
    const { notes: _, ...rest } = plan;
    return {
        ...rest,
        ...(notes.length ? { notes } : {}),
        again: { plan: own, later: true, repeat: true, ...(time ? { time: { value: time.value, unit: time.unit } } : {}), own: true, when: `{user} begins its turn ${condition.toLowerCase()} (${name}, a free action)` },
        ...(plan.partial && !notes.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
