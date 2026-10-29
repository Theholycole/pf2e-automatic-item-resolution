// A slime its creature or those beside it pull off with Interact actions (2026-10-28, docs/needs.md "reader"): Alchemists+'s Phial of Slurk,
// whose slurk spits at a creature: a failed Reflex save leaves it Clumsy 1 with a 5-foot status penalty to its Speed for an hour or until
// the slime is off — two Interact actions (three after a critical failure), by it or any creature adjacent, not all at once nor by one
// creature. The save card's failure rows get the Speed penalty beside the Clumsy the rows read (PF2e's land Speed, as rows.js reads a
// singular "Speed"); the slime's removal is the end-early card (src/compiler/end-early.js, plan.endEarly.byDegree): its Interact actions
// by degree, others helping, which ends the item's Effects on that creature. Pure.

const COUNT = { one: 1, two: 2, three: 3, four: 4 };
const FAILS = /^A creature that fails its save is ([A-Z][a-z]+) (\d+) and takes a\s+[–-](\d+)-foot status penalty\s+to Speed for (\d+) (hours?|minutes?)\s+or until the (\w+) is removed\.$/;
const REMOVED = /^The (\w+) can be removed\s+with (one|two|three|four) Interact actions\s+by the [\w ]+? creature or creatures\s+adjacent to the creature,\s+or (one|two|three|four) Interact actions\s+if the creature critically fails its save\.$/;
const HELPED = /^These actions don[’']t need to be\s+consecutive or made by the same creature\.$/;

// The plan (a save card's) and its item's plain text → the plan with the penalty and the end-early card, or the same plan.
export function withSlimeOff(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.endEarly) return plan;
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const fails = sentences.map((sentence) => FAILS.exec(sentence)).find(Boolean);
    const removed = sentences.map((sentence) => REMOVED.exec(sentence)).find(Boolean);
    const helped = sentences.some((sentence) => HELPED.test(sentence));
    if (!fails || !removed || !helped || fails[6] !== removed[1]) return plan;
    const slug = fails[1].toLowerCase();
    const outcomes = plan.resolution.outcomes ?? {};
    const degrees = ["failure", "criticalFailure"];
    if (!degrees.every((degree) => (outcomes[degree]?.effects ?? []).some((effect) => effect.slug === slug && effect.value === Number(fails[2])))) return plan;
    const unit = fails[5].replace(/s?$/, "s");
    const duration = { mode: "fixed", value: Number(fails[4]), unit, expiry: "turn-start", anchor: "effect-start" };
    const penalty = { selector: "land-speed", value: -Number(fails[3]), type: "status", duration };
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, degrees.includes(degree) ? { ...row, modifiers: [...(row.modifiers ?? []), penalty] } : row]));
    const ways = { failure: { kind: "actions", count: COUNT[removed[2]], helped: true }, criticalFailure: { kind: "actions", count: COUNT[removed[3]], helped: true } };
    const notes = (plan.notes ?? []).filter((note) => !FAILS.test(String(note).trim()) && !REMOVED.test(String(note).trim()) && !HELPED.test(String(note).trim()));
    const left = notes.length || (plan.unread ?? []).length || Object.values(rows).some((row) => (row?.manualInstructions ?? []).length);
    const { notes: _notes, ...rest } = plan;
    return {
        ...rest,
        ...(notes.length ? { notes } : {}),
        resolution: { ...plan.resolution, outcomes: rows },
        endEarly: { how: ways.failure, byDegree: ways, conditions: [], degrees, said: [fails[0], removed[0]] },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
