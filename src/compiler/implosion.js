// A shrink whose steps a save at each of its creature's turns moves (2026-10-27, docs/needs.md): Implosion Dust's "which must attempt a DC 20
// Fortitude saving throw. The target must repeat the saving throw at the end of each of its turns. Implosion dust functions for up to 6 rounds.
// … Critical Success The dust becomes inert, and the creature returns to its normal size. Success The target increases in size one step, up to
// its normal size. If it's at its normal size after the increase, the effect ends. Failure The target decreases in size one step, to a minimum of
// Tiny. The reach of each of its Strikes decreases by 5 feet … Shrinking also imposes a status penalty to the creature's physical melee damage.
// This penalty is –2 for every step lower than its normal size the creature is. Critical Failure As failure, but the target decreases in size by
// two steps." The failure's and the critical failure's note Effect for the 6 rounds with PF2e's rules for its steps — a CreatureSize −1 for each
// (never below Tiny; PF2e's reach follows the size) and −2 status to melee damage for each — and a marker (RollOption
// "air-implosion:<save>:<dc>") by which, at the end of each of its creature's turns, the active GM's client rolls that save and moves its steps
// (scripts/implosion.js): one fewer on a success, none left on a critical success, one or two more on a failure or critical failure. Only
// amorphous creatures (the GM's call) are its targets: a line of the card. Pure.

const DUST = /\bwhich must attempt an? @Check\[(fortitude|reflex|will)\|dc:(\d+)\][^.]*?\. The target must repeat the saving throw at the end of each of its turns\. Implosion dust functions for up to (\d+) rounds\. It then becomes inert, and the creature returns to its normal size\./i;
const ROWS = /\bCritical Success The dust becomes inert, and the creature returns to its normal size\. Success The target increases in size one step, up to its normal size\. If it's at its normal size after the increase, the effect ends\. Failure The target decreases in size one step, to a minimum of Tiny\. The reach of each of its Strikes decreases by 5 feet, to a minimum of 5 feet if the creature is Small or larger, or a minimum of 0 feet if the creature is Tiny\. Shrinking also imposes a status penalty to the creature's physical melee damage\. This penalty is [–-]2 for every step lower than its normal size the creature is\. Critical Failure As failure, but the target decreases in size by two steps\./i;
const AMORPHOUS = /\bIt's effective at weakening water elementals, air elementals, oozes, and other creatures the GM determines are similarly amorphous\b/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

// The Effect's rules for so many steps (each step's −2 counted for the steps it really shrank: shrunk, at most what it has above Tiny).
export function implosionRules({ save, dc, steps, shrunk = steps, label = "Implosion Dust" }) {
    return [
        { key: "RollOption", domain: "all", option: `air-implosion:${save}:${dc}` },
        ...Array.from({ length: steps }, () => ({ key: "CreatureSize", value: -1, minimumSize: "tiny", resizeEquipment: true })),
        ...(shrunk > 0 ? [{ key: "FlatModifier", selector: "melee-damage", type: "status", value: -2 * shrunk, label }] : [])
    ];
}
export const implosionWords = (steps) => `Shrunk ${steps} size step${steps === 1 ? "" : "s"} (never below Tiny), its reach as its new size's; –2 status to its physical melee damage for each step it's below its normal size. A new save at the end of each of its turns: a critical success ends it, a success takes a step back, a failure one more step, a critical failure two.`;

// The degree of a new save (0 critical failure … 3 critical success) and the steps now → the steps after (0: it ends).
export const implosionNext = (steps, degree) => (degree === 3 ? 0 : degree === 2 ? Math.max(0, steps - 1) : degree === 1 ? steps + 1 : steps + 2);

// The save plan the ability compiler read and the item's plain text → the plan with those rows, or the same plan.
export function withImplosion(plan, text) {
    const plain = String(text ?? "");
    const dust = DUST.exec(plain);
    if (!dust || !ROWS.test(plain) || plan?.resolution?.kind !== "save") return plan;
    const save = dust[1].toLowerCase();
    const dc = Number(dust[2]);
    const duration = { mode: "fixed", value: Number(dust[3]), unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
    const label = String(plan.source?.name ?? "Implosion Dust");
    const shrink = (steps) => ({ ...none(), noteEffects: [{ label: "Imploded", text: implosionWords(steps), duration, rules: implosionRules({ save, dc, steps, label }) }] });
    // (Last of its readers: the rows' GM lines and the repeated save's sentence, untraced by the others, are this reading's.)
    const { partial, ...rest } = plan;
    const notes = (plan.notes ?? []).filter((note) => !/^The target must repeat the saving throw at the end of each of its turns\.$/i.test(String(note?.text ?? note).trim()));
    return {
        ...rest,
        automation: { ...(plan.automation ?? {}), level: notes.length || (plan.unread ?? []).length ? "guided" : "automatic" },
        resolution: { ...plan.resolution, outcomes: { criticalSuccess: none(), success: none(), failure: shrink(1), criticalFailure: shrink(2) } },
        notes: [...notes, ...(AMORPHOUS.test(plain) ? ["Only amorphous creatures — water and air elementals, oozes, and others the GM judges alike — are shrunk by it."] : [])],
        ...(notes.length || (plan.unread ?? []).length ? { partial: true } : {})
    };
}
