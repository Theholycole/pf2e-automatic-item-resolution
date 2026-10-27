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
// (A builtin no-effect's has none of them: the activation's own.)
function keptBase(plan, item, entry) {
    const own = baseOf(item, entry);
    if (!plan) return own;
    const frequency = plan.trigger?.frequency ?? own.trigger.frequency;
    return { ...own, modelVersion: plan.modelVersion ?? own.modelVersion, source: plan.source ?? own.source, rank: plan.rank ?? own.rank, traits: plan.traits ?? own.traits, activation: plan.activation ?? own.activation, trigger: { event: "use", ...(frequency ? { frequency } : {}) }, item: plan.item?.activation ? plan.item : { ...own.item, ...(plan.item ?? {}) } };
}
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

// --- A roll PF2e's own Effect replaces -------------------------------------------------------------------------------------------------------

// (Ancestral Geometry's "Replace the roll with the d20 roll from your ancestor's visitation": its linked PF2e Effect, Effect: Ancestral Geometry, rolls
// the visitation's 2d20 (kept highest) as its badge and the save's type, and its SubstituteRoll offers that d20 in the noted save's roll dialog,
// gone once used — the reaction is PF2e's own, builtin "pf2e-rules", no card; what its user does is a line.)
const SUBSTITUTE = /^Replace the roll with the d20 roll from your ancestor's visitation\.$/i;
const LINKED_EFFECT = /@UUID\[Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+\]\{(Effect: [^}]+)\}/;
export function withSubstituteRoll(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const linked = LINKED_EFFECT.exec(String(item?.system?.description?.value ?? ""))?.[1];
    if (sentences.length !== 1 || !SUBSTITUTE.test(sentences[0]) || !linked || !/\bfortune\b/.test((activation.traits ?? []).join(" "))) return plan;
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    return { ...base, builtin: "pf2e-rules", rules: ["SubstituteRoll"], automation: { level: "automatic" }, notes: [`PF2e's own ${linked} plays it: its badge is the visitation's recorded d20 and it notes the save's type; in a save of that type's roll dialog, pick ${linked.replace(/^Effect: /, "")} to use that d20 in place of the roll (the Effect is gone once it's used).`] };
}

// --- A missed shot sent back -------------------------------------------------------------------------------------------------------------------

// (Turnabout Shield's "The ammunition enters the shield and is redirected with the same force with which it was originally fired. Make a ranged
// Strike using the ammunition with an attack modifier of +19, targeting a creature within 60 feet": the item's own attack at +19 against the AC of
// the creature its presser targets (plan.ownCheck, the save card), its hit's damage the triggering Strike's — plan.strikeDamage { from:
// "triggering-miss" }, the formula of the latest ranged Strike that missed its user, its weapon's and ammunition's as PF2e gives it, filled in
// as the card is made (scripts/live.js, src/live/strike-as.js), doubled on a critical hit.)
const REDIRECTED = /^The ammunition enters the shield and is redirected with the same force with which it was originally fired\.$/i;
const SHOT_BACK = /^Make a ranged Strike using the ammunition with an attack modifier of \+(\d+), targeting a creature within (\d+) feet\.$/i;
export function withRedirectedShot(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const shot = sentences.map((sentence) => SHOT_BACK.exec(sentence)).find(Boolean);
    if (!shot || sentences.length !== 2 || !sentences.some((sentence) => REDIRECTED.test(sentence))) return plan;
    const modifier = Number(shot[1]);
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    const rows = Object.fromEntries(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => [degree, { ...none() }]));
    return {
        ...base,
        automation: { level: "automatic" },
        ownCheck: { kind: "attack", modifier },
        targeting: { target: "1 creature", range: `${shot[2]} feet`, area: null },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier }, outcomes: rows },
        strikeDamage: { as: null, from: "triggering-miss", rows: { success: 1, criticalSuccess: 2 } }
    };
}

// --- A bleed made worse -------------------------------------------------------------------------------------------------------------------------

// (Secret-Keeper's Mask (Father Skinsaw)'s "The DC of flat checks to recover from the persistent bleed damage is increased by 2, and the target
// creature has a -2 status penalty to Deception, Diplomacy, and Performance checks while it is bleeding and for 1 minute after it ceases bleeding":
// the item card at the creature its presser targets (item.recipient "targets"), a note Effect lasting while it takes persistent bleed damage
// (the ability module's whilePersistent) with PF2e's rules — ItemAlteration "pd-recovery-dc" on its bleed (as PF2e's own Toothy Knife raises
// it) and the FlatModifiers — and the RollOption "air-then-for:1:minutes:bleed", by which scripts/then-for.js gives it the same penalties for
// the minute after once the bleeding has ended.)
const SKILL_SLUGS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const MUTILATING = /^The DC of flat checks to recover from the persistent (\w+) damage is increased by (\d+), and the target creature has an? [–-](\d+) (status|circumstance|item) penalty to ([A-Z]\w+(?:,? (?:and )?[A-Z]\w+)*) checks while it is bleeding and for (\d+|one|a) (minutes?|rounds?) after it ceases bleeding\.$/;
export function withBleedWorse(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const found = sentences.map((sentence) => MUTILATING.exec(sentence)).find(Boolean);
    if (!found || sentences.some((sentence) => !MUTILATING.test(sentence) && !flavor(sentence))) return plan;
    const [, type, by, value, kind, skills, count_, unit_] = found;
    const slugs = skills.split(/,\s*(?:and\s+)?|\s+and\s+/).map((word) => word.trim().toLowerCase());
    if (!slugs.every((slug) => SKILL_SLUGS.includes(slug))) return plan;
    const after = { value: count(count_), unit: unit(unit_) };
    const penalty = slugs.map((selector) => ({ key: "FlatModifier", selector, type: kind.toLowerCase(), value: -Number(value), label: item.name }));
    const note = {
        label: "Mutilating wound",
        text: `While it takes persistent ${type} damage, its flat checks to recover from it are ${by} harder, and it has a −${value} ${kind.toLowerCase()} penalty to ${slugs.map(capital).join(", ").replace(/, (?=[^,]+$)/, " and ")} checks; the penalty stays for ${after.value} ${after.value === 1 ? after.unit.replace(/s$/, "") : after.unit} after the bleeding ends.`,
        duration: null,
        whilePersistent: type.toLowerCase(),
        rules: [{ key: "ItemAlteration", itemType: "condition", mode: "add", property: "pd-recovery-dc", value: Number(by), predicate: [`item:damage:type:${type.toLowerCase()}`] }, ...penalty, { key: "RollOption", option: `air-then-for:${after.value}:${after.unit}:${type.toLowerCase()}` }]
    };
    const base = keptBase(plan, item, { activation, index });
    const card = ownCard({ ...base, targeting: { target: "1 creature", range: null, area: null }, item: { ...base.item, recipient: "targets" } }, { noteEffects: [note] });
    return { ...card, noteOnly: undefined };
}

// --- An attacker beguiled ------------------------------------------------------------------------------------------------------------------------

// (Beguiling Crown's reaction, "The creature must succeed at a DC 41 Will save or the attack roll becomes a failure and the target is friendly to you
// until the end of its turn. On a critical failure, the target becomes friendly to you, drops to their knees, and begs your forgiveness for 1
// minute or until another creature takes a hostile action against them": the save card at the attacker (the creature its presser targets), its
// failing rows' note Effects on it — the attack's failure (no damage from it) and its attitude, the user's rulings for what a card can't
// apply — until the end of its turn, or for the minute.)
const BEGUILED = /^The creature must succeed at a @Check\[will\|dc:(\d+)[^\]]*\] save or the attack roll becomes a failure and the target is friendly to you until the end of its turn\.$/i;
const BEGS = /^On a critical failure, the target becomes friendly to you, drops to their knees, and begs your forgiveness for (\d+|one|a) (minutes?|rounds?) or until another creature takes a hostile action against them\.$/i;
export function withBeguiledAttacker(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const save = sentences.map((sentence) => BEGUILED.exec(sentence)).find(Boolean);
    const begs = sentences.map((sentence) => BEGS.exec(sentence)).find(Boolean);
    if (!save || !begs || sentences.length !== 2) return plan;
    const turn = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
    const missed = "Its attack roll against the crown's wearer is a failure instead: no damage from it (don't roll it)";
    const failure = { ...none(), noteEffects: [{ label: "Beguiled", text: `${missed}, and it's friendly to the wearer until the end of its turn.`, duration: turn }] };
    const criticalFailure = { ...none(), noteEffects: [{ label: "Begging forgiveness", text: `${missed}. It's friendly to the wearer, drops to its knees and begs the wearer's forgiveness for ${count(begs[1])} ${unit(begs[2]).replace(/s$/, count(begs[1]) === 1 ? "" : "s")}, or until another creature takes a hostile action against it.`, duration: { mode: "fixed", value: count(begs[1]), unit: unit(begs[2]), expiry: "turn-start", anchor: "effect-start" } }] };
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    return {
        ...base,
        noteOnly: undefined,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", against: { dc: "fixed", value: Number(save[1]) } }, outcomes: { criticalSuccess: { ...none() }, success: { ...none() }, failure, criticalFailure } }
    };
}

// --- A spell at its user counteracted -------------------------------------------------------------------------------------------------------------

// GM Core's DCs by level, 0 to 25 (src/compiler/counteract.js's): a counteract modifier the text leaves out is its item's level's, less 10 (the
// user's answer to question 5, 2026-10-26).
const LEVEL_DCS = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const counteractCard = (base, { counteredWords = null, ...counteract }) => ({ ...base, builtin: "counteract", automation: { level: "automatic" }, targeting: { target: "the drinker", range: null, area: null }, item: { ...base.item, counteract: { conditions: [], traits: [], afflictions: [], free: { name: "the triggering spell", ...(counteredWords ? { counteredWords } : {}) }, pick: "one", ...counteract } } });
// (Spell Duelist's Siphon's "You attempt to counteract the triggering spell. If you succeed, the spell is absorbed into the grimoire, and the diagrams
// on the cover change … While the grimoire contains a spell, you can spend a spell slot of the same or higher rank as the spell in the grimoire to
// cast that spell instead, heightened to the appropriate rank (if you spent a higher-rank spell slot). After you cast the spell, it's expended from
// the grimoire": the counteract card at the triggering spell — no modifier given, its level's DC less 10; half its level its rank — and once
// it's counteracted a note Effect on its user that the grimoire holds it, its casting from its user's own slot its user's to spend.)
const ABSORB_INTRO = /^The grimoire attempts to absorb knowledge of the spell targeting you\.$/i;
const ABSORB_COUNTER = /^You attempt to counteract the triggering spell\.$/i;
const ABSORBED = /^If you succeed, the spell is absorbed into the grimoire, and the diagrams on the cover change to indicate the somatic gestures and sigils for the counteracted spell\.$/i;
const ABSORBED_CAST = /^While the grimoire contains a spell, you can spend a spell slot of the same or higher rank as the spell in the grimoire to cast that spell instead, heightened to the appropriate rank \(if you spent a higher-rank spell slot\)\.$/i;
const ABSORBED_GONE = /^After you cast the spell, it's expended from the grimoire\.$/i;
export function withAbsorbedSpell(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const known = [ABSORB_INTRO, ABSORB_COUNTER, ABSORBED, ABSORBED_CAST, ABSORBED_GONE];
    if (sentences.length !== known.length || !known.every((pattern, at) => pattern.test(sentences[at]))) return plan;
    const level = Number(item?.system?.level?.value) || 0;
    const modifier = LEVEL_DCS[Math.max(0, Math.min(25, level))] - 10;
    const base = keptBase(plan, item, { activation, index });
    return counteractCard(base, {
        modifier,
        rank: Math.max(1, Math.ceil(level / 2)),
        onCounter: { label: "Absorbed spell", text: "The grimoire holds the spell it counteracted (its cover shows the spell's gestures and sigils). Its user can spend a spell slot of that spell's rank or higher to cast it instead, heightened to the slot's rank; then it's gone from the grimoire." },
        notes: [`Its counteract modifier +${modifier}: the item gives none, so its level's DC less 10 (the GM's call).`]
    });
}

// The consumable's plain text → its sentences after its Activate, Trigger and Requirements lines (a talisman's description follows them).
const usedSentences = (text) => sentencesOf(String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "")).flatMap((sentence) => sentence.split(/(?<=\.)\s+(?=[A-Z])/)).map((sentence) => sentence.trim()).filter(Boolean);
// (Reflecting Shard's "When you Activate it, you attempt to reflect the triggering spell back at its caster with Spell Riposte, using your Athletics
// modifier for the counteract check. The talisman's counteract rank is 7th": the counteract card at the triggering spell, its user's Athletics its
// modifier (counteract.fromUser, scripts/counteract.js); counteracted, Spell Riposte turns it on its caster.)
const RIPOSTE = /^When you Activate it, you attempt to reflect the triggering spell back at its caster with Spell Riposte, using your (?:@Check\[)?(acrobatics|athletics|arcana|occultism|religion|nature)\]? modifier for the counteract check\.$/i;
const TALISMAN_RANK = /^The talisman's counteract rank is (\d+)(?:st|nd|rd|th)\.$/i;
function reflectedSpell(text, base) {
    const sentences = usedSentences(text);
    const riposte = sentences.map((sentence) => RIPOSTE.exec(sentence)).find(Boolean);
    const rank = sentences.map((sentence) => TALISMAN_RANK.exec(sentence)).find(Boolean);
    if (!riposte || !rank) return null;
    // (Its Activate, Trigger and Requirements lines and its flavor: nothing else.)
    if (sentences.some((sentence) => !RIPOSTE.test(sentence) && !TALISMAN_RANK.test(sentence) && !/^(?:Activate|Trigger|Requirements?)\b/.test(sentence) && !flavor(sentence))) return null;
    return counteractCard(base, { modifier: null, fromUser: { modifier: riposte[1].toLowerCase() }, rank: Number(rank[1]), counteredWords: "Spell Riposte turns it back: it goes on with its caster as its target instead of its user (the GM's to aim)", notes: ["Counteracted, the spell goes on with its caster as its target instead (Spell Riposte); one that isn't targeted, an area spell, it can't affect."] });
}
// (Spellslasher's "While your weapon is under the effect of a spellslasher, you gain the Spellslash reaction; you can use this reaction only with the
// affected weapon, and the spellslasher's effects end as soon as you use Spellslash. Spellslash … Effect … attempting to counteract the spell. Your
// counteract rank is equal to half your level (rounded up), and your counteract check modifier is equal to your attack modifier with the affected
// weapon": the counteract card, kept open until its user's Spellslash — half its level its rank, its best Strike's attack modifier its modifier.)
const SLASH_GAINED = /^While your weapon is under the effect of an? [\w' -]+?\s*, you gain the (\w+) reaction; you can use this reaction only with the affected weapon, and the [\w' -]+?\s*'s effects end as soon as you use \1\.$/i;
const SLASH_COUNTER = /^(\w+) \([^)]*\) Trigger You are the only target of a spell Effect You swing or shoot your weapon to intercept the magic, attempting to counteract the spell\.$/i;
const SLASH_NUMBERS = /^Your counteract rank is equal to half your level \(rounded up\), and your counteract check modifier is equal to your attack modifier with the affected weapon\.$/i;
function slashedSpell(text, base) {
    const sentences = usedSentences(text);
    const gained = sentences.map((sentence) => SLASH_GAINED.exec(sentence)).find(Boolean);
    if (!gained || !sentences.some((sentence) => SLASH_COUNTER.test(sentence)) || !sentences.some((sentence) => SLASH_NUMBERS.test(sentence))) return null;
    const known = (sentence) => SLASH_GAINED.test(sentence) || SLASH_COUNTER.test(sentence) || SLASH_NUMBERS.test(sentence) || (/^Activate\b/.test(sentence) && flavor(sentence.replace(/^Activate\s*(?:\([^)]*\))?\s*/, ""))) || flavor(sentence);
    if (!sentences.every(known)) return null;
    return counteractCard(base, { modifier: null, fromUser: { rank: "half-level", modifier: "weapon-attack" }, rank: null, notes: [`Applied to a weapon, it gives its user the ${gained[1]} reaction with that weapon: press Apply when it's the only target of a spell, as it uses ${gained[1]} — the spellslasher's effects end then.`] });
}

const USE_READERS = [reflectedSpell, slashedSpell];
// A consumable's plan → the plan its trigger's effect makes, or the same plan. base: its base plan; info: its item part (src/compiler/index.js).
export function withTriggeredUse(plan, item, { base, info }) {
    const text = plainText(item?.system?.description?.value);
    const ownBase = { ...base, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, item: info };
    for (const reader of USE_READERS) {
        const next = reader(text, ownBase, item);
        if (next) return next;
    }
    return plan;
}

// --- The readers, in order --------------------------------------------------------------------------------------------------------------------

const READERS = [withSuppressed, withSubstituteRoll, withRedirectedShot, withBleedWorse, withBeguiledAttacker, withAbsorbedSpell];

// The activation's plan → the plan its trigger's effect makes, or the same plan. entry: { activation, index } (compileEach's).
export function withTriggered(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of READERS) {
        const next = reader(plan, { item, activation: entry.activation, index: entry.index });
        if (next !== plan) return next;
    }
    return plan;
}
