// Triggered activations' own effects (2026-10-27, docs/needs.md "Triggers"): reactions and free actions its user presses when their trigger
// happens, whose Effect no other reading plays. Each reader below matches its item's own sentences, builds the plan its card plays, and leaves
// nothing of the Effect unread: a sentence is read, a line of the card (its user's own action, the map), or flavor (no rule in it). A plan
// built from nothing gets the activation's base and item part here (as src/compiler/permanent.js decideActivation gives one). Pure.
//
// - A condition suppressed for a while (withSuppressed): Lost Ember's Fix Focus, "You suppress the Off-Guard or Confused condition until the start
//   of your next turn"; Aeon Stone (Olivine Pendeloque)'s Still Earth, "The stone suppresses the triggering effect for 1 minute" (its trigger
//   "You become confused, frightened, or stupefied"); Moonlit Chain's Dim Sight, "suppress the Dazzled condition for 1 minute". → a note Effect on
//   its user for that time saying the condition has no effect, with PF2e's AdjustModifier suppressing the condition's own modifiers (Off-Guard's
//   −2 to AC, Frightened's and Stupefied's status penalties); the ways card, one way for each condition its words name.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
// Its Effect's words: after "Effect", without its Craft Requirements.
const effectOf = (html) => /\bEffect\b\s*(.*)$/s.exec(plainText(html).replace(/\s*\bCraft Requirements\b.*$/s, ""))?.[1]?.trim() ?? "";
// (A sentence with no rule in it: no number, no link, no rule word — its flavor.)
const RULE = /\d|\b(?:checks?|saves?|saving throws?|bonus|penalty|damage|conditions?|Strikes?|actions?|reactions?|resistance|Speeds?|Hit Points|DC|AC|attack|spell|turn|round|minute|hour|immune|target|creature|ally|enemy|you can|can't|cannot|must|instead)\b/i;
const flavor = (sentence) => !RULE.test(sentence);
const unit = (word) => (/^min/i.test(word) ? "minutes" : /^hour/i.test(word) ? "hours" : "rounds");
const COUNT = { a: 1, an: 1, one: 1 };
const count = (word) => COUNT[String(word).toLowerCase()] ?? Number(word);
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

// The plan's base and item part, for a plan built from nothing (as decideActivation gives one).
function baseOf(item, { activation, index }) {
    const frequency = activation.frequency?.max ? activation.frequency : null;
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${item.name}${activation.name ? `: ${activation.name}` : ""}`, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits: [...(item.system?.traits?.value ?? [])],
        activation: { time: activation.time ?? null, traits: activation.traits ?? [] },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(frequency ? { frequency } : {}) },
        item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger }, links: 0 }
    };
}
// (The plan's own base when it has one: its source, item part and trigger kept.)
const keptBase = (plan, item, entry) => (plan ? { modelVersion: plan.modelVersion, source: plan.source, rank: plan.rank, traits: plan.traits, activation: plan.activation, targeting: { target: null, range: null, area: null }, trigger: { event: "use", ...(plan.trigger?.frequency ? { frequency: plan.trigger.frequency } : {}) }, item: plan.item ?? baseOf(item, entry).item } : baseOf(item, entry));
const ownCard = (base, row, notes = []) => ({ ...base, automation: { level: "automatic" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...row } } }, ...(notes.length ? { notes } : {}) });

// --- A condition suppressed -------------------------------------------------------------------------------------------------------------------

// Each condition's own PF2e modifiers (its condition item's FlatModifier rules: their selectors and slug), suppressed by AdjustModifier; and
// what suppressing it means beyond them, in words. (Confused's Off-Guard is PF2e's GrantItem of that condition.)
const SUPPRESSES = {
    "off-guard": { rules: [{ key: "AdjustModifier", selectors: ["ac"], slug: "off-guard", suppress: true }], words: "its −2 circumstance penalty to AC doesn't apply" },
    confused: { rules: [{ key: "AdjustModifier", selectors: ["ac"], slug: "off-guard", suppress: true }], words: "you act normally (you choose your own actions and targets, can use reactions) and aren't Off-Guard from it" },
    frightened: { rules: [{ key: "AdjustModifier", selectors: ["all"], slug: "frightened", suppress: true }], words: "its status penalty to your checks and DCs doesn't apply" },
    stupefied: { rules: [{ key: "AdjustModifier", selectors: ["cha-based", "int-based", "wis-based"], slug: "stupefied", suppress: true }], words: "its status penalty to Intelligence-, Wisdom- and Charisma-based checks and DCs doesn't apply, nor its flat check to cast a spell" },
    dazzled: { rules: [], words: "creatures and objects aren't Concealed to you from it (no flat check for it)" }
};
const NAMES = Object.keys(SUPPRESSES).join("|");
const OWN = new RegExp(String.raw`^(?:(.+?) and )?suppress the (${NAMES})(?: or (${NAMES}))? condition (until the start of your next turn|for (\d+|one|a) (minutes?|rounds?|hours?))\.$`, "i");
const TRIGGERING = /^The [\w' -]+? suppresses the triggering effect for (\d+|one|a) (minutes?|rounds?|hours?)(?:, but (?:the [\w ]+? )?impose an? [–-]\d+ (?:status|circumstance|item) penalty to your [\w ]+?)?\.$/i;
// (Its user's own action said, Lost Ember's: a line of its card.)
const WHILE_CONFUSED = /^You can use this free action when you're confused, even though you normally can't take actions of your choice when confused\.$/i;
const NEXT_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };

function suppressNote(slug, duration, { effect = false } = {}) {
    const name = slug === "off-guard" ? "Off-Guard" : capital(slug);
    const time = duration.unit === "rounds" && duration.anchor === "source-turn" ? "until the start of your next turn" : `for ${duration.value} ${duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit}`;
    const what = effect ? `The effect that made you ${name} is suppressed ${time}, and so is ${name} from it: ${SUPPRESSES[slug].words}.` : `${name} is suppressed ${time}: ${SUPPRESSES[slug].words}.`;
    return { label: `${name} suppressed`, text: `${what} The condition itself stays, and applies again once this ends if it's still there.`, duration, ...(SUPPRESSES[slug].rules.length ? { rules: SUPPRESSES[slug].rules.map((rule) => ({ ...rule })) } : {}) };
}

export function withSuppressed(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    let conditions = null;
    let duration = null;
    let fromEffect = false;
    const read = new Set();
    for (const sentence of sentences) {
        const own = OWN.exec(sentence.replace(/^You\s+(?=suppress\b)/, ""));
        if (own && !conditions && (!own[1] || flavor(own[1]))) {
            conditions = [own[2], own[3]].filter(Boolean).map((name) => name.toLowerCase());
            duration = own[5] ? { mode: "fixed", value: count(own[5]), unit: unit(own[6]), expiry: "turn-start", anchor: "effect-start" } : NEXT_TURN;
            read.add(sentence);
            continue;
        }
        const triggering = TRIGGERING.exec(sentence);
        const named = triggering ? new RegExp(String.raw`^You become ((?:${NAMES})(?:,? (?:or )?(?:${NAMES}))*)$`, "i").exec(String(activation.trigger ?? "").trim()) : null;
        if (named && !conditions) {
            conditions = named[1].toLowerCase().split(/,\s*(?:or\s+)?|\s+or\s+/).map((name) => name.trim()).filter(Boolean);
            duration = { mode: "fixed", value: count(triggering[1]), unit: unit(triggering[2]), expiry: "turn-start", anchor: "effect-start" };
            fromEffect = true;
            read.add(sentence);
        }
    }
    if (!conditions?.length) return plan;
    const lines = sentences.filter((sentence) => WHILE_CONFUSED.test(sentence));
    // (Every other sentence flavor, else not this reading.)
    if (sentences.some((sentence) => !read.has(sentence) && !lines.includes(sentence) && !flavor(sentence))) return plan;
    // (Its penalty beside, already read as the row's modifier: Still Earth's −1 status to attack rolls.)
    const modifiers = fromEffect ? plan?.resolution?.outcomes?.success?.modifiers ?? [] : [];
    if (fromEffect && /\bimpose an? [–-]\d+\b/i.test(sentences.find((sentence) => read.has(sentence)) ?? "") && !modifiers.length) return plan;
    const base = keptBase(plan, item, { activation, index });
    const notes = lines.map((line) => `${line.replace(/\.$/, "")} (its own action).`);
    const cardOf = (slug) => ownCard(base, { modifiers, noteEffects: [suppressNote(slug, duration, { effect: fromEffect })] }, notes);
    if (conditions.length === 1) return cardOf(conditions[0]);
    return { ...base, builtin: "ways", automation: { level: "automatic" }, ways: conditions.map((slug) => ({ name: slug === "off-guard" ? "Off-Guard" : capital(slug), html: "", plan: cardOf(slug) })), once: true };
}

// --- The readers, in order --------------------------------------------------------------------------------------------------------------------

const READERS = [withSuppressed];

// The activation's plan → the plan its trigger's effect makes, or the same plan. entry: { activation, index } (compileEach's).
export function withTriggered(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of READERS) {
        const next = reader(plan, { item, activation: entry.activation, index: entry.index });
        if (next !== plan) return next;
    }
    return plan;
}
