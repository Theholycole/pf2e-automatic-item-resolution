// Mines that roll out and trip whoever starts a turn on them (2026-10-28, docs/needs.md "Moving creatures and the user"): Marble Mines' grades,
// the installed inventors' module's — balls rolled 15 feet along the floor (stopping early in a creature's space, the GM free to make it more
// or less by the ground) that cover a square for a minute as difficult terrain, a creature starting its turn there making a Reflex save or
// falling Prone; the first to fall Prone there sets them off, fire damage on a basic Reflex save to the creatures in them, and they're gone.
// The ability module's zone placed within 15 feet: PF2e's difficult terrain, the save at each turn's start on the creatures in it (Prone on a
// failure), the minute. Where they stop is the map's, a line; the setting off a one-off rule (src/compiler/one-offs.js, the user's ruling:
// a line of the zone card, its words there) — so the plan, partial, goes to the user's rulings again (context.decide). Their words stay
// theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";
import { DIFFICULT, zoneOf } from "./area-readings.js";

const MINES = {
    flavour: /^Activate Interact These strange metal\s+balls\b(?:(?!\b(?:feet|DC|check|damage)\b)[^.\d])*\.$/i,
    thrown: /^When thrown to the floor, the marbles\s+beep\b[^.]*\.$/i,
    roll: /^When Activated, [\w' -]+? move (\d+) feet away from\s+you in a straight line\b[^.]*\.$/i,
    gm: /^The GM might reduce or increase\s+this distance\b[^.]*\.$/i,
    occupy: /^At the end of this movement, the\s+mines occupy the\s+listed area and make it\s+difficult for creatures to move\.$/i,
    prone: /^Creatures that begin their turn in\s+the space of the\s+mines must attempt a\s+Reflex save or fall prone\.$/i,
    detonate: /^The first time a creature falls prone\s+in a square occupied by mines, the\s+mines detonate\b[^.]*\bbasic Reflex save\b[^.]*\.$/i,
    lasts: /^After (\d+|one|an?) (minutes?|rounds?) has passed, the\s+mines break ?down and are destroyed\.$/i,
    listed: /^The mines deal (\d+(?:d\d+)?) fire\s+(?:fire )?damage, occupy an? (\d+)-foot square, and an? @Check\[type:reflex\|dc:(\d+)\|basic:true\b[^\]]*\]\.$/i
};
const WORDS = { one: 1, a: 1, an: 1 };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
const prone = () => ({ ...none(), effects: [{ kind: "condition", slug: "prone", value: null, duration: null }] });

// The plan read before, the consumable's plain text, its context → the mines' zone (still partial, for the one-off ruling), or the same plan.
export function withRollingMines(plan, text, { base, info } = {}) {
    if (plan?.builtin && plan.builtin !== "no-effect") return plan;
    const sentences = sentencesOf(text);
    const found = Object.fromEntries(Object.entries(MINES).map(([key, pattern]) => [key, sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null]));
    if (!Object.values(found).every(Boolean) || !sentences.every((sentence) => Object.values(MINES).some((pattern) => pattern.test(sentence)))) return plan;
    const [, feet] = found.roll;
    const [, formula, size, dc] = found.listed;
    const [, value, unit] = found.lasts;
    const lasts = { mode: "fixed", value: WORDS[value.toLowerCase()] ?? Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const save = {
        ...(base ?? {}),
        automation: { level: "automatic" },
        trigger: { event: "zone" },
        targeting: { target: "a creature in the area", range: null, area: null },
        resolution: { kind: "save", check: { roll: "save", statistic: "reflex", basic: false, against: { dc: "fixed", value: Number(dc) } }, outcomes: { criticalSuccess: none(), success: none(), failure: prone(), criticalFailure: prone() } }
    };
    const zone = zoneOf({
        area: { type: "square", value: Number(size) },
        centre: "placed",
        range: Number(feet),
        lasts,
        terrain: DIFFICULT,
        saves: [{ when: ["start"], plan: save }],
        notes: [
            `They roll ${feet} feet from its user in a straight line along the floor, stopping in the first creature's space on the way: place them where they stop (the GM may lengthen or shorten the roll for a slope or the ground).`,
            `Difficult terrain while they last; a creature starting its turn in them rolls the DC ${dc} Reflex save on this card, Prone on a failure.`,
            `The first creature to fall Prone in them sets them off: ${formula} fire damage, DC ${dc} basic Reflex, to each creature in them, and they're gone (end the zone).`
        ]
    });
    return {
        ...(base ?? {}),
        automation: { level: "guided" },
        trigger: { event: "use" },
        builtin: "zone",
        actions: null,
        targeting: { target: null, range: `${feet} feet`, area: zone.area },
        zone,
        item: { ...(info ?? plan?.item ?? {}) },
        partial: true
    };
}
