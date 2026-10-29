// A curse on a creature's spellcasting (2026-10-29, docs/spell-module-requests.md row 6, the user's answer to question 8): Magekiller Bullet's
// hit — for a week, whenever its target casts, a flat check (DC 11) and 2d12 force when it's failed. The hit's note Effect lasts the week,
// with a RollOption naming the check and the damage (air-cast-curse:<dc>:<formula>:<type>):
// scripts/cast-curse.js rolls the flat check each time its creature casts a spell, and the damage on a failure. Its counteract and the
// surgery that helps it stay the note's words. Pure.

import { timeOf } from "./area-readings.js";

const CURSE = /\bEach time within the next (\w+) an affected target Casts a Spell, it must attempt a @Check\[flat\|dc:(\d+)\]\. On a failure, it takes (\d+d\d+) ([a-z]+) damage\./;
const SPAN = { round: [1, "rounds"], minute: [1, "minutes"], hour: [1, "hours"], day: [1, "days"], week: [7, "days"] };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export const castCurseOption = ({ dc, formula, type }) => `air-cast-curse:${dc}:${formula}:${type}`;
// The option's numbers back, or null.
export function castCurseOf(option) {
    const found = /^air-cast-curse:(\d+):(\d+d\d+):([a-z]+)$/.exec(String(option ?? ""));
    return found ? { dc: Number(found[1]), formula: found[2], type: found[3] } : null;
}

// The plan → its rows' note Effects with the curse given its time and its option, or the same plan.
export function withCastCurse(plan) {
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes) return plan;
    let changed = false;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (!row?.noteEffects?.length) return [degree, row];
        const noteEffects = row.noteEffects.map((note) => {
            const found = CURSE.exec(said(note));
            const span = found ? SPAN[found[1].toLowerCase()] : null;
            if (!span || (note.rules ?? []).some((rule) => String(rule?.option ?? "").startsWith("air-cast-curse:"))) return note;
            changed = true;
            const curse = { dc: Number(found[2]), formula: found[3], type: found[4] };
            return { ...note, label: note.label ?? "Curse on its spellcasting", duration: timeOf(span[0], span[1]), rules: [...(note.rules ?? []), { key: "RollOption", option: castCurseOption(curse) }] };
        });
        return [degree, { ...row, noteEffects }];
    }));
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes: rows } } : plan;
}
