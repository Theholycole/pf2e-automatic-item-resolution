// A condition its user takes beside the save it gives others (2026-10-25, docs/needs.md): Pharasmin Visor's Pharasma's Disdain, "Your vision becomes
// obscured, causing you to become Dazzled. … At the end of your turn, both visors automatically rise back up, but you remain dazzled until the
// start of your next turn", beside the undead's Will save → plan.userEffects [{ slug, value, duration }]: given to its user as it's used
// (scripts/live.js, through the ability module's applyChange), its sentences read. And (2026-10-26) Death Tusk Helm's "You then gain 5
// temporary Hit Points that last 1 minute" beside its roar's save — { kind: "temp-hp", amount, duration } — and its "Increase this DC by the sum
// of your Doomed and Wounded values (maximum DC 20)": plan.dcBy { slugs, max }, the save's DC its user's values higher as it's used
// (src/live/scaled.js). Pure.

const BECOMES = /\bcausing you to become (Blinded|Clumsy|Dazzled|Deafened|Enfeebled|Fatigued|Off-Guard|Sickened|Slowed|Stupefied)(?: (\d))?\./i;
const REMAINS = /\byou remain (\w+(?:-\w+)?) until the (start|end) of your next turn\./i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

const TEMP_THEN = /^You then gain (\d+) temporary Hit Points that last (\d+|one|an?) (rounds?|minutes?|hours?)\.$/i;
const DC_BY = /^Increase this DC by the sum of your (\w+) and (\w+) values \(maximum DC (\d+)\)\.$/i;
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };

// (Its user's temporary Hit Points, and its DC by its user's conditions, beside its save: Death Tusk Helm's.)
function withUserTemp(plan, plain) {
    const sentences = plain.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const temp = sentences.map((sentence) => TEMP_THEN.exec(sentence)).find(Boolean);
    const dc = sentences.map((sentence) => DC_BY.exec(sentence)).find(Boolean);
    if (!temp && !dc) return plan;
    const read = [temp?.[0], dc?.[0]].filter(Boolean);
    const notes = (plan.notes ?? []).filter((note) => !read.some((sentence) => said(note).startsWith(sentence.replace(/\.$/, ""))));
    const result = {
        ...plan,
        ...(temp ? { userEffects: [...(plan.userEffects ?? []), { kind: "temp-hp", amount: Number(temp[1]), duration: { mode: "fixed", value: /^\d+$/.test(temp[2]) ? Number(temp[2]) : 1, unit: UNITS[temp[3].toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" } }] } : {}),
        ...(dc ? { dcBy: { slugs: [dc[1].toLowerCase(), dc[2].toLowerCase()], max: Number(dc[3]) } } : {}),
        ...(plan.notes ? { notes: notes.length ? notes : undefined } : {})
    };
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(plan.resolution.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

export function withUserConditions(given, text) {
    if (given?.resolution?.kind !== "save" || given.builtin) return given;
    const plain = String(text ?? "");
    const plan = withUserTemp(given, plain);
    const becomes = BECOMES.exec(plain);
    const remains = REMAINS.exec(plain);
    if (!becomes || !remains || remains[1].toLowerCase() !== becomes[1].toLowerCase()) return plan;
    const slug = becomes[1].toLowerCase();
    const duration = { mode: "fixed", value: 1, unit: "rounds", expiry: remains[2].toLowerCase() === "end" ? "turn-end" : "turn-start", anchor: "source-turn" };
    const sentences = plain.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => BECOMES.test(sentence) || REMAINS.test(sentence)).map((sentence) => sentence.trim());
    const notes = (plan.notes ?? []).filter((note) => !sentences.some((sentence) => said(note).startsWith(sentence.replace(/\.$/, ""))));
    const result = { ...plan, userEffects: [{ slug, value: becomes[2] ? Number(becomes[2]) : null, duration }], ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}) };
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(plan.resolution.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
