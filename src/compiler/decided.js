// The user's rulings for what a card can't apply as game numbers (2026-10-25, docs/needs.md "Your decisions"): messages, speech and sound a
// note Effect for the item's time, counted done; a creature's attitude, memory or behaviour a note Effect on it, counted done on its own;
// information a card whispered to the GM and the user, with what the GM fills in, counted done. A plan whose leftover words show only
// these needs (src/compiler/needs.js), and no game numbers at all — no dice, DC, distance, bonus, condition, damage, Strike or teleport:
// those are work to build — becomes that: its note row kept and no longer note-only, the GM's lines of its rows note Effects on whom they're
// for, or (information) plan.whisper, the item module's whispered card (scripts/live.js).
// (And out of combat and objects, the user's answer of 2026-10-27: a leftover that's only these — or these beside the kinds above — a line of
// its card, counted done, decided "card-line": its notes and GM lines kept as they are, or for one nothing read, its words the card's line. Not
// a unique item's or an artifact's — special, their rules to be built (the user, the same day) — nor words that act on a creature in a fight:
// a condition, a Strike, a save — COMBAT.) Pure.

import { leftToTheGM } from "./honest.js";
import { leftText, needsOf } from "./needs.js";
import { notesChecked } from "./notes-checked.js";
import { oneOff } from "./one-offs.js";
import { loreOnly } from "./lore-lines.js";

const DECIDED = new Set(["speech", "mind", "information"]);
const CARD_LINE = new Set(["out-of-combat", "objects"]);
const COMBAT = /\b(?:attack rolls?|saving throws?|save|AC|temporary Hit Points|teleport\w*|frightened|slowed|stunned|immobilized|grabbed|restrained|prone|dazzled|blinded|deafened|clumsy|enfeebled|sickened|fascinated|controlled|confused|paralyzed|unconscious|drained|stupefied|fatigued|off-guard|quickened|persistent|dies|concealed|invisible|hidden|undetected|the next (?:elixir|potion|mutagen|bomb|Strike|attack))\b|\bextended by \d+%/i;
const MECHANICAL = /\b\d+d\d+\b|(?:^|\s)[+\-–]\d+\b|\bDC \d+\b|\b(?:damage|Hit Points|attack|teleport\w*|transport\w*|Speed|bonus|penalty|resistance|weakness|saving throws?|save|check|frightened|slowed|stunned|immobilized|grabbed|restrained|prone|dazzled|blinded|deafened|clumsy|enfeebled|sickened|fascinated|controlled|confused|paralyzed|unconscious|dies|concealed|invisible|hidden)\b/i;
// (A Strike only as PF2e writes the action, capitalized: "strike the chime", the verb, isn't one — src/compiler/needs.js, 2026-10-27.)
const STRIKE = /\bStrikes?\b/;
const combat = (words) => COMBAT.test(words) || STRIKE.test(words);
const mechanical = (words) => MECHANICAL.test(words) || STRIKE.test(words);
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
// A unique item or an artifact: special, its own rules built rather than a card's line (the user, 2026-10-27).
export const isSpecialItem = (item) => item?.system?.traits?.rarity === "unique" || (item?.system?.traits?.value ?? []).includes("artifact");
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// What its card leaves over, as tools/needs.mjs reads it: notes, unread lines, note Effects, and its rows' GM lines.
function leftovers(plan) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        for (const key of ["notes", "unread", "noteEffects"]) if (Array.isArray(node[key])) for (const entry of node[key]) if (said(entry)) out.push([key, said(entry)]);
        // (An item action's rule after PF2e's own action, its card's line — Binding Coil's escape DC, Crying Angel Pendant's stabilized 1 Hit Point: 2026-10-27.)
        if (typeof node.action?.after === "string" && node.action.after.trim()) out.push(["after", node.action.after.trim()]);
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

// Its words from its effect on: a consumable's without its Activate line — "Activate 1 minute", "Activate (manipulate)" — or Usage.
const bodyOf = (kind, text, words) => (kind === "activation" ? words : String(text).replace(/^\s*(?:Usage [^.]*?(?=Activate)\s*)?Activat(?:e|ion)\s*(?:\[[^\]]*\]\s*)?(?:\d+ (?:minutes?|hours?|rounds?)|reaction|free action|[123])?\s*(?:(?:Interact|command|envision|Cast a Spell|Strike)\s*)?(?:\([^)]*\))?\s*/i, "").trim() || words);

// Card lines (decided "card-line", "one-off"): a partial plan's notes and GM lines as they are — its unread lines, and an item card row's GM
// lines, its notes too, as the item card shows neither —; a note-only one's note row kept; else its words the card's line.
function asCardLines(plan, { result, base, body, decided }) {
    if (result === "partial" || result === "note-only") {
        const { partial, noteOnly, unread, ...rest } = plan;
        const own = rest.resolution?.check?.roll === "automatic" ? rest.resolution.outcomes?.success : null;
        const gm = own ? leftToTheGM(own) : [];
        const lines = [...(unread ?? []).map(said), ...gm.map((line) => line.replace(/^\{(?:target|source)\}(?: \([^)]*\))?:\s*/, "").replace(/\s*\(by hand\)\.?$/, "."))].filter(Boolean);
        const resolution = gm.length ? { ...rest.resolution, outcomes: { ...rest.resolution.outcomes, success: { ...own, manualInstructions: (own.manualInstructions ?? []).filter((line) => !gm.includes(said(line))) } } } : rest.resolution;
        return { ...rest, ...(resolution ? { resolution } : {}), ...(lines.length ? { notes: [...(rest.notes ?? []), ...lines] } : {}), decided, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    }
    // (The GM's no-effect's own source, activation and item part where it has them — its base's where it doesn't, 2026-10-27.)
    return { ...(base ?? {}), ...(plan && result === "builtin:no-effect" ? ownParts(plan) : {}), builtin: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [body], decided };
}
const ownParts = (plan) => Object.fromEntries(["source", "activation", "item"].filter((key) => plan[key] !== undefined).map((key) => [key, plan[key]]));

// The plan, its item's plain text and its base, and whether it's an activation (its text from Effect on) → the plan as decided, or as it was.
// special: a unique item's or an artifact's (no card-line ruling).
export function withDecided(plan, { text = "", base = null, kind = "consumable", trigger = false, name = null, special = false } = {}) {
    const result = resultOf(plan);
    // (A one-off rule of a card of its own — a zone, a counteract, a readied bonus, a cast (Crown of the Companion's, with its later healing), partial —: its notes are that card's lines already
    // (the zone card's, the counteract card's, the fortune and cast cards' plan.notes), done the same, 2026-10-27.)
    // (Not one whose top-level notes or unread lines no card of its kind shows: a zone's, a counteract's.)
    // (And a conjured creature's: the ability module's conjure card shows its notes — 2026-10-27, Fossil Fragment (Amber Mosquito)'s.)
    // (And a fortune's: the fortune card shows them too — 2026-10-27, Gorum's Tear's.)
    const shown = ["readied-bonus", "cast-spell", "conjure", "roll-twice"].includes(plan?.builtin) || !((plan?.notes ?? []).length || (plan?.unread ?? []).length);
    if (plan?.partial && plan.builtin && plan.builtin !== "no-effect" && shown && !special && oneOff(name ?? plan.source?.name)) return asCardLines(plan, { result: "partial", base, body: null, decided: "one-off" });
    // (A unique item's or an artifact's, its lore all that's left — src/compiler/lore-lines.js, the user's of 2026-10-27: its effects built, its
    // history, look or destruction its card's lines —: done, decided "lore". On a card of its own only when that card shows its notes.)
    const sentencesOf = (words) => String(words ?? "").split(/(?<=[.!?])\s+(?=[A-Z@(])/).map((sentence) => sentence.trim()).filter(Boolean);
    if (special && plan?.partial && (!plan.builtin || plan.builtin === "no-effect" || shown) && loreOnly(name ?? plan.source?.name, leftovers(plan).map(([, line]) => line))) return asCardLines(plan, { result: "partial", base, body: null, decided: "lore" });
    if (result === "resolves" || (result.startsWith("builtin:") && result !== "builtin:no-effect")) return plan;
    const entry = { result, kind, trigger, text, left: plan ? leftovers(plan) : [] };
    if (special && ["none", "note-only", "builtin:no-effect"].includes(result) && loreOnly(name ?? plan?.source?.name, sentencesOf(leftText(entry)))) return asCardLines(plan, { result, base, body: bodyOf(kind, text, leftText(entry)), decided: "lore" });
    // (A note-only item checked and found to hold nothing a card could play, src/compiler/notes-checked.js — the user's answer to question 3,
    // 2026-10-26: its note row kept, done.)
    if (result === "note-only" && notesChecked(name ?? plan?.source?.name)) return { ...plan, noteOnly: undefined, decided: "checked", automation: { ...(plan.automation ?? {}), level: "automatic" } };
    // (Or one nothing read, the same check: its words its card's line, 2026-10-27. And the GM's no-effect, Philosopher's Stone's — read as nothing.)
    if ((result === "none" || result === "builtin:no-effect") && notesChecked(name ?? plan?.source?.name)) return asCardLines(plan, { result, base, body: bodyOf(kind, text, leftText(entry)), decided: "checked" });
    // (A one-off rule, src/compiler/one-offs.js — the user's answer of 2026-10-27: its card's lines, counted done, kept to build later.)
    // (Its words without the "Trigger" leftText puts before a triggered activation's Effect, for the needs' reading: Belt of Giant Strength's.)
    if (!special && oneOff(name ?? plan?.source?.name)) return asCardLines(plan, { result, base, body: bodyOf(kind, text, leftText(entry)).replace(/^Trigger (?=\S)/, ""), decided: "one-off" });
    const needs = needsOf(entry);
    // (Nothing in its words a card could play — food, refills, ingredients, flavor —: counted done, its card saying so (the user's answer to
    // question 1, 2026-10-26).)
    // (A note-only one only when its words show no number either — Vambrace of Gorum's "+3 … major striking" is a rule the needs' words miss.)
    if (needs.length === 1 && needs[0] === "no-rules" && (!plan || result === "builtin:no-effect" || (result === "note-only" && !mechanical(leftText(entry)) && !/\d/.test(leftText(entry))))) {
        return { ...(base ?? plan ?? {}), ...(plan?.item ? { item: plan.item } : {}), builtin: undefined, noteOnly: undefined, partial: undefined, noRules: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: ["It has no rules to play: the card does nothing more."] };
    }
    const lined = !special && needs.some((need) => CARD_LINE.has(need));
    if (!needs.length || !needs.every((need) => DECIDED.has(need) || (lined && CARD_LINE.has(need)))) return plan;
    const words = leftText(entry);
    // (Not the item's own name — Mortar of Hidden Meaning's "hidden" —, nor PF2e's Decipher Writing still to attempt, Comprehension Elixir's
    // "you still need to attempt a skill check to Decipher Writing": its user's own action. A range — telepathy 100 feet, a mind within 30
    // feet — is no number to apply either: since 2026-10-27 no longer MECHANICAL's.)
    const own = String(name ?? "").replace(/:.*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    const named = own.length > 3 ? words.split(new RegExp(own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join(" ") : words;
    const guarded = named.replace(/\b(?:attempt )?an? (?:skill )?check to Decipher Writing\b/gi, " ");
    if (lined ? combat(guarded) : mechanical(guarded)) return plan;
    const decided = needs.includes("information") ? "information" : needs.find((need) => need === "speech" || need === "mind") ?? (lined ? "card-line" : needs[0]);
    const body = bodyOf(kind, text, words);
    // (Information: whispered to the GM and its user, what it tells filled in by the GM.)
    if (decided === "information" && (!plan || result === "builtin:no-effect" || result === "note-only")) {
        return { ...(plan ?? base ?? {}), ...(base ?? {}), builtin: "whisper", noteOnly: undefined, partial: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" }, whisper: { text: body }, decided, resolution: undefined };
    }
    if (decided === "card-line") return asCardLines(plan, { result, base, body, decided });
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
