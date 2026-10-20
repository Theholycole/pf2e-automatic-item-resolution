// An item whose use is a Strike with riders (Fear Gem's "make a melee Strike. If you hit and deal damage, the target is
// Frightened 1, or Frightened 2 on a critical hit"; Duelist's Beacon's "Attempt a melee Strike … On a hit, the target
// must succeed at a DC 22 Fortitude save or be Dazzled"), or with more damage or a bonus (Mantle of the Tikbalang's "This
// Strike deals an additional 4d6 mental damage", src/compiler/strike-damage.js): the bombs' readers (src/compiler/bombs.js)
// on its text. The plan is the core's save family with the Strike as its roll, like a bomb's: live play readies the
// user's next Strike (scripts/strikes.js) and takes the degree PF2e rolls. PF2e's own Strike deals the damage, with the
// extra dice the readied Strike's Effect gives it. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { bombSave, hasRow, hitRiders } from "./bombs.js";
import { plainText } from "./rows.js";
import { readStrikeExtras } from "./strike-damage.js";
import { itemActionPlan } from "./item-actions.js";
import { directDamagePlan } from "./direct-damage.js";
import { hitNotes } from "./hit-notes.js";

// "make a melee Strike", "make a weapon or unarmed attack Strike", "make a ranged or melee Strike", "attempt a Strike" (not
// a creature's own, "makes a beak Strike with a +8 modifier").
// (And a shield bash, Jawbreaker Shield's "You make a shield bash Strike as a reaction against the attacker".)
const STRIKE = /\b(?:make|makes|attempt|attempts) an? ((?:(?:melee|ranged|unarmed|weapon|thrown|single|or|attack|shield bash) ){0,4})Strike\b/i;
// "You Strike the creature you are grappling", "Make two unarmed Strikes", "the next successful Strike you make with it",
// a trigger's hit ("Trigger You … successfully Strike your target Effect …").
const YOU_STRIKE = /\bYou Strike (?:the|a|an|with)\b/;
const TWO = /\bMake two (unarmed )?Strikes\b/i;
const NEXT = /\bthe next (successful )?(?:(melee|ranged) )?Strike you make\b/i;
const TRIGGER_HIT = /\bTrigger\b(?:(?!\bEffect\b).)*?\b(?:successfully Strike|hit (?:\w+ )?with a Strike|Strike hits)\b(?:(?!\bEffect\b).)*\bEffect\b/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const sentenceOf = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];

// Its range from the words before "Strike": "melee", "ranged", "unarmed" (and "melee" for "a melee weapon or unarmed attack").
function rangeOf(words) {
    const said = String(words ?? "").toLowerCase();
    if (/\bmelee\b/.test(said) && !/\branged\b/.test(said)) return "melee";
    if (/\branged\b/.test(said) && !/\bmelee\b/.test(said)) return "ranged";
    return null;
}

// The text's Strike: { range, unarmed, after, sentence, next, uses, hit } — after, the text from that Strike on; next, a
// "next Strike" (its own damage counts, "successful" in missKeeps); uses, how many Strikes it's for; hit, a trigger's
// Strike that already hit — or null. Not one of several Strikes ("Make up to four Strikes", "make a Strike against each
// creature in the area"), nor one it makes for you with its own modifier (an item's attack, "with an attack modifier of +14").
// (A talisman's, with no Effect heading: Blessed Ampoule's "Trigger Your Strike with the affixed weapon hits a target Requirements …
// When activated, the weapon's physical damage for the Strike becomes spirit damage" — what follows its Requirements.)
const TALISMAN_HIT = /\bTrigger\s+(?:Your Strike with the affixed weapon hits an? (?:target|creature)|You hit an? (?:target|creature) with an? (?:melee |ranged )?Strike with the affixed weapon|You succeed at a Strike with the affixed weapon)\b(?:\s+Requirements\b[^.]*\.)?/i;
export function readStrike(text) {
    const triggered = TRIGGER_HIT.exec(text) ?? TALISMAN_HIT.exec(text);
    if (triggered) {
        const after = text.slice(triggered.index + triggered[0].length).trim();
        return { range: null, unarmed: false, after, sentence: sentenceOf(after), next: false, missKeeps: false, uses: 1, hit: true };
    }
    const found = [["make", STRIKE.exec(text)], ["you", YOU_STRIKE.exec(text)], ["two", TWO.exec(text)], ["next", NEXT.exec(text)]].filter(([, match]) => match).sort((a, b) => a[1].index - b[1].index)[0];
    if (!found) return null;
    const [kind, match] = found;
    // (From the start of its sentence — "All non-magical light sources … are extinguished, and the next melee Strike …" —
    // or, when it's a trigger's ("Trigger You Strike a creature that has the Off-Guard condition … Effect You deal …"), its effect.)
    const trigger = text.lastIndexOf("Trigger", match.index);
    const effect = text.indexOf("Effect", match.index);
    const inTrigger = trigger >= 0 && trigger > text.lastIndexOf("Effect", match.index) && effect > match.index && !/[.!?]/.test(text.slice(match.index, effect));
    let start = match.index;
    if (inTrigger) start = effect + "Effect".length;
    else for (const stop of text.slice(0, match.index).matchAll(/[.!?]\s+|\bEffect\s+/g)) start = stop.index + stop[0].length;
    const after = text.slice(start).trim();
    const sentence = inTrigger ? sentenceOf(after) : sentenceOf(text.slice(match.index));
    if (kind !== "two" && /\b(?:against each|each (?:against|at) a different|up to \w+ Strikes|two Strikes|Strikes? with an attack modifier|attack modifier of|with an? [+-]\d+ (?:attack )?modifier|with a [+-]\d+ to hit)\b/i.test(sentence)) return null;
    // ("You Strike the creature you are grappling with a melee weapon or unarmed attack": the words after it.)
    const words = kind === "you" ? sentence : kind === "next" ? match[2] : match[1];
    const unarmed = kind === "two" ? Boolean(match[1]) : /\bunarmed\b/i.test(words ?? "") && !/\b(?:weapon|melee)\b/i.test(words ?? "");
    return {
        // (Its range after the word, Tasset of Flexibility's "Make a Strike with a melee weapon".)
        range: unarmed ? null : rangeOf(words) ?? (kind === "make" && !String(words ?? "").trim() ? /^Strike with an? (melee|ranged) weapon\b/i.exec(sentence.slice(sentence.search(/\bStrike\b/)))?.[1]?.toLowerCase() ?? null : null),
        unarmed,
        after,
        sentence,
        next: kind === "next",
        missKeeps: kind === "next" && Boolean(match[1]),
        uses: kind === "two" ? 2 : 1,
        hit: false
    };
}

// How long a readied Strike waits: "this turn" (an activation's own Strike), "before the end of your next turn", "within
// the next minute".
function untilOf(text) {
    if (/\bbefore the end of your next turn\b/i.test(text)) return "next-turn-end";
    if (/\bwithin the next minute\b/i.test(text)) return "minute";
    return "turn-end";
}

// The item (or an activation's block as its description) → its Strike plan, or null when no rider, save or extra is read.
// Activated ammunition's hit, in its words (Antler Arrow's "When an activated antler arrow hits a target, …", Rattling
// Bolt's "A target damaged by the rattling bolt must …", Fairy Bullet's "On a successful Strike, …"): the bombs' "On a hit"
// form, so their readers take it.
const AMMO_HITS = [
    [/\b(?:When|Once|After) (?:an? |the )?(?:activated )?[\w' -]{1,40}? (?:hits|strikes) (?:a|the|its) (?:target|creature)(?:, which can be a square)?,\s*/gi, "On a hit, "],
    [/\bOnce it hits the target, /gi, "On a hit, "],
    [/\bWhen you hit a target with (?:this|an activated) [\w' -]{1,30}?, /gi, "On a hit, "],
    [/\bOn a successful Strike, /gi, "On a hit, "],
    [/\bA (?:creature|target) (?:hit|struck|damaged) by (?:an? |the )?(?:activated )?[\w' -]{1,40}? (?=must|is|takes|becomes)/gi, "On a hit, the target "],
    // ("It deals bludgeoning damage instead of its normal damage type and pushes the target 5 feet on a successful hit": the hit's
    // clause at the end of its sentence.)
    [/(^|[.!?]\s+)((?:It|The (?:ammunition|target|creature))\b[^.]*?) on a successful (?:hit|Strike)\./g, "$1On a hit, $2."]
];
const AMMUNITION = { arrow: "arrows", arrows: "arrows", bolt: "bolts", bolts: "bolts", "sling bullet": "sling-bullets", "sling bullets": "sling-bullets", round: "rounds", rounds: "rounds", bullet: "sling-bullets" };
const isAmmo = (item) => item?.type === "ammo" || (item?.system?.traits?.value ?? []).includes("ammunition");
function ammoStrike(text) {
    // (The Strike that fires it, not only its hit: Weapon Shot's "For the Strike with which you consume the ammunition, the
    // weapon is a +1 striking weapon …" — its runes for that Strike's attack and damage, src/compiler/strike-damage.js.)
    const firing = /\bFor the Strike with which you consume the ammunition, /i.exec(text);
    if (firing) return { range: "ranged", unarmed: false, after: text.slice(firing.index), sentence: null, next: false, missKeeps: false, uses: 1, hit: false, ammo: true };
    let after = text;
    for (const [pattern, replacement] of AMMO_HITS) after = after.replace(pattern, replacement);
    if (!/\bOn a hit\b/.test(after)) return null;
    return { range: "ranged", unarmed: false, after: after.replace(/^.*?\b(?=On a hit\b)/s, ""), sentence: null, next: false, missKeeps: false, uses: 1, hit: false, ammo: true };
}

// Ammunition's save is the target's own: in its hit's sentence, or a sentence on the target or the creature hit — not one
// for others ("Each creature standing on the icy surface must …") nor one under a condition ("If the target takes vitality
// damage, it must …").
function ammoSave(after) {
    const saving = after.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\b(?:save|saving throw)\b|@Check\[(?:fortitude|reflex|will)/i.test(sentence));
    // (Others': no. A condition's — "If the target takes vitality damage, it must …" — only beside the target's own save,
    // as a critical hit's change to it: "If the Strike was a critical success, the target takes a -2 penalty to its save".)
    if (saving.some((sentence) => /^(?:Each|All|Any|Creatures?)\b/.test(sentence))) return false;
    return saving.filter((sentence) => !/^(?:If|When|Whenever)\b/.test(sentence)).some((sentence) => /^(?:On a hit,|(?:the (?:target|struck creature|creature|foe)|it)\b)/i.test(sentence));
}

// A PF2e ammunition item's own damage rules ("{item|id}-ranged-damage"): its extra dice are PF2e's already.
const pf2eDamage = (item) => (item?.system?.rules ?? []).some((rule) => ["DamageDice", "FlatModifier"].includes(rule?.key) && /damage/.test([].concat(rule.selector ?? []).join(" ")));

// A spell cast at the creature the Strike hits: Tiger's Claw's "If you successfully deal damage to your target, the target is
// also affected by a 4th-rank Vision of Death with a spell DC of 28", Stone Bullet's "A creature hit by an activated stone
// bullet is subject to the effects of a 6th-rank Petrify spell (DC 34 Fortitude)". strike.cast { uuid, name, rank, dc }: on a
// hit, the spell module casts it (api.castFromItem) at that creature, its own save at the item's DC. A save of the item's own
// first — Silencing Shot's "… unless it succeeds at a @Check[will|dc:25] save" — is castFromItem's saveFirst; the hit in place
// of the spell's attack — Disintegration Bolt's "subject to a Disintegrate spell requiring a … save" — its attackDegree, the
// Strike's own degree.
// (Also Fairy Bullet's "On a successful Strike, a fairy bullet casts Revealing Light (DC 23)", and Silencing Ammunition's "creates
// a 2nd-rank Silence effect on the target. The target can resist the effects of the ammunition with a successful … will save":
// its saveFirst.)
const CAST_ON_HIT = /\bis (?:also )?(?:subject to|affected by) (?:the effects of )?an? (?:(\d+)(?:st|nd|rd|th)-rank )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\}(?: spell)?([^.]*)/i;
// (And Devil's Trident's "On a hit, the trident casts 3rd-rank Paralyze on the target (DC 25)".)
const CASTS_ON_HIT = /\bOn a (?:successful Strike|hit), (?:an? |the )?[^.]*?\b(?:casts|creates) (?:an? ?)?(?:(\d+)(?:st|nd|rd|th)-rank )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\}(?: effect on the target| spell)?([^.]*\.(?:\s*The target can resist the effects[^.]*)?)/i;
export function castOnHit(html) {
    const match = CAST_ON_HIT.exec(String(html ?? "")) ?? CASTS_ON_HIT.exec(String(html ?? "").replace(/<\/?em>/g, "").replace(/\bcasts (@UUID)/, "casts a $1"));
    if (!match) return null;
    const dc = /\bspell DC of (\d+)|@Check\[\w+\|dc:(\d+)|\(DC (\d+)\)/i.exec(match[4]);
    const unless = /\bunless it succeeds at an? @Check\[(fortitude|reflex|will)\|dc:(\d+)|\bThe target can resist the effects[^.]*? with a successful @Check\[(fortitude|reflex|will)\|dc:(\d+)/i.exec(match[4]);
    const requiring = /\brequiring an? @Check\[(?:fortitude|reflex|will)\|dc:\d+/i.test(match[4]);
    return {
        uuid: match[2],
        name: match[3],
        rank: match[1] ? Number(match[1]) : null,
        dc: unless ? null : dc ? Number(dc[1] ?? dc[2] ?? dc[3]) : null,
        ...(unless ? { saveFirst: { statistic: (unless[1] ?? unless[3]).toLowerCase(), dc: Number(unless[2] ?? unless[4]) } } : {}),
        ...(requiring ? { attackFromHit: true } : {})
    };
}

// Ammunition whose damage takes the place of its weapon's, by the attack's degree: Big Rock Bullet's "The target takes
// @Damage[4d6[bludgeoning]] damage on a successful hit. Even on a failed attack roll (but not a critical failure), the target
// takes @Damage[2d6[bludgeoning]] damage" — read as in place of the sling's damage. strike.instead { hit, failure }, each
// { formula, type }: live play rolls it at the target on the ability module's card (a critical hit doubles it, as the Strike's
// damage), and the weapon's own damage isn't rolled. Its other sentences are notes.
const INSTEAD = /\bThe target takes @Damage\[\(?(\d+d\d+(?:\+\d+)?)\)?\[(\w+)\]\] damage on a successful hit\.\s*Even on a failed attack roll \(but not a critical failure\), the target takes @Damage\[\(?(\d+d\d+(?:\+\d+)?)\)?\[(\w+)\]\] damage\.\s*/i;
function insteadPlan(item, base) {
    const text = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const match = INSTEAD.exec(text);
    if (!match) return null;
    // (After the activation's lines, what it does besides: Catch Rock's reaction against it.)
    const body = text.slice(match.index + match[0].length).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s*\bCraft Requirements\b.*$/s, "");
    // (A reaction its target may have, "Creatures with the Catch Rock reaction can use it against a big rock bullet": that creature's — the card's
    // line, strike.requires, not a note.)
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const requires = sentences.filter((sentence) => /^Creatures with the [A-Z][\w ]+? reaction can use it against an? [\w' -]+?\.$/.test(sentence));
    const notes = sentences.filter((sentence) => !requires.includes(sentence) && /\b(?:reactions?|damage|save|bonus|penalty|conditions?|Strikes?)\b/i.test(sentence));
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess", "failure"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() }
        },
        strike: { range: "ranged", save: null, ammo: true, instead: { hit: { formula: match[1], type: match[2].toLowerCase() }, failure: { formula: match[3], type: match[4].toLowerCase() } }, uses: 1, until: "turn-end", missKeeps: false, ...(requires.length ? { requires } : {}), notes },
        ...(notes.length ? { partial: true } : {})
    };
}

// A maneuver after the Strike's hit: Iron Cube's "If it hits and deals damage, you can attempt an Athletics check to Trip the creature you
// hit. If this knocks the target Prone, the target takes 2d6 bludgeoning damage from the force of the impact", Serpent's Lash's "If you
// hit and deal damage, you also Reposition the creature 5 feet (10 feet on a critical hit)": strike.follow, the item-action plan of that
// maneuver (src/compiler/item-actions.js, PF2e's own action and the ability module's rows), with what its success adds — live play
// posts its card after the hit. What else the text says about it is the follow's notes.
const MANEUVERS = "Trip|Shove|Grapple|Disarm|Reposition";
const FOLLOW = new RegExp(String.raw`\bIf (?:it|you) hits? and deals? damage, you (?:can attempt an Athletics check to|also) (?:@UUID\[[^\]]*\]\{(${MANEUVERS})\}|\[\[\/act (${MANEUVERS.toLowerCase()})\b[^\]]*\]\](?:\{[^}]*\})?|(${MANEUVERS}))`, "i");
const PRONE_DAMAGE = /\bIf this knocks the target (?:@UUID\[[^\]]*\]\{)?Prone\}?, the target takes @Damage\[(\d+d\d+)\[(\w+)\]\] damage\b/i;
function followOf(html, base, options) {
    const match = FOLLOW.exec(String(html ?? ""));
    if (!match) return null;
    const name = (match[1] ?? match[2] ?? match[3]).toLowerCase();
    const plan = itemActionPlan(`<p>You attempt to ${name.charAt(0).toUpperCase()}${name.slice(1)} the creature.</p>`, base, options);
    if (!plan?.action) return null;
    const prone = PRONE_DAMAGE.exec(String(html ?? ""));
    const damage = prone ? directDamagePlan(`The target takes ${prone[1]} ${prone[2].toLowerCase()} damage.`, { ...base, activation: base.activation ?? null }) : null;
    const after = plainText(String(html ?? "").slice(match.index + match[0].length)).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    // (The rest of its own sentence, Serpent's Lash's "the creature 5 feet (10 feet on a critical hit)": with the maneuver's name.)
    if (after[0] && /^[a-z]/.test(after[0])) after[0] = `${name.charAt(0).toUpperCase()}${name.slice(1)} ${after[0]}`;
    const notes = after.filter((sentence) => sentence && !/^If this knocks the target Prone\b/i.test(sentence) && /\b(?:feet|penalty|free hand|requirement|feat|attacks?|damage)\b/i.test(sentence)).slice(0, 4);
    return { ...plan, action: { ...plan.action, ...(damage ? { damage: { success: damage, criticalSuccess: damage } } : {}) }, ...(notes.length ? { notes } : {}) };
}

export function compileStrike(item, base, options = {}) {
    const html = String(item?.system?.description?.value ?? "");
    if (isAmmo(item)) {
        const instead = insteadPlan(item, base);
        if (instead) return instead;
    }
    // ("This Strike deals an additional 2d6 precision damage, and on a hit, the creature is Clumsy 1": the rider its own sentence.)
    // (And Devil's Trident's "If the Strike was a critical hit, the target is Stunned 1 even if it critically succeeds at the save": the
    // critical hit's rider, whatever the cast's save.)
    const text = plainText(html).replace(/,? and on a hit, /gi, ". On a hit, ").replace(/\bIf the Strike was a critical hit, (the target is [^.]+?) even if it critically succeeds at the save\./g, "On a critical hit, $1.");
    // (Activated ammunition: its hit is the next ranged Strike's with it. A consumable that's ammunition only in its words —
    // Roc-Shaft Arrow's "Ammunition arrow" line, which PF2e can't load — is its user's next ranged Strike.)
    const wordsOnly = !isAmmo(item) && /^\s*Ammunition (?:arrows?|bolts?|bullets?|sling bullets?|rounds?|any)\b/i.test(text);
    const found = isAmmo(item) || wordsOnly ? ammoStrike(text) : readStrike(text);
    // (The ammunition its weapon fires, by PF2e's weapon ammo.baseType — "arrows", "bolts", "sling-bullets", "rounds…" — so a
    // reader knows which weapons it's for; "any" names none.)
    const kinds = wordsOnly ? (/^\s*Ammunition ([a-z ,]+?)(?= Activate\b|\.|$)/i.exec(text)?.[1] ?? "").toLowerCase().split(/,\s*|\s+or\s+/).map((kind) => AMMUNITION[kind.trim()]).filter(Boolean) : [];
    const strike = found && wordsOnly ? { ...found, ammo: false, next: true, wordsAmmo: true, ...(kinds.length ? { ammunition: kinds } : {}) } : found;
    if (!strike) return null;
    let riders = hitRiders(strike.after);
    // (A save for the creature the Strike hits: "On a hit, the target must succeed at a DC 22 Fortitude save or be Dazzled";
    // ammunition's, anywhere in what its hit does.)
    const hitSentence = strike.ammo ? ammoSave(strike.after) : /(?:On a hit|If (?:you|it|the Strike) hits?|If you hit and deal damage|If you successfully deal damage)[^.]*\b(?:save|saving throw)\b|@Check\[(?:fortitude|reflex|will)/i.test(strike.after);
    let save = hitSentence ? bombSave({ ...item, system: { ...(item.system ?? {}), description: { value: html } } }, { scope: { scope: "target" } }) : null;
    const riderSentence = (sentence) => {
        const row = hitRiders(sentence);
        return hasRow(row.success) || hasRow(row.criticalSuccess) || Boolean(save && /^(?:On a hit|If (?:you|it|the Strike) hits?)\b[^.]*\b(?:save|saving throw)\b/i.test(sentence));
    };
    const cast = castOnHit(html);
    const follow = followOf(html, base, options);
    const read = readStrikeExtras(strike.after, { item, strikeSentence: strike.sentence, own: strike.next, riderSentence });
    // (The cast's own sentence isn't a note.)
    if (cast) read.notes = read.notes.filter((note) => !note.includes(cast.name) && !(cast.attackFromHit && /^As with the spell\b/i.test(note)));
    let extras = strike.ammo && pf2eDamage(item) ? { ...read, dice: [], read: Boolean(read.attack || read.alteration || read.runes) } : read;
    // (What a hit does that isn't a condition, a note Effect on the creature hit — its save's, or the hit's own with its time,
    // src/compiler/hit-notes.js: Blister Ammunition, Magekiller Bullet. Only when nothing else is read.)
    // (Not a Strike its trigger names, another creature's: Cauthooj Bagpipes' "Trigger A creature … attempts a melee Strike".)
    const othersStrike = !strike.ammo && /\bTrigger\b(?:(?!\bEffect\b).)*\bStrikes?\b/is.test(text);
    const noted = !hasRow(riders.success) && !hasRow(riders.criticalSuccess) && !save && !extras.read && !cast && !follow && !strike.hit && !othersStrike ? hitNotes(strike.after, base) : null;
    if (noted?.save) {
        save = noted.save;
        // (A critical hit's change the save can't hold — "increase the Fortitude DC by 2" — a note; a condition it adds, its row.)
        riders = { success: riders.success, criticalSuccess: hitRiders(noted.notes.map((note) => note.replace(/\bincrease the \w+ DC by \d+ \([^)]*\),?\s*(?:and\s+)?/i, "")).join(" ")).criticalSuccess };
        // (Its note's own sentences aren't the Strike card's notes too.)
        const said = noted.save.plan.resolution.outcomes.failure.noteEffects[0].text;
        extras = { ...extras, notes: [...extras.notes.filter((note) => !noted.notes.includes(note) && !said.includes(note)), ...noted.notes] };
    } else if (noted?.note) riders = { success: { ...riders.success, noteEffects: [noted.note] }, criticalSuccess: { ...riders.criticalSuccess, noteEffects: [noted.note] } };
    if (!hasRow(riders.success) && !hasRow(riders.criticalSuccess) && !save && !extras.read && !cast && !follow && !noted) return null;
    const anyRider = hasRow(riders.success) || hasRow(riders.criticalSuccess);
    // (A trigger's Strike that already hit — Spore Sap's "Trigger You successfully Strike a creature with the spore sap Effect
    // The target must succeed at a DC 28 Fortitude save …": its save is the plan, at the creature struck; its extra damage
    // waits for the damage roll; riders for a hit already rolled aren't read.)
    if (strike.hit) {
        if (extras.read) return anyRider || save ? null : strikePlan({ base, item, strike, riders, save, extras });
        return save && !anyRider ? { ...save.plan, source: base.source, rank: base.rank, traits: base.traits, activation: base.activation, targeting: { target: "the creature struck", range: null, area: null }, trigger: { event: "use" } } : null;
    }
    // (The maneuver after it: its own card, not the Strike's riders — Iron Cube's "If this knocks the target Prone" isn't the hit's.)
    const empty = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    if (follow) return strikePlan({ base, item, strike, riders: { success: empty(), criticalSuccess: empty() }, save, extras: { ...extras, notes: extras.notes.filter((note) => !(follow.notes ?? []).includes(note) && !FOLLOW.test(note) && !/^If this knocks the target Prone\b/i.test(note)) }, cast, follow });
    const plan = withOwnRuleDamage(withSaveOnly(strikePlan({ base, item, strike, riders, save, extras, cast }), text), item);
    // (A plan of hit notes alone: below any other reading, src/compiler/strikes.js strikeOver.)
    return noted && plan?.strike ? { ...plan, strike: { ...plan.strike, fromNotes: true } } : plan;
}

// (The save only for the creatures its damage harms: Gravebane Ammunition's "On a hit, a target with void healing must succeed at …" (its
// own words, src/compiler/item-data.js) — strike.saveOnly "void-healing", the creature hit checked before its save card (scripts/strikes.js).)
function withSaveOnly(plan, text) {
    if (!plan?.strike?.save || !/\bOn a hit, a target with void healing must succeed at\b/i.test(String(text ?? ""))) return plan;
    return { ...plan, strike: { ...plan.strike, saveOnly: "void-healing" } };
}

// (Damage its own PF2e rules add to the Strike that fires it, said in its words: Gravebane Ammunition's "the attack deals an additional 1d10
// vitality damage to creatures with void healing" — PF2e's DamageDice on its own Strike rolls it, so the sentence is the card's line, not a
// note: strike.ownRules.)
function withOwnRuleDamage(plan, item) {
    const notes = plan?.strike?.notes ?? [];
    if (!isAmmo(item) || !notes.length) return plan;
    const rules = (item?.system?.rules ?? []).filter((rule) => rule?.key === "DamageDice" && rule.dieSize);
    const own = (note) => rules.find((rule) => new RegExp(String.raw`\b(?:deals )?an additional ${rule.diceNumber ?? 1}${rule.dieSize} ${rule.damageType ?? "\\w+"} damage\b`, "i").test(String(note)));
    const said = notes.filter((note) => /^On a hit, the attack deals an additional \d+d\d+ \w+ damage(?: to creatures with [\w ]+)?\.$/i.test(String(note).trim()) && own(note));
    if (!said.length) return plan;
    const left = notes.filter((note) => !said.includes(note));
    const leftAll = [...left, ...(plan.notes ?? []), ...(plan.unread ?? [])];
    return { ...plan, strike: { ...plan.strike, notes: left, ownRules: said.map((note) => String(note).trim().replace(/^On a hit, the attack deals /i, "").replace(/\.$/, "")) }, ...(plan.partial && !leftAll.length ? { partial: undefined, automation: { level: "automatic" } } : {}) };
}

const CRITICAL_DC = /^On a critical hit, increase the (Fortitude|Reflex|Will) DC by (\d+) \((?:@Check\[[^\]]*\]|DC) ?(\d+)\)(?:, and the target is (Dazzled|Sickened|Frightened|Off-Guard|Stupefied|Clumsy|Enfeebled|Slowed|Stunned|Blinded|Deafened) for \d+ rounds?)?\.$/i;
// (A critical hit's save that only its critical success escapes, Rhino Shot's "If the hit with the rhino shot was a critical success, the
// target is knocked prone unless it critically succeeds at its save": strike.criticalWorse, the conditions the save's success then gets
// too — its failure's (scripts/strikes.js).)
// (A critical hit's penalty to the save, Blindpepper Bolt's "If the Strike was a critical success, the target takes a -2 circumstance penalty to
// its Fortitude save": strike.criticalSaveBonus — the core's own save bonus, after a critical hit.)
const CRITICAL_SAVE_PENALTY = /^If the Strike was a critical success, the target takes an? [–-](\d+) (circumstance|status|item) penalty to its (Fortitude|Reflex|Will) save\.$/i;
const CRITICAL_WORSE = /^If the hit with the [\w' -]+? was a critical success, the target is (?:knocked )?(prone|\w+) unless it critically succeeds at its save\.$/i;

const AGAINST_KIND = /^Make an? (?:melee |ranged )?Strike with the [\w' -]+? against an? (plant|undead|construct|fiend|dragon|animal|beast|elemental|ooze|fungus|giant|aberration) creature(?: or a creature made primarily of (wood|stone|metal))?\.$/i;

function strikePlan({ base, item, strike, riders, save, extras: read, cast = null, follow = null }) {
    // (A Strike with no die size of its own, "an extra die of weapon damage", from an item that isn't the weapon: PF2e's DamageDice with no
    // die size, which takes the weapon's — as PF2e's own Brutal Finish does. Only weapon dice, though: other dice need their size.)
    if (read.dice.some((entry) => !entry.dieSize && !entry.weaponDie)) return null;
    // (With a save on the hit, its own sentence and its degrees are the save card's, not notes: "It takes 4d10 void damage with a
    // DC 25 Fortitude saving throw", "Critical Success The foe is unaffected.")
    const filtered = save ? { ...read, notes: read.notes.filter((note) => !/^(?:Critical Success|Success|Failure|Critical Failure)\b/.test(note) && !/@Check\[(?:fortitude|reflex|will)\b/i.test(note)) } : read;
    // (A critical hit's harder save: Blister Ammunition's "On a critical hit, increase the Fortitude DC by 2 (DC 21), and the target is
    // Dazzled for 1 round" — strike.criticalDC, the save card's DC after a critical hit (scripts/strikes.js); its condition already the
    // critical row's.)
    const critical = save ? filtered.notes.map((note) => [note, CRITICAL_DC.exec(String(note).trim())]).find(([, match]) => match && (!match[4] || (riders.criticalSuccess?.effects ?? []).some((effect) => effect.slug === match[4].toLowerCase()))) : null;
    const sharpest = critical ? { ...filtered, notes: filtered.notes.filter((note) => note !== critical[0]) } : filtered;
    const worse = save ? sharpest.notes.map((note) => [note, CRITICAL_WORSE.exec(String(note).trim())]).find(([, match]) => match && (save.plan.resolution?.outcomes?.failure?.effects ?? []).some((effect) => effect.slug === match[1].toLowerCase())) : null;
    const sharpened = worse ? { ...sharpest, notes: sharpest.notes.filter((note) => note !== worse[0]) } : sharpest;
    const penalty = save ? sharpened.notes.map((note) => [note, CRITICAL_SAVE_PENALTY.exec(String(note).trim())]).find(([, match]) => match && match[3].toLowerCase() === save.plan.resolution?.check?.statistic) : null;
    const sharper = penalty ? { ...sharpened, notes: sharpened.notes.filter((note) => note !== penalty[0]) } : sharpened;
    // (Only against a kind of creature: Carver-cutter's "Make a Strike with the axe against a plant creature or a creature made primarily
    // of wood" — strike.against, the traits; its extra dice for those targets alone, and its riders only on them (src/live/strike-card.js).)
    const kind = sharper.notes.map((note) => [note, AGAINST_KIND.exec(String(note).trim())]).find(([, match]) => match);
    const against = kind ? [kind[1][1].toLowerCase(), ...(kind[1][2] ? [kind[1][2].toLowerCase()] : [])] : null;
    const extras = kind ? { ...sharper, notes: sharper.notes.filter((note) => note !== kind[0]), dice: sharper.dice.map((entry) => ({ ...entry, predicate: [...(entry.predicate ?? []), { or: against.map((trait) => `target:trait:${trait}`) }] })) } : sharper;
    const extra = extras.read
        ? {
              damage: extras.dice,
              attack: extras.attack,
              alteration: extras.alteration,
              ...(extras.material ? { material: extras.material } : {}),
              ...(extras.degree ? { degree: extras.degree } : {}),
              ...(extras.runes ? { runes: extras.runes } : {}),
              ...(extras.options ? { options: extras.options } : {}),
              ...(extras.suppress ? { suppress: extras.suppress } : {}),
              ...(extras.splash ? { splash: extras.splash } : {}),
              ...(extras.offGuard ? { offGuard: true } : {}),
              // (Weapon dice on a failure: Brutal Finish's.)
              ...(extras.failDice ? { failDice: extras.failDice } : {}),
              // (Half its extra damage on a failure: Energizing Lattice's.)
              ...(extras.failHalf ? { failHalf: extras.failHalf } : {}),
              // (What its target must be, a reaction its target may have: the card's lines.)
              ...(extras.requires ? { requires: extras.requires } : {}),
              // (A miss giving its use back: Hydra Head Club's.)
              ...(extras.missRefund ? { missRefund: true } : {}),
              // (More reach for it: the Extending rune's, Tasset of Flexibility's.)
              ...(extras.reach ? { reach: extras.reach } : {}),
              // (The item's own weapon, unless it's unarmed Strikes it gives.)
              own: item?.type === "weapon" && !strike.unarmed,
              ...(strike.ammo ? { ammo: true } : {}),
              unarmed: strike.unarmed,
              uses: strike.uses,
              until: strike.hit ? "turn-end" : untilOf(strike.after),
              missKeeps: strike.missKeeps,
              hit: strike.hit,
              notes: extras.notes
          }
        : {};
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: extras.read && extras.notes.length ? "guided" : "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: riders.criticalSuccess, success: riders.success, failure: none(), criticalFailure: none() }
        },
        // (A weapon's own Strike, riders alone or not: Gloaming Arc's "Attempt a melee Strike with the gloaming arc", Growth Gun's "Make a
        // ranged Strike" — only a Strike with it carries them.)
        strike: { range: strike.range, save: save ? save.plan : null, ...(critical ? { criticalDC: Number(critical[1][3]) } : {}), ...(worse ? { criticalWorse: [worse[1][1].toLowerCase()] } : {}), ...(penalty ? { criticalSaveBonus: { value: -Number(penalty[1][1]), type: penalty[1][2].toLowerCase() } } : {}), ...(against ? { against } : {}), ...(item?.type === "weapon" && !strike.unarmed ? { own: true } : {}), ...extra, ...(strike.ammo ? { ammo: true, notes: extras.notes } : strike.wordsAmmo ? { notes: extras.notes, ...(strike.ammunition ? { ammunition: strike.ammunition } : {}) } : {}), ...(cast ? { cast } : {}), ...(follow ? { follow } : {}) },
        ...(((extras.read || strike.ammo || strike.wordsAmmo) && extras.notes.length) || follow?.notes?.length ? { partial: true } : {})
    };
}

// The plan to keep: the Strike's over nothing, a note alone or the GM's fallback, and over a save that's the Strike's
// own on a hit (Aurochs' Might Tattoo's "If the Strike hits and deals damage, the target attempts a DC 24 Fortitude
// save": not a save at whoever's targeted, Strike or no Strike).
export function strikeOver(plan, strike) {
    if (!strike) return plan;
    // (Hit notes alone give way to any other reading but a note.)
    if (strike.strike?.fromNotes) return !plan || plan.noteOnly || plan.builtin === "no-effect" ? strike : plan;
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") return strike;
    // (Or a spell cast on its hit, over a save the ability compiler read in the text beside it: Devil's Trident's Paralyze, not the
    // disease another of its activations gives.)
    // (And over a plain cast of the spell its hit casts: Devil's Trident's "Attempt a Strike. On a hit, the trident casts … Paralyze" isn't
    // Paralyze cast outright.)
    if (plan.builtin === "cast-spell" && strike.strike?.cast && plan.spell?.uuid === strike.strike.cast.uuid) return strike;
    return plan.resolution?.kind === "save" && plan.resolution.check?.roll === "save" && (strike.strike?.save || strike.strike?.cast) ? strike : plan;
}
