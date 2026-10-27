// Actions and feats for the user, and rules PF2e plays on its user's Effect (2026-10-27, docs/needs.md "Actions and feats for the user"): an
// activation's or a consumable's own sentences, matched whole, made into what its card plays — nothing of its Effect left unread (a sentence is
// read, a line of the card — its user's own action, the map — or flavor). A plan built from nothing gets the activation's base and item part
// (src/compiler/triggered.js keptBase), as src/compiler/permanent.js decideActivation gives one.
//
// - An armor trait's action no longer needed (withEntrenched): Bastion of the Inheritor's "As long as the cloak is red, you gain the benefits of
//   the armor's deflect melee trait without needing to spend an additional action to activate it during each turn" → its user's Effect for the
//   time with PF2e's FlatModifier, +1 circumstance to AC against melee attacks (item:melee) — the entrench trait's bonus —, and the white cloak's
//   bonus suppressed while it's red (AdjustModifier on the item's own FlatModifier, its slug the item's).
// - A rule PF2e can't play, on a note Effect for its time (NOTE_RULES): Clockwork Shield's extra reaction for Shield Block; Vital Earth's air and
//   water, its label "doesn't need to breathe" — what the environment module's breath tracker reads (scripts/foundry.js noBreath).
// Pure.

import { plainText } from "./rows.js";
import { keptBase, ownCard } from "./triggered.js";

const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
// Its Effect's words: after "Effect", without its Craft Requirements.
const effectOf = (html) => /\bEffect\b\s*(.*)$/s.exec(plainText(html).replace(/\s*\bCraft Requirements\b.*$/s, ""))?.[1]?.trim() ?? "";
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const hours = (value) => ({ mode: "fixed", value: Number(value), unit: "hours", expiry: "turn-start", anchor: "effect-start" });
const matches = (patterns, sentences) => patterns.length === sentences.length && patterns.every((pattern, at) => pattern.test(sentences[at]));
const sluggify = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- An armor trait's action no longer needed ------------------------------------------------------------------------------------------------

const RED = /^The armor's cloak becomes red for (\d+) minutes?\.$/i;
const ENTRENCHED = /^As long as the cloak is red, you gain the benefits of the armor's (?:deflect|entrench) (melee|ranged) trait without needing to spend an additional action to activate it during each turn\.$/i;
// (The item's own bonus while the cloak is white: its FlatModifier, slugged by PF2e from the item's name.)
const WHITE = /\bWhile the cloak is white, this armor grants you a \+(\d+) item bonus to (Diplomacy) checks\b/i;
function withEntrenched(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!matches([RED, ENTRENCHED], sentences)) return plan;
    const minutes = Number(RED.exec(sentences[0])[1]);
    const reach = ENTRENCHED.exec(sentences[1])[1].toLowerCase();
    const white = WHITE.exec(plainText(item?.system?.description?.value));
    const rules = [{ key: "FlatModifier", selector: "ac", type: "circumstance", value: 1, predicate: [`item:${reach}`], label: `${item.name} (entrench ${reach})` }, ...(white ? [{ key: "AdjustModifier", selectors: [white[2].toLowerCase()], slug: sluggify(item.name), suppress: true }] : [])];
    const text = `The cloak is red: the armor's entrench ${reach} bonus without spending its action, +1 circumstance bonus to AC against ${reach} attacks.${white ? ` The white cloak's +${white[1]} item bonus to ${white[2]} doesn't apply.` : ""}`;
    return { ...ownCard(keptBase(plan, item, { activation, index }), { noteEffects: [{ label: "Cloak red", text, duration: { ...MINUTE, value: minutes }, rules }] }), noteOnly: undefined };
}

// --- A rule PF2e can't play, on a note Effect for its time -------------------------------------------------------------------------------------

// Each: the sentences in order (an activation's from its Effect on, a consumable's whole text), its label, words and time.
const NOTE_RULES = [
    // (Clockwork Shield: an extra reaction this turn and at the start of each of its turns for a minute, only to Shield Block.)
    { sentences: [/^The shield's gears begin to spin, subtly adjusting the shield's position as you fight\.$/i, /^You gain an extra reaction this turn and at the start of each of your turns for the next minute that you can use only to Shield Block\.$/i], label: "Extra reaction", text: "An extra reaction this turn and at the start of each of its turns, usable only to Shield Block.", duration: () => MINUTE },
    // (Vital Earth: no air or water needed for 24 hours — "doesn't need to breathe", the environment module's breath tracker's word —, and those who treat
    // its wounds need no healer's toolkit, with a bonus to their Medicine check: theirs, no rule on its Effect can give it.)
    { sentences: [/^Life-infused soil from the Plane of Earth, vital earth is glittering dust you inhale that causes you to not need air or water for (\d+) hours\.$/i, /^Also, for this time, your wounds close easily, like molding clay, meaning someone attempting to Administer First Aid or Treat Wounds on you doesn't need a healer's toolkit and gains a \+(\d+) item bonus to the Medicine check\.$/i], label: "Doesn't need to breathe", text: (said) => `It needs no air or water (it doesn't need to breathe). Anyone who Administers First Aid or Treats Wounds on it needs no healer's toolkit and gets a +${said[1][1]} item bonus to that Medicine check.`, duration: (said) => hours(said[0][1]) }
];
function noteRuleOf(sentences) {
    const rule = NOTE_RULES.find((entry) => matches(entry.sentences, sentences));
    if (!rule) return null;
    const said = rule.sentences.map((pattern, at) => pattern.exec(sentences[at]));
    return { label: rule.label, text: typeof rule.text === "function" ? rule.text(said) : rule.text, duration: rule.duration(said) };
}
function withNoteRule(plan, { item, activation, index }) {
    const note = noteRuleOf(sentencesOf(effectOf(activation.html)));
    return note ? { ...ownCard(keptBase(plan, item, { activation, index }), { noteEffects: [note] }), noteOnly: undefined } : plan;
}

// --- The readers ---------------------------------------------------------------------------------------------------------------------------------

const READERS = [withEntrenched, withNoteRule];

// An activation's plan → the plan its own sentences make, or the same plan. entry: { activation, index } (compileEach's).
export function withUserActions(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of READERS) {
        const next = reader(plan, { item, activation: entry.activation, index: entry.index });
        if (next !== plan) return next;
    }
    return plan;
}

// A consumable's plan → the plan its own sentences make, or the same plan. base: its base plan; info: its item part (src/compiler/index.js).
export function withUserActionsUse(plan, item, { base, info }) {
    const note = noteRuleOf(sentencesOf(plainText(item?.system?.description?.value).replace(/\s*\bCraft Requirements\b.*$/s, "")));
    if (!note) return plan;
    return ownCard({ ...base, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, item: info }, { noteEffects: [note] });
}
