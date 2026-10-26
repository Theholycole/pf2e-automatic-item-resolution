// The user's rulings for what a card can't apply as game numbers (2026-10-25, docs/needs.md "Your decisions"): messages, speech and sound a
// note Effect for the item's time, counted done; a creature's attitude, memory or behaviour a note Effect on it, counted done on its own;
// information a card whispered to the GM and the user, with what the GM fills in, counted done. A plan whose leftover words show only
// these needs (src/compiler/needs.js), and no game numbers at all — no dice, DC, distance, bonus, condition, damage, Strike or teleport:
// those are work to build — becomes that: its note row kept and no longer note-only, the GM's lines of its rows note Effects on whom they're
// for, or (information) plan.whisper, the item module's whispered card (scripts/live.js). Pure.

import { leftToTheGM } from "./honest.js";
import { leftText, needsOf } from "./needs.js";

const DECIDED = new Set(["speech", "mind", "information"]);
const MECHANICAL = /\b\d+d\d+\b|(?:^|\s)[+\-–]\d+\b|\bDC \d+\b|\b\d+ (?:feet|foot)\b|\b(?:damage|Hit Points|Strikes?|attack|teleport\w*|transport\w*|Speed|bonus|penalty|resistance|weakness|saving throws?|save|check|frightened|slowed|stunned|immobilized|grabbed|restrained|prone|dazzled|blinded|deafened|clumsy|enfeebled|sickened|fascinated|controlled|confused|paralyzed|unconscious|dies|concealed|invisible|hidden)\b/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// What its card leaves over, as tools/needs.mjs reads it: notes, unread lines, note Effects, and its rows' GM lines.
function leftovers(plan) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        for (const key of ["notes", "unread", "noteEffects"]) if (Array.isArray(node[key])) for (const entry of node[key]) if (said(entry)) out.push([key, said(entry)]);
        if (node.resolution?.outcomes) for (const [degree, row] of Object.entries(node.resolution.outcomes)) for (const line of leftToTheGM(row)) out.push([`gm:${degree}`, line]);
        for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
    };
    walk(plan);
    return out;
}

const resultOf = (plan) => (!plan ? "none" : plan.builtin ? `builtin:${plan.builtin}` : plan.noteOnly ? "note-only" : plan.partial ? "partial" : "resolves");

// Its words' time: "for 1 hour", "for 10 minutes", "for 24 hours" (the first), else none (unlimited).
const TIME = /\b[Ff]or (\d+|one|an?) (rounds?|minutes?|hours?|days?)\b/;
function timeOf(text) {
    const found = TIME.exec(String(text ?? ""));
    if (!found) return null;
    const value = { one: 1, a: 1, an: 1 }[found[1].toLowerCase()] ?? Number(found[1]);
    const unit = found[2].toLowerCase().replace(/s?$/, "s");
    return unit === "days" ? { mode: "fixed", value: value * 24, unit: "hours", expiry: "turn-start" } : { mode: "fixed", value, unit, expiry: "turn-start" };
}

// The plan, its item's plain text and its base, and whether it's an activation (its text from Effect on) → the plan as decided, or as it was.
export function withDecided(plan, { text = "", base = null, kind = "consumable", trigger = false, name = null } = {}) {
    const result = resultOf(plan);
    if (result === "resolves" || (result.startsWith("builtin:") && result !== "builtin:no-effect")) return plan;
    const entry = { result, kind, trigger, text, left: plan ? leftovers(plan) : [] };
    const needs = needsOf(entry);
    if (!needs.length || !needs.every((need) => DECIDED.has(need))) return plan;
    const words = leftText(entry);
    if (MECHANICAL.test(words)) return plan;
    const decided = needs.includes("information") ? "information" : needs[0];
    // (Its words from its effect on: a consumable's without its Activate line — "Activate 1 minute", "Activate (manipulate)" — or Usage.)
    const body = kind === "activation" ? words : String(text).replace(/^\s*(?:Usage [^.]*?(?=Activate)\s*)?Activat(?:e|ion)\s*(?:\[[^\]]*\]\s*)?(?:\d+ (?:minutes?|hours?|rounds?)|reaction|free action|[123])?\s*(?:(?:Interact|command|envision|Cast a Spell)\s*)?(?:\([^)]*\))?\s*/i, "").trim() || words;
    // (Information: whispered to the GM and its user, what it tells filled in by the GM.)
    if (decided === "information" && (!plan || result === "builtin:no-effect" || result === "note-only")) {
        return { ...(plan ?? base ?? {}), ...(base ?? {}), builtin: "whisper", noteOnly: undefined, partial: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" }, whisper: { text: body }, decided, resolution: undefined };
    }
    // (A partial plan: its GM's lines of these kinds note Effects on that row, for whom the row is.)
    if (result === "partial") {
        const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => {
            const lines = leftToTheGM(row);
            if (!row || !lines.length) return [degree, row];
            return [degree, { ...row, manualInstructions: (row.manualInstructions ?? []).filter((line) => !lines.includes(said(line))), noteEffects: [...(row.noteEffects ?? []), ...lines.map((line) => ({ label: name ?? plan.source?.name ?? "Note", text: line.replace(/^\{target\}(?: \([^)]*\))?:\s*/, ""), duration: timeOf(line) }))] }];
        }));
        const next = { ...plan, resolution: plan.resolution ? { ...plan.resolution, outcomes } : plan.resolution, decided };
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
        return next;
    }
    // (Note-only: its note row kept, done. Nothing read, or the GM's: a note row of its words for their time.)
    if (result === "note-only") return { ...plan, noteOnly: undefined, decided, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    const success = { ...none(), noteEffects: [{ label: name ?? base?.source?.name ?? "Note", text: body, duration: timeOf(body) }] };
    return { ...(base ?? {}), ...(plan && result === "builtin:no-effect" ? { source: plan.source, activation: plan.activation, item: plan.item } : {}), builtin: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success } }, decided };
}
