// A light source that lights its room for a while each time it's worked (2026-10-27, docs/needs.md): Aquarium Lamp's "When active, the aquarium
// lamp produces bright light in a 60-foot radius (and dim light for the next 60 feet). Each activation provides enough energy for 10 minutes of
// use, and the two feeding tanks combined carry enough prey animals for 50 activations before needing to be refilled …" → plan.item.placedLight
// { bright, dim, duration }: a Foundry light at its user's square, beside the lamp they work, for the 10 minutes (scripts/placed-light.js, as
// Flare Beacon's), moved onto the lamp by hand. Its prey's refills and its eels' moods are lines of the card; the rest is its long flavor. Pure.

const LAMP = /\bWhen active, the aquarium lamp produces bright light in an? (\d+)-foot radius \(and dim light for the next (\d+) feet\)\. Each activation provides enough energy for (\d+) minutes of use, and the two feeding tanks combined carry enough prey animals for (\d+) activations before needing to be refilled\b/i;

// The activation's note-only plan and its html → the plan with that light, or the same plan.
export function withLampLight(plan, html) {
    const lamp = plan?.noteOnly ? LAMP.exec(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : null;
    if (!lamp) return plan;
    const [bright, more, minutes, uses] = lamp.slice(1).map(Number);
    const { noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { level: "automatic" },
        resolution: { ...plan.resolution, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } },
        notes: [`Its light comes from the lamp itself: move the light onto it. Its feeding tanks hold prey for ${uses} activations before they're refilled; its eels need feeding about once a day, and their scuffles sometimes light it with no one at the lever (the GM's).`],
        item: { ...(plan.item ?? {}), placedLight: { bright, dim: bright + more, duration: { mode: "fixed", value: minutes, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } } }
    };
}
