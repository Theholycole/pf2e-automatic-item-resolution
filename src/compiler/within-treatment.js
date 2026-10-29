// A plant used as part of its user's Treat Wounds that also treats the soul (2026-10-28, docs/needs.md "actions"): Curative Aglaophotis — the
// target's Doomed lowered by 1 on a success, by 2 on a critical success (action.reduce with criticalBy, scripts/item-actions.js withinResults),
// a curse on it counteracted with that same Treat Wounds result at half the item's level (rounded up, as an item's counteract rank is), and
// the target immune to it for a day whatever the result (action.immunity, scripts/immunity.js). → the item-action card for PF2e's Treat
// Wounds (action.within: every sentence read), and beside it the counteract card for the target's curses (plan.item.counteract, its check
// its user's latest Treat Wounds roll — counteract.fromRoll, scripts/counteract.js — not a roll of its own). Its lore and its words for the
// soul are flavor. Pure.

const sentencesOf = (text) => String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const slug = (name) => String(name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^\s*-|-$/g, "");
const UNITS = { day: "days", days: "days", hour: "hours", hours: "hours", minute: "minutes", minutes: "minutes" };

const SENTENCES = {
    lore: /^\s*Activate Treat Wounds Famous\s+among occultists\b[^.]*\.$/,
    within: /^\s*You can Activate the item as\s+part of your activity to Treat Wounds\.$/,
    soul: /^\s*When you do so, you also\s+cleanse the soul\.$/,
    doomed: /^\s*You reduce the target(?:'|’)s (Doomed)\s+condition by (\d+)\s+in addition to the normal effects,\s+or by (\d+) on a critical success\.$/,
    curse: /^\s*Alternatively, if the target\s+is cursed, you can attempt to\s+counteract the curse\b.*\busing your result from\s+Treat Wounds as your result\s+to counteract the curse\.$/,
    rank: /^\s*The counteract rank is equal\s+to half the item level\.$/,
    immune: /^\s*Regardless of the results of\s+your Treat Wounds, the target\s+is temporarily immune to these\s+effects for (\d+) (days?|hours?|minutes?)\.$/
};

export function withinTreatment(plan, { kind, text, item }) {
    if (kind !== "consumable" || plan?.builtin !== "item-action" || plan.action?.slug !== "treat-wounds" || plan.action.within) return plan;
    const found = {};
    for (const sentence of sentencesOf(text)) {
        const entry = Object.entries(SENTENCES).find(([, pattern]) => pattern.test(sentence));
        if (!entry) return plan;
        found[entry[0]] = entry[1].exec(sentence);
    }
    if (!found.within || !found.doomed || !found.curse || !found.rank || !found.immune) return plan;
    const level = Number(item?.system?.level?.value) || 0;
    const rank = Math.max(1, Math.ceil(level / 2));
    const condition = found.doomed[1].toLowerCase();
    const [by, criticalBy] = [Number(found.doomed[2]), Number(found.doomed[3])];
    const immunity = { scope: "target", raw: found.immune[0], duration: { value: Number(found.immune[1]), unit: UNITS[found.immune[2].toLowerCase()] }, degrees: ["criticalSuccess", "success", "failure", "criticalFailure"], against: "all", slug: item?.system?.slug ?? slug(item?.name) };
    const action = {
        ...plan.action,
        within: true,
        reduce: { choose: [condition], by, criticalBy },
        immunity,
        after: `On a success it also lowers its ${condition} by ${by} (${criticalBy} on a critical success). A curse on it can be counteracted with the same Treat Wounds result (rank ${rank}): the counteract card beside this one. The creature treated is then immune to it for ${immunity.duration.value} ${immunity.duration.value === 1 ? immunity.duration.unit.replace(/s$/, "") : immunity.duration.unit}, success or not.`
    };
    const { reduce: _reduce, ...info } = plan.item ?? {};
    const counteract = { modifier: 0, rank, fromRoll: { action: "treat-wounds", words: "its user's latest Treat Wounds roll" }, conditions: [], traits: [], afflictions: ["curse"], pick: "one", notes: ["Its check is the Treat Wounds roll just made (its total and die), not a roll of its own."] };
    const next = { ...plan, action, item: { ...info, counteract }, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    return next;
}
