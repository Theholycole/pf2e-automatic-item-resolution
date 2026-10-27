// A unique item's or an artifact's words with no rule in them (2026-10-27; the user: their unique effects all automated, never a card's line
// in their place): its history, its look, how it can be destroyed. Listed here by the plan's source name (an activation's "Item: Activation"),
// each pattern one such sentence; once every sentence its card leaves over is one of these, those are its card's lines and it counts done
// (src/compiler/decided.js) — what has a rule in it is still built. Pure.

export const LORE_LINES = new Map([]);

// Whether every left-over sentence is one of the item's lore sentences.
export function loreOnly(name, sentences) {
    const patterns = LORE_LINES.get(String(name ?? "")) ?? [];
    const words = (sentences ?? []).map((sentence) => String(sentence ?? "").trim()).filter(Boolean);
    return patterns.length > 0 && words.length > 0 && words.every((sentence) => patterns.some((pattern) => pattern.test(sentence)));
}
