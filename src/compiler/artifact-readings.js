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
    },
    {
        // Soulheart (Pure)'s Restore Life: the dead creature it's held to brought back with 1 Hit Point (item.revive, scripts/revive.js) — none above
        // 20th level (refused), the soulheart gone once it works; dead for no more than a year the GM's, a line.
        names: ["Soulheart (Pure): Restore Life"],
        sentences: [
            /^By holding a pure soulheart against the remains of a dead creature of (\d+)(?:st|nd|rd|th) level or lower that has been dead for no more than (a year|\d+ \w+) and concentrating for one minute, the pure soulheart flashes with red light and is destroyed\.$/,
            /^The targeted dead creature is restored to life with (\d+) Hit Points?, no spells prepared or spell slots available, no points in any pools or any other daily resources, and is still affected by any long-term debilitations of the old body\.$/
        ],
        card: ([held, back]) => ({
            targeting: { target: "the dead creature it's held to", range: "touch", area: null },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } },
            notes: [`Only a creature dead for no more than ${held[2]}: the GM's to say.`],
            activation: { time: "1 minute", traits: ["concentrate", "manipulate"] },
            item: { recipient: "drinker", revive: { hp: Number(back[1]), maxLevel: Number(held[1]), destroysItem: true, words: "Back from death with no spells prepared or spell slots left, no points in its pools and none of its other daily resources; any long-term debilitation of its old body stays" } }
        })
    },
    {
        // The Big Sky: its user and up to four creatures it touches ignore difficult terrain and circumstance penalties to their Speeds for 10
        // minutes — a note Effect on each targeted with PF2e's own terrain rule and an AdjustModifier suppressing those penalties; at 17th level
        // greater difficult terrain too (its user's level, as compiled for it).
        names: ["The Big Sky"],
        sentences: [
            /^For (\d+) (minutes?|hours?), you and up to (four|three|two|\d+) creatures you touch ignore difficult terrain and effects that would give a circumstance penalty to Speed\.$/,
            /^If you are at least (\d+)(?:st|nd|rd|th) level, the targets also ignore greater difficult terrain\.$/
        ],
        card: ([time, high], _plan, { ownerLevel }) => {
            const greater = Number(ownerLevel) >= Number(high[1]);
            const ignore = (path) => ({ key: "ActiveEffectLike", mode: "add", path, value: { environment: "all", feature: "all" } });
            const speeds = ["speed", "all-speeds", "land-speed", "fly-speed", "swim-speed", "climb-speed", "burrow-speed"];
            return {
                targeting: { target: `its user and up to ${time[3]} creatures it touches`, range: "touch", area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [{
                    label: "Free of the ground",
                    text: `It ignores difficult terrain${greater ? " and greater difficult terrain" : ""}, and any effect that would give it a circumstance penalty to its Speed.`,
                    duration: { mode: "fixed", value: Number(time[1]), unit: /^h/i.test(time[2]) ? "hours" : "minutes", expiry: "turn-start" },
                    rules: [ignore("system.movement.terrain.difficult.ignored"), ...(greater ? [ignore("system.movement.terrain.greater.ignored")] : []), { key: "AdjustModifier", selectors: speeds, suppress: true, predicate: ["penalty:type:circumstance"] }]
                }] } } },
                notes: [`Target its user and up to ${time[3]} creatures it touches.`, ...(greater ? [] : [`From ${high[1]}th level, greater difficult terrain too.`])],
                item: { recipient: "targets" }
            };
        }
    },
    {
        // The Trader: two of its user's skills' ranks swapped for the hour (src/live/skill-swap.js, scripts/skill-swap.js); feats whose
        // prerequisites the swap breaks are lost till then, words on its Effect (PF2e can't play a feat's loss).
        names: ["The Trader"],
        sentences: [
            /^The Trader allows you to make an exchange with yourself\.$/,
            /^Press the card to your brow, and then select (two) skills\.$/,
            /^Your proficiency rank with those two skills swaps for (\d+|an?|one) (hours?|minutes?)\.$/,
            /^For example, if you were a master in Athletics and untrained in Crafting, you would become untrained in Athletics and a master in Crafting\.$/,
            /^If making this swap would break prerequisites to feats, you lose access to those feats until your skill proficiencies change back in an hour\.$/
        ],
        card: ([, , time]) => ({
            builtin: "skill-swap",
            targeting: { target: null, range: null, area: null },
            swap: {
                duration: { value: { a: 1, an: 1, one: 1 }[time[1].toLowerCase()] ?? Number(time[1]), unit: /^h/i.test(time[2]) ? "hours" : "minutes" },
                words: "Feats whose prerequisites this swap breaks are lost until it ends.",
                lines: ["Pick the two skills: their proficiency ranks swap (a Lore's by hand)", "Feats whose prerequisites the swap breaks are lost until it ends"]
            }
        })
    },
    {
        // The Eclipse: an aura of doubt — the ability module's zone on its user, −2 item to saving throws and Strikes for the foes inside
        // (zone.inside who "foes": asked of the ability module, partial till then) and the light dimmed, the map's — and the triggering foe's own
        // note Effect: its critical success a success, −3 to its saves and Strikes instead, for the minute it can be Sustained.
        names: ["The Eclipse"],
        trigger: /^A foe that you're aware of and who is within (\d+) feet achieves a critical success on a saving throw or a Strike$/,
        sentences: [
            /^You produce an aura of doubt that overwhelms all foes in a (\d+)-foot emanation and reduces bright light in that area to dim light, as if the region were under an eclipse\.$/,
            /^The triggering creature's critical success is reduced to a regular success\.$/,
            /^All further saving throws or Strikes attempted by enemies within the emanation suffer a [-–](\d+) item penalty; saving throws or Strikes attempted by the triggering enemy suffer a [-–](\d+) penalty instead\.$/,
            /^You can sustain this aura of doubt for up to (\d+) (minutes?|rounds?)\.$/
        ],
        card: ([aura, , penalty, sustain], _plan, { base, info }) => {
            const time = { mode: "fixed", value: Number(sustain[1]), unit: /^m/i.test(sustain[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
            const penalties = (value) => [{ key: "FlatModifier", selector: "saving-throw", type: "item", value: -Number(value) }, { key: "FlatModifier", selector: "strike-attack-roll", type: "item", value: -Number(value) }];
            const zone = {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: null, area: { type: "emanation", value: Number(aura[1]) } },
                zone: { area: { type: "emanation", value: Number(aura[1]) }, centre: "self", range: null, lasts: time, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], inside: [{ who: "foes", rules: penalties(penalty[1]) }], notes: [`Foes inside take a −${penalty[1]} item penalty to saving throws and Strikes.`, "Bright light inside is dim light, as under an eclipse (the map's lighting).", `Its user Sustains it, up to ${sustain[1]} ${sustain[2]}: not Sustained, it ends (delete the zone).`] },
                item: { ...info }
            };
            return {
                targeting: { target: "the triggering foe", range: null, area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [{ label: "Overwhelmed by doubt", text: `Its critical success that triggered this is only a success (apply it so). Its saving throws and Strikes take a −${penalty[2]} item penalty while the aura lasts.`, duration: time, rules: penalties(penalty[2]) }] } } },
                notes: ["Target the foe whose critical success triggered it."],
                partial: true,
                automation: { level: "guided" },
                item: { recipient: "targets", alsoZone: zone }
            };
        }
    },
    {
        // Vambrace of Gorum's Blade of Iron: the objects card's greatsword in its user's hand — +3 major striking, high-grade adamantine — gone after
        // the minute (objects.lasts), and its user's Effect for the minute, +1 circumstance to AC for each adjacent enemy up to +4 (objects.effect
        // adjacent: scripts/adjacent-bonus.js keeps its count).
        names: ["Vambrace of Gorum: Blade of Iron"],
        sentences: [
            /^The shield reforms into a \+(\d) (high|standard|low)-grade (adamantine|cold iron|dawnsilver|silver|duskwood|orichalcum) (greater |major )?striking (greatsword|longsword|bastard sword) for (\d+) (minutes?|rounds?)\.$/,
            /^While wielding this sword, you gain a \+(\d) circumstance bonus to AC for each adjacent enemy \(up to a \+(\d) bonus\)\.$/
        ],
        card: ([blade, guard]) => {
            const lasts = { value: Number(blade[6]), unit: /^m/i.test(blade[7]) ? "minutes" : "rounds" };
            return {
                builtin: "objects",
                targeting: { target: null, range: null, area: null },
                objects: {
                    op: "create",
                    self: true,
                    weapon: blade[5].toLowerCase().replace(/\s+/g, "-"),
                    potency: Number(blade[1]),
                    striking: { "greater ": 2, "major ": 3 }[blade[4] ?? ""] ?? 1,
                    material: { type: blade[3].toLowerCase().replace(/\s+/g, "-"), grade: blade[2].toLowerCase() },
                    lasts,
                    replaces: true,
                    effect: { name: "a guard of iron", words: `+${guard[1]} circumstance bonus to AC for each enemy adjacent to it, up to +${guard[2]}, while it wields the sword`, adjacent: { per: Number(guard[1]), max: Number(guard[2]), type: "circumstance", selector: "ac" }, duration: { ...lasts, expiry: "turn-start" } },
                    said: blade[0]
                },
                notes: ["The shield is the sword for that time: it takes up its shield again once the sword is gone."]
            };
        }
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
export function withArtifactReading(plan, { name, words, requirements = null, trigger = null, html = "", item = "", itemHtml = "", index = null, spells = {}, ownerLevel = null, base, info, frequency = null }) {
    const slug = base?.source?.slug ?? null;
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.index === undefined || reading.index === index) && (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const asked = reading.requirements ? reading.requirements.exec(String(requirements ?? "").trim()) : null;
        if (reading.requirements && !asked) continue;
        if (reading.trigger && !reading.trigger.test(String(trigger ?? "").trim())) continue;
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, item, itemHtml, requirements: asked, trigger, spells, slug, ownerLevel, base, info }) : null;
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
