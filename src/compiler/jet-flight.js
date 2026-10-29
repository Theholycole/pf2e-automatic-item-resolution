// A flight that keeps going while it's sustained (2026-10-28, docs/needs.md "Moving creatures and the user"): Junkcraft Jetpack, the installed
// inventors' module's — a Fly of up to 60 feet in any direction, one turn of up to 90° mid-flight on a DC 20 Acrobatics check, no moving on
// the ground till the end of its user's next turn, no falling while it burns; sustained up to a minute, each turn's first Sustain another 60
// feet the way it last flew, the restrictions holding till the minute's out; then out of fuel, its user falling if still in the air. The move
// card (the teleport card's own move, verb Fly, within 60 feet — src/compiler/move.js's kind), kept open for the next flights (move.again);
// its user's note Effect for the minute holding what PF2e can't play (no ground moves, no fall while it burns, the next flights' way), the
// user's ruling 1; the turn's check, its user's own to roll, and the fall at its end (the environment module's, as its token comes down)
// lines of the card. Their words stay theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";

const JET = {
    flavour: /^Activate Interact \(move\) This strange\b(?:(?!\b(?:feet|DC|check|damage)\b)[^.\d])*\.$/i,
    fly: /^When you Activate [\w' -]+?, spurts of fire\b[^.]*?\band you Fly up to (\d+) feet in any direction\.$/i,
    turn: /^During this movement, you must succeed at an? @Check\[type:acrobatics\|[^\]]*\bdc:(\d+)\] to turn up to (\d+) degrees\b[^.]*\.$/i,
    ground: /^During the activation and after the\s+activation is complete, you can't\s+Stride, Step, or otherwise\s+move on the ground\s+until the end of your next turn\.$/i,
    falls: /^You do not fall\s+as long as your\s+jetpack is active\.$/i,
    sustain: /^You can Sustain the activation of [\w' -]+? for up to (\d+) (minutes?|rounds?)\.$/i,
    again: /^Starting on the turn after you Activate\s+the jetpack, the first time you Sustain\b[^.]*?\byou Fly up to (\d+) feet in the same direction\b[^.]*\.$/i,
    empty: /^Once the effect ends, the jetpack is\s+out of fuel and you fall\b[^.]*\.$/i
};

// The plan read before (nothing), the consumable's plain text, its base and item part → the move card with its user's note Effect, or the
// same plan.
export function withJetFlight(plan, text, { base, info, name } = {}) {
    if (plan && !plan.noteOnly && plan.builtin !== "no-effect") return plan;
    const sentences = sentencesOf(text);
    const found = Object.fromEntries(Object.entries(JET).map(([key, pattern]) => [key, sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null]));
    if (!Object.values(found).every(Boolean) || !sentences.every((sentence) => Object.values(JET).some((pattern) => pattern.test(sentence)))) return plan;
    const [, feet] = found.fly;
    const [, dc, degrees] = found.turn;
    const [, value, unit] = found.sustain;
    const time = { mode: "fixed", value: Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const note = {
        kind: "note",
        label: `${name}: flying`,
        text: `While the jetpack burns — sustained each turn, ${value} ${unit.toLowerCase()} at most; delete this at the end of the turn after an unsustained one —: no Stride, Step or other move on the ground, and it doesn't fall. Each turn after the first, its first Sustain flies it up to ${found.again[1]} feet more, the same way as its last flight (the move card again). When this ends, the fuel's spent: it falls if it's still in the air.`,
        duration: time
    };
    return {
        ...(base ?? {}),
        builtin: "teleport",
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        teleport: { within: Number(feet), from: "self", move: { verb: "Fly", lines: ["In any direction", `One turn mid-flight, ${degrees}° at most, takes a DC ${dc} Acrobatics check (its user's own to roll); no more turns than that`, `Again with each turn's first Sustain: up to ${found.again[1]} feet the same way as before`], again: true } },
        userEffects: [note],
        notes: ["When the flight's over and the fuel's spent, lower its token if it's still in the air: the environment module's fall."],
        item: { ...(info ?? plan?.item ?? {}) }
    };
}
