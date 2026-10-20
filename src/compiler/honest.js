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

// A behaviour rule or the GM's call with a time of its own — Floppy Rag Doll's "can't use reactions until the end your turn", Truth Potion's "must
// tell the truth", Animal Pheromones' attitude — as a note Effect on the creature for that time (the user's note-Effect rule, 2026-09-26), not a
// GM line: its time the line's own, else the item's (time: its text's). Not one with numbers or conditions the card should apply, nor one with
// two times.
const BEHAVIOUR_NOTE = /\bcan't use reactions\b|\bmust tell the truth\b|\bunable to tell any deliberate lies\b|\battitude\b[^.]*\bimproves\b|\battitude increases\b|\bbecomes (?:friendly|helpful)\b|\bcan't use hostile actions\b|\bignores other creatures\b|\bdoesn't disbelieve\b|\bbelieves you're\b|\bdoesn't act against you\b/i;
const MECHANICAL = /\b\d+d\d+\b|[+\-–]\d+\b|\bDC \d+\b|\b(?:frightened|slowed|stunned|immobilized|grabbed|restrained|prone|dazzled|blinded|deafened|clumsy|enfeebled|sickened|fascinated|controlled|dies|damage)\b/i;
const TURN_TIMES = [
    [/\buntil the end (?:of )?your turn\b/i, { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }],
    [/\buntil the end of your next turn\b/i, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }],
    [/\buntil the end of its (?:next )?turn\b/i, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" }],
    [/\buntil the (?:start|beginning) of your next turn\b/i, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" }]
];
const FOR_TIME = /\b(?:for|persists for|lasts) (\d+|one|an?) (round|minute|hour)s?\b/gi;
const COUNT = { one: 1, a: 1, an: 1 };
function timeOf(line) {
    const turns = TURN_TIMES.filter(([pattern]) => pattern.test(line));
    const times = [...line.matchAll(FOR_TIME)];
    if (turns.length + times.length !== 1) return turns.length + times.length ? undefined : null;
    if (turns.length) return { ...turns[0][1] };
    const [, count, unit] = times[0];
    return { mode: "fixed", value: COUNT[count.toLowerCase()] ?? Number(count), unit: `${unit.toLowerCase()}s`, expiry: "turn-start", anchor: "effect-start" };
}
function withBehaviourNotes(plan, time) {
    const outcomes = plan.resolution?.outcomes;
    if (!outcomes) return plan;
    let changed = false;
    const next = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        const lines = row?.manualInstructions ?? [];
        if (!lines.length) return [degree, row];
        const kept = [];
        const notes = [];
        for (const entry of lines) {
            const line = said(entry).replace(/^\{target\}(?: \([^)]*\))?:\s*/, "").replace(/\s*\(by hand\)\.?$/, "");
            const own = timeOf(line);
            const duration = own === undefined ? undefined : own ?? time ?? undefined;
            if (BEHAVIOUR_NOTE.test(line) && !MECHANICAL.test(line) && duration) notes.push({ text: line, duration });
            else kept.push(entry);
        }
        if (!notes.length) return [degree, row];
        changed = true;
        const { manualInstructions, ...rest } = row;
        return [degree, { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(row.noteEffects ?? []), ...notes] }];
    }));
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes: next } } : plan;
}

// The plan, partial when a row leaves the GM something to carry out. time: the item's own, for a behaviour note's time when its line has none.
export function withHonestPartial(given, time = null) {
    if (!given || given.partial || given.noteOnly || given.builtin === "no-effect") return given;
    // (Its whole text's reminder, once later readings left nothing unread: stale, gone. Its behaviour lines, note Effects.)
    const plan = withBehaviourNotes(withoutStaleReminder(given), time);
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
