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
    // (2026-10-27, the visibility group's: what each sees, tells or hides is the GM's and the map's, no number a card applies.)
    ["Ring of Observation (Lesser)", "a minute of focusing (one concentrate action each) to feel whether creatures within 30 feet that aren't Hidden from its wearer are watching it: the GM's to say (information)"],
    ["Ring of Observation (Moderate)", "10 minutes of focusing (one concentrate action each) to feel whether creatures within 60 feet that aren't Hidden from its wearer are watching it: the GM's to say (information)"],
    ["Ring of Observation (Greater)", "an hour of focusing (one concentrate action each) to feel whether creatures within 120 feet that aren't Hidden from its wearer are watching it: the GM's to say (information)"],
    ["Ectoplasmic Tracer", "incorporeal spirits in its 15-foot cone marked for 1d4 days, +2 to Track them and 10 minutes' scraping to remove it: tracking out of combat, the GM's"],
    ["Lover's Ink", "a hidden message, revealed by more ink and 3 Interact actions, or spotted by a DC 25 Seek: an object and a message, the GM's"],
    ["Parchment of Secrets", "a secret message hidden in the letters until someone taps the symbol: an object and a message"],
    ["Moonlit Ink", "a stamp that fades from sight until an hour of moonlight, or a DC 25 Perception check: an object, the GM's"],
    ["Tlil Mask", "a minute of seeing through small living plants within 60 feet (no concealment, Hiding or Sneaking by them alone against its wearer): the map's and the GM's"],
    ["Tlil Mask (Greater)", "10 minutes of seeing through small living plants within 60 feet (no concealment, Hiding or Sneaking by them alone against its wearer): the map's and the GM's"],
    ["Silent Bell: Ring in the Quiet", "a 20-foot cube no sound passes into or out of for 10 minutes, lips still read through it: sound and the map"],
    ["Twilight Tattoo: Fade", "the tattoo unseen and undetectable by magic for a day, Dismissed at will: an appearance"],
    ["Ally's Kerchief: Identify Allies", "a symbol glowing over its wearer that only matching kerchiefs' wearers see: recognition, no game numbers"],
    ["Mirrorblade: Scryshield", "an hour unseen by scrying, and the scrying within 30 feet learned (detect scrying), ended by sheathing, dropping or attacking with the blade: information out of combat"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
