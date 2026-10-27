// Unique items' and artifacts' activations read whole (2026-10-27, docs/needs.md; the user: "unique effects that are on unique rarity items
// should be automated … They are special and should feel special to players"): each reading names its activation (the plan's source name)
// and has a pattern for every sentence of its effect, in order — none dropped —, and builds its card from what they say: every number,
// condition, duration, area and choice played as written. The mechanisms they use are the module's own (the item card's note Effects, the
// ability module's save cards and zones, the spell module's casts) and, where none fitted, new ones named at their reading: crafting from a
// known formula (plan.craft, src/live/craft-card.js, scripts/craft.js), damage each round around its user with a blast at the end
// (plan.item.pulse, src/live/pulse.js, scripts/pulse.js), mutagens made from a creature that give its abilities (plan.transmogrify,
// src/live/transmogrify.js, scripts/transmogrify.js). Pure.

import { effectWords, sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const timeOf = (value, unit, expiry = "turn-start") => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry, anchor: "effect-start" });

// A card of the item's own: a row for its user (a note Effect), its lines.
const ownRow = ({ noteEffects = [], effects = [], notes = [] }) => ({
    targeting: { target: null, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});

// Each reading: the source name it's for, a pattern for each of its effect's sentences (every sentence one, in order), and its card from
// the matches (and the plan read before, for one over it: over true). frequency: its own where PF2e's words aren't read ("4 times per year").
const READINGS = [
    {
        // Aroden's Hearthstone's crafting: a magical weapon or armor of 20th level or lower from a formula its user knows, PF2e's Crafting check
        // at its level's DC — on a success the item made, its user paying only a quarter of its Price in raw materials (a critical failure
        // ruins a tenth of them, as Craft has it; a failure loses none); the three days its activation takes are the downtime, no more. Its
        // Requirements' Legendary proficiency in Crafting the craft card's to hold to. The stars glowing brighter: its card's line.
        name: "Aroden's Hearthstone",
        frequency: { max: 4, per: "year", raw: "4 times per year" },
        sentences: [
            /^You craft a magical (weapon) or (armor) of up to (\d+)th level\.$/,
            /^You must attempt a Crafting check as usual to create the item, but you need supply only raw materials worth a quarter of the item's Price, and you need not pay the remaining portion of the item's Price or spend additional downtime days working on it\.$/,
            /^While Aroden's Hearthstone is active, the stars in the sky, including Golarion's sun, appear to glow brighter within a (\d+)-mile radius of the hearthstone\.$/
        ],
        card: ([craft, , stars]) => ({
            builtin: "craft",
            targeting: { target: null, range: null, area: null },
            craft: { types: [craft[1], craft[2]], traits: ["magical"], maxLevel: Number(craft[3]), check: true, materials: 0.25, requires: { skill: "crafting", rank: 4, words: "legendary in Crafting" } },
            notes: [
                "Its 3 days are the Craft's downtime: no more days to spend, and no more of the Price to pay once the check succeeds.",
                `While it's active, the stars and the sun look brighter within ${stars[1]} miles of it.`
            ]
        })
    },
    {
        // Aroden's Hearthstone's cold: 4d6 cold damage each round to every creature within its mile — its user too —, the ability module's card
        // at them all as it's activated and at the start of each of its user's turns for the minute (scripts/pulse.js); then, as the minute
        // ends, the blast's 25d6 fire damage to every creature within 150 feet. The temperatures, on its user's note Effect for the minute; the
        // blue moon and the objects the blast burns, its card's lines.
        name: "Aroden's Hearthstone",
        frequency: { max: 1, per: "month", raw: "once per month" },
        sentences: [
            /^Aroden's Hearthstone draws in heat from the world itself, causing the ambient temperature within (\d+) miles to drop below 0°F\.$/,
            /^Within (\d+) mile of the Hearthstone ?, the temperature drops to -(\d+)°F, rivaling the frigid cold of outer space and dealing (\d+d\d+) (cold) damage each round to every creature in the area\.$/,
            /^This effect lasts (\d+) (minutes?), during which time the nearest moon \(probably Golarion's\) appears an eerie blue color to any observers within (\d+) miles of the hearthstone\.$/,
            /^At the end of 1 minute, the hearthstone emits a blast of concentrated heat that deals (\d+d\d+) (fire) damage to creatures and objects within (\d+) feet\.$/
        ],
        card: ([far, near, lasts, blast]) => ({
            ...ownRow({
                noteEffects: [{
                    label: "Aroden's Hearthstone: the cold",
                    text: `Within ${far[1]} miles of the hearthstone the air is below 0 °F; within ${near[1]} mile, −${near[2]} °F, and every creature there takes ${near[3]} ${near[4]} damage each round (its cards at the start of its user's turns). As the minute ends, its blast of heat deals ${blast[1]} ${blast[2]} damage to every creature and object within ${blast[3]} feet of it (its card then).`,
                    duration: timeOf(lasts[1], lasts[2])
                }],
                notes: [
                    `For the minute the nearest moon looks an eerie blue to anyone within ${lasts[3]} miles.`,
                    `Objects within ${blast[3]} feet take the blast's damage too (the GM's).`
                ]
            }),
            item: { pulse: { formula: near[3], type: near[4], radius: Number(near[1]) * 5280, own: true, lasts: timeOf(lasts[1], lasts[2]), then: { formula: blast[1], type: blast[2], radius: Number(blast[3]), own: true } } }
        })
    },
    {
        // Philosopher's Extractor's Accelerated Synthesis: an alchemical item of its user's level or lower from a formula they know, made at
        // once — no check, no cost —, up to 56 levels of items a day (the craft card counts them); impeccable, as the extractor's own items
        // are (src/live/craft-card.js). Its example: the card's line.
        name: "Philosopher's Extractor: Accelerated Synthesis",
        sentences: [
            /^You use the extractor to produce an (alchemical) item of your level or lower whose formula you know\.$/,
            /^The extractor can create (\d+) levels' worth of items per day in this way\.$/,
            /^For example, the extractor could create two true elixirs of life \(19th level\) and two moderate elixirs of life \(9th level\), or eight comprehension elixirs \(7th level\), and so on\.$/
        ],
        card: ([made, budget]) => ({
            builtin: "craft",
            targeting: { target: null, range: null, area: null },
            craft: { types: [], traits: [made[1]], maxLevel: "user", check: false, materials: 0, budget: { levels: Number(budget[1]), per: "day" }, impeccable: true },
            notes: ["Two true elixirs of life (19th level) and two moderate ones (9th) make 56 levels, as eight comprehension elixirs (7th) do."]
        })
    },
    {
        // Philosopher's Extractor's Essence Transmogrification: up to 10 transmogrifying mutagens from the body of the creature its user
        // targets, each in its user's inventory; drunk, one of that creature's abilities the GM picks for 1 hour at its drinker's class or
        // spell DC — the same creature's again, one more and an hour longer for them all; any other active, the flat check, failed the GM's
        // transformation (src/live/transmogrify.js, scripts/transmogrify.js). Its example abilities and the GM's say: the card's lines.
        name: "Philosopher's Extractor: Essence Transmogrification",
        sentences: [
            /^You take a sizable portion of a creature \(at least two-thirds of its original mass\) and filter it through the mechanisms of the extractor\.$/,
            /^After the end of the process, the philosopher's extractor creates a transmogrifying mutagen that imparts the essence of the creature to the drinker\.$/,
            /^The extractor can make several transmogrifying mutagens simultaneously using the same activation if enough mass is provided at once, up to a maximum of (\d+) concurrent mutagens\.$/,
            /^Drinking a transmogrifying mutagen imparts you with one of the creature's unique abilities for (\d+) (hours?)\.$/,
            /^This could grant one of several abilities such as a dragon's breath, darkvision, flight, frightful presence, or immunity to sleep\.$/,
            /^The ability functions as it did for the original creature, except it uses your class DC or your spell DC \(whichever is higher\) instead of the creature's DC\.$/,
            /^The mutagen grants only abilities based on a creature's physiology and never grants magic-related abilities such as innate spells or spellcasting ability\.$/,
            /^The GM ultimately decides what ability a transmogrifying mutagen grants\.$/,
            /^Unlike normal for mutagens and polymorph effects, you can drink multiple transmogrifying mutagens and gain benefits from each\.$/,
            /^When you drink transmogrifying mutagens made from different creatures, you receive abilities from each creature\.$/,
            /^When you drink multiple transmogrifying mutagens made from the same type of creature, such as multiple mutagens made from trolls, you gain an additional ability for each transmogrifying mutagen you drink, and the duration of the abilities from that creature type increases by 1 hour for each additional concoction you drink\.$/,
            /^However, these additional benefits come with a risk; if you drink a transmogrifying mutagen while at least one other is active, after drinking it, you must succeed at a flat check with a DC equal to the total number of active transmogrifying mutagens you've consumed\.$/,
            /^On a failure, you fully transform into a member of the species of the latest transmogrifying mutagen you drank, and you almost always go berserk from your change\.$/,
            /^The transformation may leave some amount of your personality and memories intact, at the GM's discretion\.$/
        ],
        card: ([, , most, lasts]) => ({
            builtin: "transmogrify",
            targeting: { target: "1 creature", range: null, area: null },
            transmogrify: { step: "make", most: Number(most[1]), lasts: { value: Number(lasts[1]), unit: "hours" } },
            notes: [
                "Target the creature: at least two-thirds of its body goes in; whether there's enough for more than one is the GM's call.",
                "Such as a dragon's breath, darkvision, flight, frightful presence or immunity to sleep: abilities of its body only, never its spells or spellcasting (the GM picks one as each is drunk).",
                "Mutagens and polymorph effects don't keep it from drinking more of these, and those of different creatures each give theirs."
            ]
        })
    }
];

// Whether a reading is for this source name.
export const hasRelicReading = (name) => READINGS.some((reading) => reading.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan read before and the activation's html → the reading's card, or the same plan. name: its source name; base, info, frequency: its
// own (lasting.js activationBase). A reading without over reads only where nothing was read, or a note or the GM's no-effect.
export function withRelicReadings(plan, { name, html, base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => reading.name === name && (reading.over || !plan || plan.noteOnly || plan.builtin === "no-effect" || plan.partial));
    if (!readings.length) return plan;
    const words = effectWords(html, "activation");
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan) : null;
        if (!card) continue;
        const often = reading.frequency ?? frequency;
        const { item: own, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(often ? { frequency: often } : {}) },
            ...rest,
            item: { ...info, ...(often ? { activation: { ...(info?.activation ?? {}), frequency: often } } : {}), ...(own ?? {}) }
        };
    }
    return plan;
}
