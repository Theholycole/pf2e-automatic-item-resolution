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
// order — and the card they make (from its matches and the plan before; keep: changes to that plan instead of a card of its own). Or read:
// a reading of its own over the plan before and the html, for words the plan has already taken apart (Rusting Ammunition's rows).
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
    },
    // --- Casts and what their notes leave: the card's lines for the map, its user's own actions and an object's numbers.
    {
        // Cloud Pouch's Disperse: Mist in a 20-foot burst within 10 feet (castRange, read before); moving the cloud on a Sustain is the map.
        names: ["Cloud Pouch: Disperse"],
        over: (plan) => plan?.builtin === "cast-spell" && plan.spell?.name === "Mist" && plan.castRange?.feet === 10,
        sentences: [
            /^You scatter the dust into the air around you, causing it to condense into a cloud in a 20-foot burst within 10 feet, as the Mist spell\.$/,
            /^You can Sustain the activation to make the cloud Fly (\d+) feet\.$/,
            /^The cloud lasts 1 minute, and you can Dismiss it\.$/
        ],
        card: ([, fly], plan) => ({ keep: true, drop: true, notes: [`Its user can Sustain the activation to move the cloud ${fly[1]} feet (move Mist's area on the map).`, "It lasts Mist's minute; its user can Dismiss it."] })
    },
    {
        // Dragon Pearl's Pearlescent Shell: Containment on its user (the cast, read before); the field's resistance to the type its user picks is
        // the field's own — an object's, as its Hardness and Hit Points are.
        names: ["Dragon Pearl (Draconic Codex): Pearlescent Shell"],
        over: (plan) => plan?.builtin === "cast-spell" && plan.spell?.name === "Containment" && plan.self,
        sentences: [
            /^You call protective power from the pearl to form a defensive barrier around yourself\.$/,
            /^You're affected by an 8th-rank Containment spell, which takes on the appearance of shimmering translucent dragon scales\.$/,
            /^The field has resistance (\d+) to one damage type related to the dragon the pearl came from\.$/,
            /^When you activate the pearl, you choose the type from all types the dragon has immunity or resistance to plus a type based on their tradition: force for arcane, spirit for divine, mental for occult, or poison for primal\.$/
        ],
        card: ([, , resistance]) => ({ keep: true, drop: true, notes: [`The field (Containment's, around its user) has resistance ${resistance[1]} to one damage type its user picks as it's activated: one the pearl's dragon is immune or resistant to, or by the dragon's tradition force (arcane), spirit (divine), mental (occult) or poison (primal). The field's own numbers, an object's (the GM's).`] })
    },
    {
        // Pipe of Dancing Smoke: its smoke bird's burst with the effects of Mist — Mist cast where the bird bursts (its own range, 120 feet).
        names: ["Pipe of Dancing Smoke"],
        sentences: [
            /^The smoke forms a bird that flies up to (\d+) feet in a direction of your choice\.$/,
            /^When it collides with a solid object or travels the full range, whichever is shorter, it explodes in a 20-foot burst of smoke with the effects of Mist\.$/
        ],
        card: ([bird]) => ({ builtin: "cast-spell", spell: { uuid: "Compendium.pf2e.spells-srd.Item.9XHmC2JgTUIQ1CCm", name: "Mist" }, rank: null, dc: null, attack: null, tradition: null, self: false, targeting: { target: null, range: `${bird[1]} feet`, area: { type: "burst", value: 20 } }, notes: [`A bird of smoke flies up to ${bird[1]} feet in a direction its user picks and bursts where it hits something solid or ends its flight: Mist's burst there (the map).`] })
    },
    {
        // Highhelm Stronghold Plate: Wall of Stone (the cast, read before), for up to 10 minutes (castDuration) — the armor off its wearer
        // meanwhile its user's own (its sheet), the wall's end the map's.
        names: ["Highhelm Stronghold Plate"],
        over: (plan) => plan?.builtin === "cast-spell" && plan.spell?.name === "Wall of Stone",
        sentences: [
            /^The plating on your armor explodes off of your body, expands, and reshapes, transforming into a stone structure with the effects of Wall of Stone\.$/,
            /^While the armor is transformed in this way, you don't gain the benefits of wearing the armor\.$/,
            /^The armor remains transformed for up to (\d+) (minutes?) or until you Dismiss the effect, at which point the wall of stone disappears and the armor returns to you, donning itself immediately\.$/,
            /^Crafting Requirements Supply one casting of wall of stone \.$/
        ],
        card: ([, , lasts]) => ({
            keep: true,
            drop: true,
            castDuration: { value: Number(lasts[1]), unit: UNITS[lasts[2].toLowerCase()] },
            notes: [
                "The armor is the wall: its wearer has none of its benefits meanwhile (set it to carried on the sheet, its user's own).",
                `The wall lasts up to ${lasts[1]} minutes or until Dismissed; then it's gone and the armor dons itself again (end the wall, put the armor back on).`
            ]
        })
    },
    {
        // Zuhra's Gloves' Zuhra's Stratagem: the zuhra's choice (the GM's) — the ways card's two casts at DC 30, Weapon Storm at 6th rank or
        // Wall of Metal; the wall's own toggle on the gloves (PF2e's "wall-of-metal", its +3 to Reflex DC against Disarm off) turned on with it.
        names: ["Zuhra's Gloves: Zuhra's Stratagem"],
        over: (plan) => plan?.builtin === "cast-spell",
        sentences: [
            /^You extend the weapon and call out the zuhra's name\.$/,
            /^They channel their magic through the gloves to assist you with their choice of offense or defense \(as determined by the GM\)\.$/,
            /^The zuhra makes any choices for the spell, and any save DC is (\d+)\.$/,
            /^Offense The metal of the gloves wraps around your weapon and channels the zuhra's magic to cast a (\d+)th-rank Weapon Storm spell, replicating the metal weapon\.$/,
            /^Defense The metal flows off your arms, creating a Wall of Metal\.$/,
            /^The wall's surface has the same pattern as the gloves\.$/,
            /^You lose the gloves' item bonus until the barrier ends, at which point the metal returns to your hands and forearms\.$/,
            /^You can Dismiss the activation\.$/
        ],
        card: ([, , dc, storm], plan, { base, info }) => {
            const lines = ["The zuhra picks offense or defense and makes the spell's choices (the GM's call)."];
            const cast = (spell, rank, more = {}, notes = []) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, builtin: "cast-spell", spell, rank, dc: Number(dc[1]), attack: null, tradition: null, self: false, targeting: { target: null, range: null, area: null }, ...more, notes: [...lines, ...notes], item: info });
            const way = (name, plan) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan });
            return {
                builtin: "ways",
                once: true,
                targeting: { target: null, range: null, area: null },
                ways: [
                    way(`Offense: Weapon Storm at ${storm[1]}th rank`, cast({ uuid: "Compendium.pf2e.spells-srd.Item.8M03UxGXjYyDFAoy", name: "Weapon Storm" }, Number(storm[1]), {}, ["It replicates the metal weapon its user wields."])),
                    way("Defense: Wall of Metal", cast({ uuid: "Compendium.pf2e.spells-srd.Item.CB5TlGv5ZghtMifi", name: "Wall of Metal" }, null, { toggleOn: { option: "wall-of-metal", domain: "saving-throw" } }, ["While the wall stands, the gloves give no bonus (their Wall of Metal toggle, turned on); when it ends, the metal returns: switch the toggle off (its user's own).", "Its user can Dismiss it."]))
                ]
            };
        }
    },
    {
        // Rusting Ammunition (both grades): its persistent force damage for 6 rounds at most and the crumbling at 0 Hit Points while it lasts —
        // a note Effect on the creature hit for those rounds, while it takes that damage (whilePersistent); a metal object's cube, a line.
        names: ["Rusting Ammunition (Moderate)", "Rusting Ammunition (Greater)"],
        read: (plan, { html }) => {
            const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
            const rounds = /\bdamage for up to (\d+) rounds\b/.exec(text);
            const cube = /\bFor an object, the ammunition destroys a (\d+)-foot cube\./.exec(text);
            const row = plan?.resolution?.outcomes?.success;
            const gm = row?.manualInstructions ?? [];
            if (!rounds || !cube || !/\bdeals damage to objects or creatures primarily made of metal\b/.test(text) || gm.length !== 2 || !/crumbles into fine powder/.test(said(gm[0])) || !/destroys a \d+-foot cube/.test(said(gm[1]))) return null;
            const note = { label: "Rusting", text: `Its persistent force damage lasts ${rounds[1]} rounds at most (remove it then). If it drops to 0 Hit Points while taking it, it crumbles into fine powder; its gear remains.`, duration: timeOf(rounds[1], "rounds"), whilePersistent: "force" };
            const { manualInstructions, ...kept } = row;
            return { keep: true, drop: true, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...kept, noteEffects: [...(kept.noteEffects ?? []), note] } } }, notes: [...(plan.notes ?? []), "Only a creature or object primarily made of metal (the GM's call).", `At a metal object, it destroys a ${cube[1]}-foot cube of it (an object's, the GM's).`] };
        }
    },
    // --- Walls: the ability module's zone where the wall stands, for its time, its numbers its notes — an object's, the GM's (as the ability
    // module's own walls are).
    {
        // Limestone Shield's Limestone Wall: up to 60 feet long, 10 feet high, for a minute.
        names: ["Limestone Shield: Limestone Wall"],
        sentences: [
            /^You set the shield down as it expands up to (\d+) feet wide and (\d+) feet tall\.$/,
            /^Each square of the wall has AC (\d+), Hardness (\d+), and (\d+) Hit Points, and it's immune to critical hits and precision damage\.$/,
            /^If a section is destroyed, this effect ends, and your limestone shield is broken\.$/,
            /^You can Dismiss this activation, which otherwise lasts for (\d+) (minutes?)\.$/
        ],
        card: ([wall, square, , lasts]) => zoneCard(zoneOf({
            area: { type: "line", value: Number(wall[1]) },
            centre: "placed",
            lasts: timeOf(lasts[1], lasts[2]),
            notes: [`A stone wall up to ${wall[1]} feet long and ${wall[2]} feet high, set down beside its user (draw its walls on the map).`, `Each square: AC ${square[1]}, Hardness ${square[2]}, ${square[3]} Hit Points, immune to critical hits and precision damage (an object's, the GM's).`, "A section destroyed ends it, and the shield is broken (the GM's).", "Its user can Dismiss it (end the zone)."]
        }))
    },
    {
        // Rampart Shield: a 10-foot stone rampart with arrow slits for an hour.
        names: ["Rampart Shield"],
        sentences: [
            /^You transform the shield into a 1-foot-thick, (\d+)-foot-by-\d+-foot stone rampart topped with a battlement and adorned with the flags of Absalom\.$/,
            /^If any part of the rampart would pass through any creatures or objects, the activation fails\.$/,
            /^At the center of each 5-foot length of the rampart is an arrow slit\.$/,
            /^The rampart has AC (\d+), Hardness (\d+), and (\d+) Hit Points\.$/,
            /^The rampart is immune to critical hits and precision damage\.$/,
            /^Attacks that would destroy the rampart cause it to instead revert back to its shield form and drop to the ground in an open space below the rampart\.$/,
            /^When this happens, the shield loses (\d+) Hit Points\.$/,
            /^You can Dismiss the activation, causing the wall to revert back to its shield form\.$/,
            /^The shield then returns secured to your arm if you are adjacent to the rampart, or drops to the ground in an open space if you're not adjacent to the rampart\.$/,
            /^If neither destroyed nor Dismissed, the rampart reverts back to a shield automatically after (\d+) (hours?)\.$/
        ],
        card: ([rampart, , , stats, , , loses, , , lasts]) => zoneCard(zoneOf({
            area: { type: "line", value: Number(rampart[1]) },
            centre: "placed",
            lasts: timeOf(lasts[1], lasts[2]),
            notes: [
                `A 1-foot-thick stone rampart ${rampart[1]} feet long and high, with a battlement and an arrow slit in each 5 feet, where it passes through no creature or object (draw its walls on the map).`,
                `AC ${stats[1]}, Hardness ${stats[2]}, ${stats[3]} Hit Points, immune to critical hits and precision damage (an object's, the GM's).`,
                `Destroyed, it's the shield again, dropped below it, with ${loses[1]} Hit Points less (the GM's).`,
                "Dismissed, it's the shield again: back on its user's arm if adjacent, else dropped in an open space (end the zone)."
            ]
        }))
    },
    // --- Snares that only make a noise.
    {
        // Warning Snare: Alarm Snare's square (src/compiler/snares.js alarmZone), its sound only for its maker within 1,000 feet, and the
        // searchers who beat its maker's Craft DC — the GM's note when it's set off.
        names: ["Warning Snare"],
        sentences: [
            /^Using materials specific to the area, you connect a sound-making component to a trip wire or a pressure plate\.$/,
            /^This snare is like an alarm snare, but its subtle sound blends into ambient noise\.$/,
            /^You can detect this sound as long as you're within ([\d,]+) feet of the snare and aren't prevented from hearing it\.$/,
            /^Other creatures in that area who are searching might notice the sound if their Perception check result meets or exceeds your Craft DC\.$/
        ],
        card: ([, , heard]) => zoneCard(zoneOf({
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            once: true,
            // (As an alarm snare's: a Small or larger creature sets it off.)
            saves: [{ when: ["enter"], plan: null, only: { minSize: "sm" }, note: `A creature set off Warning Snare: a subtle sound its maker hears within ${heard[1]} feet, unless kept from hearing; a creature searching nearby notices it if its Perception check meets its maker's Craft DC (the GM's to tell).` }],
            notes: ["The first Small or larger creature to enter the square sets it off; then it's spent."]
        }))
    },
    // --- Fulus that guard a building for a week, and what they do once wet or burning.
    {
        // Fulu of Flood Suppression and of Fire Suppression: the week's slowed water or fire (the GM's, out of combat), and the counteract card
        // for when it's submersed or catches fire (plan.item.counteract: +7, rank 2, the magical water or fire effects there).
        names: ["Fulu of Flood Suppression", "Fulu of Fire Suppression"],
        read: (plan, { html }) => {
            const text = String(html ?? "").replace(/@Template\[(?:type:)?(\w+)\|distance:(\d+)[^\]]*\]/g, "$2-foot $1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const flood = /\bThe fulu slows the spread of flooding water in a (\d+)-foot radius by half, repelling the remaining water away\. If the fulu becomes submersed, as the ink dissolves in the water, it releases a rush of heat in a (\d+)-foot emanation, harmlessly vaporizing non-magical water in this area into steam and attempting to counteract any magical water effects with a \+(\d+) counteract modifier and a counteract rank of (\d+); when this happens, the fulu's duration ends early\./.exec(text);
            const fire = /\bthis fulu slows the spread of fire in a (\d+)-foot radius by half\. If the fulu itself catches fire, as it burns, it releases a shower of water in a (\d+)-foot cone, automatically putting out non-magical fires in this area and attempting to counteract any magical fire effects with a \+(\d+) counteract modifier and a counteract rank of (\d+); when this happens, the fulu's duration ends early\b/.exec(text);
            const found = flood ?? fire;
            if (!found || !plan?.noteOnly || !/\bUsage affixed to a wall Duration 1 week\b/.test(text)) return null;
            const [, radius, area, modifier, rank] = found;
            const what = flood ? "water" : "fire";
            return {
                ...ownRow({
                    notes: [
                        flood ? `Affixed to a wall for a week: flooding water within ${radius} feet spreads half as fast, the rest pushed away (out of combat, the GM's).` : `Affixed to a wall for a week: fire within ${radius} feet spreads half as fast (out of combat, the GM's).`,
                        flood ? `Submersed, it vaporizes the non-magical water in a ${area}-foot emanation into steam and counteracts the magical water effects there (the counteract card); then its week is over.` : `Catching fire, it showers a ${area}-foot cone with water, putting out the non-magical fires there, and counteracts the magical fire effects there (the counteract card); then its week is over.`
                    ]
                }),
                item: { counteract: { modifier: Number(modifier), rank: Number(rank), conditions: [], traits: [], afflictions: [], free: { name: `the magical ${what} effects` }, pick: "one", notes: [flood ? "When the fulu is submersed." : "When the fulu catches fire."] } }
            };
        }
    },
    // --- Snares that leave their contents, or harm what's carried.
    {
        // Caltrop Snare: set off by the first creature to enter, it flings PF2e's Caltrops into its square (or the adjacent one its setter
        // chose): the caltrops' own square then (zone.then), its DC 14 Acrobatics check at the creature there as they land and the first to
        // move in after — 1d4 piercing, 1 persistent bleed and PF2e's Effect: Caltrops on a failure.
        names: ["Caltrop Snare"],
        sentences: [
            /^This snare consists of a hidden canister of Caltrops attached to a trip wire\.$/,
            /^When the snare is triggered, it flings the caltrops into either the snare's square or a square adjacent to the snare\.$/,
            /^You choose which square when you set up the snare\.$/,
            /^If the caltrops scatter into the same square as a creature, that creature must attempt the Acrobatics check immediately\.$/
        ],
        card: (_found, _plan, { base }) => {
            const missed = () => ({ ...none(), damage: { mode: "formulas", formulas: [{ formula: "1d4[piercing]" }, { formula: "1[persistent,bleed]" }], rollScope: "target" }, nativeEffects: [{ uuid: "Compendium.pf2e.equipment-effects.Item.5DaEI4I7cVdOD507", label: "Caltrops" }] });
            const check = { ...base, source: { ...(base?.source ?? {}), name: "Caltrop Snare: caltrops" }, automation: { level: "automatic" }, targeting: { target: "the creature in the caltrops' square", range: null, area: null }, trigger: { event: "zone" }, resolution: { kind: "save", check: { roll: "save", statistic: "acrobatics", basic: false, against: { dc: "fixed", value: 14 } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: missed(), criticalFailure: missed() } } };
            return zoneCard(zoneOf({
                area: { type: "square", value: 5 },
                centre: "placed",
                range: 5,
                once: true,
                notes: ["The first creature to enter the square sets it off; then it's spent, its caltrops in the square."],
                then: {
                    area: { type: "square", value: 5 },
                    lasts: null,
                    concealed: false,
                    terrain: [],
                    saves: [{ when: ["initial", "enter"], plan: check }],
                    notes: ["Caltrops: a DC 14 Acrobatics check for a creature there as they land or moving in (failed: 1d4 piercing and 1 persistent bleed, its Speed 5 feet lower while it bleeds).", "Its setter may have picked the adjacent square instead: move the zone there.", "Once a creature takes damage from them, the rest are safe (end the zone); plucked free with an Interact action, the bleed's DC is lower (PF2e's Effect: Caltrops)."]
                }
            }));
        }
    },
    {
        // Rusting Snare: its damage is to one of the creature's metal items, not to it — the Reflex save's rows a note Effect each of what the
        // item takes (an object's: PF2e has no card for an item's Hit Points), its scraping and the item's numbers lines of the zone.
        names: ["Rusting Snare"],
        over: (plan) => plan?.builtin === "zone" && plan.zone?.saves?.length === 1 && plan.zone.saves[0].plan?.resolution?.kind === "save",
        sentences: [
            /^This snare emits puffs of oxidizing chemicals that rapidly degrade metal items; skymetals and most precious metals are immune\.$/,
            /^The chemicals affect a non-magical metal item of up to 1 Bulk that the triggering creature is holding or openly wearing \(determined randomly if the creature is holding or wearing more than one\)\.$/,
            /^The triggering creature must attempt a @Check\[reflex\|dc:\d+\] saving throw\.$/,
            /^The snare deals (\d+d\d+) damage to the item; this damage ignores the item's Hardness and might deal persistent damage on a failed Reflex save\.$/,
            /^The creature, or an adjacent creature, can attempt to scrape off the chemicals as an Interact action to prevent the persistent damage; doing so reduces the DC of the flat check to end persistent damage to (\d+) and grants an immediate flat check\.$/,
            /^Thin iron or steel items, such as weapons, typically have 20 HP and a Broken Threshold of 10, and thicker iron or steel items, such as most suits of armor, typically have 36 HP and a Broken Threshold of 18\.$/,
            /^Other materials' statistics can be found on pages 577-579 of the Core Rulebook\.$/,
            /^Critical Success The object is unaffected\.$/,
            /^Success The object takes full damage\.$/,
            /^Failure The object takes full damage as well as (\d+d\d+) persistent\.$/,
            /^Critical Failure The object takes double damage as well as (\d+d\d+) persistent\.$/
        ],
        card: ([, , , dealt, scrape, , , , , failed, critical], plan) => {
            const [entry] = plan.zone.saves;
            const item = "one non-magical metal item of up to 1 Bulk it holds or openly wears (a random one of several; not skymetal or most precious metals)";
            const note = (label, text, duration) => ({ label, text, duration });
            const rows = {
                criticalSuccess: none(),
                success: { ...none(), noteEffects: [note("Rusting item", `Its ${item} takes ${dealt[1]} damage, ignoring its Hardness (roll it and apply it to the item: an object's).`, THIS_TURN)] },
                failure: { ...none(), noteEffects: [note("Rusting item", `Its ${item} takes ${dealt[1]} damage, ignoring its Hardness, and ${failed[1]} persistent damage until a flat check ends it (the item's, an object's). Scraping the chemicals off (an Interact action, by it or a creature beside it) lowers that flat check's DC to ${scrape[1]} and attempts one at once.`, null)] },
                criticalFailure: { ...none(), noteEffects: [note("Rusting item", `Its ${item} takes double ${dealt[1]} damage, ignoring its Hardness, and ${critical[1]} persistent damage until a flat check ends it (the item's, an object's). Scraping the chemicals off (an Interact action, by it or a creature beside it) lowers that flat check's DC to ${scrape[1]} and attempts one at once.`, null)] }
            };
            const { sharedDamage, ...resolution } = entry.plan.resolution;
            const save = { ...entry.plan, partial: undefined, automation: { level: "automatic" }, resolution: { ...resolution, sharedDamage: null, outcomes: rows } };
            delete save.partial;
            return { keep: true, drop: true, zone: { ...plan.zone, saves: [{ ...entry, plan: save }], notes: ["The first creature to enter the square sets it off; then it's spent.", "Thin iron or steel items (weapons): 20 Hit Points, Broken Threshold 10; thicker ones (most armor): 36, Broken Threshold 18; other materials as PF2e's tables (the GM's)."] } };
        }
    },
    {
        // Thundercrasher: its next shot turns the earth and stone around where it lands into difficult terrain — the zone placed there, its
        // scatter's radius, the surfaces it can soften the GM's call.
        names: ["Thundercrasher"],
        sentences: [
            /^You overload the thundercrasher to emit chaotic sonic frequencies that soften earth and stone\.$/,
            /^When you next fire the thundercrasher it also partially liquefies any natural earth or stone surfaces within range of its scatter trait, making the area difficult terrain\.$/
        ],
        card: (_found, _plan, { item }) => {
            const scatter = Number(/^scatter-(\d+)$/.exec((item?.system?.traits?.value ?? []).find((trait) => /^scatter-\d+$/.test(trait)) ?? "")?.[1]);
            if (!Number.isFinite(scatter)) return null;
            return zoneCard(zoneOf({
                area: { type: "burst", value: scatter },
                centre: "placed",
                terrain: DIFFICULT,
                notes: [`Where its user's next shot with it lands: the natural earth or stone within its scatter's ${scatter} feet turns to mud (place the zone there; which surfaces, the GM's call).`, "No time of its own: it lasts until the ground is firm again (end the zone then)."]
            }));
        }
    },
    {
        // Sawtooth Reaper's Bloodmist Whirl: its next Strike's Off-Guard is the strike card's; the fog's Concealed on its user, on the same
        // readied Strike's Effect (strike.userRules), until it Strikes or the round is up; the free Strike after Ensnaring Disarm its own.
        names: ["Sawtooth Reaper: Bloodmist Whirl"],
        read: (plan) => {
            const notes = plan?.strike?.notes ?? [];
            const fog = notes.find((note) => /^A crimson fog from the whirled chain conceals you for 1 round or until you Strike \(Concealed, by hand\)\.$/.test(said(note)));
            const free = notes.find((note) => /^When you use Ensnaring Disarm, you can also Strike the same target as a free action\.$/.test(said(note)));
            if (!plan.strike.offGuard || !fog || !free || notes.length !== 2) return null;
            return {
                keep: true,
                drop: true,
                strike: { ...plan.strike, until: "next-turn-start", notes: ["Meanwhile, when it uses Ensnaring Disarm it can also Strike the same target as a free action (its own)."], userRules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W", allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }], userWords: "Its user is Concealed in the crimson fog until it Strikes or the start of its next turn" }
            };
        }
    },
    // --- A light on the weapon, and on what it hits.
    {
        // Limning Gem: the weapon's dim light for the whetstone's minute (plan.item.light, on its wielder), and each hit with it a note Effect
        // on the creature hit — outlined in light, an invisible one only Concealed (PF2e's Concealed granted while it's invisible) — until the
        // end of its user's next turn, or for the rest of the gem's minute after a critical hit (plan.item.attackRiders, the weapon picked).
        names: ["Limning Gem"],
        sentences: [
            /^This luminescent white gem glows from within, and a weapon it's applied to gains its inner radiance, shedding dim light in a (\d+)-foot radius\.$/,
            /^Successful Strikes with a weapon affected by a limning gem outline the target in a bright white light; if the target was Invisible, it becomes Concealed instead\.$/,
            /^This light lasts until the end of your next turn or for the remainder of the limning gem 's duration on a critical hit\.$/
        ],
        card: ([glow]) => {
            const minute = timeOf(1, "minute");
            const concealed = [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W", predicate: ["self:condition:invisible"], allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }];
            const outline = (until) => `Outlined in bright white light ${until}: if it's invisible, it's only concealed.`;
            return {
                ...ownRow({}),
                item: {
                    light: [{ bright: 0, dim: Number(glow[1]), duration: minute }],
                    attackRiders: {
                        duration: minute,
                        riders: [
                            { on: ["success"], weapon: true, note: { label: "Outlined in light", text: outline("until the end of its attacker's next turn"), duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, rules: concealed }, words: "the target outlined in light until the end of your next turn (an invisible one only concealed)" },
                            { on: ["criticalSuccess"], weapon: true, note: { label: "Outlined in light", text: outline("for as long as the limning gem lasts on the weapon (delete it when that ends)"), duration: null, rules: concealed }, words: "the target outlined in light for the rest of the gem's minute (an invisible one only concealed)" }
                        ]
                    }
                }
            };
        }
    },
    {
        // Kizidhar's Shield's Secure Site: out of combat, thorns as Wall of Thorns around the campsite for 8 hours (the map's), then a
        // three-action Heal at 4th rank from the shield on every creature in it — the cast card's Heal, its three-action version PF2e's own
        // card's pick.
        names: ["Kizidhar's Shield: Secure Site"],
        sentences: [
            /^You place the kizidhar's shield into the ground at the edge of your campsite, which can't be more than (\d+) feet on a side, then speak the name of the kizidhar shuyookh carved into its handle\.$/,
            /^The shuyookh briefly appears just long enough to make a sweeping gesture, causing sprawling thorns to grow in an unnaturally symmetrical formation around the campsite, protecting it for the next (\d+) (hours?) with an effect that's otherwise identical to Wall of Thorns\.$/,
            /^All creatures within the campsite are then immediately affected by a three-action Heal spell cast at (\d+)th rank by the shield\.$/,
            /^After \d+ hours, the wall rots away, and the shield can be retrieved as an Interact action\.$/
        ],
        card: ([site, thorns, heal]) => ({
            builtin: "cast-spell",
            spell: { uuid: "Compendium.pf2e.spells-srd.Item.rfZpqmj0AIIdkVIs", name: "Heal" },
            rank: Number(heal[1]),
            dc: null,
            attack: null,
            tradition: null,
            self: false,
            targeting: { target: "every creature in the campsite", range: null, area: null },
            notes: [
                `Set at the edge of a campsite up to ${site[1]} feet on a side: thorns as Wall of Thorns ring it for ${thorns[2] === "hours" ? `${thorns[1]} hours` : `${thorns[1]} hour`}, then rot away; the shield is taken up again with an Interact action (out of combat, the map's).`,
                "Heal's three-action version, on every creature in the campsite: target them all and pick that version on PF2e's card."
            ]
        })
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
export function withAreaReadings(plan, { name, html, kind = "activation", base, info, frequency = null, item = null }) {
    const readings = READINGS.filter((reading) => forName(reading, name) && (reading.read || (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect")));
    if (!readings.length) return plan;
    const words = effectWords(html, kind);
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        // (A reading of its own, over the plan read before and its html: Rusting Ammunition's rows, the fulus' week.)
        const found = reading.read ? true : matched(reading, sentences);
        const card = reading.read ? reading.read(plan, { html, base, info, item }) : found ? reading.card(found, plan, { base, info, item }) : null;
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
