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
// (A summon spell's time, sustained: a minute at most.)
const SUMMON_TIME = timeOf(1, "minutes");
const SUMMONED = (spell) => `${spell}'s parameters: summoned, it acts when its user Sustains the activation (2 actions); it goes if they stop, after a minute at most.`;
// (A Sustain with no time of its own lasts 10 minutes at most, PF2e's rule for Sustain.)
const SUSTAIN_MOST = timeOf(10, "minutes");

// The card's parts: a row of its own for its user (a note Effect), and its lines; a conjured creature; a choice of ways, each a plan.
// (Its companion's, the creatures its presser targets — the item card's recipient "targets", as the module's other companion items.)
const COMPANION = { recipient: "targets" };
const ownRow = ({ noteEffects = [], notes = [], target = null }) => ({
    targeting: { target, range: null, area: null },
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
// (A way of the ways card: its own plan, as the activation's.)
const wayPlan = ({ item: own, ...card }, { base, info }) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(own ?? {}) } });
const ways = (list, { once = true } = {}) => ({ builtin: "ways", targeting: { target: null, range: null, area: null }, ...(once ? { once: true } : {}), ways: list });
// (PF2e's Spider Swarm's resistances and weaknesses, Monster Core's: what Swarmform Collar's swarm gains — test/creatures-2026-10-27.test.js
// holds them to the stat block.)
export const SPIDER_SWARM = { resistances: [{ type: "bludgeoning", value: 2 }, { type: "piercing", value: 5 }, { type: "slashing", value: 5 }], weaknesses: [{ type: "area-damage", value: 5 }, { type: "splash-damage", value: 5 }] };
const basicRows = () => Object.fromEntries([["criticalSuccess", 0], ["success", 0.5], ["failure", 1], ["criticalFailure", 2]].map(([degree, multiplier]) => [degree, { damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] }]));

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
        card: ([, animates], plan, context) => {
            const way = (size) => wayPlan(conjure({
                creatures: [creature({ name: "Galvaheart Zombie", size, from: { name: "Zombie Shambler" }, traits: ["minion", "construct"], replaceType: true, removeTraits: ["unholy"], immunities: ["vitality"], own: { dropWeaknesses: ["vitality"] } })],
                lasts: timeOf(animates[1], animates[2]),
                notes: [
                    "Inserted into an adjacent intact humanoid corpse: its token goes where the corpse is.",
                    "A zombie shambler's statistics, but a construct, not undead or unholy, and vitality energy can't harm it.",
                    `${MINION} Not commanded, it takes no action.`
                ]
            }), context);
            return ways([{ name: "A Medium corpse", html: "<p>A Medium galvaheart zombie.</p>", plan: way("medium") }, { name: "A Small corpse", html: "<p>A Small galvaheart zombie.</p>", plan: way("small") }]);
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
        // (Merged into the statuette: Petrified and Tiny until it's called forth — a note Effect of PF2e's rules on its companion, with no time.)
        name: "Hosteling Statuette",
        sentences: [
            /^You touch your companion, merging it into the statuette and ending the activation with the statuette in your hand \(or on the ground in your space if you don't have a hand free\)\.$/,
            /^While in statuette form, your companion has the Petrified condition, and its size is Tiny\.$/
        ],
        card: () => ({
            ...ownRow({
                target: "your companion",
                noteEffects: [{ label: "Statuette form", text: "Merged into the statuette: Petrified, and Tiny, until it's called forth again (the statuette's other activation ends this Effect).", rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.dTwPJuKgBQCMxixg", inMemoryOnly: true }, { key: "CreatureSize", value: "tiny" }], duration: null }],
                notes: ["Its token is the statuette now: in its user's hand, or on the ground in their space with no hand free (move or hide it)."]
            }),
            item: COMPANION
        })
    },
    {
        // (Called forth: its statuette form ended — plan.item.endsOwn, the Effect the other activation gave — beside its user.)
        name: "Hosteling Statuette",
        sentences: [/^You call forth your companion from the statuette, causing it to unmerge and appear in an unoccupied space adjacent to you\.$/],
        card: () => ({ ...ownRow({ target: "your companion", notes: ["It unmerges into an unoccupied space adjacent to its user: put its token there."] }), item: { ...COMPANION, endsOwn: { label: "Statuette form" } } })
    },
    {
        // (Attuned to a companion or a willing mount over 10 minutes, out of combat: the card's lines.)
        name: "Whistle of Calling",
        sentences: [
            /^You blow the whistle at different tones in the presence of a companion or another allied creature willing to be your mount\.$/,
            /^At the end of the (\d+) minutes, the whistle is attuned to that creature\.$/,
            /^The whistle can be attuned to only one creature at any time, but you can attune it to a new one with another \d+-minute activation\.$/
        ],
        card: ([, minutes]) => ownRow({ notes: [`After ${minutes[1]} minutes of whistling near its companion, or another ally willing to be its mount, the whistle is attuned to that creature — one at a time, a new attunement replacing the last. Its other activation calls that creature.`] })
    },
    {
        // (A swim Speed of 30 feet for 10 minutes — the item card's Speed —, or +10 feet to the one it has — a note Effect of PF2e's rule: the
        // ways card, for its companion, over the ability compiler's note, partial.)
        name: "Waverider Barding",
        over: true,
        sentences: [
            /^You trace a finger along the wave patterns on the barding, granting your companion a swim Speed of (\d+) feet for (\d+) (minutes?|rounds?|hours?)\.$/,
            /^If your companion already had a swim Speed, it gains a \+(\d+)-foot item bonus to its swim Speed for \d+ (?:minutes?|rounds?|hours?) instead\.$/,
            /^Even if the companion doesn't have the mount special ability, it can still Swim while being ridden\.$/
        ],
        card: ([granted, bonus], plan, context) => {
            const duration = timeOf(granted[2], granted[3]);
            const line = "Even without the mount special ability, it can Swim while ridden.";
            return ways([
                { name: "It has no swim Speed", html: `<p>A swim Speed of ${granted[1]} feet.</p>`, plan: wayPlan({ ...ownRow({ target: "your companion", notes: [line] }), item: { ...COMPANION, speeds: [{ type: "swim", value: Number(granted[1]), duration }] } }, context) },
                { name: "It has a swim Speed", html: `<p>+${bonus[1]} feet to its swim Speed.</p>`, plan: wayPlan({ ...ownRow({ target: "your companion", noteEffects: [{ label: "Swim Speed", text: `A +${bonus[1]}-foot item bonus to its swim Speed. ${line}`, rules: [{ key: "FlatModifier", selector: "swim-speed", type: "item", value: Number(bonus[1]) }], duration }] }), item: COMPANION }, context) }
            ]);
        }
    },
    {
        // (A swarm for a minute: a note Effect of PF2e's rules on its companion — Large, the swarm trait, a Spider Swarm's
        // resistances and weaknesses —, and its swarming attack's save card kept open for that minute, pressed each time it's used (plan.again),
        // its damage type the companion's unarmed attacks', picked on the card.)
        name: "Swarmform Collar",
        sentences: [
            /^You touch the collar and your companion splits into a swarm of hundreds of identical Tiny versions of itself for (\d+) (minutes?|rounds?)\.$/,
            /^Its space becomes Large, it gains the weaknesses and resistances of a Spider Swarm, and the swarm trait, though it doesn't gain swarm mind, as it's controlled by a single mind\.$/,
            /^Its unarmed attacks are replaced with a single-action swarming attack that deals (\d+d\d+) damage of the type normally inflicted by the companion's unarmed attacks to any foe in its space, with a @Check\[reflex\|dc:(\d+)\|basic[^\]]*\] save\.$/,
            /^While in swarm form, your companion can take the Support action but can't perform its advanced maneuver\.$/,
            /^Its other statistics don't change\.$/,
            /^If the companion is reduced to 0 Hit Points while in swarm form, the companion immediately recombines into its original form in an available space, in addition to the usual effects of being reduced to 0 Hit Points\.$/
        ],
        card: ([splits, , attack], plan, { base }) => {
            const duration = timeOf(splits[1], splits[2]);
            const rules = [{ key: "CreatureSize", value: "large" }, { key: "ActorTraits", add: ["swarm"] }, ...SPIDER_SWARM.resistances.map((entry) => ({ key: "Resistance", ...entry })), ...SPIDER_SWARM.weaknesses.map((entry) => ({ key: "Weakness", ...entry }))];
            const types = ["bludgeoning", "piercing", "slashing"];
            const swarming = {
                ...base,
                source: { ...base.source, name: `${base.source.name}: Swarm Attack` },
                automation: { level: "automatic" },
                targeting: { target: "each foe in its space", range: null, area: null },
                trigger: { event: "use" },
                resolution: { kind: "save", check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: Number(attack[2]) } }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${attack[1]}[${types[0]}]`, type: null, category: null }] }, outcomes: basicRows() },
                damageChoices: types.map((type) => ({ label: `${type.charAt(0).toUpperCase()}${type.slice(1)} (its unarmed attacks' type)`, formula: `${attack[1]}[${type}]` }))
            };
            return {
                ...ownRow({ target: "your companion", noteEffects: [{ label: "Swarm form", text: `A swarm of Tiny copies of itself: Large, with the swarm trait (no swarm mind) and a Spider Swarm's resistances and weaknesses. Its unarmed attacks are replaced by its swarming attack (1 action: ${attack[1]} damage of their type to each foe in its space, basic Reflex DC ${attack[2]} — its card stays open). It can Support but not use its advanced maneuver. At 0 Hit Points it recombines in an available space: remove this Effect.`, rules, duration }] }),
                again: { plan: swarming, later: true, repeat: true, time: { value: duration.value, unit: duration.unit }, when: "{user} uses its swarming attack (1 action), at the foes in its space" },
                item: COMPANION
            };
        }
    },
    {
        // (A tattoo guardian with a summon spell's parameters: PF2e's Tattoo Guardian, summoned and a minion, Sustained up to a minute; at 0 Hit
        // Points it's gone, a tattoo again.)
        name: "Bound Guardian",
        sentences: [
            /^You animate your tattoo guardian, otherwise using the duration and other parameters of a (\d+)(?:st|nd|rd|th)-rank Summon Construct spell\.$/,
            /^You can have the guardian Fly Free as part of Activating your tattoo\.$/,
            /^If your tattoo guardian drops to 0 HP, the activation ends, and the inanimate tattoo returns to your skin\.$/
        ],
        card: ([summon]) => conjure({
            creatures: [creature({ name: "Tattoo Guardian", from: { name: "Tattoo Guardian" }, traits: ["summoned", "minion"] })],
            lasts: SUMMON_TIME,
            notes: [
                SUMMONED(`Summon Construct (rank ${summon[1]})`),
                "Its user can have it Fly Free as part of the activation.",
                "At 0 Hit Points the activation ends and it's a tattoo on its user's skin again."
            ]
        })
    },
    {
        // (The tattoo's animal, picked by its user — a common animal of level 4 or lower, chosen when tattooed —, with a summon spell's
        // parameters: summoned and a minion beside its user, Sustained up to a minute; at 0 Hit Points it's a tattoo again.)
        name: "Fauna Guardian",
        sentences: [
            /^You animate your tattoo using the duration and other parameters of a (\d+)(?:st|nd|rd|th)-rank Summon Animal spell\.$/,
            /^It appears in a space adjacent to you\.$/,
            /^If your tattoo animal drops to 0 HP, the activation ends, and the inanimate tattoo returns to your skin\.$/
        ],
        card: ([summon], plan, { item }) => {
            const tattooed = /\bcan be any common animal of (\d+)(?:st|nd|rd|th) level or lower\b/i.exec(item ?? "");
            if (!tattooed) return null;
            return conjure({
                creatures: [creature({ name: "Tattoo animal", traits: ["summoned", "minion"] })],
                pick: { any: ["animal"], maxLevel: Number(tattooed[1]) },
                lasts: SUMMON_TIME,
                notes: [
                    `Its user picks the animal its tattoo shows: chosen when it was tattooed, a common animal of level ${tattooed[1]} or lower (others if the GM allows).`,
                    SUMMONED(`Summon Animal (rank ${summon[1]})`),
                    "It appears in a space adjacent to its user.",
                    "At 0 Hit Points the activation ends and it's a tattoo on its user's skin again."
                ]
            });
        }
    },
    {
        // (A summon cast with no limits of alignment, whose celestial fights only evil creatures: the cast's lines its card's, a behaviour beside
        // the cast.)
        name: "Busine of Divine Reinforcements",
        over: true,
        sentences: [
            /^You blow into the busine and conjure a celestial with the effects of a 6th-rank Summon Celestial spell, but there are no alignment restrictions to define which celestials you can call\.$/,
            /^The celestial will fight only evil creatures and leaves after all present evil creatures have been defeated or the spell's duration ends, whichever comes first\.$/,
            /^You can Sustain the Activation to extend the spell's duration, as normal\.$/,
            /^If you have a deity and the conjured celestial's alignment is one of your deity's preferred alignments, the effect functions as a normal 6th-rank summon celestial spell instead, meaning the celestial will fight any creature, not just evil creatures, and will perform other tasks as you command\.$/
        ],
        card: (found, plan) => (plan?.builtin === "cast-spell" ? {
            keep: true,
            partial: undefined,
            automation: { ...(plan.automation ?? {}), level: "automatic" },
            notes: [
                "Any celestial can be called: no alignment limits it.",
                "It fights only evil creatures, and leaves once every evil creature present is defeated or the spell ends, whichever is first.",
                "Its user Sustains the activation to keep the spell going, as normal.",
                "If its user has a deity whose preferred alignments include the celestial's, it's an ordinary summon: it fights any creature and does other tasks it's told."
            ]
        } : null)
    },
    {
        // (Phantasmal Minion as a visible skeleton: the cast's line, its look.)
        name: "Sack of Hydra's Teeth: Sow a Tooth",
        over: true,
        sentences: [
            /^You cast forth a tooth from the bag, and where it lands, a skeleton springs up from the ground\.$/,
            /^This has the effect of Phantasmal Minion, except the minion appears as a visible skeleton\.$/
        ],
        card: (found, plan) => (plan?.builtin === "cast-spell" ? { keep: true, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" }, notes: ["The minion looks like a visible skeleton, springing up where the tooth lands: not Invisible."] } : null)
    },
    {
        // (Cozy Cabin as a sunken ship full of air, under water: the cast's lines, its look and the air inside — out of combat.)
        name: "Anchor of Aquatic Exploration",
        over: true,
        sentences: [
            /^You spend one minute digging the anchor into the seabed, after which the anchor casts a Cozy Cabin spell, summoning a sunken ship instead of a cabin\.$/,
            /^The sunken ship is filled with breathable air\.$/
        ],
        card: (found, plan) => (plan?.builtin === "cast-spell" ? { keep: true, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" }, notes: ["Dug into the seabed for its minute, it casts Cozy Cabin: the shelter is a sunken ship, filled with air its occupants can breathe."] } : null)
    },
    {
        // (A Small object a Sea Snake, a Medium one a Python, each PF2e's linked creature as a minion for a minute: the ways card.)
        name: "Serpent Oil (Moderate)",
        sentences: [
            /^This glistening oil has a green hue and tiny snake scales floating within\.$/,
            /^If you slather serpent oil on an object, the object transforms\.$/,
            /^The oil can be applied to a Small object, producing a Sea Snake, or a Medium object, producing a Python, keeping some of the same colors and patterns of the original item\.$/,
            /^If placed on other objects, the oil fails and is wasted\.$/,
            /^This false snake has the minion trait\.$/,
            /^It remains in snake form for (\d+) (minutes?|rounds?) before returning to its object state\.$/,
            /^If slain, the item returns to its original form, unharmed\.$/
        ],
        card: ([, , , , , remains], plan, context) => {
            const snake = (label, size) => {
                const uuid = linkOf(context.html, label);
                return uuid ? { name: `A ${size} object`, html: `<p>A ${label}.</p>`, plan: wayPlan(conjure({
                    creatures: [creature({ name: label, from: { uuid }, traits: ["minion"] })],
                    lasts: timeOf(remains[1], remains[2]),
                    notes: [`The ${size} object it's slathered on becomes the snake (any other object wastes the oil): its token where the object is.`, MINION, "Slain, it's the object again, unharmed."]
                }), context) } : null;
            };
            const list = [snake("Sea Snake", "Small"), snake("Python", "Medium")];
            return list.every(Boolean) ? ways(list) : null;
        }
    },
    {
        // (Four Unseen Servants carrying the palanquin, for travel out of combat until it's folded up: the ability module's conjured tokens, the
        // rest its card's lines.)
        name: "Palanquin of Night",
        sentences: [
            /^The fabric unfolds into a dark palanquin large enough to comfortably hold two Medium creatures\.$/,
            /^Four spectral bearers appear at the corners of the palanquin, capable of carrying it effortlessly over most types of terrain as long as the terrain is relatively flat and devoid of hazards\.$/,
            /^Spectral bearers have the statistics of an Unseen Servant, except they're strong enough to carry the palanquin and its occupants\.$/,
            /^They move generally along a basic set of directions you indicate upon activation, which can include turns onto various streets, but they don't take other creatures' feelings into account and can be inconsiderate to passersby in an inhabited area as they relentlessly move you forward\.$/,
            /^The bearers move slowly but steadily along their simple directions\.$/,
            /^While the palanquin is perfectly suitable for overland travel, the bearers' imprecise movements and the requirement to reactivate the palanquin to change destinations make it unsuited for a combat encounter or other situation where seconds and precise movements count\.$/,
            /^The palanquin's interior ceiling is painted with the same night sky pattern as the cloth, and dark curtains hang over the windows\.$/,
            /^The palanquin protects its occupants from sunlight and severe heat and cold \(though not extreme or incredible heat or cold\) as well as blocks most non-damaging forms of weather\.$/,
            /^The palanquin is only as sturdy as a standard wooden carriage - if it would be destroyed, it instantly reverts to a square of fabric and can't be Activated again for 1 month\.$/,
            /^You can return the palanquin to its original shape by using an Interact action to command the spectral bearers to collapse it\.$/,
            /^They disappear the moment it returns to its fabric form\.$/
        ],
        card: (found, plan, { html }) => {
            const uuid = linkOf(html, "Unseen Servant");
            return uuid ? conjure({
                creatures: [creature({ name: "Spectral Bearer", count: 4, from: { uuid } })],
                vanishAtZero: false,
                notes: [
                    "The fabric unfolds into a palanquin that seats two Medium creatures, a bearer at each corner: place it and them on the map.",
                    "Unseen Servants strong enough to carry it and those inside, they bear it slowly and steadily over fairly flat ground free of hazards, along the simple directions given as it's activated (streets and turns too), heedless of passersby. It's for travel, not an encounter: a new destination needs a new activation.",
                    "Inside, it keeps out sunlight, severe heat and cold (not extreme or incredible), and most weather that does no damage.",
                    "As sturdy as a wooden carriage: destroyed, it's a square of fabric again and can't be activated for a month.",
                    "An Interact action folds it back into fabric, and the bearers vanish: dismiss them."
                ]
            }) : null;
        }
    },
    {
        // (A performance contest with a talent the ritual conjures, out of combat: the +2 item bonus to its user's Performance checks a note Effect
        // of PF2e's rule until it's over, the contest its card's lines — the talent the GM's.)
        name: "Bargainer's Instrument",
        sentences: [
            /^A bargainer's instrument is a musical implement\.$/,
            /^The most typical version is a violin made from maple and spruce, its body stained so deep a purple it appears almost black\.$/,
            /^When activated, the instrument casts a Binding Circle ritual to conjure a willing extraplanar talent to compete with you in performance\.$/,
            /^The contest could be a musical battle, a dance-off, an oratorical debate - the two of you could even use entirely different types of performance\.$/,
            /^The loser of the bout is magically bound to perform a task of the winner's choice within (\d+) weeks?\.$/,
            /^The contest consists of taking turns to Perform, starting with your opponent\.$/,
            /^The Performance check's DC is the higher of the opponent's Perception DC or Will DC, though the two parties can mutually agree to use an impartial judge instead\.$/,
            /^The first to reach (four|\d+) successes wins, with each critical successes counting as two successes\.$/,
            /^If you play the bargainer's instrument as part of your performance, it grants you a \+(\d+) item bonus to the Performance checks\.$/,
            /^After the contest, the conjured creature can choose to return to where it came from or remain where you conjured it\.$/,
            /^The loser must endeavor to complete the task by all reasonable means within \d+ weeks?\.$/,
            /^Failing to complete it is shameful but has no further consequences\.$/,
            /^The instrument loses its magic and remains a non-magical virtuoso instrument\.$/
        ],
        card: ([, , , , bound, , , first, bonus]) => ownRow({
            noteEffects: [{ label: "Performance contest", text: `+${bonus[1]} item bonus to its Performance checks played on the instrument in the contest: remove this Effect once it's over.`, rules: [{ key: "FlatModifier", selector: "performance", type: "item", value: Number(bonus[1]) }], duration: null }],
            notes: [
                "Its Binding Circle conjures a willing extraplanar talent (the GM's) to compete in performance — music, dance, oration, even different kinds.",
                `They take turns to Perform, the talent first, against the higher of the other's Perception DC and Will DC (or an impartial judge both agree on); the first to ${first[1]} successes wins, a critical success counting two.`,
                `The loser is magically bound to do a task of the winner's choice within ${bound[1]} week${bound[1] === "1" ? "" : "s"}, by all reasonable means; failing it is shameful, with no other consequence. After, the talent leaves or stays, as it chooses.`,
                "The instrument is a non-magical virtuoso instrument after."
            ]
        })
    },
    {
        // (A lost object or body found within 500 feet: what it shows, whispered to the GM and its user.)
        name: "Mourner's Dawnlight Fulu",
        sentences: [
            /^A mourner's dawnlight fulu is a stack of pages that resembles joss paper, used to locate the remains of the lost\.$/,
            /^When you Activate the fulu, you envision a specific object or deceased creature you're familiar with and want to find\.$/,
            /^You then rip the fulu into pieces and let them drift in the wind\.$/,
            /^If the item or creature you seek is within (\d+) feet, the pieces flutter through the air and land on the target, or on the surface closest to a buried or otherwise obscured target\.$/,
            /^If the torn fulu lands or fails to locate the desired target, its magic ends\.$/
        ],
        card: ([, , , within]) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text: `Its user pictures an object or a dead creature it knows and tears the fulu up: if that's within ${within[1]} feet, the pieces drift to it and land on it, or on the surface nearest it if it's buried or hidden — the GM shows where. Else, or once they land, its magic ends.` } })
    },
    ...["Cooperative Waffles", "Cooperative Waffles (Greater)"].map((name) => ({
        // (A bonus 1 higher between two who shared them, for Follow the Expert (and Aid, the greater's), for 24 hours: a note Effect on each,
        // PF2e's Follow the Expert telling no one whom it follows.)
        name,
        sentences: [
            /^Flash-cooked on a waffle iron and drizzled with alchemical syrups and compound butter, cooperative waffles bolster the supportive spirit of those who share the batch\.$/,
            /^You can split the waffles with one other creature\.$/,
            /^After you both eat half of the waffles to Activate them, when one of you uses Follow the Expert to follow the other, the circumstance bonus granted is 1 higher\.$/,
            ...(name.endsWith("(Greater)") ? [/^The benefit of the waffles also applies when one of you successfully Aids a skill check the other attempts\.$/] : []),
            /^The waffles' bonus lasts (\d+) hours or until you next make your daily preparations, whichever comes first\.$/,
            /^You can only be linked to one creature in this way at a time; if either of you eats cooperative waffles again, the effect of your previous waffles ends\.$/
        ],
        card: (found) => {
            const aids = name.endsWith("(Greater)");
            const lasts = found.at(-2);
            return {
                ...ownRow({
                    target: "its user and the creature it shares them with",
                    noteEffects: [{ label: "Linked by waffles", text: `When one of the two who shared them uses Follow the Expert to follow the other, its circumstance bonus is 1 higher${aids ? ", as is the bonus when one successfully Aids the other's skill check" : ""}. Until the next daily preparations, ${lasts[1]} hours at most; eating cooperative waffles again ends this link.`, duration: timeOf(lasts[1], "hours") }],
                    notes: ["Target both who share them: its user and the other creature."]
                }),
                item: COMPANION
            };
        }
    })),
    {
        // (A harrow card or 1d6 for the next check of a kind rolled twice, until the next daily preparations: the table card, each row the
        // fortune card's roll twice.)
        name: "Harrow Spellcards",
        sentences: [
            /^You draw forth a card to gain insight into future challenges you'll face\.$/,
            /^Draw a card from a harrow deck or roll 1d6: 1 = hammers \(Athletics\) 2 = keys \(Acrobatics\) 3 = shields \(Survival\) 4 = books \(any Recall Knowledge\) 5 = stars \(Religion\) 6 = crowns \(Diplomacy\)\.$/,
            /^The next time you attempt a check of the same type as your result, roll twice and take the better result, as the spirits of the harrow guide your actions\.$/,
            /^If not used by your next daily preparations, this benefit disappears\.$/
        ],
        card: (found, plan, { base }) => {
            const until = { value: 1, unit: "days", expiry: "turn-start" };
            const row = (low, suit, words, roll) => ({ low, high: low, text: `${suit}: ${words}, rolled twice (the better kept).`, plan: { ...base, builtin: "roll-twice", automation: { level: "automatic" }, targeting: { target: "the user", range: null, area: null }, trigger: { event: "use" }, rollTwice: { ...roll, keep: "higher", duration: until }, notes: ["Until its next daily preparations (a day) if it's not used."] } });
            return {
                builtin: "table",
                targeting: { target: null, range: null, area: null },
                table: { die: "1d6", rows: [row(1, "Hammers", "its next Athletics check", { selector: "athletics" }), row(2, "Keys", "its next Acrobatics check", { selector: "acrobatics" }), row(3, "Shields", "its next Survival check", { selector: "survival" }), row(4, "Books", "its next Recall Knowledge check", { selector: "skill-check", predicate: ["action:recall-knowledge"] }), row(5, "Stars", "its next Religion check", { selector: "religion" }), row(6, "Crowns", "its next Diplomacy check", { selector: "diplomacy" })] },
                notes: ["A harrow card drawn in place of the roll: its suit's row (hammers 1, keys 2, shields 3, books 4, stars 5, crowns 6)."]
            };
        }
    },
    {
        // (Healing for its undead minion before the damage that would destroy it, 1d8 per rank of the slot with Harm its user expends: the ways
        // card, a way per rank, each spending that slot — src/compiler/slot-cost.js's spellSlot { rank }.)
        name: "Doctrine of Blissful Eternity",
        sentences: [
            /^You call out and demand the undead to remain, reaching out with tendrils of void energy that preserves your minion so it might continue to serve you\.$/,
            /^Expend a spell slot in which you've prepared a Harm spell to restore (\d+)d(\d+) Hit Points to your undead minion per level of the expended spell slot, before applying the damage\.$/,
            /^If this prevents the minion from being reduced to 0 Hit Points, it isn't destroyed\.$/
        ],
        card: ([, restore], plan, context) => ways(Array.from({ length: 10 }, (unused, index) => index + 1).map((rank) => ({
            name: `A rank ${rank} slot`,
            html: `<p>${Number(restore[1]) * rank}d${restore[2]} Hit Points.</p>`,
            plan: wayPlan({
                targeting: { target: "your undead minion", range: null, area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects: [{ kind: "heal", formula: `${Number(restore[1]) * rank}d${restore[2]}` }] } } },
                spend: { spellSlot: { rank } },
                notes: ["A slot it prepared Harm in: the card spends one of that rank.", "Before the triggering damage: heal first, then apply it; kept above 0 Hit Points, the minion isn't destroyed."]
            }, context)
        })))
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
// plan. name: its source name; base, info, frequency: its own (an activation's, or a consumable's basePlan and itemInfo); html: its text,
// item: the whole item's plain text.
// (A card with keep: true goes over the plan read before — a cast's — its fields changed, undefined ones gone.)
export function withCreatureReading(plan, { name, words, html = "", item = "", base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, base, info, item }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept: a cast's lines its card's, Busine of Divine Reinforcements'.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
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
