// A square that softens the falls into it (2026-10-28, docs/needs.md "Moving creatures and the user"): Impact Jelly, the installed alchemists'
// module's — a flask that covers a 10-foot square for a minute, falls into it counted 50 feet shorter, their damage nonlethal, a creature it
// would hurt rolling Acrobatics or Athletics (DC 10, 1 more per 10 feet fallen) to land standing, and jumps from it up to 10 feet longer. Its
// square a zone the user places, as Invisible Net's (src/compiler/moving-readings.js): zone.fall { shorter, nonlethal, landCheck }, which
// scripts/falls.js netsUnder passes to the environment module's fall as it lands — the shorter fall played now; the nonlethal damage and the
// check to land standing the environment module's still (a request), so the card says them and the plan stays partial. The jump's longer
// distance is the creature's own move, a line. Its flavour no rule. Their words stay theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";
import { zoneOf } from "./area-readings.js";

const FLAVOUR = /^Activate \(manipulate\) This\b(?:(?!\b(?:feet|DC|check|damage|bonus)\b)[^.\d])*\.$/i;
const COVERS = /^A single flask of [\w' -]+? covers an? (\d+)-foot square for (\d+|one|an?) (minutes?|rounds?)\.$/i;
const SHORTER = /^A creature that falls\s+in an area with\s+the jelly treats the fall as (\d+) feet\s+shorter and any fall damage\b[^.]*\bnon-?lethal damage\.$/i;
const STANDING = /^A creature that would\s+take damage from\s+falling on an? [\w' -]+? can attempt an\s+Acrobatics or Athletics check against a\s+DC (\d+) \+ (\d+) for every (\d+) feet\b[^.]*\bstanding after the fall\.$/i;
const JUMPS = /^Creatures in the jelly that\s+Leap, Long Jump, or High Jump\s+increase the distance\b[^.]*\bby up to (\d+) feet\.$/i;
const WORDS = { one: 1, a: 1, an: 1 };

// The plan read before (its note alone), the consumable's plain text → its zone card, or the same plan.
export function withSoftSquare(plan, text, { base, info } = {}) {
    if (plan && !plan.noteOnly) return plan;
    const sentences = sentencesOf(text);
    const pick = (pattern) => sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null;
    const covers = pick(COVERS);
    const shorter = pick(SHORTER);
    const standing = pick(STANDING);
    const jumps = pick(JUMPS);
    if (!covers || !shorter || !standing || !jumps || !sentences.every((sentence) => [FLAVOUR, COVERS, SHORTER, STANDING, JUMPS].some((pattern) => pattern.test(sentence)))) return plan;
    const [, size, value, unit] = covers;
    const [, dc, add, per] = standing;
    const lasts = { mode: "fixed", value: WORDS[value.toLowerCase()] ?? Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const zone = zoneOf({
        area: { type: "square", value: Number(size) },
        centre: "placed",
        lasts,
        notes: [
            `Placed where its user pours it; a creature falling into it falls ${shorter[1]} feet less (the environment module's fall, while it lasts).`,
            `Its falling damage there is nonlethal, and one it would hurt rolls Acrobatics or Athletics, DC ${dc} and ${add} more per ${per} feet fallen, to land standing (the GM's, until the environment module plays them).`,
            `A creature in it can Leap, High Jump or Long Jump up to ${jumps[1]} feet farther (its own move).`
        ],
        fall: { shorter: Number(shorter[1]), nonlethal: true, landCheck: { statistics: ["acrobatics", "athletics"], dc: Number(dc), add: Number(add), per: Number(per) } }
    });
    return {
        ...(base ?? {}),
        automation: { level: "guided" },
        trigger: { event: "use" },
        builtin: "zone",
        actions: null,
        targeting: { target: null, range: null, area: zone.area },
        zone,
        item: { ...(info ?? plan?.item ?? {}) },
        partial: true
    };
}
