// Creatures an item makes or controls, and what it does to its user's companion (2026-10-27, docs/needs.md "Creatures it makes or
// controls"): an activation or a consumable read sentence by sentence, every sentence of its effect one of the reading's own — none dropped
// —, into what its card plays. Dust of Corpse Animation's "Pouring the dust in a special pattern over a corpse turns it into an undead
// creature … If the undead's level would be greater than 3, the dust fails to animate it", Oil of Dynamism's animated object, a
// Galvasphere's zombie shambler that's a construct, Kotodama Bells' object with "AC 5, 5 Hit Points, a Speed of 10 feet, and automatically
// fails all saves", Cordelia's Construct Key's Animated Broom "but has no bristles Strike": the ability module's conjured token (its
// api.live.startConjure, scripts/zones.js), the creature its user picks from the compendiums first when the text lets them choose
// (plan.pick, scripts/creature-pick.js), its size picked on the ways card when the text gives two; what the item changes on it — its
// creature type, a trait or weakness it lacks, its Strikes gone, its saves always failed — the made creature's own (scripts/zones.js
// finishConjured). Collar of Empathy's "You perceive through your animal companion's senses instead of your own": a note Effect on its
// user for the Sustain's time (the user's ruling for a rule PF2e can't play, 2026-10-25). The card's lines for its user's own actions and
// the map. Pure.

import { sentencesOf } from "./lasting.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const hours = (time) => (time.unit === "hours" ? [`It lasts ${time.value} hour${time.value === 1 ? "" : "s"}: dismiss it when that's up.`] : []);
// (The link its text gives a creature, by its label: "Compendium.pf2e.pathfinder-monster-core.Actor.…".)
const linkOf = (html, label) => new RegExp(String.raw`@UUID\[(Compendium\.[\w.-]+\.Actor\.[A-Za-z0-9]{16})\]\{${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\}`, "i").exec(String(html ?? ""))?.[1] ?? null;
const MINION = "A minion: it acts when its user commands it (1 action for 2 of its own).";
// (A Sustain with no time of its own lasts 10 minutes at most, PF2e's rule for Sustain.)
const SUSTAIN_MOST = timeOf(10, "minutes");

// The card's parts: a row of its own for its user (a note Effect), and its lines; a conjured creature; a choice of ways, each a plan.
const ownRow = ({ noteEffects = [], notes = [] }) => ({
    targeting: { target: null, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});
const conjure = ({ creatures, lasts = null, notes = [], pick = null, needs = null, max = null, vanishAtZero = true }) => ({
    builtin: "conjure",
    targeting: { target: "self", range: null, area: null },
    creatures,
    ...(pick ? { pick } : {}),
    ...(needs ? { needs } : {}),
    max: max ?? creatures.reduce((sum, creature) => sum + (Number(creature.count) || 1), 0),
    lasts,
    ...(vanishAtZero ? { vanishAtZero: true } : {}),
    notes
});
const creature = (fields) => ({ count: 1, size: null, stats: null, from: null, traits: [], initiative: null, ...fields });

// Each reading: the source name it's for (an activation's "Item: Activation"; a pattern for an item's grades), a pattern for each of its
// effect's sentences — every sentence must be one, in order — and the card they make (from its matches and the item's html).
const READINGS = [
    {
        // (Its companion's senses for its own while it's Sustained: a note Effect on its user, 10 minutes at most.)
        name: "Collar of Empathy: Empathic Link",
        sentences: [
            /^You perceive through your animal companion's senses instead of your own\.$/,
            /^You can Sustain the activation\.$/,
            /^You are unaware of your own surroundings for as long as you are using your animal companion's senses\.$/,
            /^In addition to the obvious use when you are separated from your companion, this ability might allow you to notice sounds, scents, and other stimuli that your companion's senses register but yours alone don't\.$/
        ],
        card: () => ownRow({ noteEffects: [{ label: "Empathic Link", text: "It perceives through its animal companion's senses in place of its own, unaware of its own surroundings meanwhile — noticing what the companion's senses pick up (sounds, scents and the like) that its own wouldn't. It lasts while its user Sustains the activation, 10 minutes at most: remove this Effect when they stop.", duration: SUSTAIN_MOST }] })
    },
    {
        // (A skeleton or zombie of its level or lower from a corpse, its user's pick: a minion for a minute.)
        name: /^Dust of Corpse Animation(?: \(Greater\))?$/,
        sentences: [
            /^This black pouch contains what appears to be fine bone dust\.$/,
            /^Pouring the dust in a special pattern over a corpse turns it into an undead creature\.$/,
            /^The type of undead created depends on the condition of the corpse, resulting in either a skeleton or a zombie ?\.$/,
            /^If the undead's level would be greater than (\d+), the dust fails to animate it\.$/,
            /^The body must be of an appropriate size and type for the undead you wish to create-for example, you must sprinkle the dust on a horse's skeleton to animate a skeletal horse ?\.$/,
            /^If more than one undead in the level range is appropriate, such as skeletal guard or skeletal champion for a Medium humanoid skeleton, you choose\.$/,
            /^The animated undead has the minion trait, meaning it can use 2 actions when you Command it\.$/,
            /^You can issue a Command for the current turn as part of the activation\.$/,
            /^The undead creature remains animated for (\d+) (minutes?|rounds?) before collapsing back into its corpse form\.$/,
            /^As usual, you can have a maximum of four minions under your control\.$/
        ],
        card: ([, , , level, , , , , lasts]) => conjure({
            creatures: [creature({ name: "Animated undead", traits: ["minion"] })],
            pick: { any: ["skeleton", "zombie"], maxLevel: Number(level[1]) },
            needs: "a corpse of the size and kind the undead needs (a horse's skeleton for a skeletal horse)",
            lasts: timeOf(lasts[1], lasts[2]),
            notes: [
                `Its user picks a skeleton or zombie of level ${level[1]} or lower that the corpse fits; a higher one isn't animated. Its token goes where the corpse is.`,
                MINION,
                "Its user can Command it this turn as part of the activation.",
                `After ${lasts[1]} ${lasts[2]} it collapses back into a corpse.`,
                "Its user can have four minions at most."
            ]
        })
    },
    {
        // (An animated object of the object's own kind, of its level or lower, its user's pick: a minion for a minute.)
        name: /^Oil of Dynamism(?: \(Greater\))?$/,
        sentences: [
            /^This fine golden oil comes in a small blue canister\.$/,
            /^Carefully spreading the oil over an object turns it into an animated object of the same type\.$/,
            /^For example, sprinkling it on a statue makes an animated statue ?\.$/,
            /^If the animated object's level would be greater than (\d+), the oil struggles to animate it and ultimately fails\.$/,
            /^This animated object has the minion trait, meaning it can use 2 actions when you Command it\.$/,
            /^You can issue a Command for the current turn as part of the activation\.$/,
            /^The object remains animated for (\d+) (minutes?|rounds?) before falling inert\.$/,
            /^As usual, you can have a maximum of four minions under your control\.$/
        ],
        card: ([, , , level, , , lasts]) => conjure({
            creatures: [creature({ name: "Animated object", traits: ["minion"] })],
            pick: { all: ["construct", "mindless"], maxLevel: Number(level[1]) },
            needs: "an object to spread it on",
            lasts: timeOf(lasts[1], lasts[2]),
            notes: [
                `Its user picks the animated object of level ${level[1]} or lower that matches the object (a statue: an animated statue); a higher one isn't animated. Its token goes where the object is.`,
                MINION,
                "Its user can Command it this turn as part of the activation.",
                `After ${lasts[1]} ${lasts[2]} it falls inert again.`,
                "Its user can have four minions at most."
            ]
        })
    },
    {
        // (A zombie shambler that's a construct, not undead or unholy, unharmed by vitality: a minion for a minute, Medium or Small as the corpse
        // is — the ways card.)
        name: "Galvasphere",
        sentences: [
            /^A galvasphere animates a corpse to motion via electricity, rather than dark magic\.$/,
            /^When you Activate the galvasphere by inserting it into an adjacent intact Medium or Small humanoid corpse, the corpse animates as a galvaheart zombie for (\d+) (minutes?|rounds?)\.$/,
            /^The galvaheart zombie has the statistics of a zombie shambler except that it's a construct instead of an undead, isn't unholy, can't be harmed by vitality energy, and is the same size as the corpse \(Medium or Small\)\.$/,
            /^The zombie is your minion and performs the actions you choose when you Command it\.$/,
            /^If you don't Command it, it takes no action, twitching in place as the electricity that animates it slowly expends itself\.$/
        ],
        card: ([, animates], plan, { base, info }) => {
            const way = (size) => ({
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                ...conjure({
                    creatures: [creature({ name: "Galvaheart Zombie", size, from: { name: "Zombie Shambler" }, traits: ["minion", "construct"], replaceType: true, removeTraits: ["unholy"], immunities: ["vitality"], own: { dropWeaknesses: ["vitality"] } })],
                    lasts: timeOf(animates[1], animates[2]),
                    notes: [
                        "Inserted into an adjacent intact humanoid corpse: its token goes where the corpse is.",
                        "A zombie shambler's statistics, but a construct, not undead or unholy, and vitality energy can't harm it.",
                        `${MINION} Not commanded, it takes no action.`
                    ]
                }),
                item: info
            });
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                once: true,
                ways: [{ name: "A Medium corpse", html: "<p>A Medium galvaheart zombie.</p>", plan: way("medium") }, { name: "A Small corpse", html: "<p>A Small galvaheart zombie.</p>", plan: way("small") }]
            };
        }
    },
    {
        // (An object of negligible Bulk that moves and Interacts but can't attack, with the text's own numbers, every save failed: a minion
        // for 24 hours.)
        name: "Kotodama Bells: Awaken the Soul",
        sentences: [
            /^You ring the bell and focus on an object of negligible Bulk within (\d+) feet\.$/,
            /^The bell's toll animates the object for (\d+) (hours?|minutes?)\.$/,
            /^The object becomes a minion that can't attack but can move and take simple Interact actions appropriate for an item of its type, as determined by the GM\.$/,
            /^For example, a piece of chalk can write a message or draw a symbol, a hand fan can open or fan in a particular direction, or a magnifying glass can set itself up to dramatically reveal incriminating evidence\.$/,
            /^The animated item has AC (\d+), (\d+) Hit Points, a Speed of (\d+) feet, and automatically fails all saves\.$/,
            /^If the object is broken, it can no longer move, though it can still Interact as appropriate for an item of its type\.$/,
            /^As normal with minions you control, you must Command the object to grant it actions\.$/
        ],
        card: ([within, animates, , , stats]) => {
            const lasts = timeOf(animates[1], animates[2]);
            return conjure({
                creatures: [creature({ name: "Awakened object", size: "tiny", stats: { ac: Number(stats[1]), hp: Number(stats[2]), speeds: { land: Number(stats[3]) } }, traits: ["minion"], own: { rules: [{ key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "to-failure" } }] } })],
                lasts,
                vanishAtZero: false,
                notes: [
                    `An object of negligible Bulk within ${within[1]} feet: its token goes where the object is.`,
                    MINION,
                    "It can't attack, but moves and takes simple Interact actions that suit its kind of item, as the GM decides (chalk writes, a fan fans).",
                    "It fails every save.",
                    "Broken, it can't move any more, though it can still Interact.",
                    ...hours(lasts)
                ]
            });
        }
    },
    {
        // (An Animated Broom with no Strike, for menial tasks out of combat, for an hour (8 for the greater key).)
        name: /^Cordelia's (?:Greater )?Construct Key$/,
        sentences: [
            /^You place the key on a Small object and turn it, creating a simple animated object for (\d+) (hours?|minutes?)\.$/,
            /^The animated object has the statistics of an Animated Broom but has no bristles Strike and can't attack\.$/,
            /^It performs simple and broad menial tasks for you in exploration or downtime but is too slow to react to individual commands to assist you in a combat encounter\.$/
        ],
        card: ([animates], plan, { html }) => {
            const uuid = linkOf(html, "Animated Broom");
            if (!uuid) return null;
            const lasts = timeOf(animates[1], animates[2]);
            return conjure({
                creatures: [creature({ name: "Animated Broom", from: { uuid }, own: { noStrikes: true } })],
                lasts,
                notes: [
                    "A Small object the key's placed on: its token goes where the object is.",
                    "An Animated Broom's statistics with no Strike: it can't attack.",
                    "It does simple, broad menial tasks for its user in exploration or downtime; it's too slow to help in a combat encounter.",
                    ...hours(lasts)
                ]
            });
        }
    }
];

const named = (reading, name) => (reading.name instanceof RegExp ? reading.name.test(String(name ?? "")) : reading.name === name);
// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasCreatureReading = (name) => READINGS.some((reading) => named(reading, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (an activation's, or a consumable's basePlan and itemInfo); html: its text.
export function withCreatureReading(plan, { name, words, html = "", base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, base, info }) : null;
        if (!card) continue;
        const { item: own, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(own ?? {}) }
        };
    }
    return plan;
}
