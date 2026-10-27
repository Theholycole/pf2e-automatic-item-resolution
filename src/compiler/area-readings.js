// Areas an item makes, and what its words leave beside them (2026-10-27, docs/needs.md "Light, darkness, smoke, terrain and walls"): an
// activation or a consumable read sentence by sentence — every sentence of its effect one of the reading's own, none dropped — into what its
// card plays. The ability module's zone where it makes an area that lasts (its terrain, its saves on entering, the modifiers and PF2e rules
// for the creatures inside, its lighting in its notes as Shadow Cloak Snare's is); a note Effect for the time its words give where PF2e
// can't play a rule (the user's ruling of 2026-10-25), with PF2e's own toggle and bonus where the bonus is only for a situation; what it
// tells, whispered to the GM and its user; the card's lines for its user's own actions, the map and the GM's call. Each reading names what
// it builds; the item card, the zone card and the ability module play it. Pure.

import { effectWords, sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1, next: 1 };
export const timeOf = (value, unit, expiry = "turn-start") => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry, anchor: "effect-start" });
// (Until the end of its user's turn: 0 rounds, as PF2e's own Effects say it.)
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "effect-start" };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
const bonus = (selector, type, value, predicate, once = false) => ({ key: "FlatModifier", selector, type, value, predicate, ...(once ? { removeAfterRoll: "if-enabled" } : {}) });

// The ability module's zone, its fields as its compiler gives them (src/compiler/monster.js readZone).
export const zoneOf = (fields) => ({ area: null, centre: "self", range: null, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: [], ...fields });
export const DIFFICULT = [{ movement: ["walk"], difficulty: 2 }];

// A card of the item's own: a row for its user or the creatures targeted, its lines.
const ownRow = ({ noteEffects = [], effects = [], notes = [], target = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});
// (What it tells: whispered to the GM and its user, the GM filling in what it shows — the user's ruling, src/compiler/decided.js.)
const whisper = (text) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text } });
// (A zone card of its own.)
const zoneCard = (zone, actions = null) => ({ builtin: "zone", actions, targeting: { target: null, range: zone.range ? `${zone.range} feet` : null, area: zone.area }, zone });

// Each reading: the source names it's for (an activation's "Item: Activation"; any when none), whether it reads over the plan read before
// (by default only none, note-only, or the GM's no-effect), a pattern for each of its effect's sentences — every sentence must be one, in
// order — and the card they make (from its matches and the plan before; keep: changes to that plan instead of a card of its own).
const READINGS = [
    {
        // (Diver's Gloves' fall is src/compiler/falls.js's.)
        // Resonant Guitar's Chord of Protection: the readied +2 to AC and the barrier's 3d10 sonic on a hit are the readied-bonus card's; the
        // barrier its first sentence pictures is that bonus — no rule of its own.
        names: ["Resonant Guitar: Chord of Protection"],
        over: (plan) => plan?.builtin === "readied-bonus",
        sentences: [
            /^You strike a piercing chord, putting up an invisible sound barrier between the target and the attacker\.$/,
            /^The target gains a \+2 status bonus to AC against the triggering attack\.$/,
            /^If the Strike still hits, the barrier breaks, dealing 3d10 sonic damage to the attacker\.$/
        ],
        card: ([picture], plan) => (plan.bonus?.onAttack?.hit?.damage?.formula === "3d10" ? { keep: true, notes: (plan.notes ?? []).filter((note) => said(note) !== picture[0]), drop: (plan.notes ?? []).length === 1 } : null)
    },
    {
        // Goz Mask: the weather's fog and mist ignored through the environment module (src/compiler/weather.js), smoke and other vapors on the
        // same Effect's words — the reminder of its whole text no longer needed.
        names: ["Goz Mask", "Goz Mask (Greater)"],
        over: (plan) => Boolean(plan?.noteOnly && plan.weatherIgnores),
        sentences: [/^You ignore Concealment caused by fog, smoke, and other obscuring vapors for \d+ minutes?\.$/],
        card: (_found, plan) => ({ keep: true, noteOnly: undefined, automation: { level: "automatic" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } } })
    },
    {
        // Mantle of Far Horizons' Gaze upon the Horizon: a bonus only for some Perception checks — PF2e's toggle for them on its note Effect.
        names: ["Mantle of Far Horizons: Gaze upon the Horizon"],
        sentences: [
            /^You raise the mantle's hood to augment your ability to see over large distances or through adverse weather\.$/,
            /^For the next hour, or until you lower your hood \(whichever comes first\), you gain a \+(\d) item bonus to Perception checks made to observe things more than (\d+) feet away, or while in weather-related conditions that penalize your Perception checks \(such as fog or precipitation\)\.$/
        ],
        card: ([, gaze]) => ownRow({
            noteEffects: [{
                label: "Gaze upon the Horizon",
                text: `+${gaze[1]} item bonus to Perception checks to observe things more than ${gaze[2]} feet away, or while in weather that penalizes its Perception checks, such as fog or precipitation (its toggle on for those). It ends early when its user lowers the hood (delete it then).`,
                duration: timeOf(1, "hour"),
                rules: [toggle("far-horizons-gaze", "Observing far away, or in weather that penalizes Perception"), bonus("perception", "item", Number(gaze[1]), ["far-horizons-gaze"])]
            }]
        })
    },
    {
        // Spectacles of Piercing Sight: a sight PF2e has no rule for — its words on its user for the minute.
        names: ["Spectacles of Piercing Sight"],
        sentences: [
            /^You can see into and through solid matter for (\d+) (minutes?)\.$/,
            /^This vision can pierce through solid materials up to (\d+) feet away as if looking at something in normal light even if no illumination is available\.$/,
            /^You can see through up to 1 foot of stone, 1 inch of metal, or 3 feet of wood or dirt\.$/,
            /^A thin sheet of lead blocks this vision entirely\.$/
        ],
        card: ([time, reach]) => ownRow({
            noteEffects: [{ label: "Piercing sight", text: `It sees into and through solid matter up to ${reach[1]} feet away as if in normal light, even with no light: through up to 1 foot of stone, 1 inch of metal, or 3 feet of wood or dirt. A thin sheet of lead blocks it.`, duration: timeOf(time[1], time[2]) }]
        })
    },
    {
        // Effervescent Ampoule: walking on water until the end of its user's turn — its own move on the map, its words on its Effect.
        names: ["Effervescent Ampoule"],
        sentences: [
            /^Requirements You're trained in Acrobatics Light spring water fizzes and bubbles within this small glass globe, spilling onto the affixed armor when activated\.$/,
            /^Until the end of your turn, you can move across water and other liquids as if they were solid ground\.$/,
            /^Your movement does not trigger any device or hazard that relies on a weight-sensitive pressure plate or similar device\.$/,
            /^When the ampoule's effect ends, you sink, fall, break through flimsy ground, or land on pressure plates as normal for your current location\.$/
        ],
        card: () => ({
            ...ownRow({
                noteEffects: [{ label: "Walking on water", text: "Until the end of its turn it moves across water and other liquids as on solid ground, and its movement sets off no weight-sensitive pressure plate or similar device. When this ends it sinks, falls, breaks through flimsy ground or lands on pressure plates as its place has it.", duration: THIS_TURN }],
                notes: ["Its user must be trained in Acrobatics to use it."]
            })
        })
    },
    {
        // Echo Token: a fact the GM tells, and +1 to the next Recall Knowledge on that Lore within a year — PF2e's toggle for it, gone after it.
        names: ["Echo Token"],
        sentences: [
            /^Visitors to the Echo Repository always emerge with one of these silver coins\b/,
            /^An echo token carries a minute shard of the Echo Repository's mission to impart lost information\.$/,
            /^Activate - Flip Coin \(manipulate\) Effect When flipped, the coin disintegrates into a glittery mist\.$/,
            /^You learn and memorize one random fact about a specific type of Lore \(such as Architecture Lore, Elf Lore, Astral Plane Lore\) that you didn't previously know, chosen by the GM\.$/,
            /^The next time you attempt a check to Recall Knowledge on this type of Lore within the next year, you gain a \+(\d) status bonus on the check\.$/,
            /^You can benefit from only one echo token at a time in this way; if you Flip another echo token , the Lore skill changes\.$/,
            /^However, the memorized fact will remain perfectly in your memory forever unless magically altered or removed\.$/
        ],
        card: ([, , , , next]) => ownRow({
            noteEffects: [{
                label: "Echo Token",
                text: `It learned a fact of a Lore the GM picks. +${next[1]} status bonus to its next check to Recall Knowledge on that Lore within a year (its toggle on for it; gone after it). Another echo token flipped changes the Lore: delete this then. The fact itself stays.`,
                duration: timeOf(365, "days"),
                rules: [toggle("echo-token-lore", "Recalling Knowledge on the echo token's Lore"), bonus("skill-check", "status", Number(next[1]), ["echo-token-lore"], true)]
            }],
            notes: ["The GM tells its user the fact, and which Lore it's of (the GM's call)."]
        })
    },
    {
        // Detector Stone: undead it detects — whispered to the GM and its user, the GM telling which.
        names: ["Detector Stone"],
        sentences: [
            /^You channel your life-force into the stone, empowering it temporarily\.$/,
            /^The stone can detect undead within (\d+) feet of you, rather than 30 feet, until the end of your turn\.$/,
            /^Undead hiding or disguising themselves must make an additional Deception or Stealth check to remain disguised or hidden from the activation, and the DC of the check is (\d+) rather than 20\.$/
        ],
        card: ([, within, dc]) => whisper(`Until the end of its turn, the stone detects undead within ${within[1]} feet of its user. Undead that are hiding or disguised attempt a new Deception or Stealth check against DC ${dc[1]} to stay so. The GM tells which it detects.`)
    },
    {
        names: ["Detector Stone"],
        sentences: [
            /^You focus on the stone as it glows, and your eyes glow with the same tainted light\.$/,
            /^You detect the auras of evil undead in a (\d+)-foot radius around you and learn each aura's location and strength\.$/,
            /^This has the effects of a 2nd-rank detect alignment spell but only detects evil undead\.$/
        ],
        card: ([, radius]) => whisper(`Its user detects the auras of evil undead within ${radius[1]} feet, learning each one's location and strength (a 2nd-rank detect alignment for evil undead only). The GM tells what it finds.`)
    },
    {
        // Earthsight Box: a miniature of the stone terrain around — the GM's to show.
        names: ["Earthsight Box: Replicate Earth"],
        sentences: [
            /^You hold the box closed and, while envisioning the terrain, turn the box clockwise three times\.$/,
            /^When you open the box, the sand reveals, in miniature, the stone terrain surrounding you, to a range of (\d+) feet\.$/,
            /^This shows details of paths, hills, embankments, boulders, and even artificial structures like walls and ditches, as long as they're made of stone and earth\.$/,
            /^If you're underground, it reveals tunnels and voids in the earth within \d+ feet at your current depth\.$/,
            /^The sand maintains its shape until you close the box\.$/
        ],
        card: ([, range]) => whisper(`The sand shows in miniature the stone and earth terrain within ${range[1]} feet of its user — paths, hills, embankments, boulders, walls and ditches; underground, the tunnels and voids at its depth — until the box is closed. The GM shows it.`)
    },
    {
        // Sighting Shot: what the shot passes, the GM's to tell its user; its light while it flies, a line.
        names: ["Sighting Shot"],
        sentences: [
            /^Eyes are carved onto a sighting shot\.$/,
            /^When you Activate the ammunition, it glows, shedding bright light for (\d+) feet and dim light for (\d+) feet beyond that\.$/,
            /^If you shot the activated ammunition, your mind swirls with images of what the sighting shot passed and hit as if you sprinted along the ammunition's course\.$/,
            /^You see this path as if with your normal visual senses\.$/,
            /^Once a sighting shot hits anything or reaches its maximum range, it stops transmitting images to you\.$/,
            /^A sighting shot's light is visible to creatures who didn't Activate the ammunition, but they receive no special information from it\.$/
        ],
        card: ([, light]) => whisper(`Activated, the shot glows: bright light ${light[1]} feet, dim light ${light[2]} feet beyond. Shot, its user sees what it passes and hits along its course, as with its own eyes, until it hits something or reaches its maximum range. Others see its light but learn nothing. The GM tells what it sees.`)
    }
];

// Whether a reading is for this source name.
const forName = (reading, name) => !reading.names || reading.names.includes(name);
export const hasAreaReading = (name) => READINGS.some((reading) => forName(reading, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan and the activation's (or consumable's) html → the reading's card, or the same plan. name: its source name; kind "activation"
// or "consumable"; base, info, frequency: its own (lasting.js activationBase, or a consumable's basePlan and itemInfo).
export function withAreaReadings(plan, { name, html, kind = "activation", base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => forName(reading, name) && (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect"));
    if (!readings.length) return plan;
    const words = effectWords(html, kind);
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept; drop: what was left is gone, so it's whole.)
        if (card.keep) {
            const { keep, drop, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined || (Array.isArray(changes[key]) && !changes[key].length)) delete next[key];
            if (drop && next.partial) {
                delete next.partial;
                next.automation = { ...(next.automation ?? {}), level: "automatic" };
            }
            return next;
        }
        const { item: own, ...rest } = card;
        return { ...base, automation: { level: "automatic" }, trigger: { event: "use", ...(frequency ? { frequency } : {}) }, ...rest, item: { ...info, ...(own ?? {}) } };
    }
    return plan;
}
