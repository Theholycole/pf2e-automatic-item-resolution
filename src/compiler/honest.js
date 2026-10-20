// A plan counted resolved only when its card does all of it (2026-10-20, an audit of the resolved plans): a result row whose GM line the GM
// must carry out makes the plan partial. Not a line that does nothing ("The creature is unaffected"), nor a behaviour rule beside something the
// row really applies — the user's rule for spells (2026-09-26): "can't use reactions until …" as a GM line only on a row that also applies a
// condition, damage or a push. A note Effect carrying what can't be automated is the user's later rule (2026-09-26, note Effects) and counts
// as done; only the whole text's reminder beside a part read (src/compiler/rows.js noteRow) goes with partial, and once later readings leave
// nothing unread it's stale and gone. Plan-level notes are the readers' own choice (a card's line, or partial already). Pure.

const NO_OP = /^(?:\{target\}(?: \([^)]*\))?:\s*)?(?:The (?:target|creature|animal|foe|undead|possessing creature)(?: creature)? (?:is unaffected|can act normally|takes no (?:additional )?damage)|(?:Its|The) (?:effect|oil|dust) (?:ends|becomes inert)[^.]*)\.?\s*$/i;
// (Lines the card's own results already are: "takes half damage and no other effects", Hauling's direction line, an item's own recharge.)
const CARD_LINE = /\btakes half damage and no other effects\b|^The direction is its user's choice: the card moves it\b|\breappears on the [\w ]+? after 24 hours\.$/i;
const BEHAVIOUR = /\bcan't use (?:reactions|hostile actions)\b|\bmust (?:spend|use) (?:at least )?(?:one of )?its (?:first )?actions?\b|\bcan't treat any creature as (?:its|an) ally\b|\bdoesn't act against you\b|\bignores other creatures\b/i;
const DEGREES = ["criticalSuccess", "success", "failure", "criticalFailure"];

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const applies = (row) => Boolean((row?.effects ?? []).length || (row?.modifiers ?? []).length || row?.forcedMovement || (row?.damage && row.damage.mode && row.damage.mode !== "none"));

// The rows of every check the plan carries (its own, a Strike's save, a zone's saves) → [row].
function rowsOf(node, found = [], seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return found;
    seen.add(node);
    const outcomes = node.resolution?.outcomes;
    if (outcomes && typeof outcomes === "object") for (const degree of DEGREES) if (outcomes[degree]) found.push(outcomes[degree]);
    for (const value of Object.values(node)) if (value && typeof value === "object") rowsOf(value, found, seen);
    return found;
}

// What of a row the GM must still carry out: its GM lines that aren't nothing or a behaviour rule beside a real result.
export function leftToTheGM(row) {
    return (row?.manualInstructions ?? []).map(said).filter((line) => line && !NO_OP.test(line) && !CARD_LINE.test(line.replace(/^\{target\}(?: \([^)]*\))?:\s*/, "")) && !(applies(row) && BEHAVIOUR.test(line) && /\bthe rest by hand\b/i.test(line)));
}

// The plan, partial when a row leaves the GM something to carry out.
export function withHonestPartial(given) {
    if (!given || given.partial || given.noteOnly || given.builtin === "no-effect") return given;
    // (Its whole text's reminder, once later readings left nothing unread: stale, gone.)
    const plan = withoutStaleReminder(given);
    const left = rowsOf(plan).flatMap(leftToTheGM);
    if (!left.length) return plan;
    return { ...plan, partial: true, automation: { ...(plan.automation ?? {}), level: "guided" } };
}

function withoutStaleReminder(plan) {
    const outcomes = plan.resolution?.outcomes;
    if (!outcomes || !Object.values(outcomes).some((row) => (row?.noteEffects ?? []).some((entry) => entry?.reminder))) return plan;
    const next = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((entry) => !entry?.reminder) } : row]));
    return { ...plan, resolution: { ...plan.resolution, outcomes: next } };
}
