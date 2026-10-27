// A creature's attitude changed by its save, and its immunity after a critical success (2026-10-27, docs/needs.md): Beguiling Crown's "Choose
// one living creature within 30 feet of you. That creature must succeed at a DC 41 Will saving throw or become helpful to you for the next 24
// hours. If they succeed, they become friendly to you for 1 hour. If they critically succeed they're immune to this effect for 1 year." The
// save card at the creature targeted: each row's attitude a note Effect on it for its time (the user's ruling for minds), the critical
// success's immunity the save's trigger.immunity (the immunity tracker, a year as 365 days). That it's a living creature is its user's to
// pick. Pure.

const flat = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ATTITUDE = /\bEffect Choose one living creature within (\d+) feet of you\. That creature must succeed at a @Check\[(will|fortitude|reflex)\|dc:(\d+)\] saving throw or become (helpful|friendly) to you for the next (\d+) (hours?|minutes?)\. If they succeed, they become (friendly|indifferent) to you for (\d+) (hours?|minutes?)\. (If they critically succeed they're immune to this effect for (\d+) years?)\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
const time = (value, unit) => ({ mode: "fixed", value: Number(value), unit: /^hour/i.test(unit) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" });

// An activation's plan, its html and the item → the save card's plan, or the same plan.
export function withAttitudeSave(plan, html, item) {
    const read = ATTITUDE.exec(flat(html));
    if (!read || !plan?.noteOnly) return plan;
    const [, range, statistic, dc, failed, failValue, failUnit, saved, saveValue, saveUnit, raw, years] = read;
    const attitude = (word, value, unit) => ({ ...none(), noteEffects: [{ label: `${word.charAt(0).toUpperCase()}${word.slice(1)}`, text: `Its attitude toward the ${String(item?.name ?? "item").toLowerCase()}'s wearer is ${word.toLowerCase()} for ${value} ${unit}.`, duration: time(value, unit) }] });
    const immunity = { scope: "target", raw: `${raw}.`, duration: { value: 365 * Number(years), unit: "days" }, degrees: ["criticalSuccess"], against: "all", slug: String(item?.system?.slug || "item") };
    return {
        ...plan,
        noteOnly: undefined,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        targeting: { target: "1 living creature", range: `${range} feet`, area: null },
        trigger: { ...(plan.trigger ?? {}), immunity },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: statistic.toLowerCase(), basic: false, against: { dc: "fixed", value: Number(dc) } },
            sharedDamage: null,
            outcomes: { criticalSuccess: none(), success: attitude(saved, saveValue, saveUnit), failure: attitude(failed, failValue, failUnit), criticalFailure: attitude(failed, failValue, failUnit) }
        }
    };
}
