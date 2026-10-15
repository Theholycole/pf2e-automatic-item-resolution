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
export function compileStrike(item, base) {
    const html = String(item?.system?.description?.value ?? "");
    // ("This Strike deals an additional 2d6 precision damage, and on a hit, the creature is Clumsy 1": the rider its own sentence.)
    const strike = readStrike(plainText(html).replace(/,? and on a hit, /gi, ". On a hit, "));
    if (!strike) return null;
    const riders = hitRiders(strike.after);
    // (A save for the creature the Strike hits: "On a hit, the target must succeed at a DC 22 Fortitude save or be Dazzled".)
    const hitSentence = /(?:On a hit|If (?:you|it|the Strike) hits?|If you hit and deal damage|If you successfully deal damage)[^.]*\b(?:save|saving throw)\b|@Check\[(?:fortitude|reflex|will)/i.test(strike.after);
    const save = hitSentence ? bombSave({ ...item, system: { ...(item.system ?? {}), description: { value: html } } }, { scope: { scope: "target" } }) : null;
    const riderSentence = (sentence) => {
        const row = hitRiders(sentence);
        return hasRow(row.success) || hasRow(row.criticalSuccess) || Boolean(save && /^(?:On a hit|If (?:you|it|the Strike) hits?)\b[^.]*\b(?:save|saving throw)\b/i.test(sentence));
    };
    const extras = readStrikeExtras(strike.after, { item, strikeSentence: strike.sentence, own: strike.next, riderSentence });
    if (!hasRow(riders.success) && !hasRow(riders.criticalSuccess) && !save && !extras.read) return null;
    const anyRider = hasRow(riders.success) || hasRow(riders.criticalSuccess);
    // (A trigger's Strike that already hit — Spore Sap's "Trigger You successfully Strike a creature with the spore sap Effect
    // The target must succeed at a DC 28 Fortitude save …": its save is the plan, at the creature struck; its extra damage
    // waits for the damage roll; riders for a hit already rolled aren't read.)
    if (strike.hit) {
        if (extras.read) return anyRider || save ? null : strikePlan({ base, item, strike, riders, save, extras });
        return save && !anyRider ? { ...save.plan, source: base.source, rank: base.rank, traits: base.traits, activation: base.activation, targeting: { target: "the creature struck", range: null, area: null }, trigger: { event: "use" } } : null;
    }
    return strikePlan({ base, item, strike, riders, save, extras });
}

function strikePlan({ base, item, strike, riders, save, extras }) {
    // (A Strike with no die size of its own, "an extra die of weapon damage", from an item that isn't the weapon: not read.)
    if (extras.dice.some((entry) => !entry.dieSize)) return null;
    const extra = extras.read
        ? {
              damage: extras.dice,
              attack: extras.attack,
              alteration: extras.alteration,
              // (The item's own weapon, unless it's unarmed Strikes it gives.)
              own: item?.type === "weapon" && !strike.unarmed,
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
        strike: { range: strike.range, save: save ? save.plan : null, ...extra },
        ...(extras.read && extras.notes.length ? { partial: true } : {})
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
