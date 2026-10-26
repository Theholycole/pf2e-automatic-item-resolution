// What a spell-cast card's item gives beside the spell, for the spell's time (2026-10-26): Enveloping Light's "For 5 rounds, your entire body
// begins to glow, with the effects of a 1st-rank Light spell. At the end of each of your turns during this time, you regain 1d4 Hit Points."
// → plan.castDuration (the item's 5 rounds, when the spell's own differs) and plan.turnHeal { formula, said }: an Effect on its user for
// that long that heals it at the end of each of its turns (scripts/turn-heal.js). Pure.

const TURN_HEAL = /^At the end of each of your turns during this time, you regain (\d+d\d+(?:\s*\+\s*\d+)?) Hit Points\.$/i;
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
const literal = (words) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

export function withTurnHeal(plan, item = null) {
    if (plan?.builtin !== "cast-spell" || plan.turnHeal) return plan;
    const note = (plan.notes ?? []).map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim()).find((entry) => TURN_HEAL.test(entry));
    if (!note) return plan;
    // ("During this time": the item's own, "For 5 rounds, … with the effects of a 1st-rank Light spell".)
    const name = plan.spell?.name ?? "";
    const time = new RegExp(String.raw`\bFor (\d+) (rounds?|minutes?|hours?), [^.]*?\bwith the effects of (?:an? )?(?:\d+(?:st|nd|rd|th)[- ]rank )?${literal(name)}\b`, "i").exec(plain(item?.system?.description?.value));
    if (!time) return plan;
    const duration = { value: Number(time[1]), unit: UNITS[time[2].toLowerCase().replace(/s$/, "")] };
    return { ...plan, turnHeal: { formula: TURN_HEAL.exec(note)[1].replace(/\s+/g, ""), said: note }, castDuration: plan.castDuration ?? { ...duration, said: [] } };
}
