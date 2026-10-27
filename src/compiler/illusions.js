// An item's illusion, read sentence by sentence (2026-10-27, docs/needs.md "Illusions and disbelief"): the user's ruling of 2026-10-25 — the
// spells' rule, disbelief a control the GM uses, the creature's check against the item's DC, who saw through it tracked (plan.disbelief, the
// GM's disbelief card, src/live/disbelief-card.js, scripts/disbelief.js). Deck of Mischief's "A creature who Seeks or touches the card can
// attempt to disbelieve this illusion", Camp Shroud's "A creature outside the area that uses the Seek action or Search activity to examine the
// area … can attempt a … check to disbelieve the illusion", Wooden Nickel's Perception "against your Deception DC" (plan.disbelief.against:
// its user's DC, read when the card is posted) with its Crafting check that "will also reveal the item's true nature" (plan.disbelief.also,
// the card's second check). Beside it, as lasting.js reads its own: a note Effect for the illusion's time on its user (the user's ruling for
// a rule PF2e can't play), the card's lines for its user's own choices, the map and objects. Every sentence of its effect one of the
// reading's own, none dropped. Pure.

import { activationBase, effectWords, sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const lastsOf = (value, unit) => ({ value: Number(value), unit: UNITS[String(unit).toLowerCase()] });

// The card's parts: its own row (a note Effect, modifiers) for its user, its lines and its disbelief.
const own = ({ noteEffects = [], effects = [], modifiers = [], notes = [], disbelief = null, target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, modifiers, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(disbelief ? { disbelief } : {}),
    ...(item ? { item } : {})
});
// (The GM's disbelief card: Perception against the DC, for a creature that does what the text says.)
const seeThrough = ({ dc = null, when, lasts = null, ends = null, against = null, also = null }) => ({ dc, statistic: "perception", when, ...(against ? { against } : {}), ...(lasts ? { lasts } : {}), ...(ends ? { ends } : {}), ...(also ? { also } : {}) });

const SHROUDS = ["Minor", "Lesser", "Moderate", "Greater", "Major"];

// Each reading: the plan's source name it's for (an activation's "Item: Activation"), a pattern for each of its effect's sentences — every
// sentence must be one, in order — and the card they make.
const READINGS = [
    {
        // (A card's face swapped for one still in the deck: what's left in it the GM's to say, the swap its user's pick; no time of its own, so
        // the disbelief card stays until the GM's done with it.)
        name: "Deck of Mischief: Card Trick",
        sentences: [
            /^You learn which of the ace and face\b.*\bstill in the deck\.$/,
            /^You can then swap the apparent face\b.*\bone still in the deck\.$/,
            /^A creature who Seeks or touches the (card)\b[^.]*\bdisbelieve this illusion \(@Check\[perception\|dc:(\d+)\]\)\.$/
        ],
        card: ([, , seen]) => own({
            notes: ["Its user learns which ace and face cards are left in the deck (the GM, or the deck's keeper, says which).", "It may then give an ace or face card in its hand the look of one left in the deck: its user's pick."],
            disbelief: seeThrough({ dc: Number(seen[2]), when: "Seeks or touches the card" })
        })
    },
    {
        // (Objects made to look like precious metal for 10 minutes: words on its user for that time, the GM's disbelief card against its user's
        // Deception DC, and the second check its Crafting — a fitting Lore the GM's to roll by hand. Its master in Deception the card's
        // requirement check, src/compiler/requirement.js.)
        name: "Wooden Nickel",
        sentences: [
            /^Prerequisites You are a master in Deception\b.*\bwooden coin\b.*\.$/,
            /^When you Activate the wooden nickel ?, for (\d+) (minutes?), you can cause any object\b.*?\bof (\d+) Bulk or less\b.*\bprecious metal of your choice\.$/,
            /^A creature that touches or Interacts with an affected object can attempt a @Check\[perception\|against:deception[^\]]*\] check\b.*@Check\[crafting\|against:deception[^\]]*\] or an appropriate Lore skill\b.*\btrue nature\.$/,
            /^After \d+ minutes have elapsed since you Activated\b.*\brevert to their true form\.$/
        ],
        card: ([, time]) => own({
            noteEffects: [{ label: "Wooden Nickel", text: `Any object of ${time[3]} Bulk or less it touches can be made to look, feel and smell like valuables of about its size in a precious metal of its choosing; all of them turn back when the ${time[1]} minutes are up.`, duration: timeOf(time[1], time[2]) }],
            disbelief: seeThrough({ when: "touches or Interacts with an affected object", against: "deception", lasts: lastsOf(time[1], time[2]), also: { statistic: "crafting", through: true, what: "sees what the object truly is (a fitting Lore instead: rolled by hand)" } })
        })
    },
    // (A mist around a campfire for up to 12 hours: where it is and what it hides the map's, the GM's disbelief card for a creature outside
    // that Seeks or Searches, put out with the fire.)
    ...SHROUDS.map((grade) => ({
        name: `Camp Shroud (${grade})`,
        sentences: [
            /^Knights make use of this magically treated powder\b.*\.$/,
            /^When you toss the powder into a campfire or other sizable fire, .*\bin an? (\d+)-foot emanation from the fire\.$/,
            /^The mist creates protective illusions that remain for up to (\d+) (hours?)\b.*\bfrom afar\.$/,
            /^You can end the effect earlier by putting out the fire\.$/,
            /^Light and smoke produced in the area aren't visible\b.*\.$/,
            /^The illusions don't prevent sound from traveling\b.*\bfrom being seen\.$/,
            /^A creature outside the area that uses the Seek action or Search activity\b.*@Check\[perception\|dc:(\d+)[^\]]*\] check to disbelieve the illusion\.$/
        ],
        card: ([, area, time, , , , seen]) => own({
            notes: [
                `Tossed into a campfire or another sizable fire: a thin mist fills a ${area[1]}-foot emanation from the fire for up to ${time[1]} hours, the area hard to spot from afar (the map's).`,
                "From outside it, the area's light and smoke can't be seen; sound still carries, and the area and those in it can still be seen."
            ],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "is outside the area and Seeks or Searches to examine it or to look for its smoke and light", lasts: lastsOf(time[1], time[2]), ends: "Putting out the fire ends it." })
        })
    })),
    {
        // (A ship's looks changed for 6 hours: words on its user for that time, a Dismiss its user removing it, the GM's disbelief card for a
        // creature that boards the ship or Seeks.)
        name: "Veiled Figurehead: Veil!",
        sentences: [
            /^You change the appearance of the ship in minor\b.*\.$/,
            /^Its general size and shape can't be changed, but\b.*\bsurface details to your liking\.$/,
            /^Flags and sails can be recolored\b.*\.$/,
            /^Wear and surface damage\b.*\.$/,
            /^The figurehead itself shifts to fit the change\b.*\.$/,
            /^The illusion lasts for (\d+) (hours?) or until you Dismiss this effect\.$/,
            /^Any creature that boards the ship or uses the Seek action\b.*\bdisbelieves the illusion if it succeeds at a @Check\[perception\|dc:(\d+)[^\]]*\] check\.$/
        ],
        card: ([, , , , , time, seen]) => own({
            noteEffects: [{ label: "Veiled ship", text: "Its ship looks changed in small but noticeable ways of its user's choosing — flags and sails recolored and marked anew, its material another color or quality, wear and damage hidden or added, the figurehead given a face to match —, its size and shape the same. Its user can Dismiss it: remove this Effect.", duration: timeOf(time[1], time[2]) }],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "boards the ship or Seeks to examine it", lasts: lastsOf(time[1], time[2]), ends: "Its user can Dismiss it." })
        })
    },
    {
        // (Documents made misleading until it's used again: the documents the GM's, the GM's disbelief card for a creature that inspects one,
        // and Society to Decipher Writing its second check, the real text. Its other activation, the revert, is whispered — src/compiler/decided.js.)
        name: "Misdirecting Haversack",
        sentences: [
            /^Documents inside the haversack become magically disguised\b.*\.$/,
            /^Anyone inspecting a document notices the disguise with a successful @Check\[perception\|dc:(\d+)[^\]]*\] check, but\b.*@Check\[society\|dc:(\d+)[^\]]*\] check to Decipher Writing\.$/,
            /^This lasts until you use this activation again, .*\bending the effect for that document\.$/
        ],
        card: ([, seen]) => own({
            notes: ["Each document in the haversack now looks like one of a similar type with misleading information (the GM's to word).", "It lasts until this activation is used again (for all of them), until the other activation reverts one, or for a document kept an hour out of the haversack."],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "inspects one of the documents", also: { statistic: "society", dc: Number(seen[2]), what: "reads its real text (Decipher Writing)" } })
        })
    }
];

// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasIllusionReading = (name) => READINGS.some((entry) => entry.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (lasting.js activationBase, or a consumable's basePlan and itemInfo).
export function withIllusionReading(plan, { name, words, base, info, frequency = null }) {
    const readings = READINGS.filter((entry) => entry.name === name && (entry.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: mine, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(mine ?? {}) }
        };
    }
    return plan;
}

// (An activation's, as src/compiler/permanent.js calls it: its base from lasting.js.)
export function withActivationIllusion(plan, item, entry) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasIllusionReading(base.source.name)) return plan;
    return withIllusionReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), base, info, frequency });
}
