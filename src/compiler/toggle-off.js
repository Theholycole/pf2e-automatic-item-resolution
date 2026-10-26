// A healing its item stops for a while (2026-10-26): Splithead Bow's Two-Headed Arrow, "Additionally, after using this ability, you do not
// regain Hit Points from wielding the bow on your next turn" — PF2e's own toggle on the bow that gates its fast healing ("splithead-bow-healing"
// in its rules), plan.toggleOff: turned off as the activation is used, back on once its Effect ends after that next turn (scripts/toggle-off.js).
// Only when the item's own rules have that toggle before its FastHealing. Pure.

const NO_REGAIN = /^(?:Additionally, )?after using this ability, you do not regain Hit Points from wielding the [\w' ]+? on your next turn\.$/i;
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan, the activation's html, the item → the plan with toggleOff and its sentence no longer a note, or the plan as it was.
export function withToggleOff(plan, html, item) {
    if (!plan) return plan;
    const sentence = plainOf(html).split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).find((one) => NO_REGAIN.test(one));
    if (!sentence) return plan;
    const rules = item?.system?.rules ?? [];
    const healing = rules.find((rule) => rule?.key === "FastHealing");
    const toggle = rules.find((rule) => rule?.key === "RollOption" && rule.toggleable && (healing?.predicate ?? []).includes(rule.option));
    if (!toggle) return plan;
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => said(entry) !== sentence) : list);
    const next = { ...plan, toggleOff: { option: toggle.option, words: "No Hit Points from it on the next turn", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } }, notes: kept(plan.notes)?.length ? kept(plan.notes) : undefined, ...(plan.unread ? { unread: kept(plan.unread) } : {}), ...(plan.strike?.notes ? { strike: { ...plan.strike, notes: kept(plan.strike.notes) } } : {}) };
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...(next.strike?.notes ?? []), ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
