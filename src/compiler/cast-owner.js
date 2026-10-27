// A spell-cast card's rank and DC from its caster (2026-10-27): The Inquisitor's "The rank of the spell is one-half your level, rounded down
// (minimum 5th level), and the save DC is your class DC or spell DC", The Courtesan's "The rank of the spell is one-half your level, rounded
// down (minimum 6th level)". → plan.castRank { round, min, said } and plan.castDC { from: "class-spell", said }: the words they were read from
// (src/compiler/honest.js leaves them out of the cast's leftovers). Live: scripts/casts.js casts at the caster's level halved, at least the
// minimum, and at the higher of its class DC and spell DC. And a casting time the activation already is: "but as a two-action spell rather
// than one that takes 1 minute to cast" on a 2-action activation — plan.castTime { said }. Pure.

const RANK = /\bThe rank of the spell is (?:one-)?half your level, rounded (down|up) \(minimum (\d+)(?:st|nd|rd|th) (?:level|rank)\)/i;
const DC = /\b(?:and )?the save DC is (?:equal to )?your class DC or spell DC(?: \([^)]*\))?/i;
// (Another spell from a level on, The Sickness's "If you are at least 15th-level, you can instead choose to cast Spiritual Epidemic": a choice
// beside the cast's own, its level the card's to check.)
const FROM_LEVEL = /^If you are at least (\d+)(?:st|nd|rd|th)[- ]level, you can instead choose to cast ([A-Z][\w' -]+?)\.$/;
const TIME = /,?\s*but as a (one|two|three)-action spell rather than one that takes [^.]+? to cast\b/i;
const ACTIONS = { one: "1", two: "2", three: "3" };

export function withCastOwner(plan) {
    if (plan?.builtin !== "cast-spell" || !(plan.notes ?? []).length) return plan;
    const notes = plan.notes.map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? ""));
    const rank = !plan.rank ? notes.map((note) => RANK.exec(note)).find(Boolean) : null;
    const dc = !plan.dc ? notes.map((note) => DC.exec(note)).find(Boolean) : null;
    const time = notes.map((note) => TIME.exec(note)).find(Boolean);
    const own = time && ACTIONS[time[1].toLowerCase()] === String(plan.item?.activation?.time ?? plan.activation?.time ?? "") ? time : null;
    if (!rank && !dc && !own) return plan;
    return {
        ...plan,
        ...(rank ? { castRank: { round: rank[1].toLowerCase(), min: Number(rank[2]), said: rank[0] } } : {}),
        ...(dc ? { castDC: { from: "class-spell", said: dc[0] } } : {}),
        ...(own ? { castTime: { said: own[0] } } : {})
    };
}

// The plan and PF2e's spells by name (cast-words.js spellIndex) → the plan with a choice from a level on, or the same plan.
export function withLevelChoice(plan, spells = {}) {
    if (plan?.builtin !== "cast-spell" || !plan.spell?.uuid) return plan;
    const notes = (plan.notes ?? []).map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim());
    const found = notes.map((note) => FROM_LEVEL.exec(note)).find(Boolean);
    const spell = found ? spells[found[2].toLowerCase()] : null;
    if (!spell) return plan;
    const own = plan.choices?.length ? plan.choices : [{ spell: plan.spell, rank: plan.rank ?? null }];
    return { ...plan, choices: [...own, { spell: { uuid: spell.uuid, name: spell.name }, rank: plan.rank ?? null, area: spell.area, targets: spell.targets, minLevel: Number(found[1]) }], levelChoice: { said: found[0] } };
}

// The rank for a caster of that level: half of it, rounded as said, at least the minimum.
export const castRankAt = (castRank, level) => (castRank ? Math.max(castRank.min, castRank.round === "up" ? Math.ceil(Number(level) / 2) : Math.floor(Number(level) / 2)) : null);
