// A creature swallowed, then spat out to fall (2026-10-27, docs/needs.md): Worm Vial's Eat — "The target must be within 15 feet, and it attempts
// a … save. If it fails, it takes … (doubled on a critical failure). The worm then spits the creature out to any empty space on the ground within
// 30 feet, causing the creature to take damage from a 20-foot fall." Its failing rows: the critical failure's damage doubled; the spit a placed
// move (plan.placed, its user picking the space within that distance — scripts/placed-moves.js); the fall half its feet as bludgeoning damage
// and Prone, as PF2e's falls are (the ability module's Fling reads the same); its range the 15 feet. Its other function, Burrow, a line of the
// card: a tunnel on the map, no rule to apply. Pure.

import { plainText } from "./rows.js";

const SPITS = /^The [\w ]+? then spits the creature out to any empty space on the ground within (\d+) feet, causing the creature to take damage from an? (\d+)-foot fall\.$/i;
const DOUBLED = /\bIf it fails, it takes @Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})? \(doubled on a critical failure\)/i;
const WITHIN = /\bThe target must be within (\d+) feet\b/i;
const BURROW = /\bBurrow The (\w+) Burrows up to (\d+) feet, leaving a tunnel behind it\. It can burrow through solid stone, but if it does so it burrows (\d+) feet instead of \2 feet\./i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();

// The plan and its item (or its description) → the plan with the spit, or the same plan.
export function withSpitOut(plan, given) {
    const outcomes = plan?.resolution?.outcomes;
    const spit = outcomes ? (plan.notes ?? []).map((note) => [note, SPITS.exec(said(note))]).find(([, match]) => match) : null;
    if (!spit) return plan;
    const html = String(typeof given === "string" ? given : given?.system?.description?.value ?? "");
    const text = plainText(html);
    const [, within, feet] = spit[1].map((part, at) => (at ? Number(part) : part));
    const fall = { formula: `${Math.floor(feet / 2)}[bludgeoning]` };
    const prone = { kind: "condition", slug: "prone", value: null, duration: null };
    const doubled = DOUBLED.test(html);
    const failing = ["failure", "criticalFailure"].filter((degree) => outcomes[degree]?.damage?.mode === "formulas");
    if (failing.length !== 2) return plan;
    const rows = { ...outcomes };
    for (const degree of failing) {
        const row = outcomes[degree];
        // (The critical failure's swallowing doubled, when its formulas are the failure's own; not the fall.)
        const own = doubled && degree === "criticalFailure" && JSON.stringify(row.damage.formulas) === JSON.stringify(outcomes.failure.damage.formulas) ? row.damage.formulas.map((entry) => ({ formula: `2*${entry.formula}` })) : row.damage.formulas;
        rows[degree] = { ...row, damage: { ...row.damage, formulas: [...own, fall] }, effects: [...(row.effects ?? []), prone] };
    }
    const range = WITHIN.exec(text);
    const burrow = BURROW.exec(text);
    const notes = [
        ...(plan.notes ?? []).filter((note) => note !== spit[0]),
        ...(burrow ? [`Or Burrow instead: the ${burrow[1]} tunnels up to ${burrow[2]} feet (${burrow[3]} through solid stone), leaving a tunnel behind it (draw it on the map).`] : [])
    ];
    const placed = { rows: Object.fromEntries(failing.map((degree) => [degree, { within }])), nearSource: null, optional: false, lines: [`Spat out on the ground, it falls ${feet} feet: ${Math.floor(feet / 2)} bludgeoning damage and Prone (on the card)`], byHand: [`On a failure, move it to an empty space on the ground within ${within} feet.`] };
    const left = (plan.unread ?? []).length || Object.values(rows).some((row) => (row?.manualInstructions ?? []).length);
    const result = {
        ...plan,
        ...(range ? { targeting: { ...plan.targeting, range: `${range[1]} feet` } } : {}),
        resolution: { ...plan.resolution, outcomes: rows },
        placed,
        notes: notes.length ? notes : undefined
    };
    if (plan.partial && !left) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
