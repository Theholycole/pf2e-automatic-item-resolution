// A spell-cast card's own duration, where the item's text gives the spell another: Dust of Disappearance's "a 4th-rank Invisibility spell
// with a duration of 1 minute", The Winged Serpent's "but the duration is only 10 minutes" (and "If you're at least 17th level, the
// duration extends to 1 hour"), Vanishing Wayfinder's "the effects of a 2nd-rank Invisibility spell for 5 minutes", Hydration Cloak's
// "to a maximum of 10 minutes", Cane of the Maelstrom's "the duration is unlimited". → plan.castDuration { value, unit, said, atLevel? }:
// PF2e's duration units, the words it was read from (src/compiler/honest.js leaves them out of the cast's leftovers), a higher one from a
// level on. Not when it's the spell's own duration (options.spells). Live: scripts/casts.js sets the Effects the cast makes to it. Pure.

const WORDS = { one: 1, an: 1, a: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, twenty: 20, thirty: 30 };
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days", week: "days", weeks: "days", month: "days", months: "days" };
const DAYS = { week: 7, weeks: 7, month: 30, months: 30 };
const TIME = String.raw`(\d+|one|an?|two|three|four|five|ten|twenty|thirty) (rounds?|minutes?|hours?|days?|weeks?|months?)`;
const literal = (words) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const timeOf = (count, unit) => {
    const value = (WORDS[count.toLowerCase()] ?? Number(count)) * (DAYS[unit.toLowerCase()] ?? 1);
    return value > 0 ? { value, unit: UNITS[unit.toLowerCase()] } : null;
};
// The spell's own duration in the same terms ("10 minutes"), when it's one.
const ownTime = (spell) => {
    const match = new RegExp(String.raw`^${TIME}$`, "i").exec(String(spell?.duration ?? "").trim());
    return match ? timeOf(match[1], match[2]) : null;
};

// The duration words a note gives the cast: the first match of these, the spell's name standing in where one is needed.
function readTime(note, name) {
    const spell = name ? String.raw`(?:an? )?(?:\d+(?:st|nd|rd|th)[- ]rank )?${literal(name)}(?: spell)?` : null;
    const forms = [
        String.raw`\b(?:the|its|this spell's) duration (?:is (?:only |up to |reduced to )?|of this spell is (?:up to )?|increases to |extends to )${TIME}`,
        String.raw`\b(?:with|has) a duration of ${TIME}`,
        String.raw`\b(?:The spell|The illusion|the effect) lasts (?:for )?${TIME}`,
        String.raw`\bto a maximum of ${TIME}`,
        String.raw`\byou become \w+ for ${TIME}, gaining the effects of`,
        ...(spell ? [String.raw`\beffects? of ${spell} for ${TIME}`] : [])
    ];
    // (And the spell's own it replaces: The Peacock's "instead of 20 minutes", Orb of Dragonkind's "rather than unlimited".)
    for (const form of forms) {
        const match = new RegExp(String.raw`${form}(?:,? (?:instead of|rather than) (?:(?:\d+|one|an?) \w+|unlimited))?`, "i").exec(note);
        if (match) return { ...timeOf(match[1], match[2]), said: match[0] };
    }
    const unlimited = /\b(?:the|its) duration is unlimited\b/i.exec(note);
    return unlimited ? { value: -1, unit: "unlimited", said: unlimited[0] } : null;
}

export function withCastDuration(plan, spell = null) {
    if (plan?.builtin !== "cast-spell" || plan.castDuration || !(plan.notes ?? []).length) return plan;
    const own = ownTime(spell);
    let found = null;
    let atLevel = null;
    for (const note of plan.notes.map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? ""))) {
        // (A higher one from a level on: The Mountain Man's "If you're at least 15th level, the duration increases to 1 hour".)
        const gate = /\bIf you're at least (\d+)(?:st|nd|rd|th) level, the duration (?:increases|extends) to /i.exec(note);
        const time = readTime(gate ? note.slice(0, gate.index) : note, plan.spell?.name);
        if (time?.unit && !found) found = time;
        const higher = gate ? readTime(note.slice(gate.index), plan.spell?.name) : null;
        if (higher?.unit) atLevel = { level: Number(gate[1]), ...higher };
    }
    const base = found ?? (atLevel ? own : null);
    if (!base || (!atLevel && own && own.value === base.value && own.unit === base.unit)) return plan;
    const said = [found?.said, atLevel?.said].filter(Boolean);
    return { ...plan, castDuration: { value: base.value, unit: base.unit, said, ...(atLevel ? { atLevel: { level: atLevel.level, value: atLevel.value, unit: atLevel.unit } } : {}) } };
}

// The duration for a caster of that level: the higher one from its level on.
export const castDurationAt = (castDuration, level) => (castDuration?.atLevel && Number(level) >= castDuration.atLevel.level ? { value: castDuration.atLevel.value, unit: castDuration.atLevel.unit } : castDuration ? { value: castDuration.value, unit: castDuration.unit } : null);
