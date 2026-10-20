// A potion the item holds, used through it: Potion Patch's "When you Activate the patch, the potion affects you without you needing to have
// the potion in your hand … The potion must be 10th level or lower" (or "can be any level"). PF2e doesn't track what fills it: the item
// card picks one of its user's own potions, up to that level, and uses it — PF2e's own use of it, whose card follows (scripts/live.js).
// plan.item.patch { maxLevel } (null: any level). Pure.

const PATCH = /\bWhen you Activate the patch, the potion affects you without you needing to have the potion in your hand\b/i;
const LEVEL = /\bThe potion (?:must be (\d+)(?:st|nd|rd|th) level or lower|can be any level)\b/i;

// The item's text (plain) → { maxLevel } or null.
export function readPatch(text) {
    const plain = String(text ?? "");
    if (!PATCH.test(plain)) return null;
    const level = LEVEL.exec(plain);
    return { maxLevel: level?.[1] ? Number(level[1]) : null };
}
