// A roll at each of an afflicted creature's turns (2026-10-26): Blackfinger Blight's "Each round, at the beginning of their turn, a creature
// affected by blackfinger blight must succeed at a flat DC 5 check or drop one random item they're holding", Astringent Venom's the same with
// PF2e's flat check link. Before, the first was a note and the second dropped unread. plan.afflictedTurns { name, flatDC, drop: "random-held",
// lasts }: once the card hands the affliction over (its failure rows), the creature is marked for the affliction's maximum duration; at the
// start of each of its turns while Pseudo Afflictions still has it, the flat check is rolled and on a failure one random item it holds is
// dropped (scripts/afflicted-turns.js). Pure.

const DROPS = /\bEach round,? at the beginning of their turn, a creature affected by ([\w' -]+?) must succeed at (?:a flat DC (\d+) check|a DC (\d+) flat check|an? @Check\[flat\|dc:(\d+)\](?:\{[^}]*\})?) or drop one random item they're holding\./i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const plainOf = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The plan and the item's html → the plan with afflictedTurns, or the same plan.
export function withAfflictedTurns(plan, html) {
    const handoff = plan?.resolution?.afflictionHandoff;
    const match = DROPS.exec(plainOf(html));
    if (!handoff || !match) return plan;
    const flatDC = Number(match[2] ?? match[3] ?? match[4]);
    const lasts = handoff.maximumDuration?.value ? { mode: "fixed", value: Number(handoff.maximumDuration.value), unit: handoff.maximumDuration.unit, expiry: "turn-start", anchor: "effect-start" } : null;
    // (Its sentence, a note before: gone, said by the mark.)
    const sentence = match[0].replace(/an? @Check\[flat\|dc:(\d+)\](?:\{[^}]*\})?/i, "a DC $1 flat check");
    const gone = (entry) => said(entry).replace(/\s*\(by hand\)\.?$/, "").replace(/\.$/, "") === match[0].replace(/\.$/, "") || said(entry).replace(/\.$/, "") === sentence.replace(/\.$/, "");
    const notes = (plan.notes ?? []).filter((note) => !gone(note));
    const next = { ...plan, notes: notes.length ? notes : undefined, afflictedTurns: { name: handoff.name, flatDC, drop: "random-held", lasts } };
    const left = [...notes, ...(next.unread ?? []), ...Object.values(next.resolution.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
