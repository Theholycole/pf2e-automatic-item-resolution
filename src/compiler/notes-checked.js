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
    // (2026-10-27: a targeting flat check's DC, which no PF2e rule sets — PF2e's own Effect: Mummified Bat leaves the same to its words.)
    ["Cat's Eye Elixir", "flat checks to target Hidden creatures within 30 feet at DC 5, and none to target Concealed ones, for its minute: its user's own rolls"],
    // (2026-10-27: a day's food, and immune to it after a week of nothing else until a day of real meals: the table's, out of combat.)
    ["Journeybread", "a day's food and water; after a week of nothing else, immune to it until 24 hours of real food and water: meals the GM keeps"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
