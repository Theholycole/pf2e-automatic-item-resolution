// PF2e's boons (2026-10-29, docs/needs.md; the user's answer A to question 7 of docs/decisions-for-user.md): the four consumables whose
// stages last days to months — Elder Seed, Heartblood Ring, Phoenix Cinder and Void Fragment. Each "Stage N (time)" is read into the PF2e
// rules of one stage Effect on the creature that takes it in (scripts/boons.js): resistances and weaknesses by level, fast healing, senses,
// a language, conditions, a status penalty to initiative, bonuses and better saves against kinds of effects, a lower maximum Hit Points,
// the innate spells it grants, the activation it gives (an item of its own on the creature, played by its sheet's button), what it gets
// as it rolls initiative, and death at its last stage. A stage keeps what the ones before it gave unless it says otherwise ("The clumsy
// value increases to 2 and the status penalty increases to –2"). Its other words — a vampire rising, a reincarnation, sunlight, urges,
// the purging — are the stage Effect's own words. The next stage starts on its own once the last has lasted its time in world time; the
// GM holds it (a toggle on the Effect), moves it (the Effect's badge) or ends it (deleting the Effect).
//   SAVE     Elder Seed's "Swallowing it whole imparts its effects, but succeeding at the save against the boon causes the swallower to
//            regurgitate the seed", Void Fragment's "If the partaker succeeds at the initial save, the wisp reappears somewhere on the same
//            planet": its user's own save card first (plan.ownSave). No save is named: Fortitude at the item level's DC (28, 31), the card
//            saying the GM may change both. A failure starts the boon; a success gives the seed back, or the wisp is gone.
//   NO SAVE  Heartblood Ring, and Phoenix Cinder's "A partaker must be willing to gain the boon's effects": builtin "boon", its first
//            stage begun as it's used.
//   STAGES   plan.boon { name, level, source, save, stages: [{ stage, lasts, rules, spells, hpLoss, initiative, activation, first, text,
//            notes, dies }], death, purging, hold }.
//   HOLDER   withBoonActivation: the activation a stage gives, on the item scripts/boons.js makes for it (flag boonActivation) — Phoenix
//            Cinder's flames, the later card's retaliation for a minute (src/compiler/direct-damage.js retaliationPlan); Void Fragment's
//            teleport, the ways card's 30 feet for 1 action or 60 for 2 (src/compiler/teleport.js teleportPlan).
// Pure.

import { plainText } from "./rows.js";
import { LEVEL_DCS } from "./counteract.js";
import { conditionUuid } from "./row-readings.js";
import { retaliationPlan } from "./direct-damage.js";
import { teleportPlan } from "./teleport.js";

export const BOON_MODULE = "pf2e-automatic-item-resolution";
// (Its hold: a toggle on the stage Effect, PF2e's RollOption — scripts/boons.js reads it before a stage moves on.)
export const HELD_OPTION = "air-boon-held";
const REGENERATE_EFFECT = "Compendium.pf2e.spell-effects.Item.dXq7z633ve4E0nlX";
const DOOMED = "Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const LEVEL = "@actor.level";
const HALF = "floor(@actor.level/2)";
const byLevel = (half) => (half ? HALF : LEVEL);
const UNITS = { day: "days", days: "days", week: "weeks", weeks: "weeks", month: "months", months: "months" };
const NUMBER = { one: 1, two: 2, three: 3 };

// The text of a part of the item's html, its links as their words ("@Check[flat|dc:8]" as "DC 8 flat check").
const textOf = (html) => plainText(String(html ?? "").replace(/@Check\[flat\|dc:(\d+)\]/g, "DC $1 flat check"));
const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?)])\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
// (The compendium links of a part: spells and conditions by their words.)
const linksOf = (html) => Object.fromEntries([...String(html ?? "").matchAll(/@UUID\[(Compendium\.pf2e\.[\w-]+\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\}/g)].map(([, uuid, name]) => [name.toLowerCase(), uuid]));

// PF2e's rules, each under a key a later stage's own replaces, with their words for the card: [key, rules, words].
const levelWords = (half) => (half ? "half its level" : "its level");
const TYPE_WORDS = { "axe-vulnerability": "axes" };
const resist = (type, half) => [`resist:${type}`, [{ key: "Resistance", type, value: byLevel(half) }], `resistance to ${type} equal to ${levelWords(half)}`];
const weak = (type, half) => [`weak:${type}`, [{ key: "Weakness", type, value: byLevel(half) }], `weakness to ${TYPE_WORDS[type] ?? type} equal to ${levelWords(half)}`];
const fastHealing = (half) => ["fast-healing", [{ key: "FastHealing", value: byLevel(half) }], `fast healing equal to ${levelWords(half)}`];
const sense = (selector, extra = {}) => [`sense:${selector}`, [{ key: "Sense", selector, ...extra }], `${selector.replace(/-/g, " ")}${extra.acuity ? ` (${extra.acuity}${extra.range ? `, ${extra.range} feet` : ""})` : ""}`];
const condition = (slug, value, uuid = null) => [`condition:${slug}`, [{ key: "GrantItem", uuid: uuid ?? (slug === "doomed" ? DOOMED : conditionUuid(slug)), onDeleteActions: { grantee: "restrict" }, alterations: [{ mode: "override", property: "badge-value", value }] }], `${slug.charAt(0).toUpperCase()}${slug.slice(1)} ${value}`];
const initiativePenalty = (value) => ["initiative", [{ key: "FlatModifier", selector: "initiative", type: "status", value: -value }], `a –${value} status penalty to initiative`];
const maxHp = (perLevel) => ["hp", [{ key: "FlatModifier", selector: "hp", type: "untyped", value: `-${perLevel}*@actor.level`, label: "Boon: maximum Hit Points" }], `maximum Hit Points ${perLevel} × its level lower (its current Hit Points too, as the stage begins)`];
// (Against kinds of effects: PF2e's own words for them — "inflicts:paralyzed", the trait of the effect's item.)
const KINDS = { death: "item:trait:death", "death effects": "item:trait:death", disease: "item:trait:disease", paralysis: "inflicts:paralyzed", paralyze: "inflicts:paralyzed", poison: "item:trait:poison", sleep: "item:trait:sleep", fire: "item:trait:fire", mental: "item:trait:mental" };
const kindsOf = (words) => String(words ?? "").replace(/\beffects\b/g, "").split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean);
const predicateOf = (words) => {
    const options = kindsOf(words).map((word) => KINDS[word]);
    return options.every(Boolean) && options.length ? (options.length === 1 ? options : [{ or: options }]) : null;
};

// What a sentence of a stage gives: { set: [[key, rules]], spells, spellRank, hpLoss, initiative, first, activationFrequency, dismiss,
// note, words } — note: the GM's or the player's, on the Effect and the card; words: the Effect's words alone.
const STAGE_READINGS = [
    // Elder Seed
    [/^Your skin hardens, giving you a brownish-green tinge\.$/, () => ({ words: true })],
    [/^You gain resistance to (\w+) damage and (\w+) damage equal to (half )?your level, and you have (\w+) out to a range of (\d+) feet\.$/, ([, one, two, half, kind, range]) => ({ set: [resist(one, half), resist(two, half), sense(kind.toLowerCase(), { acuity: "imprecise", range: Number(range) })] })],
    [/^Also, you can cast (.+?) each once per day as (arcane|divine|occult|primal) innate spells\.$/, ([, list, tradition]) => ({ spells: { names: list.split(/,\s*(?:and\s+)?|\s+and\s+/).map((name) => name.trim()).filter(Boolean), perDay: 1, tradition } })],
    [/^The web is a dense mycelial net rather than spider silk\.$/, () => ({ words: true })],
    [/^You gain low-light vision and fluency in (\w+)\.$/, ([, language]) => ({ set: [sense("low-light-vision"), [`language:${language.toLowerCase()}`, [{ key: "ActiveEffectLike", mode: "add", path: "system.build.languages.granted", value: { slug: language.toLowerCase(), source: "{item|name}" } }], `fluent in ${language}`]] })],
    [/^However, your body feels stiffer, your mind slower to move to intense emotions, and you are prone to take your time making decisions\.$/, () => ({ words: true })],
    [/^You become Clumsy (\d+), take a -(\d+) status penalty to initiative rolls, and gain a weakness to (\w+) damage equal to (half )?your level, and you take the same amount of additional damage from axes\.$/, ([, clumsy, penalty, type, half], links) => ({ set: [condition("clumsy", Number(clumsy), links[`clumsy ${clumsy}`]), initiativePenalty(Number(penalty)), weak(type, half), weak("axe-vulnerability", half)] })],
    [/^You become more treelike and ponderous in body and mind, and when you cast the (\w+) innate spell from this boon, you can cast it at (\d+)(?:st|nd|rd|th) rank\.$/, ([, spell, rank]) => ({ spellRank: { name: spell.toLowerCase(), rank: Number(rank) } })],
    [/^The clumsy value increases to (\d+) and the status penalty increases to -(\d+)\.$/, ([, clumsy, penalty], links) => ({ set: [condition("clumsy", Number(clumsy), links["clumsy 1"]), initiativePenalty(Number(penalty))] })],
    [/^Whenever you roll initiative, you become Slowed (\d) automatically, Slowed (\d) if the d20 roll is (\d+) or lower, or Slowed (\d) if the d20 shows a 1\.$/, ([, always, low, at, one], links) => ({ initiative: { slug: "slowed", uuid: links[`slowed ${always}`] ?? conditionUuid("slowed"), byDie: [{ atMost: 1, value: Number(one) }, { atMost: Number(at), value: Number(low) }, { atMost: 20, value: Number(always) }], lasts: "encounter" } })],
    [/^Your weakness to (\w+) and vulnerability to axes equals your level\.$/, ([, type]) => ({ set: [weak(type, false), weak("axe-vulnerability", false)] })],
    // Heartblood Ring, Phoenix Cinder
    [/^The first time you enter this stage from a (?:particular dose of )?[\w' ]+?\s*, you are affected as if by regenerate\.$/i, () => ({ first: [{ kind: "effect", uuid: REGENERATE_EFFECT, name: "Regenerate" }] })],
    [/^Each round this effect functions, it attempts to counteract one (disease|poison) or (disease|poison) affecting you with a bonus equal to your class DC - 10\.$/, ([, one, two]) => ({ first: [{ kind: "counteract", afflictions: [one, two], whileEffect: "Regenerate" }] })],
    [/^Heartblood also reduces physical signs of aging, altering your appearance to that of vigorous adulthood for your ancestry\.$/, () => ({ words: true })],
    [/^\(Non-adults who drink heartblood change only in apparent vigor, not age\.\)$/, () => ({ words: true })],
    [/^(?:While in this stage or higher, )?you have fast healing equal to (half )?your level, as well as resistance to (\w+) damage(?: and (\w+) damage)? equal to (half )?your level\.$/i, ([, halfHealing, one, two, half]) => ({ set: [fastHealing(halfHealing), resist(one, half), ...(two ? [resist(two, half)] : [])] })],
    [/^(?:Also, )?you gain a \+(\d+) circumstance bonus to saving throws \(or any other defense\) against (.+?)\.$/i, ([, bonus, kinds]) => (predicateOf(kinds) ? { set: [[`save-bonus:${kinds}`, [{ key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: Number(bonus), predicate: predicateOf(kinds) }], `a +${bonus} circumstance bonus to saves against ${kinds}`]], note: `Its +${bonus} circumstance bonus against ${kinds} counts on its other defenses too (the GM's, beside the saves).` } : null)],
    [/^Treat the outcome of any saving throw you roll against (.+?) as one step better\.$/, ([, kinds]) => (predicateOf(kinds) ? { set: [[`save-degree:${kinds}`, [{ key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "one-degree-better" }, predicate: predicateOf(kinds) }], `its saves against ${kinds} one degree better`]] } : null)],
    [/^You gain low-light vision, or you gain darkvision if your ancestry already has low-light vision\.$/, () => ({ set: [["sense:vision", [{ key: "Sense", selector: "low-light-vision" }, { key: "Sense", selector: "darkvision", predicate: ["self:low-light-vision:from-ancestry"] }], "low-light vision, or darkvision when its ancestry gives it low-light vision"]] })],
    [/^Reduce your current and maximum Hit Points by (\d+) × your level(?:, rounded up, instead of \d+ × your level)?; you are Doomed (\d+)\.$/, ([, perLevel, doomed]) => ({ hpLoss: Number(perLevel), set: [maxHp(Number(perLevel)), condition("doomed", Number(doomed))] })],
    [/^Reduce your current and maximum Hit Points by (\d+) × your level, and you have a weakness to (\w+) damage equal to (half )?your level\.$/, ([, perLevel, type, half]) => ({ hpLoss: Number(perLevel), set: [maxHp(Number(perLevel)), weak(type, half)] })],
    [/^You develop a pallor and a dislike of bright light, especially sunlight\.$/, () => ({ words: true })],
    [/^If suddenly exposed to bright light, you are Dazzled until the end of your next turn\.$/, () => ({ note: "Suddenly in bright light: Dazzled until the end of its next turn (the GM's, as the light comes)." })],
    [/^While in an area of sunlight, you remain dazzled until 1 round after the exposure ends\.$/, () => ({ note: "In sunlight it stays Dazzled until a round after it's out of it (the GM's)." })],
    [/^Normal food is unsatisfying, and you have urges to consume blood; when confronted with the opportunity to do so, you must succeed at a Will save to avoid it\.$/, () => ({ note: "Faced with blood it could drink, a Will save to hold back (the GM's DC)." })],
    [/^You have urges to burn and use fire when you can\.$/, () => ({ words: true })],
    [/^When confronted with the opportunity to do so, you must succeed at a Will save to avoid it\.$/, () => ({ note: "Given a chance to burn something, a Will save to hold back (the GM's DC)." })],
    [/^Doing so once after each time you roll initiative is enough\.$/, () => ({ note: "One such save after each initiative roll is enough for that encounter." })],
    [/^Your normal coloration returns for a few hours after you drink blood\.$/, () => ({ words: true })],
    [/^You gain darkvision and now have fast healing equal to (half )?your level\.$/, ([, half]) => ({ set: [["sense:vision", [{ key: "Sense", selector: "darkvision" }], "darkvision"], fastHealing(half)] })],
    [/^A death effect can't automatically kill you or increase your dying value\.$/, () => ({ note: "A death effect can't kill it outright or raise its Dying value (the GM's, as one lands)." })],
    [/^Your hunger for blood increases, so if you fail to drink a cup or so each day, you are considered to have gone without food that day\.$/, () => ({ note: "A day without a cup of blood counts as a day without food (out of combat)." })],
    [/^You are also Slowed 1 while in sunlight, becoming Slowed 2 after 1 minute\.$/, () => ({ note: "In sunlight: Slowed 1, Slowed 2 after a minute there (the GM's, as it's in the sun)." })],
    [/^Your shadow is wispy, and your reflection in mirrors ghostly, which are apparent signs of vampirism to those who know such facts\.$/, () => ({ words: true })],
    [/^For (\w+) days after taking in the [\w' ]+?, you are immune to (\w+)\.$/, ([, days, type]) => ({ first: [{ kind: "immunity", type: type.toLowerCase(), days: NUMBER[days.toLowerCase()] ?? Number(days) }] })],
    [/^You can cast (\w[\w' ]*?) as an innate spell, and you have access to the following activation\.$/, ([, spell]) => ({ spells: { names: [spell], perDay: null, tradition: null }, activation: true })],
    [/^You can use the activation once per (day|hour|minute)\.$/, ([, per]) => ({ activationFrequency: per })],
    [/^Always feverish and flushed, you feel as if temperatures lower than sweltering are cold\.$/, () => ({ note: "Any temperature short of sweltering feels cold to it (the GM's, out of combat)." })],
    [/^You now have fast healing equal to (half )?your level but reduce your current and maximum Hit Points by (\d+) × your level, rounded up, instead of \d+ × your level\.$/, ([, half, perLevel]) => ({ hpLoss: Number(perLevel), set: [fastHealing(half), maxHp(Number(perLevel))] })],
    [/^Also, you have a weakness to (\w+) damage equal to (half )?your level and a weakness to (\w+) equal to (half )?your level\.$/, ([, one, halfOne, two, halfTwo]) => ({ set: [weak(one, halfOne), weak(two, halfTwo)] })],
    [/^You can use the activation you previously gained once per (day|hour|minute), but you can no longer Dismiss it\.$/, ([, per]) => ({ activationFrequency: per, dismiss: false })],
    [/^Whenever you drop to 0 Hit Points, a flame strike erupts from a randomly chosen point on the edge of your space\.$/, () => ({ note: "Each time it drops to 0 Hit Points, Divine Immolation (the remaster's flame strike) erupts from a random point on the edge of its space (cast by hand)." })],
    // Void Fragment
    [/^The first time you enter this stage from a given [\w' ]+?, you gain the effect of a potion of truespeech for (\d+) days\.$/, ([, days]) => ({ first: [{ kind: "note", label: "truespeech", words: "It speaks and understands all languages, as a potion of truespeech gives, though it can't read them", days: Number(days) }] })],
    [/^The wisp grants you telepathy with a range of (\d+) feet\.$/, ([, range]) => ({ note: `Telepathy ${range} feet (speech: the player's).` })],
    [/^Also, you are under the effects of Hidden Mind, except that its status bonus is \+(\d+) and it counteracts with a modifier equal to your class DC - 9 or your spell DC - 9, whichever is higher\.$/, ([, bonus]) => ({ set: [["hidden-mind", [{ key: "FlatModifier", selector: "saving-throw", type: "status", value: Number(bonus), predicate: ["item:trait:mental"], label: "Hidden Mind" }], `a +${bonus} status bonus to saves against mental effects (Hidden Mind)`]], note: "As Hidden Mind, it hides from detection, revelation and scrying, counteracting them at the higher of its class DC and spell DC, less 9 (the GM's, as one is used on it)." })],
    [/^The wisp grants you resistance to (\w+) damage equal to (half )?your level\.$/, ([, type, half]) => ({ set: [resist(type, half)] })],
    [/^You also have access to the following activation\.$/, () => ({ activation: true })],
    [/^You gain imprecise (\w+) to half your telepathy's range, which increases to (\d+) feet\.$/, ([, kind, range]) => ({ set: [sense(kind.toLowerCase(), { acuity: "imprecise", range: Math.floor(Number(range) / 2) })], note: `Telepathy ${range} feet now (speech: the player's).` })],
    [/^However, you have a tough time filtering the mental noise\.$/, () => ({ words: true })],
    [/^If any creatures can be detected by your (\w+), you take a -(\d+) penalty to Perception checks\.$/, ([, kind, penalty]) => ({ set: noise(kind, Number(penalty)) })],
    [/^When you arrive in a space after using the activation to teleport, you create a (\d+)-foot emanation that works like Strange Geometry for 1 round\.$/, ([, radius]) => ({ arrive: `Where it arrives, a ${radius}-foot emanation works as Strange Geometry for 1 round, it too in it (its Will saves by hand)` })],
    [/^This emanation can affect you\.$/, () => ({ words: true })],
    [/^Your telepathy range increases to (\d+) feet, and the wisp grants you resistance to (\w+) damage equal to (half )?your level\.$/, ([, range, type, half]) => ({ set: [resist(type, half)], note: `Telepathy ${range} feet now (speech: the player's).` })],
    [/^The mental noise increases the penalty to Perception to -(\d+)\.$/, ([, penalty]) => ({ set: noise("thoughtsense", Number(penalty)) })],
    [/^Whenever you roll initiative, you become Confused for up to (\d+d\d+) rounds\.$/, ([, dice], links) => ({ initiative: { slug: "confused", uuid: links.confused ?? conditionUuid("confused"), value: null, rounds: dice } })]
];
// (Void Fragment's mental noise: a toggle on the Effect, on while a creature is in its thoughtsense — on by default, its player's to turn off.)
function noise(kind, penalty) {
    const option = "air-boon-mental-noise";
    return [["noise", [{ key: "RollOption", domain: "all", option, toggleable: true, value: true, label: `A creature in its ${kind.toLowerCase()}` }, { key: "FlatModifier", selector: "perception", type: "untyped", value: -penalty, predicate: [option], label: "Mental noise" }], `a –${penalty} penalty to Perception while a creature is in its ${kind.toLowerCase()} (the Effect's toggle, on)`]];
}

// A part's activation block ("<p><strong>Activate</strong> …" to the part's end) → { html, sentences } and the part without it.
function splitActivation(html) {
    const at = String(html ?? "").search(/<p>\s*<strong>\s*Activate\s*<\/strong>/i);
    return at < 0 ? { html, activation: null } : { html: html.slice(0, at), activation: html.slice(at).trim() };
}

// The activations this reading builds: Phoenix Cinder's flames, Void Fragment's teleport → { kind, …, frequency } or null.
const FLAMES = /^Frequency once per (day|hour|minute) Effect You wreathe yourself in flame for 1 minute\. Adjacent creatures that hit you with a melee attack, as well as creatures that touch you or hit you with an unarmed attack, take (\d+d\d+) (\w+)\. You can Dismiss the activation\.$/;
const TELEPORT = /^Frequency once per (day|hour|minute) Effect You teleport up to (\d+) feet to an unoccupied space you can see\. If you used 2 actions, you can teleport up to (\d+) feet\.$/;
function readActivation(html) {
    const text = textOf(html).replace(/^Activate\s*(?:or\s*)?\([^)]*\)\s*/, "");
    const flames = FLAMES.exec(text);
    // (Its block too, its Frequency the stage's on the item made for it: src/live/boons.js boonActivationSource.)
    if (flames) return { kind: "flames", per: flames[1], formula: flames[2], type: flames[3], dismiss: true, html: String(html).trim() };
    const teleport = TELEPORT.exec(text);
    if (teleport) return { kind: "teleport", per: teleport[1], within: Number(teleport[2]), farther: Number(teleport[3]), html: String(html).trim() };
    return null;
}

// "9 Days", "1 Week", "1 Month" → { value, unit }.
const lastsOf = (words) => {
    const match = /^(\d+|one|two|three) (days?|weeks?|months?)$/i.exec(String(words ?? "").trim());
    return match ? { value: NUMBER[match[1].toLowerCase()] ?? Number(match[1]), unit: UNITS[match[2].toLowerCase()] } : null;
};

// The item's html → its parts: { intro, stages: [{ stage, lasts, html, activation }], purging } or null when it isn't a boon.
function partsOf(html) {
    const parts = String(html ?? "").split(/<hr\s*\/?>/i).map((part) => part.trim()).filter(Boolean);
    const stages = [];
    let purging = null;
    const intro = [];
    for (const part of parts) {
        const stage = /^<p>\s*<strong>\s*Stage (\d+)(?:\s*\(([^)]+)\))?\s*<\/strong>/i.exec(part);
        if (stage) {
            const { html: own, activation } = splitActivation(part.replace(stage[0], "<p>"));
            stages.push({ stage: Number(stage[1]), lastsWords: stage[2] ?? null, html: own, activation });
            continue;
        }
        if (/^<p>\s*<strong>\s*Purging\s*<\/strong>/i.test(part)) {
            purging = part.replace(/<strong>\s*Purging\s*<\/strong>/i, "");
            continue;
        }
        if (!stages.length) intro.push(part);
        else return null;
    }
    if (stages.length < 2 || !purging || stages.some((stage, index) => stage.stage !== index + 1)) return null;
    return { intro: intro.filter((part) => !/^<p>\s*<strong>\s*Activate\s*<\/strong>/i.test(part)), stages, purging };
}

// The intro's own sentences: its flavor, the save and what a success does, or the willing partaker.
const INTRO = [
    [/^An enormous, perfect, ripe seed from a tree important to a region's druids, an elder seed exudes vitality\.$/, () => ({})],
    [/^Plant life grows quickly and abundantly around it\.$/, () => ({})],
    [/^Anyone who touches the seed understands the nature of its power\.$/, () => ({})],
    [/^Swallowing it whole imparts its effects, but succeeding at the save against the boon causes the swallower to regurgitate the seed\.$/, () => ({ save: { back: true } })],
    [/^Sealed inside the hidden compartment of a gold ring, heartblood has an unmistakable coppery taste, along with a thick mouth feel\.$/, () => ({})],
    [/^A whiff of the concoction is pleasantly stimulating\.$/, () => ({})],
    [/^An incandescent, multipronged crystal the color of dying fire, a phoenix cinder gives off pleasant warmth and a sense of peace\.$/, () => ({})],
    [/^A low, soft chirruping around the crystal invokes the idea of using fire to cleanse and protect\.$/, () => ({})],
    [/^The crystal offers this power to anyone who touches it\.$/, () => ({})],
    [/^A partaker must be willing to gain the boon's effects\.$/, () => ({ willing: true })],
    [/^Hovering midair, thrumming and whispering of its power, a void fragment is a crystalline fragment of swirling colors, reminiscent of stars and deep darkness\.$/, () => ({})],
    [/^It thrums intermittently with a beckoning vibration, drawing attention from and pulling at nearby creatures with a tangible sense of gravity\.$/, () => ({})],
    [/^A chill hangs in the air around it\.$/, () => ({})],
    [/^At a touch, the wisp vanishes, giving the point of contact a gangrenous color\.$/, () => ({})],
    [/^If the partaker succeeds at the initial save, the wisp reappears somewhere on the same planet\.$/, () => ({ save: { back: false } })]
];

const readSentence = (readings, sentence, links) => {
    for (const [pattern, read] of readings) {
        const match = pattern.exec(sentence);
        if (!match) continue;
        const got = read(match, links);
        if (got) return got;
    }
    return null;
};

// The item → plan.boon and what it left unread, or null when it isn't one.
export function readBoon(item, { spells = {} } = {}) {
    const html = String(item?.system?.description?.value ?? "");
    const parts = partsOf(html);
    if (!parts) return null;
    const ownTradition = (item?.system?.traits?.value ?? []).find((trait) => ["arcane", "divine", "occult", "primal"].includes(trait)) ?? null;
    const unread = [];
    const level = Number(item?.system?.level?.value) || 0;
    const intro = parts.intro.flatMap((part) => sentencesOf(textOf(part))).map((sentence) => [sentence, readSentence(INTRO, sentence, {})]);
    unread.push(...intro.filter(([, got]) => !got).map(([sentence]) => sentence));
    const said = Object.assign({}, ...intro.map(([, got]) => got ?? {}));
    // (What each stage has: the stages before it, with its own on top.)
    const kept = new Map();
    let spellList = [];
    let activation = null;
    let hpLoss = 0;
    let initiative = null;
    let death = null;
    const stages = parts.stages.map((part, index) => {
        const links = linksOf(part.html);
        const text = textOf(part.html);
        const sentences = sentencesOf(text);
        const notes = [];
        const first = [];
        // (The words after "If you die at this stage or higher": what its death becomes, the Effect's from this stage on.)
        const dying = sentences.findIndex((sentence) => /^If you die at this stage or higher\b/.test(sentence));
        if (dying >= 0) death = { from: part.stage, words: sentences.slice(dying).join(" ") };
        const own = dying >= 0 ? sentences.slice(0, dying) : sentences;
        // (Its last stage: "You die.")
        if (index === parts.stages.length - 1 && own.length === 1 && /^You die\.$/.test(own[0]) && !part.activation) return { stage: part.stage, lasts: null, dies: true, rules: [], lines: [], spells: [], hpLoss, initiative: null, activation: null, first: [], text, notes: [], ...(death ? { death: death.words } : {}) };
        let gave = null;
        for (const sentence of own) {
            const got = readSentence(STAGE_READINGS, sentence, links);
            if (!got) {
                unread.push(sentence);
                continue;
            }
            for (const [key, rules, words] of got.set ?? []) kept.set(key, { rules, words });
            if (got.spells) {
                const found = got.spells.names.map((name) => {
                    const known = spells[name.toLowerCase()];
                    const uuid = links[name.toLowerCase()] ?? known?.uuid ?? null;
                    const traditions = known?.traditions ?? [];
                    // (No tradition given, Phoenix Cinder's Ignition: the item's own tradition trait when the spell has it, else primal when it has
                    // that, else its first.)
                    const tradition = got.spells.tradition ?? (ownTradition && traditions.includes(ownTradition) ? ownTradition : traditions.includes("primal") ? "primal" : traditions[0] ?? "primal");
                    return uuid ? { uuid, name, rank: null, perDay: got.spells.perDay, tradition } : null;
                });
                if (found.some((spell) => !spell)) unread.push(sentence);
                spellList = [...spellList, ...found.filter(Boolean)];
            }
            if (got.spellRank) spellList = spellList.map((spell) => (spell.name.toLowerCase() === got.spellRank.name ? { ...spell, rank: got.spellRank.rank } : spell));
            if (got.hpLoss) hpLoss = got.hpLoss;
            if (got.initiative) initiative = got.initiative;
            if (got.first) first.push(...got.first);
            if (got.note) notes.push(got.note);
            if (got.activation) gave = true;
            if (got.activationFrequency && activation) activation = { ...activation, per: got.activationFrequency, ...(got.dismiss === false ? { dismiss: false } : {}) };
            if (got.arrive && activation) activation = { ...activation, arrive: got.arrive };
        }
        if (part.activation) {
            const read = gave ? readActivation(part.activation) : null;
            if (read) activation = read;
            else unread.push(textOf(part.activation));
        } else if (gave) unread.push("(its activation)");
        const lasts = lastsOf(part.lastsWords);
        if (!lasts) unread.push(`Stage ${part.stage} (${part.lastsWords ?? "no time"})`);
        return {
            stage: part.stage,
            lasts,
            rules: [...kept.values()].flatMap((entry) => entry.rules).map((rule) => structuredClone(rule)),
            lines: [...kept.values()].map((entry) => entry.words),
            spells: spellList.map((spell) => ({ ...spell })),
            hpLoss,
            initiative,
            activation: activation ? { ...activation } : null,
            first,
            text,
            notes,
            ...(death && death.from <= part.stage ? { death: death.words } : {})
        };
    });
    const purging = textOf(parts.purging);
    // (Elder Seed's geas: "While under the geas, you can't advance to stage 4" — the GM's hold on the Effect.)
    const hold = /\byou can't advance to stage (\d+)\b/i.exec(purging);
    const save = said.save ? { statistic: "fortitude", dc: LEVEL_DCS[Math.max(0, Math.min(25, level))] ?? 14, back: said.save.back } : null;
    const source = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? (item?._id && !item?.uuid ? `Compendium.pf2e.equipment-srd.Item.${item._id}` : null);
    return {
        boon: {
            name: item.name,
            level,
            source,
            save,
            willing: Boolean(said.willing),
            stages,
            death,
            purging,
            ...(hold ? { hold: { before: Number(hold[1]) } } : {})
        },
        unread
    };
}

// The card's lines for the boon: what a success does, its save's numbers, its willing partaker, its stages' times and the GM's controls.
const timeWords = (lasts) => (lasts ? `${lasts.value} ${lasts.value === 1 ? lasts.unit.replace(/s$/, "") : lasts.unit}` : "for good");
export function boonLines(boon) {
    const stages = boon.stages.map((stage) => (stage.dies ? `stage ${stage.stage} is death` : `stage ${stage.stage} lasts ${timeWords(stage.lasts)}`)).join(", ");
    return [
        ...(boon.save ? [`No save is named: Fortitude at its level's DC ${boon.save.dc} (the GM may change either). A failure begins its first stage on its user; ${boon.save.back ? "a success brings the seed back up whole, into its user's inventory" : "a success sends the wisp away, somewhere on this world"}.`] : []),
        ...(boon.willing ? ["Only a willing partaker takes it in: using it is its user's choice."] : []),
        `Its stages, one Effect on its user: ${stages}; each begins on its own once the last has lasted its time in the world's time, with a card.`,
        `The GM holds it at a stage with the Effect's "Held" toggle, moves it with the Effect's badge, or ends it by deleting the Effect${boon.hold ? ` (held before stage ${boon.hold.before} while its geas lasts)` : ""}; its purging is out of combat and the GM's.`
    ];
}

// The plan: the user's own save card (a save named in the text), or the boon begun as it's used.
export function withBoon(plan, { kind, item, base, info, options } = {}) {
    if (kind !== "consumable" || item?.type !== "consumable") return plan;
    const read = readBoon(item, { spells: options?.spells ?? {} });
    if (!read) return plan;
    const { boon, unread } = read;
    const common = {
        ...(base ?? {}),
        gm: undefined,
        noteOnly: undefined,
        decided: undefined,
        partial: unread.length ? true : undefined,
        unread: unread.length ? unread : undefined,
        automation: { level: unread.length ? "guided" : "automatic" },
        trigger: { event: "use" },
        targeting: { target: "self", range: null, area: null },
        item: { ...(info ?? plan?.item ?? {}) },
        boon,
        notes: boonLines(boon)
    };
    if (boon.save) {
        const rows = { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() };
        return { ...common, builtin: undefined, ownSave: true, resolution: { kind: "save", check: { roll: "save", statistic: boon.save.statistic, basic: false, against: { dc: "fixed", value: boon.save.dc } }, sharedDamage: null, outcomes: rows } };
    }
    return { ...common, builtin: "boon", resolution: undefined };
}

// The activation on the item a stage gives (scripts/boons.js, flag boonActivation { name, stage, activation }): Phoenix Cinder's flames as
// the later card's retaliation for a minute, Void Fragment's teleport as the ways card's two (1 action or 2).
export function withBoonActivation(plan, { kind, item, base } = {}) {
    const own = item?.flags?.[BOON_MODULE]?.boonActivation;
    if (kind !== "activation" || !own?.activation) return plan;
    const { activation } = own;
    const frequency = { max: 1, per: activation.per, raw: `once per ${activation.per}` };
    const clean = { ...(base ?? {}), gm: undefined, partial: undefined, noteOnly: undefined, decided: undefined, unread: undefined, automation: { level: "automatic" } };
    if (activation.kind === "flames") {
        const retaliation = retaliationPlan(`For 1 minute, adjacent creatures that hit you with a melee attack, as well as creatures that touch you or hit you with an unarmed attack, take ${activation.formula} ${activation.type} damage per hit.`, base);
        if (!retaliation) return plan;
        return {
            ...clean,
            ...retaliation,
            trigger: { ...(retaliation.trigger ?? {}), event: "use", frequency },
            notes: [
                "Wreathed in flame for 1 minute: target each creature adjacent that hits its user with a melee attack, or that touches it or hits it with an unarmed attack, and press.",
                activation.dismiss === false ? "It can't be Dismissed at this stage." : "Its user can Dismiss it (1 action): then this card is no longer used."
            ]
        };
    }
    if (activation.kind === "teleport") {
        const way = (feet, actions) => {
            const teleport = teleportPlan(`<p><strong>Effect</strong> You teleport up to ${feet} feet to an unoccupied space you can see.</p>`, { ...(base ?? {}), activation: { ...(base?.activation ?? {}), time: String(actions) } });
            return teleport ? { name: `${actions === 1 ? "1 action" : "2 actions"}: up to ${feet} feet`, html: `<p>Teleport up to ${feet} feet to an unoccupied space it can see.</p>`, plan: { ...teleport, ...(activation.arrive ? { notes: [`${activation.arrive}.`] } : {}) } } : null;
        };
        const ways = [way(activation.within, 1), way(activation.farther, 2)];
        if (ways.some((entry) => !entry)) return plan;
        return { ...clean, builtin: "ways", targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? {}), event: "use", frequency }, once: true, resolution: undefined, ways, notes: ["Its actions spent pick the way: 1 action, up to 30 feet; 2 actions, up to 60."].map((line) => line.replace("30", String(activation.within)).replace("60", String(activation.farther))) };
    }
    return plan;
}

// Both readings, as the leftovers group's one call (src/compiler/readings-leftovers.js).
export const withBoons = (plan, context = {}) => withBoonActivation(withBoon(plan, context), context);
