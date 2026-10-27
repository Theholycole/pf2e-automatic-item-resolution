// Triggered activations' own effects (2026-10-27, docs/needs.md "Triggers"): reactions and free actions its user presses when their trigger
// happens, whose Effect no other reading plays. Each reader below matches its item's own sentences, builds the plan its card plays, and leaves
// nothing of the Effect unread: a sentence is read, a line of the card (its user's own action, the map), or flavor (no rule in it). A plan
// built from nothing gets the activation's base and item part here (as src/compiler/permanent.js decideActivation gives one). Pure.
//
// - A condition suppressed for a while (withSuppressed): Lost Ember's Fix Focus, "You suppress the Off-Guard or Confused condition until the start
//   of your next turn"; Aeon Stone (Olivine Pendeloque)'s Still Earth, "The stone suppresses the triggering effect for 1 minute" (its trigger
//   "You become confused, frightened, or stupefied"); Moonlit Chain's Dim Sight, "suppress the Dazzled condition for 1 minute". → a note Effect on
//   its user for that time saying the condition has no effect, with PF2e's AdjustModifier suppressing the condition's own modifiers (Off-Guard's
//   −2 to AC, Frightened's and Stupefied's status penalties); the ways card, one way for each condition its words name. (And Emergency Eye's
//   sight through the eye, Blinded's.)
// - Below, each with its own words: a roll PF2e's Effect replaces (Ancestral Geometry), a missed shot sent back (Turnabout Shield), a bleed made
//   worse (Secret-Keeper's Mask), an attacker beguiled (Beguiling Crown), spells counteracted (Reflecting Shard, Spellslasher, Spell Duelist's
//   Siphon), an alert whispered (Name Pendant), a Strike drawn to its user (Black Hole Armor, Arrow-Catching and Lodestone Shields), rules on note
//   Effects (Helm of Zeal, Whispering Veil, Undead Scourge, Victory Plate), death avoided (Locket of Love Left Behind), information whispered
//   (Lion's Call), a sure save against alcohol (Fulu of the Drunken Monkey), an unstable failure eased (Inventor's Fulu), a bleed's Off-Guard
//   (Murderer's Knot) and a shell instead of stone (Exuviae Powder).

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

// (And its other activation, "Choose one living creature within 30 feet of you. That creature must succeed at a DC 41 Will saving throw or become helpful
// to you for the next 24 hours. If they succeed, they become friendly to you for 1 hour. If they critically succeed they're immune to this effect for
// 1 year": the save card at the creature targeted, each row's attitude a note Effect on it for its time (the user's ruling for attitudes), the
// critical success's immunity a note Effect for the year; only a living creature, a line of the card.)
const COMMAND = [/^Choose one (living )?creature within (\d+) feet of you\.$/i, /^That creature must succeed at a @Check\[will\|dc:(\d+)[^\]]*\] saving throw or become helpful to you for the next (\d+) hours\.$/i, /^If they succeed, they become friendly to you for (\d+) hours?\.$/i, /^If they critically succeed they're immune to this effect for (\d+) years?\.$/i];
export function withBeguilingCommand(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (sentences.length !== COMMAND.length || !COMMAND.every((pattern, at) => pattern.test(sentences[at]))) return plan;
    const [choose, save, friendly, immune] = COMMAND.map((pattern, at) => pattern.exec(sentences[at]));
    const hours = (value) => ({ mode: "fixed", value: Number(value), unit: "hours", expiry: "turn-start", anchor: "effect-start" });
    const helpful = { ...none(), noteEffects: [{ label: "Helpful", text: "Helpful to the crown's wearer.", duration: hours(save[2]) }] };
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    return {
        ...base,
        noteOnly: undefined,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: `${choose[2]} feet`, area: null },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", against: { dc: "fixed", value: Number(save[1]) } }, outcomes: {
            criticalSuccess: { ...none(), noteEffects: [{ label: "Immune to the crown", text: "Immune to the crown's command.", duration: { mode: "fixed", value: Number(immune[1]) * 365, unit: "days", expiry: "turn-start", anchor: "effect-start" } }] },
            success: { ...none(), noteEffects: [{ label: "Friendly", text: "Friendly to the crown's wearer.", duration: hours(friendly[1]) }] },
            failure: helpful,
            criticalFailure: helpful
        } },
        ...(choose[1] ? { notes: ["Only a living creature (not a construct or undead)."] } : {})
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

// --- A save against one poison, or a sure one against another ----------------------------------------------------------------------------------

// (Fulu of the Drunken Monkey's "you gain a +2 status bonus on the triggering Fortitude save and on Fortitude saves against the same poison for the
// next minute. If the triggering poison was normal Alcohol, you instead automatically succeed at the triggering save and gain a +4 status bonus on
// saves against alcohol for 1 minute": the ways card — the poison's way its +2 as read (src/compiler/item-data.js), alcohol's the triggering save
// a success (a note Effect with PF2e's AdjustDegreeOfSuccess for that one save) and +4 status to saves against PF2e's Alcohol for the minute.)
const ALCOHOL = /^If the triggering poison was normal Alcohol, you instead automatically succeed at the triggering save and gain an? \+(\d+) (status|circumstance|item) bonus on saves against alcohol for (\d+|one|a) (minutes?|rounds?)\.$/i;
function drunkenSave(text, base, item, plan) {
    const line = (plan?.unread ?? []).find((entry) => ALCOHOL.test(String(entry).trim()));
    const row = plan?.resolution?.outcomes?.success;
    if (!line || plan.unread.length !== 1 || (row?.modifiers ?? []).length !== 1 || (row.effects ?? []).length || (row.manualInstructions ?? []).length || (plan.notes ?? []).length) return null;
    const [, value, kind, amount, unit_] = ALCOHOL.exec(String(line).trim());
    const lasting = { mode: "fixed", value: count(amount), unit: unit(unit_), expiry: "turn-start", anchor: "effect-start" };
    const own = { ...plan, partial: undefined, unread: undefined, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { success: { ...row, noteEffects: [] } } } };
    // (Alcohol's save: PF2e's Alcohol by its slug, or a drug, ingested and a poison, as Alcohol is.)
    const alcoholic = [{ or: ["item:slug:alcohol", { and: ["item:trait:drug", "item:trait:ingested", "item:trait:poison"] }] }];
    const sure = { label: "A sure save", text: "Its Fortitude save against the alcohol it just drank succeeds (a failure or a critical failure becomes a success), this turn.", duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, rules: [{ key: "AdjustDegreeOfSuccess", selector: "fortitude", adjustment: { failure: "to-success", criticalFailure: "to-success" }, predicate: alcoholic }] };
    const alcohol = { ...own, resolution: { ...own.resolution, outcomes: { success: { ...none(), modifiers: [{ selector: "saving-throw", value: Number(value), type: kind.toLowerCase(), duration: lasting, predicate: alcoholic }], noteEffects: [sure] } } } };
    return { ...own, builtin: "ways", ways: [{ name: "Against an ingested poison", html: "", plan: own }, { name: "Against normal alcohol", html: "", plan: alcohol }], once: true };
}

// (Emergency Eye's "You see through the eye with normal vision until the end of your next turn, when the eye withers and flakes away" — its trigger
// "You become Blinded, or an effect otherwise impedes your vision": Blinded suppressed for that time, as withSuppressed's — its −4 to Perception off by
// PF2e's AdjustModifier, the rest in words.)
const EYE_FLAVOR = [/^This eye, harvested from a monster, looks like it's peacefully sleeping but gives you a backup when you can't use your eyes\.$/i, /^When the eye is activated, the eyelid pops open, and the eye stares frantically about\.$/i];
const EYE_SEES = /^You see through the eye with normal vision until the end of your next turn, when the eye withers and flakes away\.$/i;
function backupEye(text, base) {
    const sentences = usedSentences(text);
    if (!sentences.some((sentence) => EYE_SEES.test(sentence)) || !sentences.every((sentence) => EYE_SEES.test(sentence) || EYE_FLAVOR.some((pattern) => pattern.test(sentence)) || /^Activate\b.*\bTrigger\b/.test(sentence))) return null;
    const note = { label: "Seeing through the eye", text: "It sees normally through the eye until the end of its next turn: Blinded, or whatever else impedes its vision, has no effect on its sight — Blinded's −4 status penalty to Perception doesn't apply, and nothing is hidden from it by it. The condition stays, and applies again once this ends if it's still there.", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, rules: [{ key: "AdjustModifier", selectors: ["perception"], slug: "blinded", suppress: true }] };
    return ownCard(base, { noteEffects: [note] });
}
// (Inventor's Fulu's "When you Activate the fulu, your critical failure becomes a failure, and you can spend just 1 minute to return your innovation to
// full functionality. The fulu then burns up": its user's own unstable check and its innovation's repair — lines of the card.)
const FULU_FLAVOR = [/^Some inventors in Tian Xia put fried snacks near their innovations, a charm to make devices behave as intended\.$/i, /^The practice rubbed off on other inventors, who replaced the food with a drawing on an inventor's fulu\s*\.$/i];
const FULU_SAVES = /^When you Activate the fulu, your critical failure becomes a failure, and you can spend just 1 minute to return your innovation to full functionality\.$/i;
const FULU_BURNS = /^The fulu then burns up, and its effects end\.$/i;
function steadiedInnovation(text, base) {
    const sentences = usedSentences(text);
    if (!sentences.some((sentence) => FULU_SAVES.test(sentence)) || !sentences.every((sentence) => FULU_SAVES.test(sentence) || FULU_BURNS.test(sentence) || FULU_FLAVOR.some((pattern) => pattern.test(sentence)) || /^Activate\b.*\bTrigger\b/.test(sentence))) return null;
    return ownCard(base, {}, ["Its critical failure at the unstable action is a failure instead: nothing of the critical failure's (its own check, by PF2e's unstable rules).", "Its innovation is back to full functionality after just 1 minute of its user's work (its own action); then the fulu burns up."]);
}

// (Murderer's Knot's "the creature you damaged takes 1d6 bleed damage and is off-guard until the bleed ends. If you have the Twist the Knife feat, the
// talisman instead deals persistent bleed damage equal to your sneak attack damage": its Off-Guard a note Effect lasting while the creature takes
// persistent bleed (the ability module's whilePersistent) with PF2e's GrantItem of the condition; with the feat — its owner's feats as live play
// gives them (item.ownerFeats) — its bleed a rogue's sneak attack dice at its owner's level, with a line saying the GM may change it.)
const OFF_GUARD_UUID = "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg";
const KNOT_TRIGGER = /^Activate\b.*\bTrigger You damage an Off-Guard creature with a Strike using the affixed weapon This black strand of leather is tied to look like a peace knot when the weapon is worn, but it doesn't hamper drawing the weapon\.$/i;
const KNOT_BLEEDS = /^When you activate the knot, the creature you damaged takes (?:@Damage\[)?(\d+d\d+)(?:\[bleed\]\])? bleed damage and is off-guard until the bleed ends\.$/i;
const KNOT_TWIST = /^If you have the (?:@UUID\[[^\]]*\]\{)?Twist the Knife(?:\})? feat, the talisman instead deals persistent bleed damage equal to your sneak attack damage\.$/i;
const sneakDice = (level) => `${1 + [5, 11, 17].filter((at) => (Number(level) || 1) >= at).length}d6`;
function knottedBleed(text, base, item, plan) {
    const sentences = usedSentences(text);
    const bleeds = sentences.map((sentence) => KNOT_BLEEDS.exec(sentence)).find(Boolean);
    const row = plan?.resolution?.outcomes?.success;
    if (!bleeds || !sentences.every((sentence) => KNOT_TRIGGER.test(sentence) || KNOT_BLEEDS.test(sentence) || KNOT_TWIST.test(sentence)) || !sentences.some((sentence) => KNOT_TWIST.test(sentence))) return null;
    const component = plan?.resolution?.sharedDamage?.components?.[0];
    if (!row || component?.type !== "bleed" || component.category !== "persistent" || !(row.effects ?? []).some((effect) => effect.slug === "off-guard")) return null;
    const twist = Array.isArray(item?.ownerFeats) && item.ownerFeats.includes("twist-the-knife");
    const formula = twist ? sneakDice(item?.ownerLevel ?? item?.system?.level?.value) : component.formula;
    const note = { label: "Off-Guard while it bleeds", text: "Off-Guard until its persistent bleed damage ends.", duration: null, whilePersistent: "bleed", rules: [{ key: "GrantItem", uuid: OFF_GUARD_UUID, allowDuplicate: false }] };
    const { manualInstructions, ...kept } = row;
    const success = { ...kept, effects: (row.effects ?? []).filter((effect) => effect.slug !== "off-guard"), noteEffects: [note] };
    const { partial, notes, unread, ...rest } = plan;
    return {
        ...rest,
        automation: { level: "automatic" },
        resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: [{ ...component, formula }] }, outcomes: { ...plan.resolution.outcomes, success } },
        notes: [twist ? `With the Twist the Knife feat its bleed is ${formula}, a rogue's sneak attack at its user's level (the GM may change it to its own sneak attack's).` : "With the Twist the Knife feat, its bleed is its user's sneak attack damage instead (its card uses it once PF2e lists the feat on its user)."]
    };
}

// (Exuviae Powder's two uses, the ways card: sprinkled — "for 8 hours, you double the time you can hold your breath. During this time, you also have
// access to the shed chitin activation", a note Effect for the 8 hours —; and Shed Chitin, "The powder petrifies like a shell around you instead,
// and its other effects end. The powder causes you to become Quickened for 1 minute as well as Doomed 1 and Restrained (escape DC 25). You can use
// the extra action each round only for Escape and Stride actions" — the conditions on its user, Restrained until it Escapes against DC 25, what the
// extra action is for a note Effect beside Quickened; the petrification it doesn't take and the 8 hours' end lines of the card.)
const POWDER = [/^Activate\b/, /^You sprinkle this powder over your body, leaving an iridescent layer reminiscent of insect chitin\.$/i, /^After you do so, for (\d+) hours, you double the time you can hold your breath\.$/i, /^During this time, you also have access to the shed chitin activation\.$/i, /^Activate\s*-\s*Shed Chitin \(concentrate\) Trigger You would be petrified Effect The powder petrifies like a shell around you instead, and its other effects end\.$/i, /^The powder causes you to become Quickened for (\d+) minutes? as well as Doomed (\d+) and Restrained \((?:@Check\[)?escape[^)]*?dc[=:](\d+)[^)]*\)\.$/i, /^You can use the extra action each round only for Escape and Stride actions\.$/i];
function chitinShell(text, base) {
    const sentences = usedSentences(text);
    if (sentences.length !== POWDER.length || !POWDER.every((pattern, at) => pattern.test(sentences[at])) || !flavor(sentences[0].replace(/^Activate\s*\([^)]*\)\s*/, ""))) return null;
    const hours = Number(POWDER[2].exec(sentences[2])[1]);
    const [, minutes, doomed, dc] = POWDER[5].exec(sentences[5]);
    const sprinkled = ownCard(base, { noteEffects: [{ label: "Chitin layer", text: `It can hold its breath twice as long, and it has the Shed Chitin reaction (Trigger: it would be petrified), for ${hours} hours.`, duration: { mode: "fixed", value: hours, unit: "hours", expiry: "turn-start", anchor: "effect-start" } }] });
    const quick = { mode: "fixed", value: Number(minutes), unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
    const shed = ownCard(base, {
        effects: [{ kind: "condition", slug: "quickened", value: null, duration: quick }, { kind: "condition", slug: "doomed", value: Number(doomed), duration: null }, { kind: "condition", slug: "restrained", value: null, duration: { mode: "until-escape", escape: { dc: Number(dc) } } }],
        noteEffects: [{ label: "Shell's extra action", text: "Its extra action each round from Quickened is only for Escape and Stride actions.", duration: quick }]
    }, ["It isn't petrified: the powder petrifies around it as a shell instead (the GM doesn't apply the petrification).", "The powder's other effects end: delete its Chitin layer Effect."]);
    return { ...base, builtin: "ways", automation: { level: "automatic" }, ways: [{ name: "Sprinkled on (8 hours)", html: "", plan: sprinkled }, { name: "Shed Chitin (it would be petrified)", html: "", plan: shed }] };
}

// (Key of Unwinding's Rewrite Time, a reaction for its minute: "Attempt a Strike with the affected weapon against the triggering enemy. On a success, you
// deal no damage, but you negate the triggering attack or spell …": a note Effect on its user for the minute with its words — the Strike its own
// (PF2e's, no damage rolled), the attack's negation and the creature's lost actions the GM's, its Slowed after a second use in a combat its own.)
const KEY = [/^A key of unwinding is a narrow brass clock hand, its pointed end fashioned into the shape of a key\.$/i, /^When applied to a weapon, a key of unwinding forms a direct link to the Dimension of Time, allowing you to draw on a fragment of temporal power\.$/i, /^For (\d+) minutes?, you gain the Rewrite Time reaction while wielding the attuned weapon\.$/i, /^Rewrite Time \([^)]*\) Trigger You or an ally within your weapon's reach or range increment would be hit by a Strike or a spell attack roll Effect Attempt a Strike with the affected weapon against the triggering enemy\.$/i, /^On a success, you deal no damage, but you negate the triggering attack or spell\.$/i, /^Actions and spell slots used to attempt this attack are lost, and the triggering creature's multiple attack penalty increases as normal, as the results of the action are siphoned into the Dimension of Time\.$/i, /^Any creature attempting to use Rewrite Time more than once per combat becomes Slowed 1 for 1 round after each subsequent use, as their own time begins to leech away\.$/i];
function rewrittenTime(text, base) {
    const sentences = usedSentences(text).map((sentence) => sentence.replace(/^Activate\s*(?:\([^)]*\))?\s*/, ""));
    if (sentences.length !== KEY.length || !KEY.every((pattern, at) => pattern.test(sentences[at]))) return null;
    const minutes = Number(KEY[2].exec(sentences[2])[1]);
    return ownCard(base, { noteEffects: [{ label: "Rewrite Time", text: "While it wields the attuned weapon, it has the Rewrite Time reaction (trigger: it or an ally within the weapon's reach or range increment would be hit by a Strike or a spell attack roll): it Strikes the triggering enemy with that weapon (don't roll damage). On a success, the triggering attack or spell is negated — its actions and spell slots are lost, and its multiple attack penalty still rises. After its first use in a combat, each use makes it Slowed 1 for 1 round.", duration: { mode: "fixed", value: minutes, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }] });
}

const USE_READERS = [reflectedSpell, slashedSpell, drunkenSave, backupEye, steadiedInnovation, knottedBleed, chitinShell, rewrittenTime];
// A consumable's plan → the plan its trigger's effect makes, or the same plan. base: its base plan; info: its item part (src/compiler/index.js).
export function withTriggeredUse(plan, item, { base, info }) {
    const text = plainText(item?.system?.description?.value);
    const ownBase = { ...base, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, item: info };
    for (const reader of USE_READERS) {
        const next = reader(text, ownBase, item, plan);
        if (next) return next;
    }
    return plan;
}

// --- An alert to its wearers ---------------------------------------------------------------------------------------------------------------------

// (Name Pendant's Alert Superior Officer, "The pendent alerts all other allies within 500 feet who are also wearing a name pendant": what it tells,
// the user's ruling for information — whispered (builtin "whisper", scripts/live.js) to the GM, its user's player and the players of the creatures
// within that distance who wear one (whisper.alsoTo { slug, within }).)
const ALERTS = /^The pend[ae]nt alerts all other allies within (\d+) feet who are also wearing an? ([\w' -]+?)\.$/i;
export function withAlertWearers(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const alert = sentences.length === 1 ? ALERTS.exec(sentences[0]) : null;
    if (!alert || alert[2].toLowerCase() !== String(item?.name ?? "").toLowerCase()) return plan;
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    const when = activation.trigger ? ` (its trigger: ${activation.trigger.charAt(0).toLowerCase()}${activation.trigger.slice(1)})` : "";
    return { ...base, builtin: "whisper", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, whisper: { text: `${item.name} alerts the allies within ${alert[1]} feet who also wear a ${alert[2].toLowerCase()}${when}.`, alsoTo: { slug: item.system?.slug ?? null, within: Number(alert[1]) } }, decided: "information" };
}

// --- A Strike drawn to its user ---------------------------------------------------------------------------------------------------------------

// (Black Hole Armor's "The triggering Strike targets you instead of its intended target", Arrow-Catching Shield's and Lodestone Shield's "… instead
// of its normal target. If it hits, you gain the effects of the Shield Block reaction": the attacker's Strike is the GM's to aim at its user before
// it's rolled — a line of the card —; the Shield Block a readied Effect (builtin "readied-bonus", bonus.shieldBlock against it): that Strike's
// damage applied as PF2e's Shield Block, scripts/half-damage.js.)
const DRAWN = /^The triggering Strike targets you instead of its (?:normal|intended) target\.$/i;
const BLOCKS = /^If it hits, you gain the effects of the Shield Block reaction\.$/i;
const DRAWN_LINE = "The triggering Strike targets its user instead: the GM aims it at its user before rolling it";
export function withDrawnStrike(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!sentences.length || !DRAWN.test(sentences[0]) || sentences.length > 2 || (sentences[1] && !BLOCKS.test(sentences[1]))) return plan;
    const base = keptBase(plan, item, { activation, index });
    if (!sentences[1]) return ownCard(base, {}, [`${DRAWN_LINE}.`]);
    return { ...base, builtin: "readied-bonus", automation: { level: "automatic" }, targeting: { target: "the user", range: null, area: null }, bonus: { modifiers: [], resistance: null, shieldBlock: true, against: true, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], limits: [`${DRAWN_LINE}; its shield must be raised for the Shield Block.`] } };
}

// --- A rule PF2e can't play, on a note Effect for its time ------------------------------------------------------------------------------------

// (The user's ruling: a rule PF2e can't play is its words on a note Effect for its time, counted done.) Each: the Effect's sentences in order
// (flavor ones by name), whom it's for, its label, words and time.
const NEXT_TURN_START = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const NOTE_RULES = [
    // (Helm of Zeal's Divine Fervor: an extra reaction, only for its champion's reaction, until the start of its next turn.)
    { sentences: [/^You gain an additional reaction you can use only for your champion's reaction\.$/i, /^You lose this reaction if you don't use it by the start of your next turn\.$/i], label: "Extra reaction", text: "An additional reaction, only for its champion's reaction; lost if it isn't used by the start of its next turn.", duration: NEXT_TURN_START },
    // (Whispering Veil's Unforeseen Alert: a reaction now, only to answer the triggering action or effect.)
    { sentences: [/^The whispers warn you of the impending danger\.$/i, /^You immediately gain a reaction that you can use only to respond to the triggering action or effect\.$/i], label: "Warned", text: "A reaction now, usable only to respond to the action or effect it was warned of.", duration: THIS_TURN },
    // (Undead Scourge's Sever from the Void, on the undead it hit: no void healing for 1 minute unless that healing counteracts it first.)
    { sentences: [/^You disrupt the undead's connection to void energy\.$/i, /^For 1 minute, the undead damaged with the dagger can't be healed by void energy unless the effect attempting to heal the undead first counteracts the undead scourge's effect, which has a counteract rank of (\d+)(?:st|nd|rd|th) and a DC of (\d+)\.$/i, /^Vitality energy still has the usual effects on the undead\.$/i], label: "Severed from the void", text: (said) => `For 1 minute it can't be healed by void energy, unless the effect healing it first counteracts this (counteract rank ${said[1][1]}, DC ${said[1][2]}); vitality energy still harms it as usual.`, duration: MINUTE, targets: true },
    // (Auspicious Scepter's Fortunate Strike, on the ally its fortune spell targeted: its next Strike bypasses resistance equal to that spell's rank, one
    // type — the GM's pick, the most damage through —, until the end of the scepter's wielder's next turn. PF2e's resistance bypass is a rune's, no
    // rule an Effect can carry: the GM's to apply as that damage lands.)
    { sentences: [/^Your luck magic lingers, allowing your target to find a weak spot in an enemy's defenses\.$/i, /^The next Strike made by the target of the triggering fortune spell bypasses an amount of resistance equal to the spell's rank\.$/i, /^This benefit is lost if it isn't used by the end of your next turn\.$/i, /^If more than one type of resistance would apply against the attack, the attack bypasses only one\s*[—–-]\s*whichever would result in the highest amount of damage getting through, as determined by the GM\.$/i], label: "A weak spot found", text: "Its next Strike bypasses an amount of its target's resistance equal to the rank of the fortune spell it was given: one type only, whichever lets the most damage through (the GM's call, as the damage is applied). Lost if it isn't used by the end of the scepter's wielder's next turn.", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, targets: true },
    // (Victory Plate's record: a victory on the tabard until a later Recall uses it — the creature's trait is what that one picks.)
    { sentences: [/^You direct the armor to commemorate your victory\.$/i, /^The coat of arms on the armor's tabard shifts to incorporate heraldry related to the slain creature, and the victory is recorded within the tabard\.$/i, /^If you have already recorded four victories, choose one to replace with the new victory\.$/i], label: "Victory recorded", text: "A victory over the creature it slew is recorded on the tabard (note its trait: the tabard's other activation gives resistance by it, and that use takes it off). It holds four at most: with four already, its user replaces one (delete that one's Effect).", duration: null }
];
export function withNoteRule(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const rule = NOTE_RULES.find((entry) => entry.sentences.length === sentences.length && entry.sentences.every((pattern, at) => pattern.test(sentences[at])));
    if (!rule) return plan;
    const said = rule.sentences.map((pattern, at) => pattern.exec(sentences[at]));
    const base = keptBase(plan, item, { activation, index });
    const note = { label: rule.label, text: typeof rule.text === "function" ? rule.text(said) : rule.text, duration: rule.duration };
    const card = ownCard(rule.targets ? { ...base, targeting: { target: "1 creature", range: null, area: null }, item: { ...base.item, recipient: "targets" } } : base, { noteEffects: [note] });
    return { ...card, noteOnly: undefined };
}

// (Locket of Love Left Behind's True Love's Power, "You avoid dying and remain at 1 Hit Point. You cannot use the ability again until you replace the
// casing of the locket, which typically takes around 1 month and costs 600 gp": item.dropToOne — its user's Hit Points to 1, its Dying ended; the
// casing to replace a line of the card, its user's to keep.)
const AVOIDS_DEATH = /^You avoid dying and remain at 1 Hit Point\.$/i;
const CASING = /^You cannot use the ability again until you replace the casing of the [\w' -]+?, which typically takes around (\d+ \w+) and costs (\d+ gp)\.$/i;
export function withAvoidedDeath(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html)).filter((sentence) => !/^PFS Note\b/i.test(sentence) && !/^Replacing the casing of a [\w' -]+? takes \d+ days of Downtime\.$/i.test(sentence));
    const casing = sentences.map((sentence) => CASING.exec(sentence)).find(Boolean);
    if (!sentences.some((sentence) => AVOIDS_DEATH.test(sentence)) || !casing || sentences.some((sentence) => !AVOIDS_DEATH.test(sentence) && !CASING.test(sentence) && !flavor(sentence))) return plan;
    const base = keptBase(plan, item, { activation, index });
    return ownCard({ ...base, item: { ...base.item, dropToOne: true } }, {}, [`It can't be used again until the locket's casing is replaced: about ${casing[1]} and ${casing[2]} (30 days of Downtime in PFS).`]);
}

// (Lion's Call's Echo the Call, "You immediately learn the location and appearance of the triggering creature. You can communicate telepathically with
// the triggering creature while you remain within 1 mile of each other for the next hour": what the user's rulings make of information and speech
// once its trigger is set aside — whispered to the GM and its user, what it learns the GM's to tell (builtin "whisper", decided "information").)
const LEARNS = /^You immediately learn the location and appearance of the triggering creature\.$/i;
const TELEPATHY = /^You can communicate telepathically with the triggering creature while you remain within (\d+ (?:feet|miles?)) of each other for the next hour\.?$/i;
export function withEchoedCall(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const telepathy = sentences.length === 2 && LEARNS.test(sentences[0]) ? TELEPATHY.exec(sentences[1]) : null;
    if (!telepathy) return plan;
    const { targeting, ...base } = keptBase(plan, item, { activation, index });
    return { ...base, builtin: "whisper", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, whisper: { text: `It learns where the creature that located it is and what it looks like (the GM says), and for the next hour, while they're within ${telepathy[1]} of each other, they can communicate telepathically.` }, decided: "information" };
}

// --- A Strike of its own after the trigger --------------------------------------------------------------------------------------------------------

// The strike card's plan (src/compiler/strikes.js strikePlan's shape): its user's next Strike with the item, its riders on a hit.
function strikeCard(base, { range = null, offGuard = false, cast = null, noDamage = false, lines = [] } = {}) {
    const rows = Object.fromEntries(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => [degree, { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] }]));
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free", ...(base.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: rows },
        strike: { range, save: null, own: true, damage: [], attack: null, alteration: null, ...(offGuard ? { offGuard: true } : {}), ...(cast ? { cast } : {}), ...(noDamage ? { noDamage: true } : {}), ...(lines.length ? { lines } : {}), unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [] }
    };
}
// (Bloodstride Blade's Call of the Bloodthirst, "You cast translocate, appearing adjacent to the triggering creature, then Strike it with this weapon.
// The creature is Off-Guard to the attack": the teleport card beside it (item.move, from the creature targeted, within 5 feet) and the strike card,
// its target Off-Guard to it (PF2e's EphemeralEffect); the casting's traits a line.)
const TRANSLOCATED = /^You cast translocate, appearing adjacent to the triggering creature, then Strike it with this weapon\.$/i;
const OFF_GUARD_TO = /^The creature is Off-Guard to the attack\.$/i;
export function withTranslocatedStrike(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (sentences.length !== 2 || !TRANSLOCATED.test(sentences[0]) || !OFF_GUARD_TO.test(sentences[1]) || item?.type !== "weapon") return plan;
    const base = keptBase(plan, item, { activation, index });
    const card = strikeCard({ ...base, item: { ...base.item, move: { within: 5, speedTimes: null, from: "target" } } }, { offGuard: true, lines: ["First it casts Translocate: the teleport card moves it to a space next to the bleeding creature (target that creature); then it Strikes that creature with the blade"] });
    return { ...card, partial: undefined, notes: undefined };
}
// (Vine of Roses' "The vine of roses casts a 3rd-rank Holy Light spell with the triggering creature as the target. In place of a spell attack roll,
// make a weapon attack roll with the vine of roses using the same multiple attack penalty as the triggering Strike": the strike card, its attack
// roll the spell's — strike.cast with attackFromHit, the spell module's castFromItem at its degree (attackDegree) on a hit —, no weapon damage of
// its own (strike.noDamage); its multiple attack penalty the user's PF2e button.)
const SPELL_LINK = /@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\}/;
const UNLEASHED = /^The weapon unleashes its light in an attempt to destroy the target\.$/i;
const CASTS_AT = /^The [\w' -]+? casts an? (\d+)(?:st|nd|rd|th)-rank ([A-Z][\w' -]+?) spell with the triggering creature as the target\.$/i;
const WEAPON_ATTACK = /^In place of a spell attack roll, make a weapon attack roll with the [\w' -]+? using the same multiple attack penalty as the triggering Strike\.$/i;
export function withWeaponCast(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const casts = sentences.map((sentence) => CASTS_AT.exec(sentence)).find(Boolean);
    const link = SPELL_LINK.exec(String(activation.html ?? ""));
    if (!casts || !link || link[2] !== casts[2] || !sentences.some((sentence) => WEAPON_ATTACK.test(sentence)) || !sentences.every((sentence) => CASTS_AT.test(sentence) || WEAPON_ATTACK.test(sentence) || UNLEASHED.test(sentence))) return plan;
    const { builtin, spell, choices, castDuration, ...rest } = plan ?? {};
    const base = keptBase(plan, item, { activation, index });
    const card = strikeCard(base, { cast: { uuid: link[1], name: link[2], rank: Number(casts[1]), dc: null, attackFromHit: true }, noDamage: true, lines: ["Its attack roll is the spell's: at the creature that triggered it, with the same multiple attack penalty as that Strike (PF2e's button for it)"] });
    return { ...card, partial: undefined, notes: undefined };
}

// --- Electricity drawn off a creature ------------------------------------------------------------------------------------------------------------

// (Storm Flash's Divert Lightning, "Choose one eligible creature to protect and roll a melee attack roll against the DC of the electricity effect. If
// you succeed, the chosen creature takes no electricity damage from the triggering effect": a readied Effect on the creature its presser targets —
// within 10 feet, its user or another — immune to electricity damage against what triggered it (bonus.immunity, bonus.against, spent by that
// damage); the melee attack roll against the effect's DC its user's own, rolled first, the card's line: Apply after a success.)
const DIVERTS = /^You try to divert the electricity off course, to be absorbed by [\w' -]+?\.$/i;
const PROTECTS = /^Choose one eligible creature to protect and roll a melee attack roll against the DC of the (\w+) effect\.$/i;
const NONE_TAKEN = /^If you succeed, the chosen creature takes no (\w+) damage from the triggering effect\.$/i;
export function withDivertedEnergy(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const protects = sentences.length === 3 && DIVERTS.test(sentences[0]) ? PROTECTS.exec(sentences[1]) : null;
    const none_ = protects ? NONE_TAKEN.exec(sentences[2]) : null;
    if (!none_ || none_[1].toLowerCase() !== protects[1].toLowerCase()) return plan;
    const within = /\bwithin (\d+) feet of you\b/i.exec(String(activation.trigger ?? ""))?.[1] ?? null;
    const type = none_[1].toLowerCase();
    const base = keptBase(plan, item, { activation, index });
    return {
        ...base,
        builtin: "readied-bonus",
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: within ? `${within} feet` : null, area: null },
        bonus: { modifiers: [], resistance: null, immunity: { type }, against: true, recipient: "target", duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], limits: [`Roll first: its user's melee attack roll with ${item.name} against the ${type} effect's DC (its own roll); press Apply only if it succeeds.`, `Target the creature it protects (itself or one within ${within ?? "10"} feet).`] }
    };
}

// --- An armor that falls apart to shield its wearer -----------------------------------------------------------------------------------------------

// (Suit of Armoire's reaction, "The triggering attack is a failure, or you succeed at your Reflex save. The suit of armoire falls apart around you into
// its constituent panels, leaving you unarmored": the ways card, by what triggered it — the hit a failure (no damage from it), or the save a success
// — the GM's to apply in place of what was rolled, and the suit taken off, its user's own; lines of each way's card.)
const COLLAPSES = /^You forgot a peg or bolt when you were assembling the [\w' -]+?, causing it to collapse to pieces around you, though this shields you from harm\.$/i;
const EITHER = /^The triggering attack is a failure, or you succeed at your Reflex save\.$/i;
const UNARMORED = /^The [\w' -]+? falls apart around you into its constituent panels, leaving you unarmored\.$/i;
export function withCollapsedArmor(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html)).filter((sentence) => !/^Note\s*:\s*This item originates from\b/i.test(sentence));
    if (sentences.length !== 3 || !COLLAPSES.test(sentences[0]) || !EITHER.test(sentences[1]) || !UNARMORED.test(sentences[2])) return plan;
    const base = keptBase(plan, item, { activation, index });
    const off = `${item.name} falls apart into its panels: its user is unarmored (take it off).`;
    return {
        ...base,
        builtin: "ways",
        automation: { level: "automatic" },
        ways: [
            { name: "An enemy's Strike hit it", html: "", plan: ownCard(base, {}, ["The triggering Strike is a failure instead: no damage from it (the GM doesn't apply it).", off]) },
            { name: "It failed a Reflex save", html: "", plan: ownCard(base, {}, ["Its Reflex save is a success instead (the GM applies the success's result in place of the failure's).", off]) }
        ],
        once: true
    };
}

// --- Charges stored from a spell, and spent ------------------------------------------------------------------------------------------------------

// (Conflagration Club's Absorb Arcana, "The club gains a number of charges equal to the rank of the spell slot, and the charges are attuned to the
// damage type matching the spell's trait. If the spell has more than one eligible trait, choose one when the charges are stored" — its trigger's
// types, "the spell has the acid, cold, electricity, fire, or sonic trait": the ways card, a way for each type, each the objects card's op "charge"
// on itself — the slot's rank typed, kept on the item (its flag "charges" { count, type }, scripts/objects.js), refused while it has some (its
// Requirements). Its Explosive Cone's die per charge, typed on its card and its type picked (src/compiler/scaled.js), is filled in from them as
// its card is made, the charges then gone (scripts/live.js, src/live/charges.js).)
const ALIGNED = /^You mentally align the [\w' -]+?'s crystals to reverberate with energy from the triggering spell\.$/i;
const GAINS = /^The [\w' -]+? gains a number of charges equal to the rank of the spell slot, and the charges are attuned to the damage type matching the spell's trait\.$/i;
const CHOOSE_TRAIT = /^If the spell has more than one eligible trait, choose one when the charges are stored\.$/i;
const TRAITS = /\bthe spell has the ((?:acid|cold|electricity|fire|sonic|force|mental|poison|spirit|vitality|void)(?:,? (?:or )?(?:acid|cold|electricity|fire|sonic|force|mental|poison|spirit|vitality|void))*) trait\b/i;
export function withStoredCharges(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const traits = TRAITS.exec(String(activation.trigger ?? ""));
    if (!traits || sentences.length !== 3 || !ALIGNED.test(sentences[0]) || !GAINS.test(sentences[1]) || !CHOOSE_TRAIT.test(sentences[2]) || !/^The [\w' -]+? has no charges$/i.test(String(activation.requirements ?? ""))) return plan;
    const types = traits[1].toLowerCase().split(/,\s*(?:or\s+)?|\s+or\s+/).map((type) => type.trim()).filter(Boolean);
    const base = keptBase(plan, item, { activation, index });
    const way = (type) => ({ name: `${capital(type)} spell`, html: "", plan: { ...base, builtin: "objects", automation: { level: "automatic" }, targeting: { target: "self", range: null, area: null }, objects: { op: "charge", self: true, typed: "the spell slot's rank", attune: type, onlyWhenEmpty: true } } });
    return { ...base, builtin: "ways", automation: { level: "automatic" }, ways: types.map(way), once: true };
}
// --- The readers, in order --------------------------------------------------------------------------------------------------------------------

const READERS = [withSuppressed, withSubstituteRoll, withRedirectedShot, withBleedWorse, withBeguiledAttacker, withBeguilingCommand, withAbsorbedSpell, withAlertWearers, withDrawnStrike, withNoteRule, withAvoidedDeath, withEchoedCall, withTranslocatedStrike, withWeaponCast, withDivertedEnergy, withCollapsedArmor, withStoredCharges];

// The activation's plan → the plan its trigger's effect makes, or the same plan. entry: { activation, index } (compileEach's).
export function withTriggered(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of READERS) {
        const next = reader(plan, { item, activation: entry.activation, index: entry.index });
        if (next !== plan) return next;
    }
    return plan;
}
