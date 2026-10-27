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
const ownRowWith = (row, item) => ({ ...ownRow(row), item });
// (The ability module's zone, its fields as its compiler gives them — area-readings.js's shape.)
const zoneOf = (fields) => ({ area: null, centre: "self", range: null, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: [], ...fields });

// A save card's plan at one creature: its statistic and DC, the conditions on a failure and a critical failure.
const condition = (slug, value = null, duration = null) => ({ kind: "condition", slug: String(slug).toLowerCase(), value, ...(duration ? { duration } : {}) });
// (failureNote: a note Effect on a failure and a critical failure — Lesser Cube of Nex's move action wasted.)
function savePlan({ name, statistic, dc, failure = [], criticalFailure = [], base = null, failureNote = null }) {
    const failed = (effects) => ({ ...none(), effects, ...(failureNote ? { noteEffects: [failureNote] } : {}) });
    return {
        modelVersion: base?.modelVersion ?? 13,
        source: { ...(base?.source ?? {}), name },
        rank: 1,
        traits: [...(base?.traits ?? [])],
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: String(statistic).toLowerCase(), basic: false, against: { dc: "fixed", value: dc } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: failed(failure), criticalFailure: failed(criticalFailure) } }
    };
}
// (PF2e's abilities of creatures vulnerable to sunlight, by slug: deros' Sunlight Powerlessness, vampires' Vulnerable to Sunlight, …)
const SUNLIGHT = ["sunlight-powerlessness", "vulnerable-to-sunlight", "sunlight-petrification", "sunlight-vulnerability"];

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
    },
    {
        // Runewell of Lust's Exit the Eye: the teleport card — its user to a space it picks within 30 feet of the anima focus, the token its
        // presser targets; standing in the runewell, and the anima focus on another scene, its card's lines.
        name: "Runewell of Lust: Exit the Eye",
        sentences: [/^By splashing the runewell's water on yourself while you stand within it, you transport yourself back to a space of your choice within (\d+) feet of the anima focus, which is currently located in Sorshen's atrium\.$/],
        card: ([exit]) => ({
            builtin: "teleport",
            targeting: { target: "1 creature", range: null, area: null },
            teleport: { within: Number(exit[1]), speedTimes: null, from: "target", lines: ["The token targeted: the anima focus (now in Sorshen's atrium)", "Its user stands in the runewell's waters to splash them on itself"] },
            notes: ["The anima focus on another scene: the GM moves its user's token there, to a space within 30 feet of it that its user picks."]
        })
    },
    {
        // Freedom's Flame's Break Free: its Mythic Point spent; each creature its presser targets within 120 feet — those under a compulsion
        // or control effect — gets a note Effect with PF2e's +3 status bonus to its next saving throw (gone after that roll), for the new save
        // each attempts at once (its own roll against that effect, which PF2e can't tell). The beacon's light, its card's line.
        name: "Freedom's Flame: Break Free",
        sentences: [
            /^Spend a Mythic Point; Freedom's Flame blazes with a rose-red light, creating a beacon of spiritual strength\.$/,
            /^Any creature within (\d+) feet that's currently under a compulsion or control effect can immediately attempt a new saving throw to break free of the effect, with a \+(\d+) (status) bonus\.$/
        ],
        card: ([, freed]) => ({
            ...ownRow({
                noteEffects: [{
                    label: "Break Free",
                    text: `It attempts a new saving throw at once against the compulsion or control effect on it, breaking free on a success: +${freed[2]} ${freed[3]} bonus to that save (gone after it).`,
                    duration: timeOf(1, "rounds"),
                    rules: [{ key: "FlatModifier", selector: "saving-throw", type: freed[3], value: Number(freed[2]), removeAfterRoll: "if-enabled" }]
                }],
                notes: [
                    `Target each creature within ${freed[1]} feet under a compulsion or control effect: each attempts its new save against that effect now (its own roll, the bonus on it).`,
                    "Freedom's Flame blazes with a rose-red light, a beacon of spiritual strength."
                ]
            }),
            targeting: { target: `creatures within ${freed[1]} feet under a compulsion or control effect`, range: `${freed[1]} feet`, area: null },
            spend: { mythicPoints: 1 },
            item: { recipient: "targets" }
        })
    },
    {
        // Retribution's Vengeful Slice: the Strike card with Retribution itself, once per round, at a creature within 120 feet it can see that
        // damaged its user within the last minute, as if within reach (PF2e rolls a Strike at any creature targeted: its target its user's
        // pick, its card's line).
        name: "Retribution: Vengeful Slice",
        sentences: [/^You make a Strike with Retribution against a target within (\d+) feet that you can see and who damaged you within the last minute, as if they were within reach\.$/],
        card: ([slice]) => ({
            targeting: { target: "the creature the Strike hits", range: `${slice[1]} feet`, area: null },
            trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
            resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
            strike: { range: null, save: null, own: true, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], options: [], lines: [`With Retribution, at a creature within ${slice[1]} feet that it can see and that damaged it within the last minute: as if it were within reach (target it, then Strike)`] }
        })
    },
    {
        // Clockwork Sun's Set Cycle: its cycle and its lit periods its user's own setting (the card's lines); while lit, an Effect on the
        // sun's token (its own actor using it) with PF2e's TokenLight — a sunny day's bright light to 1 mile — and the saves it calls for at
        // creatures' turns (scripts/turn-auras.js): a sighted creature ending its turn within 20 feet that didn't Avert Gaze, DC 43
        // Fortitude or Dazzled for 1 minute (Blinded on a critical failure); a creature vulnerable to sunlight (an ability of that name, as
        // deros' and vampires') starting its turn in the light, DC 43 Will or Sickened 1 (2 on a critical failure).
        name: "Clockwork Sun: Set Cycle",
        over: true,
        sentences: [
            /^You program the clockwork sun's motions and periods of illumination over the course of a (\d+)-hour cycle\.$/,
            /^The clockwork sun follows this cycle exactly and must return to its starting point at the end of each cycle\.$/,
            /^If it does so, the act of the cycle automatically winds the clockwork sun, and it repeats the cycle\.$/,
            /^A clockwork sun that encounters an unexpected barrier can navigate simple blockades by moving around or climbing over them ?[-—–] ?as such, many users set a clockwork sun's cycle to take less time than 24 hours, giving the artifact plenty of time to return to its starting spot if it's forced take detours\.$/,
            /^As part of setting the clockwork sun's cycle, you also determine the periods during which the artifact is illuminated; the total illumination time can't be longer than half the sun's total cycle time \(typically 12 hours\)\.$/,
            /^While illuminated, a clockwork sun sheds bright light equivalent to that of a sunny day to a radius of (\d+) mile\.$/,
            /^A sighted creature that ends their turn within (\d+) feet of an illuminated clockwork sun and didn't Avert Gaze during their turn must succeed at a @Check\[(fortitude)\|dc:(\d+)\] save or be (Dazzled) for (\d+) (minutes?) \((Blinded) for (\d+) (minutes?) on a critical failure\)\.$/,
            /^Creatures at a further distance can look directly at the light without fear, as it's not as intense as true sunlight\.$/,
            /^Creatures that are vulnerable to sunlight \(such as deros or vampires\) do not treat the light of a clockwork sun as true sunlight, but if they start their turn within the illumination, they must succeed at a @Check\[(will)\|dc:(\d+)\] save or become (Sickened) (\d+) \(Sickened (\d+) on a critical failure\) from the minor but discomforting pain the near-sunlight induces\.$/
        ],
        card: ([cycle, , , , , light, glare, , pain], plan) => {
            const feet = Number(light[1]) * 5280;
            const glareSave = savePlan({ name: "Clockwork Sun: its glare", statistic: glare[2], dc: Number(glare[3]), failure: [condition(glare[4], null, timeOf(glare[5], glare[6]))], criticalFailure: [condition(glare[7], null, timeOf(glare[8], glare[9]))], base: plan });
            const painSave = savePlan({ name: "Clockwork Sun: near-sunlight", statistic: pain[1], dc: Number(pain[2]), failure: [condition(pain[3], Number(pain[4]))], criticalFailure: [condition(pain[3], Number(pain[5]))], base: plan });
            return {
                ...ownRow({
                    notes: [
                        `Its user programs its ${cycle[1]}-hour cycle — its moves and its lit periods, no more than half the cycle lit (typically 12 hours) — and it follows it exactly, back at its start each time, which winds it to repeat. It goes around or over simple barriers (many cycles are set shorter, for detours).`,
                        "Used from the clockwork sun's own token (its actor carrying it): its light and its saves are there. Delete its Effect when a lit period ends, and use it again for the next.",
                        "Farther than 20 feet, creatures can look at it safely: it isn't as intense as true sunlight, and it's not true sunlight to creatures vulnerable to it."
                    ]
                }),
                item: {
                    ruleEffects: [{
                        name: "Illuminated",
                        words: `Bright light like a sunny day to ${light[1]} mile; a sighted creature ending its turn within ${glare[1]} feet that didn't Avert Gaze attempts a DC ${glare[3]} Fortitude save (Dazzled 1 minute, Blinded on a critical failure); a creature vulnerable to sunlight starting its turn in the light, a DC ${pain[2]} Will save (Sickened ${pain[4]}, ${pain[5]} on a critical failure)`,
                        rules: [{ key: "TokenLight", value: { bright: feet, dim: feet } }],
                        duration: null,
                        turnAuras: [
                            { radius: Number(glare[1]), at: "end", sighted: true, unless: ["effect-avert-gaze"], label: `DC ${glare[3]} Fortitude save against its glare`, plan: glareSave },
                            { radius: feet, at: "start", only: { abilities: SUNLIGHT }, label: `DC ${pain[2]} Will save against the near-sunlight`, plan: painSave }
                        ]
                    }]
                }
            };
        }
    },
    {
        // Lesser Cube of Nex: the ways card's six faces, each a 10-foot cube of walls round its user — the ability module's zone the GM places
        // over its user's space, lasting until dismissed. Face 1 keeps out gas and wind, face 4 magical effects: the counteract card at +20
        // (rank 10, its level's half) for each that crosses. Faces 2 and 3 block nonliving and living matter: a DC 30 Will save for a creature
        // of that kind entering (by its traits: undead and constructs nonliving), its move action wasted on a failure. Face 5 is Wall of
        // Force: the environment module's walls round its user, Wall of Force's Hardness 30 and 60 Hit Points (scripts/item-structures.js).
        // Face 6 dismisses it, no activation (its walls removed; a zone ended on its own card). What overlaps a wall, a Huge user, and the
        // previous one dismissed first: its card's lines.
        name: "Lesser Cube of Nex",
        sentences: [
            /^You hold the cube aloft and depress one of its six faces for several seconds\.$/,
            /^The cube creates six walls around you, creating a cube (\d+) feet on each side centered on you \(typically centered on the top of your space if you're a Medium creature\)\.$/,
            /^If a creature or object overlaps any of these walls, that face of the cube doesn't appear; this also means if you're Huge or larger, the activation has no effect, as your space is larger than the cube would be\.$/,
            /^The effect of the six walls depends on which face of the cube you press when you Activate the cube, as seen on the Cube Effects table \(below\)\.$/,
            /^Pressing the sixth cube face with a simple Interact action Dismisses the effect; doing so isn't an activation and thus doesn't count against the cube's frequency\.$/,
            /^The walls have the AC, Hit Points, and Hardness of a Wall of Force\.\s*You must first Dismiss any previous activation before you use it again\.$/,
            /^Cube Face Effect 1 The walls keep out gas and wind, attempting to counteract such effects that cross the threshold with a \+(\d+) counteract modifier but allowing all other things through\. 2 The walls block nonliving matter from crossing; a nonliving creature must succeed at a @Check\[(will)\|dc:(\d+)\] save to cross the threshold, wasting their move action on a failure, and unattended objects can't cross\.$/,
            /^Non-magical ranged attacks can't cross either and instead attack the wall\.$/,
            /^A living creature can bring attended objects across the walls without needing to attempt a saving throw\. 3 The walls block living matter from crossing; a living creature must succeed at a @Check\[(will)\|dc:(\d+)\] save to cross the threshold, wasting their move action on a failure\. 4 The walls keep out magical effects that cross the threshold, attempting to counteract magical effects with a \+(\d+) counteract modifier, though they don't prevent a creature with magical items or effects from entering\. 5 The walls block everything, with the effects of Wall of Force\. 6 The cube is Dismissed \(this takes only an Interact action and isn't an activation\)\.$/
        ],
        card: ([, cube, , , , , gas, , living], plan, { base, info }) => {
            const side = Number(cube[1]);
            const rank = Math.max(1, Math.ceil((Number(info?.level) || 20) / 2));
            const walls = (notes, extra = {}) => ({ builtin: "zone", actions: null, targeting: { target: null, range: null, area: { type: "square", value: side } }, zone: zoneOf({ area: { type: "square", value: side }, centre: "placed", range: null, untilReused: true, notes: [`A ${side}-foot cube of walls round its user (place it over its space); a face a creature or object overlaps doesn't appear.`, ...notes], ...extra }) });
            const counteract = (modifier, what) => ({ modifier: Number(modifier), rank, conditions: [], traits: [], afflictions: [], free: { name: what }, pick: "one", notes: [`Each ${what} that crosses its walls: this counteract (the GM's call which cross).`] });
            const crossing = (kind, statistic, dc, only) => ({ when: ["enter"], only, plan: savePlan({ name: `Lesser Cube of Nex: ${kind} crossing`, statistic, dc: Number(dc), failure: [], criticalFailure: [], base: plan, failureNote: { label: "Lesser Cube of Nex: not crossed", text: "Its move action is wasted: it doesn't cross the cube's wall (put it back where it was).", duration: timeOf(0, "rounds", "turn-end") } }) });
            const way = (name, wayPlan) => ({ name, html: "", plan: { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...wayPlan, item: { ...info, ...(wayPlan.item ?? {}) } } });
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                notes: ["One face for each activation: dismiss the one before (face 6, an Interact, not an activation) first. A Huge or larger user's space is too big: nothing happens."],
                ways: [
                    way("Face 1: gas and wind kept out", { ...walls(["Gas and wind can't cross its walls; everything else can."]), item: { counteract: counteract(gas[1], "gas or wind effect") } }),
                    way("Face 2: nonliving matter blocked", walls(["Unattended objects and non-magical ranged attacks can't cross (an attack hits the wall instead); a living creature brings what it carries across."], { saves: [crossing("a nonliving creature", gas[2], gas[3], { traits: ["undead", "construct"] })] })),
                    way("Face 3: living matter blocked", walls(["Each living creature crossing attempts the save (a nonliving one, an undead or construct, doesn't: dismiss its card)."], { saves: [crossing("a living creature", living[1], living[2], undefined)] })),
                    way("Face 4: magic kept out", { ...walls(["A creature with magical items or effects can still enter."]), item: { counteract: counteract(living[3], "magical effect") } }),
                    way("Face 5: Wall of Force", ownRowWith({ notes: ["The walls block everything, as Wall of Force: AC 10, Hardness 30, 60 Hit Points, immune to critical hits and precision damage."] }, { structure: { name: "walls of force", shape: "square", feet: side, stats: { hardness: 30, hp: 60, bt: 0 }, words: `a ${side}-foot cube of walls of force round its user` } })),
                    way("Face 6: dismissed", ownRowWith({ notes: ["Dismissed with an Interact action, not an activation: its walls go (end its zone on the zone's own card)."] }, { removeStructures: true }))
                ]
            };
        }
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
        const card = found ? reading.card(found, plan, { base, info }) : null;
        if (!card) continue;
        const often = reading.frequency ?? frequency;
        const { item: own, trigger, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            // (Its own trigger where it has one — a Strike's —, its frequency kept.)
            trigger: { event: "use", ...(trigger ?? {}), ...(often ? { frequency: often } : {}) },
            ...rest,
            item: { ...info, ...(often ? { activation: { ...(info?.activation ?? {}), frequency: often } } : {}), ...(own ?? {}) }
        };
    }
    return plan;
}
