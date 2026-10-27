// What a spell-cast card's item gives beside the spell, for the spell's time (2026-10-26): Enveloping Light's "For 5 rounds, your entire body
// begins to glow, with the effects of a 1st-rank Light spell. At the end of each of your turns during this time, you regain 1d4 Hit Points."
// → plan.castDuration (the item's 5 rounds, when the spell's own differs) and plan.turnHeal { formula, said }: an Effect on its user for
// that long that heals it at the end of each of its turns (scripts/turn-heal.js). And a bonus with the spell, Psyche Salts' "the effect of a
// 4th-rank Clear Mind spell with a +17 counteract check modifier and a +2 item bonus to saving throws against mental effects for 10 minutes"
// → plan.castBonus { modifiers, said }: an Effect of PF2e's rules on the creature the spell is cast on (scripts/casts.js). Pure.

import { modifiersOf } from "./rows.js";

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

// "… and a +2 item bonus to saving throws against mental effects for 10 minutes": the rows' reader for it, as its user's own.
const WITH_BONUS = /\b(?:and|with) (an? [+-]\d+ (?:item|status|circumstance) (?:bonus|penalty) (?:to|on) [^.;]+?)(?=\.|;|$)/i;
export function withCastBonus(plan) {
    if (plan?.builtin !== "cast-spell" || plan.castBonus) return plan;
    for (const note of (plan.notes ?? []).map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim())) {
        const found = WITH_BONUS.exec(note);
        if (!found) continue;
        const modifiers = modifiersOf([`You gain ${found[1]}.`], null);
        if (modifiers.length && modifiers.every((modifier) => modifier.duration)) return { ...plan, castBonus: { modifiers, said: found[0] } };
    }
    return plan;
}

// (A condition on its user with the cast, Locket of Sealed Nightmares' "You become fatigued and cast one of the following spells …": plan.castSelf
// { slug, value, said }, PF2e's condition on its user once the spell's cast — scripts/casts.js, 2026-10-27.)
const BECOME = /^You become (fatigued|stupefied|drained|enfeebled|clumsy|sickened|frightened)(?: (\d+))? and (?=cast\b)/i;
export function withCastSelf(plan) {
    if (plan?.builtin !== "cast-spell" || plan.castSelf) return plan;
    for (const note of (plan.notes ?? []).map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim())) {
        const found = BECOME.exec(note);
        if (found) return { ...plan, castSelf: { slug: found[1].toLowerCase(), value: found[2] ? Number(found[2]) : null, said: found[0].trim() } };
    }
    return plan;
}
