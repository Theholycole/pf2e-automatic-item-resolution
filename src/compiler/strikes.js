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

// "make a melee Strike", "make a weapon or unarmed attack Strike", "make a ranged or melee Strike", "attempt a Strike" (not
// a creature's own, "makes a beak Strike with a +8 modifier").
const STRIKE = /\b(?:make|makes|attempt|attempts) an? ((?:(?:melee|ranged|unarmed|weapon|thrown|single|or|attack) ){0,4})Strike\b/i;
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
export function readStrike(text) {
    const triggered = TRIGGER_HIT.exec(text);
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
        range: unarmed ? null : rangeOf(words),
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
    if (after === text || !/\bOn a hit\b/.test(after)) return null;
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
const CASTS_ON_HIT = /\bOn a successful Strike, (?:an? )?[^.]*?\b(?:casts|creates) an? ?(?:(\d+)(?:st|nd|rd|th)-rank )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\}(?: effect on the target| spell)?([^.]*\.(?:\s*The target can resist the effects[^.]*)?)/i;
export function castOnHit(html) {
    const match = CAST_ON_HIT.exec(String(html ?? "")) ?? CASTS_ON_HIT.exec(String(html ?? "").replace(/<\/?em>/g, "").replace(/\bcasts (@UUID)/, "casts a $1"));
    if (!match) return null;
    const dc = /\bspell DC of (\d+)|@Check\[\w+\|dc:(\d+)/i.exec(match[4]);
    const unless = /\bunless it succeeds at an? @Check\[(fortitude|reflex|will)\|dc:(\d+)|\bThe target can resist the effects[^.]*? with a successful @Check\[(fortitude|reflex|will)\|dc:(\d+)/i.exec(match[4]);
    const requiring = /\brequiring an? @Check\[(?:fortitude|reflex|will)\|dc:\d+/i.test(match[4]);
    return {
        uuid: match[2],
        name: match[3],
        rank: match[1] ? Number(match[1]) : null,
        dc: unless ? null : dc ? Number(dc[1] ?? dc[2]) : null,
        ...(unless ? { saveFirst: { statistic: (unless[1] ?? unless[3]).toLowerCase(), dc: Number(unless[2] ?? unless[4]) } } : {}),
        ...(requiring ? { attackFromHit: true } : {})
    };
}

export function compileStrike(item, base) {
    const html = String(item?.system?.description?.value ?? "");
    // ("This Strike deals an additional 2d6 precision damage, and on a hit, the creature is Clumsy 1": the rider its own sentence.)
    const text = plainText(html).replace(/,? and on a hit, /gi, ". On a hit, ");
    // (Activated ammunition: its hit is the next ranged Strike's with it. A consumable that's ammunition only in its words —
    // Roc-Shaft Arrow's "Ammunition arrow" line, which PF2e can't load — is its user's next ranged Strike.)
    const wordsOnly = !isAmmo(item) && /^\s*Ammunition (?:arrows?|bolts?|bullets?|sling bullets?|rounds?|any)\b/i.test(text);
    const found = isAmmo(item) || wordsOnly ? ammoStrike(text) : readStrike(text);
    // (The ammunition its weapon fires, by PF2e's weapon ammo.baseType — "arrows", "bolts", "sling-bullets", "rounds…" — so a
    // reader knows which weapons it's for; "any" names none.)
    const kinds = wordsOnly ? (/^\s*Ammunition ([a-z ,]+?)(?= Activate\b|\.|$)/i.exec(text)?.[1] ?? "").toLowerCase().split(/,\s*|\s+or\s+/).map((kind) => AMMUNITION[kind.trim()]).filter(Boolean) : [];
    const strike = found && wordsOnly ? { ...found, ammo: false, next: true, wordsAmmo: true, ...(kinds.length ? { ammunition: kinds } : {}) } : found;
    if (!strike) return null;
    const riders = hitRiders(strike.after);
    // (A save for the creature the Strike hits: "On a hit, the target must succeed at a DC 22 Fortitude save or be Dazzled";
    // ammunition's, anywhere in what its hit does.)
    const hitSentence = strike.ammo ? ammoSave(strike.after) : /(?:On a hit|If (?:you|it|the Strike) hits?|If you hit and deal damage|If you successfully deal damage)[^.]*\b(?:save|saving throw)\b|@Check\[(?:fortitude|reflex|will)/i.test(strike.after);
    const save = hitSentence ? bombSave({ ...item, system: { ...(item.system ?? {}), description: { value: html } } }, { scope: { scope: "target" } }) : null;
    const riderSentence = (sentence) => {
        const row = hitRiders(sentence);
        return hasRow(row.success) || hasRow(row.criticalSuccess) || Boolean(save && /^(?:On a hit|If (?:you|it|the Strike) hits?)\b[^.]*\b(?:save|saving throw)\b/i.test(sentence));
    };
    const cast = castOnHit(html);
    const read = readStrikeExtras(strike.after, { item, strikeSentence: strike.sentence, own: strike.next, riderSentence });
    // (The cast's own sentence isn't a note.)
    if (cast) read.notes = read.notes.filter((note) => !note.includes(cast.name) && !(cast.attackFromHit && /^As with the spell\b/i.test(note)));
    const extras = strike.ammo && pf2eDamage(item) ? { ...read, dice: [], read: Boolean(read.attack || read.alteration || read.runes) } : read;
    if (!hasRow(riders.success) && !hasRow(riders.criticalSuccess) && !save && !extras.read && !cast) return null;
    const anyRider = hasRow(riders.success) || hasRow(riders.criticalSuccess);
    // (A trigger's Strike that already hit — Spore Sap's "Trigger You successfully Strike a creature with the spore sap Effect
    // The target must succeed at a DC 28 Fortitude save …": its save is the plan, at the creature struck; its extra damage
    // waits for the damage roll; riders for a hit already rolled aren't read.)
    if (strike.hit) {
        if (extras.read) return anyRider || save ? null : strikePlan({ base, item, strike, riders, save, extras });
        return save && !anyRider ? { ...save.plan, source: base.source, rank: base.rank, traits: base.traits, activation: base.activation, targeting: { target: "the creature struck", range: null, area: null }, trigger: { event: "use" } } : null;
    }
    return strikePlan({ base, item, strike, riders, save, extras, cast });
}

function strikePlan({ base, item, strike, riders, save, extras: read, cast = null }) {
    // (A Strike with no die size of its own, "an extra die of weapon damage", from an item that isn't the weapon: not read.)
    if (read.dice.some((entry) => !entry.dieSize)) return null;
    // (With a save on the hit, its own sentence and its degrees are the save card's, not notes: "It takes 4d10 void damage with a
    // DC 25 Fortitude saving throw", "Critical Success The foe is unaffected.")
    const extras = save ? { ...read, notes: read.notes.filter((note) => !/^(?:Critical Success|Success|Failure|Critical Failure)\b/.test(note) && !/@Check\[(?:fortitude|reflex|will)\b/i.test(note)) } : read;
    const extra = extras.read
        ? {
              damage: extras.dice,
              attack: extras.attack,
              alteration: extras.alteration,
              ...(extras.degree ? { degree: extras.degree } : {}),
              ...(extras.runes ? { runes: extras.runes } : {}),
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
        strike: { range: strike.range, save: save ? save.plan : null, ...extra, ...(strike.ammo ? { ammo: true, notes: extras.notes } : strike.wordsAmmo ? { notes: extras.notes, ...(strike.ammunition ? { ammunition: strike.ammunition } : {}) } : {}), ...(cast ? { cast } : {}) },
        ...((extras.read || strike.ammo || strike.wordsAmmo) && extras.notes.length ? { partial: true } : {})
    };
}

// The plan to keep: the Strike's over nothing, a note alone or the GM's fallback, and over a save that's the Strike's
// own on a hit (Aurochs' Might Tattoo's "If the Strike hits and deals damage, the target attempts a DC 24 Fortitude
// save": not a save at whoever's targeted, Strike or no Strike).
export function strikeOver(plan, strike) {
    if (!strike) return plan;
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") return strike;
    return plan.resolution?.kind === "save" && plan.resolution.check?.roll === "save" && strike.strike?.save ? strike : plan;
}
