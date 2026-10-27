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
const zoneCard = (zone) => ({ builtin: "zone", actions: null, targeting: { target: null, range: zone.range ? `${zone.range} feet` : null, area: zone.area }, zone });

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
    },
    // --- Areas of light and darkness: the zone on the map for its time, its lighting in its notes (the scene's light the GM's to set, as
    // Shadow Cloak Snare's darkness is).
    {
        // Sun Slayer's Sunset: dim light around its user for a minute.
        names: ["Sun Slayer: Sunset"],
        sentences: [
            /^You raise your shield in the air toward the sunlight, eclipsing it\.$/,
            /^The area in a (\d+)-foot emanation becomes dim light for (\d+) (minutes?)\.$/
        ],
        card: ([, area]) => zoneCard(zoneOf({ area: { type: "emanation", value: Number(area[1]) }, lasts: timeOf(area[2], area[3]), notes: ["The sunlight eclipsed: dim light inside for its time (the scene's light is the GM's to set)."] }))
    },
    {
        // Undertaker's Manifest: dim light around its user for 3 rounds, with its next shadow or void spell.
        names: ["Undertaker's Manifest"],
        sentences: [
            /^If your next action is to cast a shadow or void spell, the spell's casting is accompanied by a roiling cloud of shadow that spills out around you, creating dim light in a (\d+)-foot emanation centered on you for the next (\d+) (rounds?)\.$/,
            /^This has no effect on areas where the lighting level is already darker than dim light\.$/
        ],
        card: ([cloud]) => zoneCard(zoneOf({
            area: { type: "emanation", value: Number(cloud[1]) },
            lasts: timeOf(cloud[2], cloud[3]),
            notes: ["Only with its user's next action, a shadow or void spell it casts (its own); not cast, end the zone.", "A cloud of shadow: dim light inside for its time, where it isn't already darker (the scene's light is the GM's to set)."]
        }))
    },
    {
        // Bottled Night: a thrown burst that dims every light in it for a minute.
        names: ["Bottled Night"],
        sentences: [
            /^Tiny black motes swirl inside this crystalline vial\.$/,
            /^The vial can be thrown up to (\d+) feet, shattering and releasing the motes to absorb light within a (\d+)-foot burst\.$/,
            /^Light sources within the motes' area of effect create a 5-foot radius of dim light instead of their normal light and light sources outside the motes do not illuminate the area within them\.$/,
            /^The darkness lasts for (\d+) (minutes?), but will disperse immediately in a strong wind\.$/
        ],
        card: ([, thrown, , lasts]) => zoneCard(zoneOf({
            area: { type: "burst", value: Number(thrown[2]) },
            centre: "placed",
            range: Number(thrown[1]),
            lasts: timeOf(lasts[1], lasts[2]),
            notes: ["Light sources inside shed only 5 feet of dim light, and those outside don't light it (the scene's light is the GM's to set).", "A strong wind disperses it at once (end the zone then)."]
        }))
    },
    {
        // Ghost Lantern: ghost touch on the weapons and unarmed attacks of each creature in its bright light, while it's there, for 5 minutes —
        // PF2e's AdjustStrike adding the rune, the zone's rule for those inside.
        names: ["Ghost Lantern"],
        sentences: [
            /^You concentrate on the lantern's light to soften the boundary between the Ethereal Plane and the Universe\.$/,
            /^Any creature in the lantern's bright light on the Universe gains the effects of the Ghost Touch property rune on all its weapons and unarmed attacks\.$/,
            /^If an affected weapon or attack is magical and already has the maximum number of property runes, the wielder can choose one to suppress to gain ghost touch\.$/,
            /^This benefit lasts for (\d+) (minutes?) or until the shutters are closed, whichever comes first\.$/,
            /^It applies to a creature only while it's in the lantern's bright light, and if the creature leaves the light and returns it regains the benefit once more\.$/
        ],
        card: ([, , , lasts]) => zoneCard(zoneOf({
            // (A hooded lantern's bright light: 30 feet.)
            area: { type: "emanation", value: 30 },
            lasts: timeOf(lasts[1], lasts[2]),
            inside: [{ rules: [{ key: "AdjustStrike", mode: "add", property: "property-runes", value: "ghostTouch", definition: [] }] }],
            notes: ["Its bright light, a hooded lantern's 30 feet: each creature in it has ghost touch on its weapons and unarmed attacks while it's there.", "A magical weapon or attack with its most property runes already: its wielder picks one to suppress for ghost touch.", "Closing the shutters ends it (end the zone then)."]
        }))
    },
    {
        // Inspiring Spotlight's Light It Up: its zone is src/compiler/covered-square.js spotlightPlan's; its light at the burst (zone.light, as
        // Spark Wafer's) and its counteract against the magical darkness it meets — the counteract card beside the zone (plan.item.counteract,
        // its rank half the item's level, rounded up).
        names: ["Inspiring Spotlight (Portable): Light It Up", "Inspiring Spotlight (Mounted): Light It Up"],
        over: (plan) => plan?.builtin === "zone" && plan.zone?.area?.type === "burst",
        sentences: [
            /^The inspiring spotlight emits a (\d+)-foot burst of bright magical light within \d+ feet\.$/,
            /^If the burst intersects with an area of magical darkness, the inspiring spotlight attempts to counteract the darkness with a \+(\d+) modifier\.$/,
            /^Creatures within the burst gain a \+\d item bonus to saving throws and Charisma-based skill checks\.$/,
            /^The spotlight remains lit for \d+ minutes? or until you Interact to turn it off\.$/,
            /^During this time any creature adjacent to the spotlight can move the burst up to 20 feet from the burst's original position with an Interact action\.$/
        ],
        card: ([light, darkness], plan) => {
            const byHand = (plan.zone.notes ?? []).find((note) => /\battempts to counteract it at \+\d+ \(by hand\)/.test(said(note)));
            if (!byHand) return null;
            const level = Number(plan.item?.level) || 1;
            return {
                keep: true,
                drop: true,
                zone: { ...plan.zone, light: { bright: Number(light[1]), dim: Number(light[1]) }, notes: plan.zone.notes.filter((note) => note !== byHand) },
                item: { ...plan.item, counteract: { modifier: Number(darkness[1]), rank: Math.max(1, Math.ceil(level / 2)), conditions: [], traits: [], afflictions: [], free: { name: "the magical darkness" }, pick: "one", notes: ["Only where the burst meets an area of magical darkness."] } }
            };
        }
    },
    // --- Terrain an item makes.
    {
        // Jar of Shifting Sands' Spill Sand: an adjacent square of difficult terrain (the sand stays), and the jar's minute's wait for both
        // activations (trigger.recharge, shared with Avalanche of Sand — src/compiler/cooldown.js's shape).
        names: ["Jar of Shifting Sands: Spill Sand"],
        sentences: [
            /^You quickly pour sand over an adjacent square, making it difficult terrain\.$/,
            /^You can't use either of the jar's activations for (\d+) (minutes?)\.$/
        ],
        card: ([, wait]) => ({
            ...zoneCard(zoneOf({ area: { type: "square", value: 5 }, centre: "placed", range: 5, terrain: DIFFICULT, notes: ["An adjacent square. The sand stays until it's cleared away (end the zone then)."] })),
            trigger: { event: "use", recharge: { value: Number(wait[1]), unit: UNITS[wait[2].toLowerCase()], shared: ["Avalanche of Sand"] } }
        })
    },
    {
        // Fleshgem (Earthspeaker): crystal shards in a burst around its user, for 1 round or (two actions) 1 minute — the ways card's two
        // buttons, each the zone: difficult and hazardous terrain for the others, 2 piercing for moving into it.
        names: ["Fleshgem (Earthspeaker)"],
        sentences: [
            /^The ground around you erupts in a (\d+)-foot burst of knee-high crystal shards that remain for (\d+) (rounds?), or (\d+) (minutes?) if you spent two actions\.$/,
            /^To all creatures other than you, the area is difficult terrain as well as hazardous terrain\.$/,
            /^Creatures that move through a space containing crystal shards take (\d+) (piercing) damage\.$/
        ],
        card: ([shards, , damage], plan, { base, info }) => {
            const way = (name, lasts, time) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...base, activation: { ...(base.activation ?? {}), time }, automation: { level: "automatic" }, trigger: { event: "use" }, ...zoneCard(zoneOf({ area: { type: "burst", value: Number(shards[1]) }, lasts, others: true, terrain: DIFFICULT, hazard: { formulas: [`${damage[1]}[${damage[2]}]`] }, notes: ["Around its user, who stands on the ground (its Requirements): difficult and hazardous terrain for every other creature."] })), item: info } });
            return { builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [way(`One action: the shards for ${shards[2]} ${shards[3]}`, timeOf(shards[2], shards[3]), "1"), way(`Two actions: the shards for ${shards[4]} ${shards[5]}`, timeOf(shards[4], shards[5]), "2")] };
        }
    },
    {
        // Swamp Lily Quilt: a 10-foot square of mud where it's laid, as long as it stays (and an hour's drying after).
        names: ["Swamp Lily Quilt"],
        sentences: [
            /^This quilt is defined by its green lily-pad pattern\b/,
            /^The quilt is (\d+) feet square and infused with a reagent that activates when the quilt is laid out across soil or earth\.$/,
            /^One round after you lay out the quilt, the ground beneath it becomes soft and muddy, creating difficult terrain in the area where the quilt was\.$/,
            /^You can leave the quilt to maintain the difficult terrain indefinitely, but the affected ground begins to dry once you remove the quilt with an Interact action\.$/,
            /^The ground dries over the span of 1 hour, after which the ground returns to normal terrain\.$/,
            /^Placing the quilt on the ground uses up its infused reagents, and it becomes an ordinary quilt once removed from the ground\.$/
        ],
        card: ([, square]) => zoneCard(zoneOf({
            area: { type: "square", value: Number(square[1]) },
            centre: "placed",
            terrain: DIFFICULT,
            notes: ["Laid out on soil or earth; the ground under it turns to mud a round later.", "It lasts while the quilt stays. Taken up (an Interact action), the mud dries over an hour, then it's normal ground (end the zone then)."]
        }))
    },
    {
        // Colorful Coating (Yellow): its coated square for the minute — +2 circumstance to Climb it (PF2e's action:climb), the terrain it
        // eases the GM's call (no zone takes terrain away).
        names: ["Colorful Coating (Yellow)"],
        sentences: [
            /^These coatings come in different colors, each with a different special effect\.$/,
            /^A bottle of colorful coating contains enough to slather over one 5-foot square within your reach or space\b/,
            /^It's possible to use the coating on any surface that can be painted \(subject to the GM's discretion\)\.$/,
            /^Colorful coating dries instantly, and its effect in the square you coated lasts for (\d+) (minutes?)\.$/,
            /^After that time, the coating turns to fine, inert powder\b/,
            /^Yellow colorful coating contains a variety of compounds\b/,
            /^On the affected surface, the coating reduces difficult terrain caused by slipperiness, such as from ice or grease; this eliminates difficult terrain, reduces greater difficult terrain to difficult terrain, and reduces uneven ground to greater difficult terrain\.$/,
            /^The coating can't affect difficult terrain caused by features or effects not part of the surface, such as crowds, underbrush, wind, magic, and so on\.$/,
            /^The GM determines if yellow colorful coating can affect a surface's terrain\.$/,
            /^The coating also makes a coated wall or ceiling easier to climb\.$/,
            /^It provides a \+(\d) circumstance bonus to checks to Climb the coated surface\.$/,
            /^Yellow colorful coating and green colorful coating have opposite effects\.$/,
            /^If they're both applied to the same surface, they negate one another\.$/
        ],
        card: ([, , , lasts, , , , , , , climb]) => zoneCard(zoneOf({
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            lasts: timeOf(lasts[1], lasts[2]),
            modifiers: [{ selector: "athletics", value: Number(climb[1]), type: "circumstance", predicate: ["action:climb"] }],
            notes: [
                "A square within its user's reach, or its own, on any surface that can be painted (the GM's call).",
                "Its surface's slipperiness eased: difficult terrain from ice or grease gone, greater difficult terrain only difficult, uneven ground only greater difficult terrain — not crowds, underbrush, wind or magic (the GM's call).",
                "Green coating on the same surface negates it (end both zones then)."
            ]
        }))
    },
    {
        // Flask of Elemental Earth: its burst's basic Reflex save as it explodes, then an hour of hazardous terrain — the zone placed within
        // 60 feet, the save at the creatures in it as it's made, the persistent bleed on moving into it or ending a turn there (PF2e's
        // persistent bleed doesn't stack: once a turn, as its words say).
        names: ["Flask of Elemental Earth"],
        over: (plan) => !plan?.builtin && plan?.resolution?.kind === "save" && plan.targeting?.area?.type === "burst",
        sentences: [
            /^While the elemental once imprisoned in this flask has long departed\b/,
            /^You activate a flask of elements by removing a wax seal from the stopper\.$/,
            /^If you or anyone else hurls the flask \(another Interact action\), it explodes where it lands\.$/,
            /^Your toss can place the center of the explosion - a (\d+)-foot burst - anywhere within (\d+) feet, though at the GM's discretion, you might need to make an attack roll if the throw is unusually challenging\.$/,
            /^If no one hurls the flask by the start of your next turn, it shatters harmlessly\.$/,
            /^The effect of the explosion depends on the type of flask\.$/,
            /^The flask explodes in shards of glass that grow into sharp spikes; this explosion has the earth trait\.$/,
            /^Creatures within the area take \d+d\d+ piercing damage with a @Check\[reflex\|dc:\d+\|basic\] save\.$/,
            /^The ground in the area becomes hazardous terrain for (\d+) (hours?), and any creature that moves into one of these squares or ends its turn in one takes (\d+d\d+) persistent (bleed) damage\.$/,
            /^A creature can take this damage only once per turn\.$/
        ],
        card: ([, , , toss, , , , , ground], plan, { base, info }) => {
            const save = { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null }, automation: { level: "automatic" } };
            for (const key of ["notes", "partial", "item", "unread"]) delete save[key];
            const bleed = `${ground[3]}[persistent,${ground[4]}]`;
            return zoneCard(zoneOf({
                area: { type: "burst", value: Number(toss[1]) },
                centre: "placed",
                range: Number(toss[2]),
                lasts: timeOf(ground[1], ground[2]),
                hazard: { formulas: [bleed] },
                saves: [{ when: ["initial"], plan: save }],
                damage: [{ when: "end", formulas: [bleed] }],
                notes: [
                    "Hurled by its user or anyone else (another Interact action), it explodes where it lands; unhurled by the start of its user's next turn, it shatters harmlessly (their own).",
                    "An unusually hard throw may need an attack roll (the GM's call).",
                    "Its spikes' persistent bleed doesn't stack: once a turn at most, as its words say."
                ]
            }));
        }
    },
    {
        // Healing Vapor (each grade): its burst for 10 minutes, the item bonus to saves against diseases and poisons for those inside (PF2e's
        // own roll options for them), its Hit Points every minute or two and its four creatures at once the GM's (out of combat).
        names: ["Healing Vapor (Lesser)", "Healing Vapor (Moderate)", "Healing Vapor (Greater)", "Healing Vapor (Major)"],
        over: (plan) => !plan || plan.partial || plan.noteOnly,
        sentences: [
            /^Healing vapor is a substance that accelerates natural recovery processes\b/,
            /^When deployed from a sealed container, the vapors fill a (\d+)-foot burst, last for (\d+) (minutes?), and can affect up to (\w+) living creatures at one time\.$/,
            /^Any creatures beyond the first \w+ gain no benefit, though if a creature leaves before the duration is over, a new creature that enters can benefit from the mist\.$/,
            /^A creature benefiting from the vapors regains (\d+) Hit Points? every ((?:\d+ )?minutes?)\.$/,
            /^While affected, a creature also gains a \+(\d) item bonus to saving throws against diseases and poisons\.$/,
            /^If the areas of more than one healing vapor overlap, only the strongest applies to creatures inside overlapping areas\.$/,
            /^Strong wind disperses the mist, rendering it ineffective while the wind blows\.$/
        ],
        card: ([, vapors, , heals, against]) => zoneCard(zoneOf({
            area: { type: "burst", value: Number(vapors[1]) },
            centre: "placed",
            range: 5,
            lasts: timeOf(vapors[2], vapors[3]),
            modifiers: [{ selector: "saving-throw", value: Number(against[1]), type: "item", predicate: [{ or: ["item:trait:disease", "item:trait:poison"] }] }],
            notes: [
                `Only ${vapors[4]} living creatures at a time benefit; one leaving makes room for the next (the GM removes it from any more).`,
                `Each creature benefiting regains ${heals[1]} Hit Point${heals[1] === "1" ? "" : "s"} every ${heals[2]} (out of combat, the GM's).`,
                "Overlapping vapors: only the strongest's bonus counts (PF2e's item bonuses don't stack).",
                "A strong wind makes it do nothing while it blows (the GM's call)."
            ]
        }))
    },
    {
        // Lambent Perfume's Light Incense: its mist around its user, and a creature ending its turn there while sickened or afflicted
        // attempting a new save against one of them (the save's note at that turn's end, its own roll) — no time given: until it's ended.
        names: ["Lambent Perfume: Light Incense"],
        sentences: [
            /^Sparkling golden mist escapes the ibis's open beaks, spreading in a (\d+)-foot emanation\.$/,
            /^This perfume mist is calming and restorative\.$/,
            /^A creature that ends its turn within the censer's smoke while sickened or under an affliction can attempt a new saving throw to overcome it\.$/,
            /^A creature with multiple afflictions, or that is both sickened and has an affliction, chooses one to attempt to overcome each time it ends its turn in the aura\.$/,
            /^After attempting a new saving throw against an affliction, a creature is temporarily immune to lambent perfume for the purpose of overcoming that affliction for (\d+) (hours?)\.$/
        ],
        card: ([mist, , , , immune]) => zoneCard(zoneOf({
            area: { type: "emanation", value: Number(mist[1]) },
            saves: [{ when: ["end"], plan: null, note: `If it's sickened or has an affliction, it may attempt a new save against one of them now (its own roll, against that condition's or affliction's DC); after a save against an affliction, the perfume can't help it against that one for ${immune[1]} ${immune[2]}.` }],
            notes: ["No time of its own: it lasts while the incense burns (end the zone then)."]
        }))
    },
    {
        // Candle of Revealing: for its minute, around its user, an invisible creature is only concealed — PF2e's Concealed granted to an
        // invisible one inside (its invisibility no help there, its observers' own to treat so).
        names: ["Candle of Revealing"],
        sentences: [
            /^When lit, this black candle's eerie blue flame reveals the presence of Invisible creatures\.$/,
            /^Within a (\d+)-foot radius of the lit candle, creatures don't benefit from the invisible condition\.$/,
            /^Their bodies are outlined, not fully visible, so they're Concealed\.$/,
            /^Once lit, the candle burns for (\d+) (minutes?), after which the effect ends\.$/,
            /^If extinguished, it can't be relit\.$/
        ],
        card: ([, radius, , burns]) => zoneCard(zoneOf({
            area: { type: "emanation", value: Number(radius[1]) },
            lasts: timeOf(burns[1], burns[2]),
            inside: [{ rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W", predicate: ["self:condition:invisible"], allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }],
            notes: ["The lit candle carried by its user.", "An invisible creature inside gets no benefit from being invisible: outlined, it's only concealed (its observers treat it so).", "Put out, it can't be lit again (end the zone then)."]
        }))
    },
    {
        // Alchemical Atomizer: its held consumable fired as a cloud into a square within 30 feet, until the start of its user's next turn; the
        // first willing creature it's valid for to enter gets its effect — the note at its entering, that consumable's own card on it.
        names: ["Alchemical Atomizer"],
        sentences: [
            /^You cause the atomizer to mix its reagents and fire its held consumable at a square within (\d+) feet\.$/,
            /^The consumable forms a cloud that fills the space\.$/,
            /^The first willing valid target to enter the space automatically gains the effect of the consumable\.$/,
            /^If there are multiple valid targets, such as with multiple weapons for aligned oil, the creature entering the space determines how the effect is applied\.$/,
            /^The cloud is consumed upon contact with a willing valid target or at the start of your next turn, whichever comes first\.$/
        ],
        card: ([fired]) => zoneCard(zoneOf({
            area: { type: "square", value: 5 },
            centre: "placed",
            range: Number(fired[1]),
            lasts: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" },
            saves: [{ when: ["enter"], plan: null, note: "If it's willing and the held elixir, oil or potion is valid for it, it gains that consumable's effect (its own card, used on it; with several valid targets, such as weapons for an oil, it picks); the cloud is used up then (end the zone)." }],
            notes: ["The held consumable's cloud lasts until the start of its user's next turn."]
        }))
    },
    {
        // Biting Snare: its critical failure's –10-foot status penalty to Speed until the creature regains a Hit Point — PF2e's FlatModifier
        // on a note Effect with no time, its end (healed) in its words.
        names: ["Biting Snare"],
        over: (plan) => plan?.builtin === "zone" && plan.zone?.saves?.length === 1,
        sentences: [
            /^This snare closes shut on the leg of a creature\.$/,
            /^The snare deals 5d6 piercing damage to the first creature that enters its square; that creature must attempt a @Check\[reflex\|[^\]]*\] save\.$/,
            /^Critical Success The creature is unaffected\.$/,
            /^Success The creature takes half damage\.$/,
            /^Failure The creature takes full damage\.$/,
            /^Critical Failure The creature takes double damage and takes a [-–](\d+)-foot (status) penalty to its Speed until it recovers at least 1 Hit Point\.$/
        ],
        card: ([, , , , , critical], plan) => {
            const [entry] = plan.zone.saves;
            const row = entry.plan?.resolution?.outcomes?.criticalFailure;
            if (!row || (row.manualInstructions ?? []).length !== 1) return null;
            const slowed = { label: "Bitten leg", text: `A –${critical[1]}-foot ${critical[2]} penalty to its Speeds until it recovers at least 1 Hit Point (delete this then).`, duration: null, rules: [{ key: "FlatModifier", selector: "all-speeds", type: critical[2], value: -Number(critical[1]) }] };
            const { manualInstructions, ...kept } = row;
            const save = { ...entry.plan, partial: undefined, automation: { level: "automatic" }, resolution: { ...entry.plan.resolution, outcomes: { ...entry.plan.resolution.outcomes, criticalFailure: { ...kept, noteEffects: [...(kept.noteEffects ?? []), slowed] } } } };
            delete save.partial;
            return { keep: true, drop: true, zone: { ...plan.zone, saves: [{ ...entry, plan: save }] } };
        }
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
        const card = found ? reading.card(found, plan, { base, info }) : null;
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
