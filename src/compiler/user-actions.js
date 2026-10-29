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
// - Its user's own feat, the immunity after it changed (withFeatImmunity): Battle Medic's Baton's Battle Medicine, a line, and the creature's
//   shorter immunity to it a note Effect on it.
// - A mode picked on the card (the ways card): Magnetic Suit's attract or repel — its user's Effect with PF2e's rules, toggles for metal weapons
//   and objects, then its allies' card —, Captivating Score's positive or negative emotion — each a Will save, an attitude on a note Effect.
// - A skill picked on the card, for one action (withSkimmed): Possibility Tome's +3 item to Recall Knowledge with the skill or Lore picked
//   (plan.item.skillPick, src/compiler/skill-pick.js listedSkillPick), its Interact before each check its user's own.
// - A result "as though by" another action's (withAsThough, in src/compiler/permanent.js beside the skill actions, with the ability module's compiled
//   actions): Self-Emptying Pocket's Create a Diversion.
// - What a cast may find, its user's pick (withLocateChoices): Lion's Call's Locate, a line of its cast card.
// - Its user's own arm made solid (withSolidArm): Aether Appendage's, PF2e's AdjustStrike on its Effect until the end of the turn.
// - A spell's effects changed past its cast (withSeenLanguages): Spectacles of Understanding's Translate of every written language, a note Effect.
// - A note that burns its holder (burningNote): Self-Immolating Note's damage card; an oil that casts on a corpse (anointedCorpse): Anointing Oil's
//   Peaceful Rest, the spell module's cast, its undead rule a one-off line.
// Pure.

import { directDamagePlan } from "./direct-damage.js";
import { plainText } from "./rows.js";
import { listedSkillPick } from "./skill-pick.js";
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
    { sentences: [/^The shield's gears begin to spin, subtly adjusting the shield's position as you fight\.$/i, /^You gain an extra reaction this turn and at the start of each of your turns for the next minute that you can use only to Shield Block\.$/i], label: "Extra reaction", text: "One more reaction now and again as each of its turns starts, for Shield Block only.", duration: () => MINUTE },
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

// --- Its user's own feat, the immunity after it changed ----------------------------------------------------------------------------------------

// (Battle Medic's Baton's "You use Battle Medicine. The target is temporarily immune to your Battle Medicine for 1 hour instead of 1 day": the feat
// its user's own, from its sheet — a line of the card —; the immunity a note Effect on the creature its user targets for that hour.)
const USES_FEAT = /^You use (Battle Medicine)\.$/i;
const FEAT_IMMUNE = /^The target is temporarily immune to your (Battle Medicine) for (\d+) (hours?|minutes?) instead of 1 day\.$/i;
function withFeatImmunity(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!matches([USES_FEAT, FEAT_IMMUNE], sentences)) return plan;
    const [, feat, value, unit] = FEAT_IMMUNE.exec(sentences[1]);
    const base = keptBase(plan, item, { activation, index });
    const duration = { mode: "fixed", value: Number(value), unit: `${unit.toLowerCase().replace(/s$/, "")}s`, expiry: "turn-start", anchor: "effect-start" };
    const card = ownCard({ ...base, targeting: { target: "1 creature", range: null, area: null }, item: { ...base.item, recipient: "targets" } }, { noteEffects: [{ label: `Immune to ${feat}`, text: `Immune to the baton user's ${feat} for ${value} ${unit.toLowerCase()} (not a day).`, duration }] }, [`Its user uses ${feat} on the creature targeted: the feat's own action, from its sheet. This card gives the creature its shorter immunity.`]);
    return { ...card, noteOnly: undefined };
}

// --- A skill picked on the card --------------------------------------------------------------------------------------------------------------

// (Possibility Tome's Skim: the skill its user picks, the card's picker (plan.item.skillPick, src/compiler/skill-pick.js listedSkillPick): +3 item to
// Recall Knowledge with it and its critical failure a failure, for 24 hours; the Interact perusing the book before each check its user's own, the
// pages its own sight only, and their end when it's activated again, lines of the card.)
const SKIMS = /^As you flip through the book, you think about a broad topic you want to know more about\.$/i;
const PAGES = /^The book's pages fill with information about that skill, though only you can see the information\.$/i;
function withSkimmed(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const pick = listedSkillPick(sentences);
    if (!pick || !sentences.every((sentence) => SKIMS.test(sentence) || PAGES.test(sentence) || pick.said.includes(sentence))) return plan;
    const { said, ...skillPick } = pick;
    const base = keptBase(plan, item, { activation, index });
    const lines = [`Before each ${pick.only} with the skill, its user spends an Interact perusing the book (its own action); only it can see the pages.`, "A Lore picked: the bonus is for that one Lore only, though the Effect gives it to every Lore check.", "Activated again, the old pages are gone: delete the last Effect."];
    return { ...ownCard({ ...base, item: { ...base.item, skillPick } }, {}, lines), noteOnly: undefined };
}

// --- A result "as though by" another action's -----------------------------------------------------------------------------------------------

// (Self-Emptying Pocket's Beguiling Presence, "On a success, the creature is affected as though by a successful Deception check to Create a
// Diversion": that action's success row, the ability module's compiled one (options.basicActions), on its success and critical success; "The entity
// that holds your contract can influence this performance as well" the GM's call on its check — the item's own +2 or −2 — a line of the card.)
const AS_THOUGH = /^\{target\} \(success\): the creature is affected as though by a successful \w+ check to (?:\[\[\/act )?([a-z-]+)(?:\]\])?$/i;
const INFLUENCE = /\bThe entity that holds your contract can influence this performance as well\./;
const INFLUENCED = /\bIf they influence your performance favorably, you gain a \+(\d+) item bonus to your Performance check\. If they influence your performance unfavorably, you take a -(\d+) item penalty to your Performance check\./;
export function withAsThough(plan, html, item, options = {}) {
    const success = plan?.resolution?.outcomes?.success;
    const line = (success?.manualInstructions ?? []).map((entry) => [entry, AS_THOUGH.exec(String(typeof entry === "string" ? entry : entry?.text ?? "").trim())]).find(([, match]) => match);
    const basic = line ? options.basicActions?.[line[1][1]] : null;
    const row = basic && !basic.builtin ? basic.resolution?.outcomes?.success : null;
    if (!row) return plan;
    const given = (own) => ({ ...own, effects: [...(own?.effects ?? []), ...structuredClone(row.effects ?? [])], ...(row.modifiers?.length ? { modifiers: [...(own?.modifiers ?? []), ...structuredClone(row.modifiers)] } : {}) });
    const { manualInstructions, ...kept } = success;
    const left = manualInstructions.filter((entry) => entry !== line[0]);
    const outcomes = { ...plan.resolution.outcomes, success: given({ ...kept, ...(left.length ? { manualInstructions: left } : {}) }), criticalSuccess: given(plan.resolution.outcomes.criticalSuccess) };
    const whole = plainText(item?.system?.description?.value);
    const influenced = INFLUENCE.test(plainText(html)) ? INFLUENCED.exec(whole) : null;
    const notes = [...(plan.notes ?? []), ...(influenced ? [`The entity holding the contract may influence it: a +${influenced[1]} item bonus or a -${influenced[2]} item penalty to the Performance check (the GM's call).`] : [])];
    const rest = left.length || (plan.unread ?? []).length || (INFLUENCE.test(plainText(html)) && !influenced) || Object.entries(outcomes).some(([degree, entry]) => degree !== "success" && (entry?.manualInstructions ?? []).length);
    return { ...plan, resolution: { ...plan.resolution, outcomes }, ...(notes.length ? { notes } : {}), ...(plan.partial && !rest ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// --- A mode picked on the card -----------------------------------------------------------------------------------------------------------------

// (Magnetic Suit's attract or repel for 10 minutes, the ways card's two buttons: its user's Effect with PF2e's rules — toggles for what PF2e can't
// tell, an attack with a metal weapon and a metal object climbed (as Magnetic Shield's), and the creature's own metal trait for Grapple and
// Shove; attracting, the allies within its emanation an Effect of their own after it (plan.again, the presser's targets): their bonus against
// metal weapons while near its user.)
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
const bonus = (selector, value, predicate, label) => ({ key: "FlatModifier", selector, type: "status", value, predicate, label });
const SUIT = [
    /^Activate\b.*?\bThis magnetized suit is strapped to your body over your armor or clothes\.$/i,
    /^When you Activate it, you must choose whether to set it to attract or repel\.$/i,
    /^After being activated, the suit provides the listed benefits for the chosen activation type for (\d+) minutes before the magnets burn out and the suit becomes useless\.$/i,
    /^While set to attract, you take a -(\d+) status penalty to your AC against attacks made by metal weapons, while allies within a (\d+)-foot emanation gain a \+(\d+) status bonus to their AC\.$/i,
    /^If set to repel, you gain a \+(\d+) status bonus to AC against attacks made with metal weapons\.$/i,
    /^While attracting metal, you gain a \+(\d+) status bonus to Athletics checks to Climb metal objects and Grapple metal creatures and a -(\d+) status penalty to Athletics checks to Shove metal creatures\.$/i,
    /^While repelling metal, you gain a \+(\d+) status bonus to Athletics checks to Shove metal creatures, but you take a -(\d+) status penalty to Climb metal objects and Grapple metal creatures\.$/i
];
function magneticSuit(sentences, own, item) {
    if (!matches(SUIT, sentences)) return null;
    const said = SUIT.map((pattern, at) => pattern.exec(sentences[at]));
    const minutes = Number(said[2][1]);
    const [, attractAC, radius, alliesAC] = said[3].map(Number);
    const repelAC = Number(said[4][1]);
    const [, attractBonus, attractPenalty] = said[5].map(Number);
    const [, repelBonus, repelPenalty] = said[6].map(Number);
    const slug = sluggify(item?.name ?? "magnetic suit");
    const weapon = `${slug}-metal-weapon`;
    const object = `${slug}-metal-object`;
    const lasts = { mode: "fixed", value: minutes, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
    const metal = (action) => [`action:${action}`, "target:trait:metal"];
    const climbing = ["action:climb", object];
    const attract = { label: "Attracting metal", text: `−${attractAC} status penalty to AC against attacks with metal weapons (its toggle on against one); +${attractBonus} status bonus to Athletics checks to Climb metal objects (its toggle on for one) and to Grapple metal creatures, −${attractPenalty} status penalty to Shove metal creatures. Allies within ${radius} feet get +${alliesAC} status bonus to AC against metal weapons (their own card follows).`, duration: lasts, rules: [toggle(weapon, "Attacked with a metal weapon"), toggle(object, "Climbing a metal object"), bonus("ac", -attractAC, [weapon], item.name), bonus("athletics", attractBonus, climbing, item.name), bonus("athletics", attractBonus, metal("grapple"), item.name), bonus("athletics", -attractPenalty, metal("shove"), item.name)] };
    const repel = { label: "Repelling metal", text: `+${repelAC} status bonus to AC against attacks with metal weapons (its toggle on against one); +${repelBonus} status bonus to Athletics checks to Shove metal creatures, −${repelPenalty} status penalty to Climb metal objects (its toggle on for one) and to Grapple metal creatures.`, duration: lasts, rules: [toggle(weapon, "Attacked with a metal weapon"), toggle(object, "Climbing a metal object"), bonus("ac", repelAC, [weapon], item.name), bonus("athletics", repelBonus, metal("shove"), item.name), bonus("athletics", -repelPenalty, climbing, item.name), bonus("athletics", -repelPenalty, metal("grapple"), item.name)] };
    const near = `${slug}-drawn`;
    const allies = { label: "Metal drawn away", text: `+${alliesAC} status bonus to AC against attacks with metal weapons (its toggle on against one), while within ${radius} feet of the suit's wearer, who draws them.`, duration: lasts, rules: [toggle(near, "Attacked with a metal weapon"), bonus("ac", alliesAC, [near], item.name)] };
    const none = { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] };
    const alliesPlan = { ...own, automation: { level: "automatic" }, targeting: { target: "your allies in the area", range: null, area: { type: "emanation", value: radius } }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none, success: { ...none, noteEffects: [allies] }, failure: none, criticalFailure: none } }, allyArea: true };
    // (The ways card shows no notes of its own: each way's card says it.)
    const spent = `After its ${minutes} minutes the magnets burn out and the suit is useless.`;
    const ways = [
        { name: "Attract", html: "", plan: { ...ownCard(own, { noteEffects: [attract] }, [`Its allies within ${radius} feet: target them on the card that follows.`, spent]), again: { plan: alliesPlan, later: false } } },
        { name: "Repel", html: "", plan: ownCard(own, { noteEffects: [repel] }, [spent]) }
    ];
    return { ...own, builtin: "ways", automation: { level: "automatic" }, ways, once: true };
}

// (Captivating Score's emotion, positive or negative, the ways card's two buttons: each the Will save of the creatures that hear it (the presser's
// targets), a failure's attitude a note Effect on it for the hour — the user's ruling for minds; composing it, its subject and its instrument lines
// of the card.)
const SCORE = [
    /^Activate\b.*?\bA captivating score is a piece of parchment prepared for musical notation, long enough for a short song\.$/i,
    /^You must be trained in (Performance) to properly compose this missive \(or trained in an appropriate Lore skill your GM allows\)\.$/i,
    /^You choose one of the emotions described below and write a musical composition to convey that emotion about a subject of your choice, typically a person or group\.$/i,
    /^When activated, the missive plays a note-perfect rendition of the inscribed score\.$/i,
    /^Each creature that can hear the score must succeed at a @Check\[(will)\|dc:(\d+)\] save or be influenced to feel the emotion you chose toward the subject of your composition\.$/i,
    /^This lasts for (\d+) (hours?|minutes?), typically returning the creature to its initial attitude unless new events have altered their attitude long-term\.$/i,
    /^Positive Your song engenders ([^.]+?), or a similar emotion\.$/i,
    /^An affected creature's attitude toward the subject (improves) by one step, such as from indifferent to friendly\.$/i,
    /^Negative Your song spurs ([^.]+?), or a similar emotion\.$/i,
    /^An affected creature's attitude toward the subject (worsens) by one step, such as from indifferent to unfriendly\.$/i,
    /^When composing this missive, you can add a small notation or illustration of a type of instrument\.$/i,
    /^If you do, the music sounds like that instrument, and if you didn't specify, it sounds vaguely like a recorder\.$/i,
    /^The choice of a louder instrument doesn't make the music carry farther\.$/i
];
function captivatingScore(sentences, own) {
    if (!matches(SCORE, sentences)) return null;
    const said = SCORE.map((pattern, at) => pattern.exec(sentences[at]));
    const [, statistic, dc] = said[4];
    const duration = { mode: "fixed", value: Number(said[5][1]), unit: /^hour/i.test(said[5][2]) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
    const swayed = (feeling, change, label) => ({ ...none(), noteEffects: [{ label, text: `It feels ${feeling} toward the score's subject: its attitude toward the subject ${change} by one step for ${duration.value} ${duration.unit}, then usually goes back to what it was unless new events changed it.`, duration }] });
    const save = (feeling, change, label) => ({
        ...own,
        automation: { level: "automatic" },
        targeting: { target: "each creature that can hear it", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: statistic.toLowerCase(), basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: swayed(feeling, change, label), criticalFailure: swayed(feeling, change, label) } },
        // (The ways card shows no notes of its own: each way's card says them.)
        notes: ["Target each creature that can hear it. Its subject (a person or group) is the one its user wrote it about.", `Composing it takes a user trained in ${said[1][1]} (or a Lore the GM allows). An instrument drawn on it makes the music sound like that one (else like a recorder), no louder.`]
    });
    const ways = [
        { name: "Positive", html: "", plan: save(said[6][1], said[7][1], "Swayed toward the subject") },
        { name: "Negative", html: "", plan: save(said[8][1], said[9][1], "Turned against the subject") }
    ];
    return { ...own, builtin: "ways", automation: { level: "automatic" }, ways, once: true };
}

// --- What a cast may find, its user's pick ------------------------------------------------------------------------------------------------------

// (Lion's Call's Find the Pride, "You cast Locate at 5th rank to learn the location of one of the following of your choice: …": the spell module's
// cast (src/compiler/cast-words.js), what it may look for a line of its card — Locate's own target its user's to name.)
const LOCATES = /^You cast Locate at \d+(?:st|nd|rd|th) rank to learn the location of one of the following of your choice: (.+)\.$/i;
function withLocateChoices(plan, { activation }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const found = plan?.builtin === "cast-spell" && sentences.length === 1 ? LOCATES.exec(sentences[0]) : null;
    if (!found || (plan.notes ?? []).length) return plan;
    return { ...plan, notes: [`What it looks for, its user's pick (Locate's target): ${found[1].replace(/\s+\./g, ".").replace(/\s+$/, "")}.`] };
}

// --- Its user's own arm, made solid ----------------------------------------------------------------------------------------------------------

// (Aether Appendage's first activation, no Effect heading: the arm corporeal until the end of its user's turn — to Strike and grasp objects, its
// own; kept so while it holds or wears an item, a line — and its unarmed Strikes magical, or with ghost touch when they're magical already: PF2e's
// AdjustStrike on its user's Effect (the trait added to unarmed attacks not magical yet, the rune to those that are). Every unarmed attack, as PF2e
// can't tell the arm's from its others: a line.)
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const SOLID = [
    /^You cause the arm to become corporeal until the end of your turn, allowing you to use it to make Strikes or grasp objects\.$/i,
    /^It remains corporeal if you're holding an item or it's wearing an item at the end of your turn\.$/i,
    /^Your unarmed attack Strikes made with the [\w' -]+? are magical\.$/i,
    /^If they're already magical, they instead gain the effect of the ghost touch property rune\.$/i
];
const UNARMED = "item:category:unarmed";
function withSolidArm(plan, { item, activation, index }) {
    const sentences = sentencesOf(plainText(activation.html).replace(/^Activate\s*(?:\([^)]*\))?\s*/, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    if (!matches(SOLID, sentences) || /\bEffect\b/.test(plainText(activation.html))) return plan;
    const rules = [
        { key: "AdjustStrike", mode: "add", property: "traits", value: "magical", definition: [UNARMED, { not: "item:trait:magical" }] },
        { key: "AdjustStrike", mode: "add", property: "property-runes", value: "ghostTouch", definition: [UNARMED, "item:trait:magical"] }
    ];
    const note = { label: "Corporeal arm", text: "The arm is corporeal until the end of its turn: it can Strike and grasp objects with it. Its unarmed Strikes are magical (with ghost touch, if they're magical already).", duration: THIS_TURN, rules };
    const lines = ["It stays corporeal past this turn while it holds or wears an item (keep the Effect then).", "PF2e can't tell the arm's unarmed attacks from its others': the Effect is for its Strikes with the arm."];
    return { ...ownCard(keptBase(plan, item, { activation, index }), { noteEffects: [note] }, lines), noteOnly: undefined };
}

// --- A spell's effects, changed -----------------------------------------------------------------------------------------------------------------

// (Spectacles of Understanding: "you gain the effects of 2nd-rank Translate for one hour except that it applies to all languages you see rather than a
// single language, and it does not apply to language you hear" — the spell changed past what its cast plays: a note Effect for the hour on its user,
// the user's ruling for languages, in place of the cast.)
const TRANSLATES = /^Unfolding the spectacles onto the bridge of the nose, you gain the effects of 2nd-rank Translate for (one|an?|\d+) (hours?|minutes?) except that it applies to all languages you see rather than a single language, and it does not apply to language you hear\.$/i;
function withSeenLanguages(plan, { item, activation, index }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const read = sentences.length === 1 ? TRANSLATES.exec(sentences[0]) : null;
    if (!read) return plan;
    const value = /^\d+$/.test(read[1]) ? Number(read[1]) : 1;
    const duration = { mode: "fixed", value, unit: /^hour/i.test(read[2]) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const { builtin, spell, rank, dc, attack, tradition, self, area, targets, partial, notes, ...rest } = plan ?? {};
    const note = { label: "Reading every language", text: "It understands every language it sees written (as 2nd-rank Translate, for all of them at once), but not speech it hears.", duration };
    return { ...ownCard(keptBase(rest, item, { activation, index }), { noteEffects: [note] }), noteOnly: undefined };
}

// --- A note that burns, an oil on a corpse ----------------------------------------------------------------------------------------------------

// (Self-Immolating Note's 1 fire damage to whoever holds it as it catches fire, 5 minutes after it's opened: the damage card at the creature its
// user targets (the holder), pressed then — when, its secret society and its envelope lines of the card.)
const IMMOLATES = [
    /^Activate\b.*?\bThis paper is crafted with an unusual formula, causing it to catch fire and self-immolate (\d+) minutes after being exposed to the air\.$/i,
    /^The item activates automatically when the envelope is opened, which typically takes an Interact action\.$/i,
    /^Anyone holding the note when it catches fire takes (\d+) (fire) damage\.$/i,
    /^Often, these notes are given as practical jokes or threats, but secret societies find them quite useful when sharing information about upcoming meetings or any other relevant news\.$/i,
    /^These letters must be written in haste and require the use of their accompanying envelopes, which prevent air from interacting with the paper until the envelope's seal is broken\.$/i
];
function burningNote(sentences, own) {
    if (!matches(IMMOLATES, sentences)) return null;
    const minutes = Number(IMMOLATES[0].exec(sentences[0])[1]);
    const [, amount, type] = IMMOLATES[2].exec(sentences[2]);
    const plan = directDamagePlan(`The target takes ${amount} ${type} damage.`, own);
    if (!plan) return null;
    return { ...plan, targeting: { target: "the creature holding it", range: null, area: null }, notes: [`It catches fire ${minutes} minutes after its envelope is opened (an Interact): target whoever holds it then and press Apply.`, "Written in haste, it needs its own envelope, which keeps the air off until the seal is broken."] };
}

// (Anointing Oil's "Applying anointing oil to a corpse casts Peaceful Rest on it. The effects last for 24 hours": the spell module's cast at the
// corpse its user targets; what undead touching it suffer, its one-off line — src/compiler/one-offs.js. 2026-10-28: the greater oil's "casts
// a 5th-rank Peaceful Rest on it", at that rank; its Knights' funerary rites flavor.)
const ANOINTS = /^Applying [\w' -]+? to a corpse casts (?:an? (\d+)(?:st|nd|rd|th)-rank )?(Peaceful Rest) on it\.$/i;
const ANOINT_FLAVOR = [/^Carried by many\b/i, /^The funerary rites of the Knights of Lastwall sometimes include\b/i];
function anointedCorpse(sentences, own, item, options) {
    const at = sentences.findIndex((sentence) => ANOINTS.test(sentence));
    const cast = at >= 0 ? ANOINTS.exec(sentences[at]) : null;
    const spell = cast ? options.spells?.[cast[2].toLowerCase()] : null;
    if (!spell) return null;
    const lasts = /^The effects last for (\d+) (hours?|days?)\.$/i.exec(sentences[at + 1] ?? "");
    const rest = sentences.filter((sentence, index) => index !== at && !(lasts && index === at + 1) && !ANOINT_FLAVOR.some((pattern) => pattern.test(sentence)));
    return { ...own, builtin: "cast-spell", automation: { level: "guided" }, targeting: { target: "the corpse", range: "touch", area: null }, spell: { uuid: spell.uuid, name: spell.name }, rank: cast[1] ? Number(cast[1]) : spell.rank, dc: null, attack: null, tradition: null, self: false, notes: [...(lasts ? [`Its effects last ${lasts[1]} ${lasts[2].toLowerCase()}.`] : []), ...rest], area: false, targets: true, partial: true };
}

// --- The readers ---------------------------------------------------------------------------------------------------------------------------------

const READERS = [withEntrenched, withNoteRule, withFeatImmunity, withSkimmed, withLocateChoices, withSolidArm, withSeenLanguages];

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
export function withUserActionsUse(plan, item, { base, info, options = {} }) {
    const sentences = sentencesOf(plainText(item?.system?.description?.value).replace(/\s*\bCraft Requirements\b.*$/s, ""));
    const own = { ...base, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, item: info };
    const picked = magneticSuit(sentences, own, item) ?? captivatingScore(sentences, own) ?? burningNote(sentences, own) ?? anointedCorpse(sentences, own, item, options);
    if (picked) return picked;
    const note = noteRuleOf(sentences);
    if (!note) return plan;
    return ownCard(own, { noteEffects: [note] });
}
