// A square an item covers for a while, with a save for a creature moving into it: Spider Gun's Web Shot, "You fire a mass of webbing
// at a square within 30 feet. That square becomes covered in webbing for 1 minute. … The first time each turn a creature in the
// webbing begins to use a move action or enters the webbing during a move action, it must attempt an @Check[athletics|dc:20]
// {Athletics} check or @Check[reflex|dc:20]{Reflex} save against DC 20. … on a critical failure, it's Immobilized for 1 round or
// until it Escapes (DC 20) or destroys the webbing." The ability module's zone builtin: a square its user places within that
// distance, for its time, the Reflex save on entering (its critical failure Immobilized for 1 round, through the ability compiler's
// reading of that row). The Athletics check in its place, the difficult terrain of a failure, a creature already in it starting a
// move, and the webbing's own statistics are notes. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";

const COVERED = /\bYou fire a mass of (\w+) at a square within (\d+) feet\. That square becomes covered in \1 for (\d+) (minutes?|rounds?|hours?)\./i;
const SAVE = /\bThe first time each turn a creature in the (\w+) begins to use a move action or enters the \1 during a move action, it (?:must|has to) attempt an @Check\[athletics\|dc:(\d+)\](?:\{[^}]*\})? check or @Check\[reflex\|dc:\2\](?:\{[^}]*\})? save against DC \2\./i;
const CRITICAL = /\bon a critical failure, it's (@UUID\[[^\]]+\]\{Immobilized\}) for 1 round\b/i;
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds", hour: "hours", hours: "hours" };

// The activation's html, the plan's base, the item → { builtin: "zone", … } or null.
export function coveredSquarePlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const covered = COVERED.exec(text);
    const save = SAVE.exec(text);
    const critical = CRITICAL.exec(text);
    if (!covered || !save || !critical) return null;
    const [, stuff, range, time, unit] = covered;
    const dc = Number(save[2]);
    // (The save's own plan: the ability compiler's reading of it, on the creature that enters.)
    const saveHtml = `<p><strong>Effect</strong> The target must attempt a @Check[reflex|dc:${dc}] save.</p><p><strong>Critical Success</strong> The target is unaffected.</p><p><strong>Success</strong> The target is unaffected.</p><p><strong>Failure</strong> The target is unaffected.</p><p><strong>Critical Failure</strong> The target is ${critical[1]} for 1 round.</p>`;
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: saveHtml }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    if (read?.resolution?.kind !== "save" || !(read.resolution.outcomes?.criticalFailure?.effects ?? []).some((effect) => effect.slug === "immobilized")) return null;
    const plan = { ...read, trigger: { event: "zone" }, targeting: { target: `the creature that enters the ${stuff}`, range: null, area: null } };
    const escape = /\buntil it Escapes \((?:\[\[[^\]]*\]\]\{)?DC (\d+)\}?\)/i.exec(text)?.[1];
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: Number(range),
            lasts: { mode: "fixed", value: Number(time), unit: UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `The first time each turn: a creature that enters the ${stuff}, or starts a move action in it (that one by hand), attempts the save.`,
                `It can attempt an Athletics check against DC ${dc} instead of the Reflex save.`,
                `On a success, it moves normally and clears the ${stuff} from the squares it enters this turn; on a failure, the ${stuff} is difficult terrain for it this turn.`,
                ...(escape ? [`Immobilized until it Escapes (DC ${escape}) or destroys the ${stuff}, at most 1 round.`] : []),
                ...(/\bA square has AC (\d+)/i.test(text) ? [`A square of ${stuff}: AC ${/\bA square has AC (\d+)/i.exec(text)[1]}, it fails its saves, and it's cleared by ${/\bcleared by ([^.]+)\./i.exec(text.replace(/<[^>]+>/g, "").replace(/@Damage\[(\d+)\[(\w+)\]\]/g, "$1 $2"))?.[1] ?? "damage"}.`] : [])
            ]
        }
    };
}
