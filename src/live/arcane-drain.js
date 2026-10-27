// A creature's spell or slot of a tradition lost (2026-10-27, src/compiler/artifact-readings.js: Belimarius's Invidious Halberd's Absorb
// Arcana, "it loses an arcane spell (or lose an unused arcane spell slot) as if it'd cast that spell. The spell or slot lost is randomly
// determined from the highest rank available, starting at 6th rank and working down"): which one, from its spellcasting entries. Pure.

// entries: [{ id, tradition, prepared ("prepared" | "spontaneous" | …), flexible, slots: { slotN: { max, value, prepared: [{ id, expended }] } } }]
// → the candidates at the highest rank with any, maxRank down: [{ entryId, rank, at }] (at: a prepared spell's place, null for a slot left).
export function drainCandidates(entries, { tradition, maxRank = 10 }) {
    for (let rank = maxRank; rank >= 1; rank--) {
        const found = [];
        for (const entry of entries ?? []) {
            if (entry.tradition !== tradition || !["prepared", "spontaneous"].includes(entry.prepared)) continue;
            const slot = entry.slots?.[`slot${rank}`];
            if (!slot || !(Number(slot.max) > 0)) continue;
            if (entry.prepared === "prepared" && !entry.flexible) (slot.prepared ?? []).forEach((spell, at) => spell?.id && !spell.expended && found.push({ entryId: entry.id, rank, at }));
            else if (Number(slot.value) > 0) found.push({ entryId: entry.id, rank, at: null });
        }
        if (found.length) return found;
    }
    return [];
}

// One of them, by a roll in [0, 1).
export const pickDrain = (candidates, roll) => candidates[Math.min(candidates.length - 1, Math.floor(Number(roll) * candidates.length))] ?? null;
