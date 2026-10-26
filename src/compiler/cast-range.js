// A spell-cast card's own range, where the item gives the spell another: Medusa's Scream's "a DC 30 Petrify spell with a range of 30 feet"
// (the spell's is 120), The Queen Mother's "but with a range of 90 feet", General's Word's "except the range is 500 feet", Tiger Shield's
// "on a target within your melee range", Empathic Cords' "The range of this message is planetary". → plan.castRange { feet | reach | words,
// said }: the words it was read from (src/compiler/honest.js leaves them out of the cast's leftovers). Not when it's the spell's own range
// (options.spells). Live: the card shows it, and refuses a target beyond it (scripts/casts.js). Pure.

const FORMS = [
    [/\b(?:with|but with) a range of (\d+) feet\b/i, (match) => ({ feet: Number(match[1]) })],
    [/\b(?:except )?the range is (\d+) feet\b/i, (match) => ({ feet: Number(match[1]) })],
    [/\bon (?:a|one) target within your melee range\b/i, () => ({ reach: true })],
    [/\bThe range of this \w+ is (planetary)\b/i, (match) => ({ words: match[1].toLowerCase() })]
];

export function withCastRange(plan, spell = null) {
    if (plan?.builtin !== "cast-spell" || plan.castRange || !(plan.notes ?? []).length) return plan;
    for (const note of plan.notes.map((entry) => String(typeof entry === "string" ? entry : entry?.text ?? ""))) {
        for (const [form, read] of FORMS) {
            const match = form.exec(note);
            if (!match) continue;
            const range = read(match);
            if (range.feet && new RegExp(String.raw`^${range.feet} feet$`, "i").test(String(spell?.range ?? ""))) return plan;
            return { ...plan, castRange: { ...range, said: match[0] } };
        }
    }
    return plan;
}

// The card's words for it: "range 30 feet", "range: your melee reach", "range planetary".
export const rangeWords = (castRange) => (!castRange ? null : castRange.feet ? `range ${castRange.feet} feet` : castRange.reach ? "range: your melee reach" : `range ${castRange.words}`);
