// Note-only items checked one by one (the user's answer to question 3, 2026-10-26): an item whose card only puts its text on a note Effect
// counts done once its text has been checked for anything a card could play — a number, a condition, a Speed or another rule — and nothing
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
    // (2026-10-27, the lasting ones: what goes on is the map's, an object's or the GM's.)
    ["Bracelet of Buoyancy: Float", "rising 60 feet as each of its user's turns ends, up to the surface (the map's), then 10 minutes of not diving or sinking, a creature pulling it under first needing a DC 17 Athletics check (the GM's, when one tries)"],
    ["War Mage's Buckler: Spell Amp", "the shield floating up to 30 feet away for a minute as its user's spells' point of origin, range and cover from there (no PF2e rule moves a spell's origin), Dismissed back to hand or ended when the shield breaks"],
    ["Trackless (Greater)", "the rune's +4 to the DC to track extended to up to 10 creatures within 20 feet for 8 hours: tracking's DC is the GM's (no PF2e rule for it)"],
    ["Kaiju Fulu", "a structure as hard as standard-grade adamantine against the damage that sets it off and any for an hour after: a building's, not a creature's"],
    ["Instant Spy", "an hour of sound recorded and played back once within a day, what it hears the GM's: sound and an object"],
    ["Colorful Coating (Indigo)", "a surface or object's Hardness 2 lower and 1d4 acid damage to it each round for a minute: an object's, the GM's"],
    ["Banquet of Hungry Ghosts", "four willing undead fed: friendly to its user for 24 hours unless angered, their hunger sated, and talk with them after a morsel: their attitude and speech"],
    ["Feast of Hungry Ghosts", "one willing undead fed: friendly to its user for 24 hours unless angered, its hunger sated, and talk with it after a morsel: its attitude and speech"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
