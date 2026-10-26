// A bonus against one creature its user picks: Spectacles of Inquiry's "Choose a creature you can see. You gain a +3 item bonus on
// Perception checks you make to use Sense Motive against that creature", Oathbow's oath "to destroy one creature you can see" and its bow's
// extra damage against that creature. PF2e's TokenMark: Apply marks the creature the presser targets (an Effect on the user,
// scripts/live.js), and the bonus on a roll at a creature is predicated on the mark, `target:mark:<slug>`. A roll with no creature in it
// (Oathbow's Survival to Track) keeps the whole roll, its creature a note. Pure.
import { isCardLine } from "./row-readings.js";

// (Or the one its trigger names, Bangles of Crowns' "Trigger An enemy within 60 feet becomes Frightened … checks against the triggering
// creature": the presser targets it.)
const CHOSEN = /\b(?:Choose (?:a|one) creature you can see|You swear an oath to destroy one creature you can see)\b|\bTrigger\b[^.]*?\b(?:An? (?:enemy|creature|foe))\b/i;
const AGAINST = /\bagainst (?:that|the chosen|the triggering) creature\b|\bonly against the creature you swore\b/i;
// (The rolls made at a creature: attacks and their damage, the actions aimed at one, and checks in general — a check at the marked
// creature: a save against it has it as its origin, not its target, so it isn't one.)
const AT_CREATURE = /^(?:attack-roll|strike-attack-roll|strike-damage|damage|check|skill-check)$/;
const AIMED = /^action:(?:sense-motive|demoralize|feint|create-a-diversion|grapple|shove|trip|disarm|reposition|request|coerce|make-an-impression|steal)$/;

const slugOf = (item) => String(item?.system?.slug || item?.name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const aimed = (modifier) => AT_CREATURE.test(String(modifier.selector)) || (modifier.predicate ?? []).some((term) => AIMED.test(String(term)));

// The plan, its activation's text (plain) and the item → the plan with the mark, or the same plan.
export function withMark(plan, text, item) {
    const plain = String(text ?? "");
    if (!plan || !CHOSEN.test(plain) || !AGAINST.test(plain)) return plan;
    const slug = `${slugOf(item)}-mark`;
    const mark = `target:mark:${slug}`;
    const success = plan.resolution?.outcomes?.success;
    const modifiers = success?.modifiers ?? [];
    const strikeDamage = plan.item?.strikeDamage ?? [];
    if (!modifiers.some(aimed) && !strikeDamage.length) return plan;
    const marked = (entry) => ({ ...entry, predicate: [...(entry.predicate ?? []), mark] });
    // (As long as what it's for: the extra damage's or the bonus's time, else until it's used again.)
    const duration = [...strikeDamage, ...modifiers.filter(aimed)].map((entry) => entry.duration).find((time) => time?.mode === "fixed") ?? null;
    // (Its creature now the mark's: those notes gone, but not the ones about a roll that can't be marked.)
    const said = (note) => AGAINST.test(String(note)) && !/\bTrack\b/.test(String(note));
    const notes = (plan.notes ?? []).filter((note) => !said(note));
    const unread = (plan.unread ?? []).filter((note) => !said(note));
    return {
        ...plan,
        ...(success ? { resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, modifiers: modifiers.map((modifier) => (aimed(modifier) ? marked(modifier) : modifier)) } } } } : {}),
        notes: notes.length ? notes : undefined,
        ...(plan.unread ? { unread } : {}),
        ...(plan.partial && !notes.filter((note) => !isCardLine(note)).length && !unread.length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}),
        item: { ...plan.item, recipient: "user", mark: { slug, duration }, ...(strikeDamage.length ? { strikeDamage: strikeDamage.map(marked) } : {}) }
    };
}
