// What an item's use costs its user beyond the item itself: a Mythic Point (the user's answer of 2026-10-19). Two ways:
// - its text's "Spend a Mythic Point" / "Spend 1 Mythic Point" as what its effect does (Mythic Resilient's "Effect Spend a Mythic Point; if
//   …", Chromatic Robe's "Effect Spend 1 Mythic Point."), not a choice ("If you spend 1 Mythic Point when you activate …") nor another's
//   ("They spend 1 Mythic Point", an intelligent item's own);
// - a cast of a spell with the mythic trait, which costs one to cast (on a cast with choices, the mythic ones' own).
// → plan.spend = { mythicPoints: 1 } (a ways plan's on each way's plan; a cast's choice's on that choice). The card spends it when it's
// applied, and refuses without one; the world setting has it a Hero Point instead (scripts/spend.js). The cost's own sentence, a note
// otherwise, goes. Pure.

const SPEND = /(?:^|[.;:]\s+|\bEffect\s+)Spend (?:a|1|one) Mythic Point\b/i;
const SPEND_NOTE = /^\s*Spend (?:a|1|one) Mythic Point\.?\s*$/i;
const COST = Object.freeze({ mythicPoints: 1 });

// The text (plain) → { mythicPoints: 1 } or null.
export const readSpend = (text) => (SPEND.test(String(text ?? "")) ? { ...COST } : null);

// Whether a spell the spells index knows has the mythic trait (options.spells: spellIndex's, by name).
const mythicSpell = (spell, spells) => Boolean(spell?.uuid) && Object.values(spells ?? {}).some((entry) => entry.uuid === spell.uuid && entry.mythic);

// The plan with what its use costs, or the same plan.
export function withSpend(plan, text, { spells = {} } = {}) {
    if (!plan || typeof plan !== "object") return plan;
    const said = readSpend(text);
    if (plan.builtin === "ways" && Array.isArray(plan.ways)) return { ...plan, ways: plan.ways.map((way) => ({ ...way, plan: withSpend(way.plan, `${said ? "Effect Spend a Mythic Point. " : ""}${way.text ?? ""}`, { spells }) })) };
    const choices = plan.builtin === "cast-spell" && Array.isArray(plan.choices) ? plan.choices.map((choice) => (mythicSpell(choice.spell, spells) ? { ...choice, spend: { ...COST } } : choice)) : null;
    const mythic = plan.builtin === "cast-spell" && !plan.choices?.length && mythicSpell(plan.spell, spells);
    if (!said && !mythic && !choices?.some((choice) => choice.spend)) return plan;
    const notes = (plan.notes ?? []).filter((note) => !SPEND_NOTE.test(note));
    // (Its unread lines too, Chromatic Robe's "Spend 1 Mythic Point." — 2026-10-26.)
    const unread = (plan.unread ?? []).filter((line) => !SPEND_NOTE.test(line));
    const next = { ...plan, ...(said || mythic ? { spend: { ...COST } } : {}), ...(choices ? { choices } : {}), ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}), ...(plan.unread ? { unread } : {}) };
    // (Partial for its cost's sentence alone: no longer.)
    const left = [...notes, ...unread, ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length && (plan.notes?.length !== notes.length || plan.unread?.length !== unread.length)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
