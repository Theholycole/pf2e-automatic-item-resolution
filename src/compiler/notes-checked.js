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
    // (2026-10-27: Leaps for a minute — its user's own moves on the map; the fall if it lands on no ground, the environment module's.)
    ["Frog Chair: Frog Hop", "its Leaps 30 feet in any direction for its minute, landing on solid ground within 30 feet or falling after its next action: its user's own moves"],
    // (2026-10-27: no PF2e rule sets a spell's range, and the casts are its user's own, not the item's.)
    ["Compass of Transpositional Awareness: Triangulate", "+30 feet to its user's teleportation spells' ranges, touch ones to 30 feet, for its minute: no rule plays a spell's range, the casts its user's own"]
]);

export const notesChecked = (name) => NOTES_CHECKED.has(String(name ?? ""));
