// A cast whose secret checks are its user's own, and what a bad one does (2026-10-27, docs/needs.md): Enigma-Sight Potion's "Drinking the potion
// grants you the effects of a Truesight spell, except that you use your Perception modifier and half your level, rounded up, for the secret
// counteract check instead of the normal counteract modifier and spell rank. However, if you critically fail the secret counteract check the
// effect grants, your mind fills in false, nightmarish information. You become Stupefied 1 for 1d4 rounds and Stunned 1 as your brain struggles
// to process what you see." Truesight's counteract checks are the GM's secret rolls, so the cast card puts on its drinker, beside the spell,
// a note Effect for the spell's time with the modifier and rank the GM rolls with — its Perception modifier and half its level, filled in as
// it's cast — and what a critical failure gives (plan.castNote, scripts/casts.js). Pure.

const OWN = /^Drinking the potion grants you the effects of an? ([A-Z][\w' -]+?) spell, except that you use your Perception modifier and half your level, rounded up, for the secret counteract check instead of the normal counteract modifier and spell rank\.$/i;
const BAD = /\bHowever, if you critically fail the secret counteract check the effect grants, your mind fills in false, nightmarish information\. You become (?:@UUID\[[^\]]*\]\{)?Stupefied (\d)\}? for (?:\[\[\/gmr (\d+d\d+) #rounds\]\]\{\d+d\d+ rounds\}|(\d+d\d+) rounds) and (?:@UUID\[[^\]]*\]\{)?Stunned (\d)\}? as your brain struggles to process what you see\./i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };

// The cast's plan, its item's html and PF2e's spells by name → the plan with castNote, or the same plan.
export function withCastNote(plan, html, spells = {}) {
    if (plan?.builtin !== "cast-spell") return plan;
    const notes = plan.notes ?? [];
    const own = notes.map((note) => [note, OWN.exec(said(note))]).find(([, match]) => match);
    const bad = BAD.exec(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!own || !bad || own[1][1].toLowerCase() !== String(plan.spell?.name ?? "").toLowerCase()) return plan;
    const time = /^(\d+) (round|minute|hour)s?$/i.exec(spells[String(plan.spell.name).toLowerCase()]?.duration ?? "");
    const duration = time ? { mode: "fixed", value: Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : null;
    const left = notes.filter((note) => note !== own[0]);
    const { notes: _, ...rest } = plan;
    return {
        ...rest,
        ...(left.length ? { notes: left } : {}),
        castNote: { label: "Enigma sight", text: `${plan.spell.name}'s secret counteract checks use its Perception modifier ({perception}) and half its level, rounded up, as their rank ({halfLevel}). A critical failure fills its mind with false, nightmarish sights: Stupefied ${bad[1]} for ${bad[2] ?? bad[3]} rounds and Stunned ${bad[4]}.`, duration },
        ...(plan.partial && !left.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

// Its words with its user's numbers.
export const castNoteText = (castNote, { perception = null, level = null } = {}) => castNote.text.replace("{perception}", Number.isFinite(perception) ? `${perception >= 0 ? "+" : ""}${perception}` : "its Perception modifier").replace("{halfLevel}", Number.isFinite(level) ? String(Math.max(1, Math.ceil(level / 2))) : "half its level");
