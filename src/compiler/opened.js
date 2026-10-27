// A trap set off by opening it, not by a square stepped into (2026-10-27, docs/needs.md): Fire Box's "Anyone who opens the box triggers a
// clockwork mechanism that unleashes a 15-foot cone of fire. The cone issues forth in a random direction determined by the GM but always
// including the creature who opened the box." Its save card at those the cone reaches, used when someone opens it; its aim a line of the card
// (the GM's way, at random, through the opener — the card's area, as any cone's). Not a zone (src/compiler/snares.js OPENED). Pure.

import { OPENED } from "./snares.js";
import { plainText } from "./rows.js";

const AIM = /^The cone issues forth in a random direction determined by the GM but always including the creature who opened the box\.$/i;

// The plan and its item → the plan as an opened trap's, or the same plan.
export function withOpenedTrap(plan, given) {
    const text = plainText(given?.system?.description?.value);
    const area = plan?.targeting?.area;
    if (!OPENED.test(text) || plan?.resolution?.kind !== "save" || area?.type !== "cone") return plan;
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    if (!sentences.some((sentence) => AIM.test(sentence))) return plan;
    const line = `Use it when someone opens the box: its ${area.value}-foot cone goes a way the GM picks at random, always through the one who opened it; target those in it.`;
    return {
        ...plan,
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        // (A snare's kind of item, but its save card on its Use: src/live/poison-card.js.)
        openedTrap: true,
        targeting: { ...plan.targeting, target: "the creatures in the cone" },
        notes: [line, ...(plan.notes ?? []).filter((note) => !AIM.test(String(note).trim()) && !OPENED.test(String(note)))]
    };
}
