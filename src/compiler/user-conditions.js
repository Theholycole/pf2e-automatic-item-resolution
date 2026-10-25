// A condition its user takes beside the save it gives others (2026-10-25, docs/needs.md): Pharasmin Visor's Pharasma's Disdain, "Your vision becomes
// obscured, causing you to become Dazzled. … At the end of your turn, both visors automatically rise back up, but you remain dazzled until the
// start of your next turn", beside the undead's Will save → plan.userEffects [{ slug, value, duration }]: given to its user as it's used
// (scripts/live.js, through the ability module's applyChange), its sentences read. Pure.

const BECOMES = /\bcausing you to become (Blinded|Clumsy|Dazzled|Deafened|Enfeebled|Fatigued|Off-Guard|Sickened|Slowed|Stupefied)(?: (\d))?\./i;
const REMAINS = /\byou remain (\w+(?:-\w+)?) until the (start|end) of your next turn\./i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withUserConditions(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin) return plan;
    const plain = String(text ?? "");
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
