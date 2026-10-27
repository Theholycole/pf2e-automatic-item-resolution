// Unique items' and artifacts' activations built whole (2026-10-27, docs/needs.md; the user, the same day: "unique effects that are on unique
// rarity items should be automated … They are special and should feel special to players"): an activation read sentence by sentence, every
// sentence of its effect one of the reading's own — none dropped —, into what its card plays: every number, condition, duration, save, area
// and choice its text gives. Each reading names the mechanism it feeds (its own file and live script when it's a new one); its item's history,
// look and destruction are src/compiler/lore-lines.js's. Pure.

import { sentencesOf } from "./lasting.js";
import { spherePlanOf } from "./sphere.js";
import { cubeWaysOf, inertPlanOf } from "./cube-faces.js";
import { dragonArmyOf } from "./spectral-army.js";
import { contractSpellsOf } from "./contract-spells.js";
import { decoyDoublePlanOf } from "./decoy-double.js";
import { pairedStonePlanOf } from "./paired-stone.js";

// Each reading: the source names it's for (an activation's "Item: Activation"), whether it reads over the plan read before (by default only
// none, note-only, or the GM's no-effect), its Requirements line's pattern when it has one, a pattern for each of its effect's sentences —
// every sentence must be one, in order — and the card they make (from its matches, the plan before and { html, item, itemHtml, requirements,
// trigger, base, info }). index: which of the item's activations, when they have no names.
const READINGS = [
    {
        // Sphere of Annihilation: its control a check each round, the sphere moved toward a failed controller or where a successful one directs
        // it, whatever it touches destroyed (src/compiler/sphere.js, the item module's sphere card).
        names: ["Sphere of Annihilation"],
        requirements: /^You are within (\d+) feet of the sphere$/,
        sentences: [
            /^You attempt a @Check\[(arcana)\|dc:(\d+)\|[^\]]*\] or @Check\[(occultism)\|dc:\2\|[^\]]*\] check to take control of the sphere\.$/,
            /^If someone else already controls the sphere, this check uses their Will DC if higher\.$/,
            /^If you succeed, you take control of the sphere\.$/,
            /^If you fail, the sphere moves (\d+) feet closer to you \(or (\d+) feet on a critical failure\)\.$/,
            /^You keep control as long as you remain within (\d+) feet of the sphere and Sustain the Activation each round\.$/,
            /^When you Sustain the Activation, you must attempt a @Check\[(arcana)\|dc:(\d+)\|[^\]]*\] or @Check\[(occultism)\|dc:\2\|[^\]]*\] check\.$/,
            /^If you succeed, you direct the sphere to move up to (\d+) feet in a straight line \(or up to (\d+) feet on a critical success\)\.$/,
            /^On a failure, you lose control of the sphere, and it moves (\d+) feet closer to you in a straight line \(or (\d+) feet on a critical failure\)\.$/
        ],
        card: (found, _plan, { requirements, item }) => spherePlanOf(found, requirements, item)
    },
    {
        // Cube of Nex: the cube of walls, its face picked on the ways card (src/compiler/cube-faces.js): each a zone or the walls of force,
        // until dismissed. (Its zones' crossing saves wait on the ability module's "exit" saves and only.notTraits, its walls of force on the
        // environment module's invisible walls: partial till then.)
        names: ["Cube of Nex"],
        index: 0,
        sentences: [
            /^You hold the cube aloft and depress one of its six faces for several seconds\.$/,
            /^The cube creates six walls around you, creating a cube 10 feet on each side centered on you \(typically centered on the top of your space if you're a Medium creature\)\.$/,
            /^If a creature or object overlaps any of these walls, that face of the cube doesn't appear; this also means if you're Huge or larger, the activation has no effect, as your space is larger than the cube would be\.$/,
            /^The effect of the six walls depends on which face of the cube you press when you Activate the cube, as seen on the Cube Effects table \(below\)\.$/,
            /^Pressing the sixth cube face with a simple Interact action Dismisses the effect; doing so isn't an activation and thus doesn't count against the cube's frequency\.$/,
            /^The walls have the AC, Hit Points, and Hardness of a Wall of Force\.\s*You must first Dismiss any previous activation before you use it again\.$/
        ],
        card: (_found, _plan, { itemHtml, base, info }) => {
            const ways = cubeWaysOf(itemHtml, { base, info });
            return ways ? { ...ways, partial: true, automation: { level: "guided" } } : null;
        }
    },
    {
        // Cube of Nex's other activation: a cube of force or Lesser Cube of Nex made inert (src/compiler/cube-faces.js inertPlanOf); its block
        // ends with the first activation's table, read there.
        names: ["Cube of Nex"],
        index: 1,
        sentences: [
            /^(An? cube of force or Lesser Cube of Nex) within (\d+) feet of you becomes inert\.$/,
            /^It can't be Activated, any current activation ends, and any constant abilities it has cease to function\.$/,
            /^Cube Face Effect 1 The walls keep out gas and wind\b.*\b2 The walls block nonliving matter from crossing\b.*\bunattended objects can't cross\.$/,
            /^Non-magical ranged attacks can't cross either and instead attack the wall\.$/,
            /^A living creature can bring attended objects across the walls without needing to attempt a saving throw\. 3 The walls block living matter\b.*\b6 The cube is Dismissed \(this takes only an Interact action and isn't an activation\)\.$/
        ],
        card: (found, _plan, { info }) => inertPlanOf(found, info)
    },
    {
        // Dragon-Lotus Drum: its army's marker, its Arrive's save (read before) and its Depart's later card (src/compiler/spectral-army.js).
        names: ["Dragon-Lotus Drum: Summon Dragon-Lotus Army"],
        over: (plan) => plan?.resolution?.kind === "save" && plan.spend?.mythicPoints === 1,
        sentences: [
            /^Spend a Mythic Point; beating the drum summons a spectral army to an area you designate within (\d+) feet\.$/,
            /^The army takes its Arrive action when you finish playing\.$/,
            /^At the end of your next turn, the army Strides up to (\d+) feet and then takes its Depart action\.$/,
            /^The Dragon-Lotus Army follows your orders and attempts to not harm you and your allies when possible\.$/,
            /^The spectral force isn't fully a creature\.$/,
            /^It can't take any other actions, nor can it be targeted or harmed by Strikes, spells, or other effects unless they would be able to target or end a spell effect \(such as Dispel Magic\)\.$/,
            /^The army is (Gargantuan), but it doesn't block movement\.$/,
            /^Arrive \(([a-z, ]+)\) The Sound of Thunder The beating of the drum amplifies to become like the stomping of hundreds of booted feet\.$/,
            /^The Dragon- ?Lotus Army appears in perfect formation and gives a brief, staccato battle cry\.$/,
            /^All enemies in a (\d+)-foot emanation around the army take \d+d\d+ sonic damage \(@Check\[fortitude\|dc:\d+\|basic\|[^\]]*\] save\); each creature who fails its save is also Frightened 3 \(Frightened 4 on a critical failure\)\.$/,
            /^Depart Devastating Charge The army readies their motley collection of weapons and Strides forward up to (\d+) feet in a straight line\.$/,
            /^Each creature it moves through takes (\d+d\d+) bludgeoning, piercing, or slashing damage \(whichever would be most harmful at the GM's discretion\) with a @Check\[reflex\|dc:(\d+)\|basic\|[^\]]*\] save\.$/,
            /^A creature who critically fails its save is also knocked (Prone)\.$/
        ],
        card: (found, plan, { base }) => dragonArmyOf(found, plan, { base })
    },
    {
        // Limitless Power's Unleash Power: the cast card of its signer's selected spells, each non-cantrip once a day (src/compiler/contract-spells.js).
        names: ["Limitless Power: Unleash Power"],
        sentences: [
            /^The contract casts one of the selected spells \(spell attack modifier \+(\d+), DC (\d+)\)\.$/,
            /^The contract can cast each non-cantrip spell only once per day\.$/,
            /^You use the same number of actions for this activation as the selected spell normally takes\.$/
        ],
        card: (found, _plan, { item, spells, info }) => contractSpellsOf(found, item, spells, info)
    },
    {
        // Shadewither Key's Umbral Double: the double's note Effect, its flat check rolled at each attack and targeted spell (src/compiler/decoy-double.js).
        names: ["Shadewither Key: Umbral Double"],
        sentences: [
            /^You touch the Shadewither Key and command the shadows it casts around you to peel away\.$/,
            /^The shadows form an umbral double that resembles you in every way except for its fiery red eyes and the expression of wicked delight on its face\.$/,
            /^The double occupies the same space as you and attempts to intercept any attacks aimed at you\.$/,
            /^A creature must succeed at a @Check\[flat\|dc:(\d+)\] when targeting you with an attack, spell, or other effect; on a failure, they hit the shadowy double instead of you\.$/,
            /^The effect lasts for (\d+) (minutes?|rounds?) or until the double is hit, whichever comes first\.$/,
            /^Once the double is hit, it's destroyed\.$/,
            /^As long as the double exists, (you don't gain the Shadewither Key's item bonus to Stealth checks)\.$/
        ],
        card: (found, _plan, { slug }) => decoyDoublePlanOf(found, slug)
    },
    {
        // Jahan Waystone: the save card at the creatures in the stone's light, those that fail teleported to the paired stone (src/compiler/paired-stone.js).
        names: ["Jahan Waystone"],
        sentences: [
            /^You place your hand on the stone and focus on the stone's light\.$/,
            /^The stone's glow envelopes all creatures in a (\d+)-foot radius with its light and attempts to teleport the creatures to its paired stone\.$/,
            /^If there is no open space within (\d+) feet of the target waystone, the teleportation attempt fails\.$/,
            /^A creature can resist the teleportation with a successful @Check\[will\|dc:(\d+)\]\.$/
        ],
        // (Its "Activate (1 minute) envision, Interact": a minute, its components concentrate and manipulate.)
        card: (found, _plan, { slug, info }) => ({ ...pairedStonePlanOf(found, slug), activation: { time: "1 minute", traits: ["concentrate", "manipulate"] }, item: { activation: { ...(info?.activation ?? {}), time: "1 minute" } } })
    },
    {
        // The Eye of the Slumberer's Vortex: the ability module's zone round the Eye (placed on it), difficult terrain for swimming, the water trait's
        // creatures exempt (zone.exceptTraits, the core's selective terrain: scripts/zones.js), until used again.
        names: ["The Eye of the Slumberer: Vortex"],
        requirements: /^You're wearing the Amulet of the Slumberer\s*, you're within (\d+) feet of the Eye of the Slumberer\s*, and the Eye is within water$/,
        sentences: [
            /^The water around the Eye churns violently in a (\d+)-foot emanation, becoming difficult terrain for (swimming) creatures that don't have the (water) trait\.$/,
            /^You can use this action again to Dismiss this effect\.$/
        ],
        card: ([churns], _plan, { requirements }) => ({
            builtin: "zone",
            actions: null,
            targeting: { target: null, range: `${requirements[1]} feet`, area: { type: "emanation", value: Number(churns[1]) } },
            zone: {
                area: { type: "emanation", value: Number(churns[1]) },
                centre: "placed",
                range: Number(requirements[1]),
                lasts: null,
                untilReused: true,
                concealed: false,
                terrain: [{ movement: ["swim"], difficulty: 2 }],
                exceptTraits: [churns[3].toLowerCase()],
                others: false,
                hazard: null,
                saves: [],
                damage: [],
                effect: null,
                modifiers: [],
                notes: [`Place it on the Eye: the water churns in a ${churns[1]}-foot emanation round it, difficult terrain for swimming creatures without the ${churns[3]} trait.`, "Its user ends it by using the action again.", `Its user must wear the Amulet of the Slumberer, be within ${requirements[1]} feet of the Eye, and the Eye must be in water.`]
            }
        })
    },
    {
        // Guiding Star Orb (Heroic)'s Embed Location: its user's place recorded on the orb, three at most (src/live/embedded-places.js).
        names: ["Guiding Star Orb (Heroic): Embed Location"],
        sentences: [
            /^By focusing, the Guiding Star Orb embeds your current location within\.$/,
            /^Thereafter, anyone who touches the Guiding Star Orb while casting a spell with the teleportation trait to travel to this location arrives precisely, without any inaccuracy at all\.$/,
            /^The Guiding Star Orb can have up to (three|two|\d+) locations embedded at a time; if this activity is used a (fourth|third|\w+) time, the new location replaces the oldest stored one\.$/
        ],
        card: ([, , most]) => ({
            builtin: "embed-location",
            targeting: { target: null, range: null, area: null },
            embed: { max: { two: 2, three: 3 }[most[1].toLowerCase()] ?? Number(most[1]), line: "A teleportation spell cast touching the orb to one of these arrives there precisely, with no inaccuracy (the GM's map of the journey)." }
        })
    },
    {
        // Phoenix Necklace: nonlethal attacks without their penalty for the willing creatures its user targets — each one's note Effect with PF2e's
        // toggle that gives its Strikes the nonlethal trait (AdjustStrike), no penalty taken; until its user uses it again (plan.item.endsPrevious:
        // scripts/activations.js removes the Effects it gave before).
        names: ["Phoenix Necklace"],
        index: 0,
        sentences: [
            /^You select any number of willing creatures you can see within (\d+) feet, including yourself\.$/,
            /^The selected creatures can make nonlethal attacks without taking a penalty to their attack rolls\.$/,
            /^This effect remains in place until you remove the necklace or use this activation again\.$/
        ],
        card: ([within], _plan, { info }) => ({
            targeting: { target: `any number of willing creatures within ${within[1]} feet, its user too`, range: `${within[1]} feet`, area: null },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [{
                label: "Nonlethal without penalty",
                text: "It can make nonlethal attacks with no penalty to their attack rolls: tick \"Nonlethal attacks\" (this Effect's toggle) and its Strikes have the nonlethal trait. It lasts until the necklace's wearer takes it off or uses this again.",
                duration: null,
                rules: [{ key: "RollOption", domain: "all", option: "phoenix-necklace-nonlethal", toggleable: true, label: "Nonlethal attacks" }, { key: "AdjustStrike", mode: "add", property: "weapon-traits", value: "nonlethal", predicate: ["phoenix-necklace-nonlethal"] }]
            }] } } },
            notes: [`Target the willing creatures it chooses within ${within[1]} feet (its user too, if it likes).`, "Taking the necklace off ends it for them all: delete their Effects then."],
            item: { recipient: "targets", endsPrevious: "Nonlethal without penalty" }
        })
    }
];

const named = (reading, name) => reading.names.includes(name);
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// Whether a source name has a reading here.
export const hasArtifactReading = (name) => READINGS.some((reading) => named(reading, name));

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (src/compiler/lasting.js activationBase); requirements, trigger: its activation's
// lines; item: its item's whole text, plain (itemHtml: as it is); index: the activation's (a reading for one of several unnamed ones); spells:
// PF2e's spells by name (options.spells).
export function withArtifactReading(plan, { name, words, requirements = null, trigger = null, html = "", item = "", itemHtml = "", index = null, spells = {}, base, info, frequency = null }) {
    const slug = base?.source?.slug ?? null;
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.index === undefined || reading.index === index) && (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const asked = reading.requirements ? reading.requirements.exec(String(requirements ?? "").trim()) : null;
        if (reading.requirements && !asked) continue;
        if (reading.trigger && !reading.trigger.test(String(trigger ?? "").trim())) continue;
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, item, itemHtml, requirements: asked, trigger, spells, slug, base, info }) : null;
        if (!card) continue;
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
