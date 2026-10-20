// A plan counted resolved only when its card does all of it (2026-10-20, an audit of the resolved plans): a result row whose GM line the GM
// must carry out makes the plan partial. Not a line that does nothing ("The creature is unaffected"), nor a behaviour rule beside something the
// row really applies — the user's rule for spells (2026-09-26): "can't use reactions until …" as a GM line only on a row that also applies a
// condition, damage or a push. A note Effect carrying what can't be automated is the user's later rule (2026-09-26, note Effects) and counts
// as done; only the whole text's reminder beside a part read (src/compiler/rows.js noteRow) goes with partial, and once later readings leave
// nothing unread it's stale and gone. Plan-level notes are the readers' own choice (a card's line, or partial already). Pure.

import { RUNE_STEP_SENTENCE } from "./rune-steps.js";

const NO_OP = /^(?:\{target\}(?: \([^)]*\))?:\s*)?(?:The (?:target|creature|animal|foe|undead|possessing creature)(?: creature)? (?:is unaffected|can act normally|takes no (?:additional )?damage)|(?:Its|The) (?:effect|oil|dust) (?:ends|becomes inert)[^.]*)\.?\s*$/i;
// (An unaffected creature's awareness, the GM's flavor and no rule: "The creature is unaffected and realizes you tried to steal its memories",
// "The animal is unaffected. It doesn't necessarily become aware of the pheromones, …", "The potion does not affect you".)
const UNAFFECTED_AWARE = /^(?:\{target\}(?: \([^)]*\))?:\s*)?(?:The (?:target|creature|animal|foe|undead)(?: creature)? is unaffected(?:\.(?=\s+It doesn't necessarily become aware\b)|\b[^.]*?\b(?:realizes?|aware|thinks|suspicious|unaware)\b[^.]*\.)(?:\s+It doesn't necessarily become aware\b.*)?|The (?:potion|elixir|oil) does not affect you\.)\s*$/i;
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
    return (row?.manualInstructions ?? []).map(said).filter((line) => line && !NO_OP.test(line) && !UNAFFECTED_AWARE.test(line) && !CARD_LINE.test(line.replace(/^\{target\}(?: \([^)]*\))?:\s*/, "")) && !(applies(row) && BEHAVIOUR.test(line) && /\bthe rest by hand\b/i.test(line)));
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

// A rule sentence the plan shows no trace of (2026-10-20, the dropped-rule audit): one with a mechanical token — dice, a DC, a distance, a
// condition, persistent damage, a resistance or weakness — none of which is anywhere in the plan (Stampede Medallion's "On a critical failure,
// the foe is also knocked Prone" beside a basic save that had no Prone). A note, the plan partial: the card says it, the census counts it.
// text: the plain text it was read from (the item's, or the activation's).
const CONDITIONS = "frightened|sickened|stunned|slowed|prone|off-guard|dazzled|blinded|deafened|clumsy|enfeebled|drained|fatigued|immobilized|grabbed|restrained|quickened|fleeing|confused|paralyzed|petrified|stupefied|doomed|persistent|resistance|weakness";
const SKIP = /^(?:This|These|Activate|Frequency|Trigger|Requirements|Craft Requirements|Usage|Access|Saving Throw|Onset|Maximum Duration|Stage \d|Effect:|Hardness)\b/;
// (A condition as a rule — "becomes Frightened 1", "is also knocked Prone", "Slowed 1" — not a word of flavor, "barely restrained contempt";
// persistent damage, a resistance or weakness with its number.)
const CONDITION_RULE = new RegExp(String.raw`\b(?:becomes?|is|are|be|knocked|falls?|gains?|remains?|also)\s+(?:\w+\s+)?(${CONDITIONS.replace(/\|persistent\|resistance\|weakness$/, "")})\b|\b(${CONDITIONS.replace(/\|persistent\|resistance\|weakness$/, "")}) \d\b`, "gi");
// (Persistent damage something takes or deals, not what a sense detects, "creatures who are taking persistent bleed damage".)
const AMOUNT_RULE = /\b\d+(?:d\d+)? persistent\b|\b(?:takes?|deals?)\b[^.]{0,40}?\bpersistent \w+ damage\b|\b(?:resistance|weakness) (?:\d+|to)\b/gi;
function tokensOf(sentence) {
    return [
        ...(sentence.match(/\b\d+d\d+\b/g) ?? []).map((dice) => ({ dice })),
        ...[...sentence.matchAll(/\bDC (\d+)\b/g)].map((match) => ({ number: Number(match[1]) })),
        ...[...sentence.matchAll(/\b(\d+)-foot\b/g)].map((match) => ({ number: Number(match[1]) })),
        ...[...sentence.matchAll(CONDITION_RULE)].map((match) => ({ word: (match[1] ?? match[2]).toLowerCase() })),
        ...[...sentence.matchAll(AMOUNT_RULE)].map((match) => ({ word: /persistent/i.test(match[0]) ? "persistent" : /resistance/i.test(match[0]) ? "resist" : "weakness" }))
    ];
}
function traceOf(plan) {
    const json = JSON.stringify(plan).toLowerCase();
    const dice = new Set([...(json.match(/\b\d+d\d+\b/g) ?? [])]);
    for (const match of json.matchAll(/"dicenumber":(\d+),(?:[^{}]*?)"diesize":"(d\d+)"/g)) dice.add(`${match[1]}${match[2]}`);
    // (Any number in it, a string's "90-foot line" too.)
    const numbers = new Set([...json.matchAll(/\d+/g)].map((match) => Number(match[0])));
    return { json, dice, numbers };
}
export function withUntracedRules(plan, text) {
    if (!plan || plan.partial || plan.noteOnly || plan.builtin) return plan;
    // (Not one that gives PF2e's own Effect, or a PF2e spell's: its rules are that Effect's, which the plan doesn't spell out.)
    if (/"native-spell-effect"|Compendium\.pf2e\.[a-z-]*effects\.Item\./.test(JSON.stringify(plan))) return plan;
    // (From its Effect on, else after its Activate line's traits.)
    const plain = String(text ?? "");
    const body = (/\bEffect\b/.test(plain) ? plain.replace(/^.*?\bEffect\b\s*/s, "") : plain.replace(/^.*?\bActivate\b[^.]*?\)\s*/s, "")).replace(/\s*\bCraft Requirements\b.*$/s, "");
    const trace = traceOf(plan);
    const untraced = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => {
        // (A step by the weapon's striking rune: its rune decides it, src/compiler/rune-steps.js.)
        if (!sentence || SKIP.test(sentence) || RUNE_STEP_SENTENCE.test(sentence)) return false;
        const tokens = tokensOf(sentence);
        return tokens.length > 0 && !tokens.some((token) => (token.dice ? trace.dice.has(token.dice.toLowerCase()) : token.number !== undefined ? trace.numbers.has(token.number) : trace.json.includes(token.word)));
    });
    if (!untraced.length) return plan;
    return { ...plan, notes: [...(plan.notes ?? []), ...untraced], partial: true, automation: { ...(plan.automation ?? {}), level: "guided" } };
}
