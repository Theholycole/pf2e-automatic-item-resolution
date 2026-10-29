// The creatures group's readings of the installed modules' items (2026-10-28, docs/needs.md; src/compiler/readings-creatures.js plays them):
// for each, its source name (an activation's "Item: Activation"; a pattern for an item's grades), its kind, a pattern for each of its
// sentences — every sentence must be one, in order, its links read as their labels — and the card they make (from its matches, the plan
// read before and the item's context). Their words aren't kept here: each says its rule in our own words, and its patterns match the item's
// sentences in short pieces. Pure.
// Skagappa (Battlezoo): a week of fitful sleep for the creature it's set by, a flat check to shake off fatigue — its note Effect on that
// creature; what a mindlink through it tells, the GM's. Homunculus Clay: its clay homunculi, the ability module's conjured minions for its
// grade's time. Traveler's Coddle, Food of the Gods, Emboldening Haggis: Effects of PF2e's rules on the eater until its next daily
// preparations (scripts/until-rest.js) — an overland Speed behind a toggle, an attribute modifier picked on the ways card (PF2e's own
// apex reckoning, +1 or up to +4), a bonus against fear beside a note for its one quicker recovery. Medicinal Hotpot: more healing each
// time its eater is healed (PF2e's healing-received dice and modifier), three times at most (scripts/healing-uses.js).

import { RAGE_EFFECT } from "./rage.js";
import { runesUpTo } from "./property-runes.js";

// Its words with PF2e's links read as their labels, and its checks as words: "@UUID[…]{Snapdrake}" → "Snapdrake", "@Check[type:flat|dc:5]"
// → "DC 5 flat check".
export const plainWords = (words) => String(words ?? "")
    .replace(/@Check\[(?:type:)?(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, (all, type, dc) => `DC ${dc} ${type}${type.toLowerCase() === "flat" ? " check" : ""}`)
    .replace(/@Template\[type:(\w+)\|distance:(\d+)[^\]]*\](?:\{([^}]*)\})?/gi, (all, type, distance, label) => label ?? `${distance}-foot ${type}`)
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10 };
const countOf = (value) => WORDS[String(value).toLowerCase()] ?? Number(value);
const timeOf = (value, unit) => ({ mode: "fixed", value: countOf(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const timeWords = (time) => `${time.value} ${time.value === 1 ? time.unit.replace(/s$/, "") : time.unit}`;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const ownRow = ({ noteEffects = [], effects = [], modifiers = [] } = {}) => ({ kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, modifiers, ...(noteEffects.length ? { noteEffects } : {}) } } });
const MINION = "A minion: it acts when its user commands it (1 action for 2 of its own).";
const hours = (time) => (time?.unit === "hours" ? [`It lasts ${timeWords(time)}: dismiss it when that's up.`] : []);
// (The link its html gives a creature, by its label — a module's short form "Compendium.<module>.<pack>.<id>" too, its Actor's.)
const linkOf = (html, label) => {
    const found = new RegExp(String.raw`@UUID\[(Compendium\.[\w-]+\.[\w-]+\.(?:Actor\.)?[A-Za-z0-9]{16})\]\{${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\}`, "i").exec(String(html ?? ""))?.[1];
    return found ? (/\.Actor\./.test(found) ? found : found.replace(/\.([A-Za-z0-9]{16})$/, ".Actor.$1")) : null;
};
const toggle = (option, label, value = true) => ({ key: "RollOption", domain: "all", option, toggleable: true, value, label });
// (The eater's Effect, with PF2e's rules, for its time or until its next daily preparations.)
const untilRest = ({ name, words, rules = [], duration, ...rest }) => ({ name, words, rules, duration, untilRest: true, replaces: true, ...rest });
const ATTRIBUTES = [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];

export const CREATURE_READINGS = [
    {
        // (A week by a sleeper: its note Effect for that week, on the creature targeted — whenever it sleeps fatigued, a flat check to shake it
        // off. What a mindlink through it learns, by its holder's check: the GM's to tell. Then it's gone.)
        name: "Skagappa",
        kind: "consumable",
        sentences: [
            /^\s*\d?\s*Interact;\s+must be set within (\d+) feet\s+of where a creature\s+typically sleeps\b.*\.$/,
            /^\s*For (\d+|one|a) week,\s+any creature that\s+sleeps within (\d+) feet\b.*\bfitful dreams\.$/,
            /^\s*If it was Fatigued,\s+the creature must\s+succeed at a DC (\d+) flat check\s+when it sleeps\.$/,
            /^\s*On a failure, the creature\s+remains fatigued until\s+it gets another\s+full night's rest\.$/,
            /^\s*At any point during\s+this week, a creature who\s+takes possession\b.*?\blearn (\d+|ten) minutes' worth\s+of information\b.*\.$/,
            /^\s*To do so, the creature\s+must cast (\w+) on\s+the \w+ and succeed at\s+a DC (\d+) (\w+) check\.$/,
            /^\s*On a failed check,\s+the spell is wasted\b.*\bagain\.$/,
            /^\s*Regardless, the same\s+information is imparted\b.*\.$/,
            /^\s*One week after it was\s+placed\b.*\bdestroying the item\.$/
        ],
        card: ([placed, week, flat, , learn, cast], plan, { info }) => {
            const days = 7 * countOf(week[1]);
            const skill = cast[3].charAt(0).toUpperCase() + cast[3].slice(1).toLowerCase();
            // (Its Activate line's 1 Interact, its requirement no trait: the line read as 1 action, manipulate.)
            const activation = { time: "1", traits: ["manipulate"] };
            return {
                activation,
                targeting: { target: "1 creature", range: null, area: null },
                resolution: ownRow({ noteEffects: [{ label: "Fitful dreams", text: `A skagappa is set by where it sleeps: whenever it sleeps while fatigued, a DC ${flat[1]} flat check — on a failure it stays fatigued until its next full night's rest. For ${days / 7 === 1 ? "a week" : `${days / 7} weeks`}.`, duration: { mode: "fixed", value: days, unit: "days", expiry: "turn-start", anchor: "effect-start" } }] }),
                notes: [
                    `Set within ${placed[1]} feet of where the creature sleeps (by its pillow or bed): target that creature.`,
                    `Meanwhile whoever holds it may cast ${cast[1].toLowerCase()} on it and attempt a DC ${cast[2]} ${skill} check: on a success the GM tells them ${countOf(learn[1])} minutes' worth of what it gleaned of the sleeper (the same each time); a failed check wastes the spell, and another casting tries again.`,
                    "A week after it was set it unravels and its worms crawl away: it's gone."
                ],
                item: { recipient: "targets", activations: (info?.activations ?? []).map((entry) => ({ ...entry, ...activation })) }
            };
        }
    },
    {
        // (Its clay homunculi, the module's own creature: the ability module's conjured minions beside its user, gone when its time is up.)
        name: /^\s*Homunculus Clay \((?:Lesser|Moderate|Greater)\)$/,
        kind: "consumable",
        sentences: [
            /^\s*This clay includes\s+reagents that simulate\s+life\b.*\bminion\.$/,
            /^\s*When you Activate it,\s+the clay produces (\d+) (Clay Homunculi)\.$/,
            /^\s*The homunculus remains\s+active for (\d+|one|an?) (minutes?|hours?|rounds?),\s+after which point it dries out\.$/
        ],
        card: ([, made, remains], plan, { html }) => {
            const uuid = linkOf(html, made[2]);
            if (!uuid) return null;
            const count = Number(made[1]);
            const lasts = timeOf(remains[1], remains[2]);
            return {
                builtin: "conjure",
                targeting: { target: "self", range: null, area: null },
                creatures: [{ name: "Clay Homunculus", count, size: null, stats: null, from: { uuid }, traits: ["minion"], initiative: null }],
                max: count,
                lasts,
                vanishAtZero: true,
                notes: [MINION, ...hours(lasts), `They dry out when the ${timeWords(lasts)} is up: gone.`]
            };
        }
    },
    {
        // (A faster overland march: +5 feet to its eater's Speed behind its toggle, on while it travels, for 24 hours or until its next daily
        // preparations.)
        name: "Traveler's Coddle",
        kind: "consumable",
        sentences: [
            /^\s*Made of sausages\b.*\bon end\.$/,
            /^\s*After eating it, you gain\s+a \+(\d+)-foot item bonus\s+to your Speed for\s+the purposes of overland travel\.$/,
            /^\s*These effects last\s+for (\d+) hours or until\s+you make your daily\s+preparations, whichever comes first\.$/
        ],
        card: ([, speed, lasts]) => ({
            targeting: { target: "the drinker", range: null, area: null },
            resolution: ownRow(),
            item: {
                ruleEffects: [untilRest({
                    name: "Traveler's Coddle",
                    words: `A +${speed[1]}-foot item bonus to its Speed for overland travel (its toggle on while it travels), for ${lasts[1]} hours or until its next daily preparations`,
                    rules: [toggle("air-overland-travel", "Overland travel", false), { key: "FlatModifier", selector: "land-speed", type: "item", value: Number(speed[1]), predicate: ["air-overland-travel"], label: "Traveler's Coddle" }],
                    duration: timeOf(lasts[1], "hours")
                })]
            }
        })
    },
    {
        // (One attribute modifier, picked when the meal was made — the ways card's six —, +1 or up to +4, the higher: PF2e's own reckoning
        // for an apex item, its rules added then raised, for 24 hours or until its eater's next daily preparations.)
        name: "Food of the Gods",
        kind: "consumable",
        sentences: [
            /^\s*Considered the Philosopher\S+ Stone\b.*\.$/,
            /^\s*It consists of alchemically\s+produced ambrosia\b.*\.$/,
            /^\s*To create Food of the Gods\s+properly\b.*\.$/,
            /^\s*After Activating the meal\s+by eating it, you either\s+increase an attribute modifier\s+selected during\b.*\bby (\d+) or increase it\s+to \+(\d+), whichever would\s+give you a higher value\.$/,
            /^\s*These effects do not\s+stack with those of an apex item\.$/,
            /^\s*The effects of the food\s+of the gods last for (\d+) hours\s+or until you make your\s+daily preparations, whichever comes first\.$/
        ],
        card: ([, , , raise, , lasts], plan, { base, info }) => {
            const by = Number(raise[1]);
            const floor = Number(raise[2]);
            const duration = timeOf(lasts[1], "hours");
            const way = ([key, label]) => ({
                name: label,
                plan: {
                    ...base,
                    automation: { level: "automatic" },
                    trigger: { event: "use" },
                    targeting: { target: "the drinker", range: null, area: null },
                    resolution: ownRow(),
                    item: {
                        ...info,
                        ruleEffects: [untilRest({
                            name: "Food of the Gods",
                            words: `Its ${label} modifier ${by} higher or +${floor}, whichever is higher, for ${lasts[1]} hours or until its next daily preparations (not with an apex item's increase: keep the better one)`,
                            rules: [{ key: "ActiveEffectLike", mode: "add", path: `system.abilities.${key}.mod`, value: by }, { key: "ActiveEffectLike", mode: "upgrade", path: `system.abilities.${key}.mod`, value: floor }],
                            duration
                        })]
                    }
                }
            });
            return {
                builtin: "ways",
                once: true,
                targeting: { target: null, range: null, area: null },
                ways: ATTRIBUTES.map(way),
                notes: ["Pick the attribute chosen when the meal was prepared.", "It doesn't stack with an apex item's increase: with one for the same attribute, keep whichever is better."]
            };
        }
    },
    {
        // (More healing each time its eater is healed — its first healing from each effect: PF2e's healing-received dice and modifier on an
        // Effect, three times at most (scripts/healing-uses.js), for 24 hours or until its next daily preparations.)
        name: /^\s*Medicinal Hotpot \((?:Lesser|Moderate|Greater)\)$/,
        kind: "consumable",
        sentences: [
            /^\s*This pot of boiled\s+medicinal herbs\b.*\.$/,
            /^\s*After Activating by eating it,\s+whenever you regain Hit Points\s+from a healing effect,\s+you regain additional (\d+)d(\d+) plus (\d+)\.$/,
            /^\s*This applies only to\s+the initial healing\b.*\.$/,
            /^\s*An individual creature\s+benefits from this healing\s+only once per effect\b.*\.$/,
            /^\s*These effects last for (\d+) hours,\s+until you make your daily\s+preparations, or you have\s+gained additional healing\b.*?(\d+|three) times, whichever comes first\.$/
        ],
        card: ([, more, , , lasts]) => {
            const [dice, die, flat] = [Number(more[1]), Number(more[2]), Number(more[3])];
            const uses = countOf(lasts[2]);
            return {
                targeting: { target: "the drinker", range: null, area: null },
                resolution: ownRow(),
                item: {
                    ruleEffects: [untilRest({
                        name: "Medicinal Hotpot",
                        words: `${dice}d${die}+${flat} more Hit Points each time it's healed (an effect's first healing of it only, once per effect), ${uses} times at most, for ${lasts[1]} hours or until its next daily preparations`,
                        rules: [{ key: "DamageDice", selector: "healing-received", diceNumber: dice, dieSize: `d${die}`, label: "Medicinal Hotpot" }, { key: "FlatModifier", selector: "healing-received", value: flat, label: "Medicinal Hotpot" }],
                        duration: timeOf(lasts[1], "hours"),
                        healingUses: uses
                    })]
                },
                notes: ["Only an effect's first healing counts (not the healing it gives later, as each round): over-healing later from the same effect, take the extra off."]
            };
        }
    },
    {
        // (Its bonus against fear until its eater's next daily preparations, on an Effect of PF2e's rules — and the moderate grade's one
        // quicker recovery from frightened, a rule PF2e can't play, in its words.)
        name: /^\s*Emboldening Haggis \((?:Lesser|Moderate)\)$/,
        kind: "consumable",
        sentences: [
            /^\s*This nutty pudding is\s+made of\b.*\bovercome fear\.$/,
            /^\s*After Activating the haggis\s+by eating it, you gain\s+a \+(\d+) status bonus\s+against fear effects for (\d+) hours\s+or until you make your daily\s+preparations, whichever comes first\.$/,
            /^\s*Once during this duration\s+of the effect, you can reduce\s+your frightened condition by (\d+|two)\s+instead of (\d+|one) at the end of your turn\.$/
        ],
        optional: 1,
        card: ([, bonus, quicker]) => ({
            targeting: { target: "the drinker", range: null, area: null },
            resolution: ownRow(),
            item: {
                ruleEffects: [untilRest({
                    name: "Emboldening Haggis",
                    words: `A +${bonus[1]} status bonus to its saves against fear${quicker ? `; once in that time, at the end of one of its turns its frightened can go down by ${countOf(quicker[1])} instead of ${countOf(quicker[2])} (its choice: lower it once more then)` : ""}, for ${bonus[2]} hours or until its next daily preparations`,
                    rules: [{ key: "FlatModifier", selector: "saving-throw", type: "status", value: Number(bonus[1]), predicate: ["item:trait:fear"], label: "Emboldening Haggis" }],
                    duration: timeOf(bonus[2], "hours")
                })]
            }
        })
    },
    {
        // (A strip that turns blue near the creatures of the trait it was made for, for a day: its note Effect on its user, the GM saying when —
        // what it tells, the user's ruling for information; the trait chosen when it was crafted, the card's line.)
        name: "Detection Strips",
        kind: "consumable",
        sentences: [
            /^\s*(?:\w\s+)?These small strips of\s+paper\b.*\bcertain creatures\.$/,
            /^\s*When crafting the detection\s+strips, choose a creature trait\b.*?, such as (.+)\.$/,
            /^\s*For the next (\d+) hours after\s+activation, if a creature of\s+that type comes within (\d+) feet\s+of the detection strip,\s+the strip turns from (\w+) to (\w+)\.$/
        ],
        card: ([, kinds, near]) => ({
            targeting: { target: null, range: null, area: null },
            resolution: ownRow({ noteEffects: [{ label: "Detection strip", text: `Its detection strip turns from ${near[3]} to ${near[4]} while a creature with the trait it was made for comes within ${near[2]} feet of it: the GM says when. For ${near[1]} hours.`, duration: timeOf(near[1], "hours") }] }),
            notes: [`Its creature trait was chosen when it was crafted (${kinds[1].replace(/,? or /, " or ")}, say).`],
            item: { recipient: "user" }
        })
    },
    {
        // (A reaction for an hour as it would fall to 0 Hit Points, a melee Strike first: no PF2e action to grant, its words on the eater's note
        // Effect for the hour — the user's ruling for a rule PF2e can't play; using it is its eater's own.)
        name: "Reefclaw Gumbo",
        kind: "consumable",
        sentences: [
            /^\s*This exceptionally flavorful\s+gumbo\b.*\bthat eat it\.$/,
            /^\s*After activating the item,\s+you can use the (Reefclaw Frenzy)\s+reaction for (\d+|an?|one) (hours?|minutes?)\.$/,
            /^\s*Reefclaw Frenzy Trigger\s+You would be reduced\s+to 0 Hit Points;\s+Requirements You have\s+a creature within your\s+melee reach; Effect You\s+make a melee Strike before\s+falling Unconscious\.$/,
            /^\s*You are then temporarily\s+immune to this effect\s+for (\d+|one|a) (days?|hours?)\.$/
        ],
        card: ([, reaction, , immune]) => {
            const lasts = timeOf(reaction[2], reaction[3]);
            return {
                targeting: { target: "the drinker", range: null, area: null },
                resolution: ownRow({ noteEffects: [{ label: reaction[1], text: `Its reaction for ${timeWords(lasts)}: as it would drop to 0 Hit Points with a creature in its melee reach, it makes a melee Strike before it falls unconscious. Then it's temporarily immune to this for ${timeWords(timeOf(immune[1], immune[2]))}.`, duration: lasts }] })
            };
        }
    },
    {
        // (Its Climb as it's used, PF2e's own action — the plan read before —, and the stalk's bonus on its user's Effect for its hour: PF2e's
        // modifiers to Climb and to Grab an Edge behind a toggle, on while it's on the stalk. The stalk's height and load, the map's.)
        name: /^\s*Cloud Giant Bean \((?:Moderate|Greater)\)$/,
        kind: "consumable",
        sentences: [
            /^\s*Climb Named after an old\s+fable\b.*\.$/,
            /^\s*You can Activate the bean\s+as part of your Climb\.$/,
            /^\s*If your initial Climb when\s+you Activate the bean is successful,\s+you can choose to automatically\s+climb half the distance\b.*\.$/,
            /^\s*The bean transforms into\s+a beanstalk, which grows up to ([\d,]+) feet high\.$/,
            /^\s*The stalk grants creatures\s+that attempt \+(\d+) item bonus\s+to checks to Climb it\s+and to Acrobatics checks\s+or Reflex saves to Grab an Edge\s*if they fall from the stalk\.$/,
            /^\s*The beanstalk can support up\s+The stalk can support up to (.+)\.$/,
            /^\s*The stalk can support any number\s+of ([\w ]+?) creatures,\s+or an equivalent Bulk amount,\s+before the stalk breaks\.$/,
            /^\s*The stalk lasts for (\d+|one|an?) (hours?|minutes?)\s+before deteriorating\.$/
        ],
        card: ([, , , high, bonus, holds, any, lasts], plan) => {
            if (plan?.builtin !== "item-action" || plan.action?.slug !== "climb") return null;
            const value = Number(bonus[1]);
            const time = timeOf(lasts[1], lasts[2]);
            const sizes = [...holds[1].matchAll(/(\d+) (?:size )?(\w+) creatures?/gi)].map((found) => `${found[1]} ${found[2]}`);
            const list = sizes.length > 1 ? `${sizes.slice(0, -1).join(", ")} or ${sizes.at(-1)}` : sizes[0] ?? holds[1];
            const on = "air-on-beanstalk";
            return {
                keep: true,
                partial: undefined,
                automation: { ...(plan.automation ?? {}), level: "automatic" },
                userEffects: [...(plan.userEffects ?? []), {
                    kind: "rules",
                    name: "Beanstalk",
                    words: `A +${value} item bonus to its checks to Climb the beanstalk and to its Acrobatics checks and Reflex saves to Grab an Edge falling from it (its toggle on while it's on the stalk), for ${timeWords(time)}`,
                    rules: [
                        toggle(on, "On the beanstalk"),
                        { key: "FlatModifier", selector: "athletics", type: "item", value, predicate: [on, "action:climb"], label: "Beanstalk" },
                        { key: "FlatModifier", selector: ["acrobatics", "reflex"], type: "item", value, predicate: [on, "action:grab-an-edge"], label: "Beanstalk" }
                    ],
                    duration: time
                }],
                // (The action card shows its action's after line, not plan.notes: the stalk's lines there, in place of the item's own words.)
                action: {
                    ...plan.action,
                    after: [
                        `Used as part of its user's Climb, the bean grows into a beanstalk up to ${high[1]} feet high, for ${timeWords(time)} before it withers (the map's). On a successful first Climb its user may climb half its height at once (their choice).`,
                        `It holds up to ${list} creatures, any number of ${any[1].toLowerCase()} ones, or their Bulk, before it breaks.`,
                        `Every creature climbing it gets the same +${value}: the Effect is its user's, another climber's the GM's to give.`
                    ].join(" ")
                }
            };
        }
    },
    {
        // (A tree beside its user with five barnacles, each a snapdrake for an hour as it's opened: the ability module's summon card, the GM
        // saying how many are opened now — its user's own among them, mounted as part of the activation —, each a minion and a mount, the
        // opener's choice; one opened later the GM's to place. The tree, the map's.)
        name: "Barnacle Tree Seed",
        kind: "consumable",
        sentences: [
            /^\s*Mount Legends speak of\s+barnacle trees\b.*\.$/,
            /^\s*While the original story\s+is likely a fabrication\b.*\.$/,
            /^\s*When you Activate this item,\s+you create a tree adjacent\s+to you that takes up a (\d+)-foot burst\s+and is (\d+) feet tall\.$/,
            /^\s*If the tree is in soil\s+and survives to the end\b.*\.$/,
            /^\s*The GM might determine that\s+the tree disappears\b.*\.$/,
            /^\s*The tree has (\d+|five) large barnacles on it\.$/,
            /^\s*When a creature uses an\s+Interact to open a barnacle,\s+a (Snapdrake) emerges which\s+remains active for (\d+|one|an?) (hours?|minutes?)\.$/,
            /^\s*The creature that opened it\s+can choose to give the \w+\s+the minion and mount traits\b.*\.$/,
            /^\s*When you Activate the barnacle\s+tree seed, you can Interact\s+and Mount a \w+ as part\s+of the Activation\.$/,
            /^\s*The \w+ do not act\s+without commands and cannot\s+use hostile actions against\s+other creatures\.$/
        ],
        card: ([, , tree, , , barnacles, emerges], plan, { html }) => {
            const uuid = linkOf(html, emerges[1]);
            if (!uuid) return null;
            const most = countOf(barnacles[1]);
            const lasts = timeOf(emerges[2], emerges[3]);
            const drake = (count) => ({ name: emerges[1], count, size: null, stats: null, from: { uuid }, traits: ["minion", "mount"], initiative: null });
            return {
                builtin: "conjure",
                targeting: { target: "self", range: null, area: null },
                creatures: [drake(1)],
                options: Array.from({ length: most }, (_, index) => ({ label: `${index + 1} opened`, creatures: [drake(index + 1)] })),
                max: most,
                lasts,
                vanishAtZero: true,
                notes: [
                    `A tree beside its user, a ${tree[1]}-foot burst ${tree[2]} feet tall (the map's): in soil, if it lasts, it grows on as an ordinary tree; the GM may have it vanish at once somewhere inhospitable.`,
                    `It bears ${most} barnacles, each opened with an Interact freeing a snapdrake for ${timeWords(lasts)}: the GM's button says how many are opened now — its user can open one and Mount it as part of the activation. One opened later is the GM's to place, for its own hour.`,
                    "Each has the minion and mount traits (its opener's choice: remove them if not wanted). They act only when commanded, and use no hostile action against other creatures.",
                    MINION,
                    ...hours(lasts)
                ]
            };
        }
    },
    {
        // (A trap for incorporeal creatures: the ability module's zone, a 15-foot emanation where the plug was used, for its grade's time —
        // each incorporeal creature in it saves as it's made and at the end of each of its turns there (not one already held by it). A failure
        // Slowed and Immobilized, its Slowed going up or down by the save at the end of each of its turns while it's still in the area (the
        // ability module's escalating save-ends condition, the GM saying whether it is), the Immobilized gone with it; a critical success
        // immune for a day (the immunity tracker). Being sucked in once the Slowed would take all its actions, and what holds it, its note
        // Effect — the user's ruling for a rule PF2e can't play. Its DCs the grade's stated ones.)
        name: /^\s*Phantasm Plug \((?:Lesser|Moderate|Greater|Major)\)$/,
        kind: "consumable",
        sentences: [
            /^\s*This box is made\s+specifically to entrap\s+incorporeal entities\.$/,
            /^\s*When you Activate the plug,\s+it projects an ectoplasmic\s+vacuum\b.*\bwithin a (\d+)-?(?:foot)?\s+emanation of the space\s+it was activated in\b.*\.$/,
            /^\s*Incorporeal creatures in\s+the area must make a\s+Fortitude save each turn\s+they remain in the area\.$/,
            /^\s*After the duration has passed,\s+the plug remains able\s+to store spirits\b.*\.$/,
            /^\s*Once a creature reduces\s+its slowed condition\b.*\bimmune to the effect\s+of Phantasm Plug for (\d+|one|a) (days?)\.$/,
            /^\s*If a creature is trapped\s+within the gadget\b.*\bnew plug\.$/,
            /^\s*The creature can attempt\s+to Escape during this transfer\.$/,
            /^\s*If the creature escapes\s+or the trap duration expires,\s+it is immediately expelled\b.*\bdestroyed\.$/,
            /^\s*Critical Success The target\s+is unaffected\.$/,
            /^\s*Success The target is\s+Slowed (\d+) for (\d+|one|a) (rounds?)\.$/,
            /^\s*Success The target is\s+slowed \d+ for \S+ rounds?\.\s*Failure The target becomes\s+slowed (\d+) or increases\s+its slowed value by (\d+)\b.*\bImmobilized as long as\s+it is slowed by this effect\.$/,
            /^\s*The creature must attempt\s+a new Fortitude save\s+at the end of each turn\s+it remains in the area\s+while the gadget is active\.$/,
            /^\s*On a failed save,\s+its slowed condition increases\s+by (\d+) \(or (\d+) on a critical failure\)\.$/,
            /^\s*A successful save reduces\s+the slowed condition by (\d+)\s+or by (\d+) on a critical success\.$/,
            /^\s*If a creature would be\s+unable to act due to\s+the slowed condition from\s+the plug, the creature must\s+immediately attempt a Fortitude save,\s+and on a failure it is\s+sucked into the phantasm plug\s+where it becomes trapped\.$/,
            /^\s*If a creature would be\s+destroyed while within\s+the emanation, it can instead\s+choose to become trapped\s+by the plug\.$/,
            /^\s*This trapping effect has\s+the incapacitation trait\.$/,
            /^\s*Critical Failure As failure,\s+but the target is Slowed (\d+)\s+or increases its slowed value\s+by (\d+) if it was already slowed\.$/,
            /^\s*The Escape and DC \d+ fortitude DCs are (\d+),\s+the initial Activation duration\s+is (\d+|one|an?) (rounds?|minutes?),\s+and the trapped duration is (\d+d\d+|\d+|one|an?) (minutes?|hours?|days?)\.(?: minutes\.)?$/
        ],
        card: ([, vacuum, , , immune, , , , , success, failure, , worse, better, , , , critical, numbers], plan, { base }) => {
            const dc = Number(numbers[1]);
            const active = timeOf(numbers[2], numbers[3]);
            const rounds = active.unit === "minutes" ? active.value * 10 : active.value;
            const trapped = /d/.test(numbers[4]) ? `${numbers[4]} ${numbers[5]}` : timeWords(timeOf(numbers[4], numbers[5]));
            const day = { value: countOf(immune[1]), unit: "days" };
            const saveEnds = {
                save: "fortitude",
                dc,
                mode: "escalate",
                escalate: { criticalSuccess: -Number(better[2]), success: -Number(better[1]), failure: Number(worse[1]), criticalFailure: Number(worse[2]) },
                alsoEnds: ["immobilized"],
                rounds,
                gate: "it's still in the plug's area"
            };
            const held = (value, by) => [
                { kind: "condition", slug: "slowed", value: Number(value), stack: { by: Number(by) }, duration: { mode: "unlimited", saveEnds } },
                { kind: "condition", slug: "immobilized", value: null, duration: null }
            ];
            const pull = { label: "Phantasm Plug's pull", text: `If the plug's Slowed would leave it unable to act, it attempts a DC ${dc} Fortitude save at once: on a failure it's sucked into the plug and trapped (incapacitation), off the map, for ${trapped}. It's expelled beside the plug, which is destroyed, when that time is up or it Escapes (DC ${dc}) — as it may when moved into another plug, which starts its time again. Destroyed while in the area, it may choose to be trapped instead. Once its Slowed from the plug is gone, it's immune to the plug for a day.`, duration: null };
            const save = {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "zone", immunity: { scope: "target", raw: "Immune to Phantasm Plug for a day.", duration: day, degrees: ["criticalSuccess"], against: "all", slug: "phantasm-plug" } },
                targeting: { target: "a creature in the area", range: null, area: null },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: dc } },
                    sharedDamage: null,
                    outcomes: {
                        criticalSuccess: { ...none() },
                        success: { ...none(), effects: [{ kind: "condition", slug: "slowed", value: Number(success[1]), duration: timeOf(success[2], success[3]) }] },
                        failure: { ...none(), effects: held(failure[1], failure[2]), noteEffects: [pull] },
                        criticalFailure: { ...none(), effects: held(critical[1], critical[2]), noteEffects: [pull] }
                    }
                }
            };
            delete save.item;
            const area = { type: "emanation", value: Number(vacuum[1]) };
            return {
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: null, area },
                zone: { area, centre: "snare", range: null, lasts: active, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [{ when: ["initial", "end"], plan: save, only: { traits: ["incorporeal"], lacks: { conditions: ["immobilized"] } } }], damage: [], effect: null, modifiers: [], notes: [
                    `Its vacuum is a ${vacuum[1]}-foot emanation from where it was used, for ${timeWords(active)}: each incorporeal creature in it saves (DC ${dc} Fortitude) as it's made and at the end of each of its turns there.`,
                    "One it holds saves again at the end of each of its turns while it's in the area: a failure raises its Slowed, a success lowers it (the GM says whether it's still there); at none it's free, and immune to the plug for a day.",
                    `Trapped spirits stay in the plug for ${trapped} after its vacuum ends.`
                ] }
            };
        }
    },
    {
        // (A property rune of its user's level or lower lent to a weapon it wields while it rages — the rune loan's card, the weapon and the
        // rune picked, its Effect gone with the Rage (flagged untilRage, scripts/live.js) and a minute at most, a Rage's.)
        name: "Instinct Crown (Rune)",
        kind: "activation",
        sentences: [
            /^\s*You bond your runes\s+to your weapons\.$/,
            /^\s*Choose a common property rune\s+of your level or lower\b.*\bwielding\.$/,
            /^\s*That weapon gains that\s+property rune as long as\s+you are raging and does not\s+count towards the total\b.*\.$/
        ],
        card: (found, plan, { item, entry }) => {
            const choices = runesUpTo(item?.ownerLevel ?? item?.system?.level?.value);
            if (!choices.length) return null;
            return {
                targeting: { target: null, range: null, area: null },
                resolution: ownRow(),
                notes: [
                    ...(entry?.activation?.requirements ? ["Only when the crown's instinct is its user's own barbarian instinct (its Requirements)."] : []),
                    "Pick a common property rune of its user's level or lower that suits a weapon it wields, and that weapon: it has the rune while its user rages, beyond the weapon's usual number of property runes."
                ],
                item: { rune: { name: choices[0].name, key: choices[0].key, duration: timeOf(1, "minutes"), own: false, choices, untilRage: true } }
            };
        }
    },
    {
        // (Its animal companion's Rage, PF2e's own Effect on the companion targeted, and Quickened until that rage ends (its Effect gone with
        // the Rage, scripts/live.js); what its extra action is for and the joint Rend, the companion's note for the rage's minute.)
        name: "Instinct Crown (Untamed)",
        kind: "activation",
        sentences: [
            /^\s*You and your companion\s+have learned to tear\b.*\bin unison\.$/,
            /^\s*Your animal companion uses\s+Rage and becomes quickened\s+until the end of its rage\.$/,
            /^\s*It can use its extra\s+action to Support or Strike\.$/,
            /^\s*If you and your animal\s+companion successfully Strike\s+the same target during your turn,\s+your animal companion can spend\s+a single action to Rend\b.*\.$/
        ],
        card: (found, plan, { entry }) => ({
            targeting: { target: "your animal companion", range: null, area: null },
            resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: RAGE_EFFECT, label: "Effect: Rage", recipients: "targets" }] },
            notes: [
                ...(entry?.activation?.requirements ? ["Only when the crown's instinct is its user's own barbarian instinct (its Requirements)."] : []),
                "Target its animal companion."
            ],
            item: {
                recipient: "targets",
                untilRage: { conditions: [{ slug: "quickened", value: null }] },
                ruleEffects: [{ name: "Untamed rage", words: "Its extra action from Quickened only to Support or Strike. When it and its master both hit the same target with a Strike on its master's turn, it can spend an action to Rend that target, with the damage of the unarmed attack it Struck with", rules: [], duration: timeOf(1, "minutes") }]
            }
        })
    },
    {
        // (Its Heighten spellshape once per round for as many rounds as the rank of the slot spent: each way's note Effect for its rounds — no
        // rule of PF2e's changes another activation's frequency, the user's ruling for such a rule.)
        name: "Scepter of Heightening: Height of Your Power",
        kind: "activation",
        sentences: [
            /^\s*Frequency once per day\s+Cost a spell slot\s+of at least (\d+)\w* rank For the duration,\s+you can use the Heighten spellshape\b.*\bonce per round instead\s+of once per hour\.$/,
            /^\s*This effect lasts for\s+a number of rounds equal\s+to the rank\s+of the spell you expended\.$/
        ],
        card: (found, plan) => {
            if (plan?.builtin !== "ways" || !(plan.ways ?? []).length) return null;
            const ways = plan.ways.map((way) => {
                const rank = Number(way.plan?.spend?.spellSlot?.rank);
                if (!Number.isFinite(rank)) return way;
                const row = way.plan.resolution?.outcomes?.success ?? none();
                const note = { label: "Height of Your Power", text: `Its scepter's Heighten Spell can be used once each round, not just once an hour, for ${rank} rounds (the rank of the slot spent).`, duration: timeOf(rank, "rounds") };
                const { noteOnly, ...rest } = way.plan;
                return { ...way, plan: { ...rest, automation: { ...(rest.automation ?? {}), level: "automatic" }, resolution: { ...rest.resolution, outcomes: { ...rest.resolution.outcomes, success: { ...row, noteEffects: [note] } } } } };
            });
            return { keep: true, ways, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
        }
    },
    {
        // (A mountain mech beside its user, once a day: no stat block of its own, its user picking a construct of a 7th-rank summon's level to
        // play it (the GM may pick another); a minion for its power's four hours, gone when another is summoned or it's destroyed.)
        name: "Mountain Mech Mahjong Tile: Summon Mech",
        kind: "activation",
        sentences: [
            /^\s*When you draw a special\s+symbol onto the mahjong\s+summoning tile, you summon\s+a mountain mech into\s+an adjacent free space\.$/,
            /^\s*The mountain mech can perform\s+all the usual duties\b.*\.$/,
            /^\s*The mountain mech teleports\s+back to its guild if you\s+summon another mech or if\s+it\S+ destroyed or runs out\s+of power\.$/
        ],
        card: (found, plan, { item }) => {
            const lasts = /\blast for approximately (\d+) hours\b/i.exec(String(item?.system?.description?.value ?? ""));
            const time = timeOf(lasts?.[1] ?? 4, "hours");
            return {
                builtin: "conjure",
                targeting: { target: "self", range: null, area: null },
                creatures: [{ name: "Mountain Mech", count: 1, size: null, stats: null, from: null, traits: ["minion"], initiative: null }],
                pick: { all: ["construct"], maxLevel: 9 },
                max: 1,
                lasts: time,
                vanishAtZero: true,
                notes: [
                    "The mountain mech has no stat block: its user picks a construct of level 9 or lower to play it (a 7th-rank summon's, the item's own level's) — the GM may pick another.",
                    "It appears in a free space beside its user. Built to guard its allies, it acts when its user commands it.",
                    MINION,
                    `Fully powered, it runs ${timeWords(time)}: dismiss it when that's up, or earlier when it runs out of power. Summoning another sends this one back, as being destroyed does. Its core takes 4 hours to recharge, or recharges while it works under moonlight (the GM's).`
                ]
            };
        }
    },
    {
        // (The chaos table's rows each a card of its own, read by its number: places traded with the target (item.swapPlaces), mice as the
        // ability module's markers for a minute (a rolled count), a rock's Clumsy until it's shaken out, both Prone, the robe's Dragon Form for
        // a rolled 1d8 rounds (castDuration.valueRoll), the robe's cry on its user too (its success, Stunned 1), two torrents on the ways card,
        // the sand's Reflex save, a billow of concealment (the ability module's zone), its healing, what Recall Knowledge tells (whispered, with
        // the flat check that tells the target as much), its looks the card's lines, and a 20's two more rolls with 20s ignored (table.rolls).)
        name: "Rumbustious Robes: Pocket Full of Chaos",
        kind: "activation",
        rows: {
            2: /^\s*You and the target\s+swap places\.$/,
            4: /^\s*(\d+d\d+) mice appear\s+from your sleeves\s+and obey your commands\s+for (\d+) (minutes?)\.$/,
            5: /^\s*Roll (\d+d\d+), on a (\d+)\s+you become the target\.\s/,
            6: /^\s*The target's shoes have\s+a rock in them\.\s+They are Clumsy (\d+) until\s+it is removed with a single\s+manipulate action\.\s+No effect if they\s+aren\S+ wearing footwear\.$/,
            7: /^\s*You and the target\s+are knocked Prone\.$/,
            8: /^\s*You turn into a dragon,\s+as the spell (Dragon Form),\s+but with a duration\s+of (\d+d\d+) (rounds)\.$/,
            9: /^\s*One inch of snow\s+drops immediately\b.*\bfor (\d+) (minutes?)\.$/,
            10: /^\s*Everyone can hear your\s+actions being narrated\b.*\bfor the next (\d+) (minutes)\.$/,
            12: /^\s*You regain\b.*\bHit Points equal to\s+twice your level\.$/,
            13: /^\s*The robes begin shrieking\s+loudly\.\s+This acts like a (Confusing Cry)\s+spell that also affects you,\s+but you automatically get\s+a result of success\./,
            14: /^\s*You cast two (\d+)\w*[- ]rank (Hydraulic Torrent)\s+spells, with their lines\s+going in opposite directions\.$/,
            15: /^\s*You throw sand in a\s*\.\s+Creatures in the area\s+must make a\s+save or be Blinded\s+for (\d+|one|a) (rounds?)\.$/,
            17: /^\s*The robes appear to billow\s+out in a\s*,\s+granting everyone in the area\s+Concealment\.$/,
            18: /^\s*You immediately gain the results\s+of a Critical Success on\s+a Recall Knowledge about the target\.\s+Failure on a\s+means they also get\s+this result targeting you\.$/,
            19: /^\s*The robes' fabric turns\s+into heavy bear fur\s+for (\d+|one|an?) (hours?)\.$/,
            20: /^\s*Roll twice and apply\s+the results in order\.\s+Ignore any further rolls of 20\.$/
        },
        card: (found, plan, { html, item, info }) => {
            const sand = /\bthrow sand in a @Template\[type:(\w+)\|distance:(\d+)\][^<]*?@Check\[type:(\w+)\|dc:(\d+)\]/i.exec(String(html ?? ""));
            const billow = /\bbillow out in a @Template\[type:(\w+)\|distance:(\d+)\]/i.exec(String(html ?? ""));
            const flat = /\bRecall Knowledge\}?[^<]*?@Check\[type:flat\|dc:(\d+)\]/i.exec(String(html ?? ""));
            const dc = Number(/\bAny spell DC required is DC (\d+)\b/i.exec(plainWords(html))?.[1]);
            const attack = Number(/\bany spell attack roll required is \+(\d+)\b/i.exec(plainWords(html))?.[1]);
            if (!sand || !billow || !flat || !Number.isFinite(dc)) return null;
            const level = Number(item?.ownerLevel ?? item?.system?.level?.value) || 1;
            const own = (card) => ({ modelVersion: plan.modelVersion, source: plan.source, rank: 1, traits: plan.traits, activation: plan.activation, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const look = (line) => own({ resolution: ownRow(), notes: [line] });
            const cast = (uuid, name, rank, extra = {}) => own({ builtin: "cast-spell", spell: { uuid: `Compendium.pf2e.spells-srd.Item.${uuid}`, name }, rank: Number(rank), dc, attack: Number.isFinite(attack) ? attack : null, tradition: null, self: false, notes: [], ...extra });
            const at = (effects, extra = {}) => own({ targeting: { target: "1 creature", range: "60 feet", area: null }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects } } }, ...extra });
            const torrent = cast("Y3G6Y6EDgCY0s3fq", found[14][2], found[14][1]);
            const plans = {
                2: own({ targeting: { target: "1 creature", range: "60 feet", area: null }, resolution: ownRow(), notes: ["Its user and the creature targeted trade places."], item: { recipient: "targets", swapPlaces: true } }),
                4: own({
                    builtin: "conjure",
                    targeting: { target: "self", range: null, area: null },
                    creatures: [{ name: "Mouse", count: { formula: found[4][1] }, size: "tiny", stats: null, from: null, traits: ["minion"], initiative: null }],
                    max: 12,
                    lasts: timeOf(found[4][2], found[4][3]),
                    vanishAtZero: true,
                    notes: [`${found[4][1]} mice from its user's sleeves, obeying its commands for ${timeWords(timeOf(found[4][2], found[4][3]))}: markers with no stat block (AC 10, 1 Hit Point).`, MINION]
                }),
                6: at([{ kind: "condition", slug: "clumsy", value: Number(found[6][1]), duration: null }], { notes: ["A rock in its shoes: Clumsy until it spends a single manipulate action to take it out (remove the condition then). A creature wearing no footwear isn't affected."] }),
                7: at([{ kind: "condition", slug: "prone", value: null, duration: null }], { userEffects: [{ slug: "prone", value: null, duration: null }], notes: ["Its user is knocked prone too."] }),
                8: cast("5c692cCcTDXjSEzk", found[8][1], 6, { self: true, castDuration: { value: 1, unit: "rounds", valueRoll: found[8][2], said: `${found[8][2]} rounds` } }),
                9: look(`An inch of snow falls at once, then flurries for ${timeWords(timeOf(found[9][1], found[9][2]))} (the scene's look).`),
                10: look(`For the next ${found[10][1]} minutes everyone hears an unseen voice narrating its user's actions.`),
                12: own({ targeting: { target: "self", range: null, area: null }, resolution: { kind: "healing", native: { healing: { components: [{ id: "healing", formula: String(2 * level), kinds: ["healing"] }], recipients: "living" } } } }),
                13: cast("I7oklLZy4aTHIdc3", found[13][1], 5, { area: true, userEffects: [{ slug: "stunned", value: 1, duration: null }], notes: ["The robe's shriek reaches its user too, who gets a success: Stunned 1."] }),
                14: own({ builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [{ name: "The first torrent", plan: torrent }, { name: "The second torrent, the other way", plan: torrent }], notes: ["Two torrents, their lines in opposite directions: cast one, then the other."] }),
                15: own({
                    targeting: { target: "creatures in the area", range: null, area: { type: sand[1].toLowerCase(), value: Number(sand[2]) } },
                    resolution: { kind: "save", check: { roll: "save", statistic: sand[3].toLowerCase(), basic: false, against: { dc: "fixed", value: Number(sand[4]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), effects: [{ kind: "condition", slug: "blinded", value: null, duration: timeOf(found[15][1], found[15][2]) }] }, criticalFailure: { ...none(), effects: [{ kind: "condition", slug: "blinded", value: null, duration: timeOf(found[15][1], found[15][2]) }] } } },
                    notes: [`Target the creatures in the ${sand[2]}-foot ${sand[1].toLowerCase()} around its user.`]
                }),
                17: own({
                    builtin: "zone",
                    actions: null,
                    targeting: { target: null, range: null, area: { type: billow[1].toLowerCase(), value: Number(billow[2]) } },
                    zone: { area: { type: billow[1].toLowerCase(), value: Number(billow[2]) }, centre: "self", range: null, lasts: timeOf(1, "rounds"), untilReused: false, concealed: true, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: [`The robe billows out ${billow[2]} feet around its user: everyone in it is concealed. Its words give no time: until its user's next turn (the GM may change it).`] }
                }),
                18: own({ builtin: "whisper", targeting: { target: "1 creature", range: "60 feet", area: null }, whisper: { text: "Its user learns what a critically successful Recall Knowledge about the target would tell: the GM says.", flat: { dc: Number(flat[1]), failure: "The target learns as much about the robe's user (the GM tells its player)." } } }),
                19: look(`For ${timeWords(timeOf(found[19][1], found[19][2]))} the robe's fabric becomes heavy bear fur (its look).`)
            };
            const rows = plan.table.rows.map((row) => {
                if (plans[row.low]) return { ...row, plan: plans[row.low] };
                // (The Confusion's row: its 1d4 first, its user the target on a 1 — with no save, a spell the robe casts at it.)
                if (row.low === 5 && row.plan) return { ...row, plan: { ...row.plan, notes: [...(row.plan.notes ?? []), `Roll ${found[5][1]} first: on a ${found[5][2]}, its user is the target instead, with no save (as a failure).`] } };
                return row;
            });
            const again = rows.map((row) => (row.low === 20 ? { low: 20, high: 20, text: "Another 20: ignored." } : row));
            const table = { ...plan.table, rows: rows.map((row) => (row.low === 20 ? { ...row, plan: own({ builtin: "table", table: { die: plan.table.die, rows: again, rolls: 2, ignore: [20] }, notes: ["Two more rolls, their rows applied in order; a 20 again is ignored."] }) } : row)) };
            if (!table.rows.every((row) => row.plan)) return null;
            return { ...plan, table, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
        }
    }
];
