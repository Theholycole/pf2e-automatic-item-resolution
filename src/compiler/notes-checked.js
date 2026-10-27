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
    // (2026-10-27, actions: what's left is its user's own action, an object's or the map's — the needs' "actions" words an Interact or Force Open
    // its user or another creature takes, no card's to roll.)
    ["Rope of Climbing (Lesser)", "the rope animated for a minute, crawling 10 feet a round along a surface to where its user points, and its commands (stop, fasten, detach, knot) its user's Interact: an object's moves on the map"],
    ["Rope of Climbing (Moderate)", "the rope animated for a minute, crawling 10 feet a round along a surface to where its user points, and its commands (stop, fasten, detach, knot) its user's Interact: an object's moves on the map"],
    ["Rope of Climbing (Greater)", "the rope animated for a minute, crawling 10 feet a round along a surface to where its user points, and its commands (stop, fasten, detach, knot) its user's Interact: an object's moves on the map"],
    ["Immovable Rod", "the rod anchored where it is until its button is pushed again, moved only by 8,000 pounds of force or a DC 40 Athletics check to Force Open it: an object's, and the creature's own action"],
    ["Philosopher's Stone", "broken open with Force Open (DC 35), its quicksilver makes an infused Elixir of Life (True) an Elixir of Rejuvenation with an Interact, or silver or gold over a month of downtime: crafting and downtime, its user's own"],
    ["Watchful Portrait", "hung up, its user sees through its eyes from within 500 feet for 10 minutes (a creature notices with a DC 30 Perception check), then it's a plain painting: what's seen the GM's"],
    ["Accolade Robe: Review", "an item drawn from the robe's storage, then a Recall Knowledge: its user's own Interact and check"],
    // (2026-10-27, objects: an object worn down over hours and days, or one blown up when its time is up — a building's or a thing's, the GM's.)
    ["Deteriorating Dust", "an unattended object's Hardness 1 lower each hour, then 1 damage every 3 hours once it's 0, for 3 days (its lost Hardness back after): an object's, over days"],
    ["Caustic Deteriorating Dust", "an unattended object's Hardness 1 lower each hour, then 1 damage an hour once it's 0, for 3 days (its lost Hardness back after): an object's, over days"],
    ["Extended Deteriorating Dust", "an unattended object's Hardness 1 lower each hour, then 1 damage every 3 hours once it's 0, for a week (its lost Hardness back after): an object's, over days"],
    ["Demolition Fulu (Lesser)", "the object it's fixed to loses Hardness equal to the fulu's level and takes 3d6 bludgeoning once its 5 minutes to 8 hours are up; a hazard to find (Perception DC 17) and disable (Thievery DC 17): a building's, the GM's"],
    ["Demolition Fulu (Moderate)", "the object it's fixed to loses Hardness equal to the fulu's level and takes 6d6 bludgeoning once its 5 minutes to 8 hours are up; a hazard to find (Perception DC 28) and disable (Thievery DC 28): a building's, the GM's"],
    ["Demolition Fulu (Greater)", "the object it's fixed to loses Hardness equal to the fulu's level and takes 10d6 bludgeoning once its 5 minutes to 8 hours are up; a hazard to find (Perception DC 37) and disable (Thievery DC 37): a building's, the GM's"],
    ["Accolade Robe (Greater): Review", "an item drawn from the robe's storage, then a Recall Knowledge (once a minute as a free action): its user's own Interact and check"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
