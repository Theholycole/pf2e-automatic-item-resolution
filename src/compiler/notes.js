// A plan's notes as the card shows them: not its Activate line before the first sentence ("Activate—Absorb Essence 1 (…) Requirements …
// Effect You absorb …", or its name and traits alone), nor the item's crafting ("… Craft Requirements Supply one casting of command"), nor an
// artifact's "Destruction" line. Pure.

const cleaned = (note) => (typeof note === "string"
    ? note.replace(/^\s*Activat(?:e|ion)\b[^.]*?\bEffect\s+/i, "").replace(/^\s*Activat(?:e|ion)\s*[—–-][^()]*?\([^)]*\)\s*/i, "").replace(/\s*\bCraft Requirements\b[\s\S]*$/, "").trim()
    : note);

// notes → the notes the card shows (strings cleaned, other entries kept).
export function cleanNotes(notes) {
    if (!Array.isArray(notes)) return notes;
    return notes.map(cleaned).filter((note) => note !== "" && !(typeof note === "string" && /^Destruction\b/.test(note)));
}
