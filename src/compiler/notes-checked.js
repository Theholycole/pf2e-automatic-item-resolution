// Note-only items checked one by one (the user's answer to question 3, 2026-10-26): an item whose card only puts its text on a note Effect
// (or one nothing reads, its words then its card's line) counts done once its text has been checked for anything a card could play — a number, a condition, a Speed or another rule — and nothing
// was found. Those with something to play are built instead; these are the ones checked and found to have none, by the plan's source name
// (an activation's "Item: Activation"), each with what its note holds. Pure.

export const NOTES_CHECKED = new Map([
    ["Spyglass Eye", "seeing as through a fine spyglass for a minute: how far it sees, nothing for a card"],
    ["Storied Skin: Living History", "the tattoo's moving picture: flavor"],
    ["Kotodama Whistle: Question the Soul", "an object's yes-or-no answers: the GM's to give (information)"],
    ["Potion of Shared Memories", "a memory passed on: a mind's, no game numbers"],
    ["Clockwork Songbird", "its song, and an adventure's portal it opens: flavor and the GM's"],
    ["Coating", "oils and poisons applied with no hands free: its user's own Interact, the oils' and poisons' cards as usual"],
    // (2026-10-27: a jump as one action, no Stride first — its user's own action, which no card can take for them.)
    ["Leaper's Elixir (Lesser)", "High Jump or Long Jump as one action with no Stride first, for its minute: its user's own action"],
    ["Leaper's Elixir (Greater)", "High Jump or Long Jump as one action with no Stride first, and a longer jump: its user's own action"],
    // (2026-10-27: one nothing read, its words its card's line — src/compiler/decided.js.)
    ["Serum of Sex Shift", "its drinker's sex characteristics changed for good, can't be counteracted: an appearance, no game numbers"],
    ["Persona Mask: Assume Role", "the mask's look changed to a dramatic character: an appearance (its Performance bonus is the mask's own)"],
    ["Persona Mask (Greater): Assume Role", "the mask's look changed to a dramatic character: an appearance (its Performance bonus is the mask's own)"],
    // (2026-10-27: Leaps for a minute — its user's own moves on the map; the fall if it lands on no ground, the environment module's.)
    ["Frog Chair: Frog Hop", "its Leaps 30 feet in any direction for its minute, landing on solid ground within 30 feet or falling after its next action: its user's own moves"],
    // (2026-10-27: no PF2e rule sets a spell's range, and the casts are its user's own, not the item's.)
    ["Compass of Transpositional Awareness: Triangulate", "+30 feet to its user's teleportation spells' ranges, touch ones to 30 feet, for its minute: no rule plays a spell's range, the casts its user's own"],
    // (2026-10-27, the lasting ones: what goes on is the map's, an object's or the GM's.)
    ["Bracelet of Buoyancy: Float", "rising 60 feet as each of its user's turns ends, up to the surface (the map's), then 10 minutes of not diving or sinking, a creature pulling it under first needing a DC 17 Athletics check (the GM's, when one tries)"],
    ["War Mage's Buckler: Spell Amp", "the shield floating up to 30 feet away for a minute as its user's spells' point of origin, range and cover from there (no PF2e rule moves a spell's origin), Dismissed back to hand or ended when the shield breaks"],
    ["Trackless (Greater)", "the rune's +4 to the DC to track extended to up to 10 creatures within 20 feet for 8 hours: tracking's DC is the GM's (no PF2e rule for it)"],
    ["Kaiju Fulu", "a structure as hard as standard-grade adamantine against the damage that sets it off and any for an hour after: a building's, not a creature's"],
    ["Instant Spy", "an hour of sound recorded and played back once within a day, what it hears the GM's: sound and an object"],
    ["Colorful Coating (Indigo)", "a surface or object's Hardness 2 lower and 1d4 acid damage to it each round for a minute: an object's, the GM's"],
    ["Banquet of Hungry Ghosts", "four willing undead fed: friendly to its user for 24 hours unless angered, their hunger sated, and talk with them after a morsel: their attitude and speech"],
    ["Feast of Hungry Ghosts", "one willing undead fed: friendly to its user for 24 hours unless angered, its hunger sated, and talk with it after a morsel: its attitude and speech"],
    // (2026-10-27: running up walls during its Strides for a minute — its user's own move, which no PF2e rule plays: a climb Speed would let it
    // Climb, not Stride up a wall, and its falls are its user's. The note Effect holds it for the minute.)
    ["Boots of Free Running (Lesser)", "running up vertical surfaces at full Speed with each Stride for 1 minute (and up waterfalls with water walking): its user's own move"],
    ["Boots of Free Running (Moderate)", "running up vertical surfaces at full Speed with each Stride for 1 minute (and up waterfalls with water walking): its user's own move"],
    ["Boots of Free Running (Greater)", "running up vertical surfaces at full Speed with each Stride for 1 minute (and up waterfalls with water walking): its user's own move"],
    // (2026-10-27: a targeting flat check's DC, which no PF2e rule sets — PF2e's own Effect: Mummified Bat leaves the same to its words.)
    ["Cat's Eye Elixir", "flat checks to target Hidden creatures within 30 feet at DC 5, and none to target Concealed ones, for its minute: its user's own rolls"],
    // (2026-10-27: a day's food, and immune to it after a week of nothing else until a day of real meals: the table's, out of combat.)
    ["Journeybread", "a day's food and water; after a week of nothing else, immune to it until 24 hours of real food and water: meals the GM keeps"],
    // (2026-10-27, the areas' leftovers: a light's look, the map's, an object's, out of combat.)
    ["Prismatic Dust", "a magical bright light's colour changed for an hour: its look only"],
    ["Cube of Recall", "a side of the cube attuned to where its user stands (10 minutes): the record its teleport reads later, its user's own"],
    ["Ruby String", "a single 10-foot-cube demiplane spun over 8 hours, or a create demiplane ritual's cost and secondary checks met: out of combat, a ritual's"],
    ["Colorful Coating (Blue)", "a loose square firmed to hold twice the weight for a minute, +1 circumstance to Reflex saves against its collapse and +2 to the DC to Force Open it: an object's, its collapse the GM's hazard"],
    ["Preserving Shot", "a Large or smaller animal it kills preserved as food: out of combat"],
    ["Explorer's Yurt: Unroll", "a yurt that houses and feeds ten, its light hidden from outside, folded back with an Interact action: out of combat and the map's"],
    ["Insistent Door Knocker", "a door made through up to 1 foot of a wall, floor or ceiling (none through metal), released with an Interact action: the map's"],
    ["Insistent Door Knocker (Greater)", "a door made through up to 5 feet of a wall, floor or ceiling (none through metal), released with an Interact action: the map's"],
    ["Insistent Door Knocker (Major)", "a door made through up to 10 feet of a wall, floor or ceiling (none through metal), released with an Interact action: the map's"],
    ["Mutator Onyx", "an unattended object's surface (up to a 5-foot cube, Hardness 5 or less) at Hardness 0 for 10 minutes: an object's"],
    ["Private Workshop", "a 15-foot workshop for Crafting at +1 (PF2e's own Effect: Private Workshop (Using for Crafting)), folded back with an Interact action: out of combat"],
    ["Sandcastle: Shape the Castle", "a castle of sand up to 120 feet, built over a minute, its walls AC 10, Hardness 10, 40 Hit Points a section, weakness to water 15, Climb DC 15: the map's and its walls' (objects)"],
    ["Blooming Lotus Seed Pod", "lotus pads floating on a liquid for a minute (the map's), or a lotus whose 8 hours of sleep within 30 feet count as a day's rest, safe from Nightmare: out of combat"],
    ["Spider Chair: Web Swing", "its user pulled by a web line to a wall, floor or ceiling up to 60 feet away: its own move on the map"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
