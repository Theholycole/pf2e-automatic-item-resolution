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

// An area of stalagmites it raises for a while: Stoneraiser Javelin's "You hurl the stoneraiser javelin at an unoccupied space within 30
// feet. The javelin's power flows into the ground, which erupts in a 5-foot-radius burst of razor-sharp stalagmites. … the stalagmites'
// spaces are difficult terrain. A creature takes 4d4 piercing damage for every move action it takes that enters at least one of the
// affected spaces. … The stalagmites crumble to dust after 1 minute. Any creature in the area when the stalagmites appear is pushed to
// the nearest unoccupied space of its choice …. Pushed creatures must attempt a DC 28 Reflex saving throw or take 4d4 piercing damage"
// with its degree rows. The ability module's zone: a burst placed within that distance, difficult terrain, the damage on each move into
// it, the save for those there as it appears. The push, the cover and the stalagmites' own statistics are notes.
const RAISED = /\bYou hurl the (?:<em>)?[\w' -]+?(?:<\/em>)? at an unoccupied space within (\d+) feet\.(?:<\/p>\s*<p>|\s)+The [\w' -]+? power flows into the ground, which erupts in a (\d+)-foot-radius burst of razor-sharp (\w+)\./i;
const ENTERING = /\bA creature takes @Damage\[([^\]]*\])\] damage for every move action it takes that enters at least one of the affected spaces\./i;
const CRUMBLE = /\bThe \w+ crumble to dust after (\d+) (minutes?|rounds?)\./i;
const PUSHED = /\bPushed creatures must attempt a DC (\d+) (Fortitude|Reflex|Will) saving throw or take (@Damage\[[^\]]*\]\]) damage\./i;
export function raisedAreaPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const raised = RAISED.exec(text);
    const entering = ENTERING.exec(text);
    const crumble = CRUMBLE.exec(text);
    if (!raised || !entering || !crumble || !/\bspaces are difficult terrain\b/i.test(text)) return null;
    const pushed = PUSHED.exec(text);
    // (Those there as it appears: their save, its degree rows as the ability compiler reads them.)
    const rows = pushed ? text.slice(text.indexOf("</p>", pushed.index) + 4) : "";
    const save = pushed ? compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> The target takes ${pushed[3]} damage with a @Check[${pushed[2].toLowerCase()}|dc:${pushed[1]}] saving throw.</p>${rows}` }, actionType: { value: "free" }, actions: { value: null } } }, options) : null;
    const savePlan = save?.resolution?.kind === "save" ? { ...save, trigger: { event: "zone" }, targeting: { target: "each creature in the area as it appears", range: null, area: null } } : null;
    const plain = text.replace(/<[^>]+>/g, " ").replace(/@Damage\[(\d+d\d+)\[(\w+)\]\]/g, "$1 $2").replace(/\s+/g, " ");
    const notes = [
        ...(/\bhas cover from creatures on the opposite side\b/i.test(plain) ? [`The ${raised[3]} give cover to creatures on either side from those on the other.`] : []),
        ...(/\bis pushed to the nearest unoccupied space of its choice\b/i.test(plain) ? ["A creature in the area as it appears is pushed to the nearest unoccupied space of its choice (forced movement): move its token."] : []),
        ...[/\bEach 5-foot-by-5-foot section has [^.]+\./i, /\bIt's immune to [^.]+\./i, /\bA destroyed section [^.]+\./i].map((pattern) => pattern.exec(plain)?.[0]).filter(Boolean),
        "Its damage on entering is once for each move action that enters it."
    ];
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "burst", value: Number(raised[2]) },
            centre: "placed",
            range: Number(raised[1]),
            lasts: { mode: "fixed", value: Number(crumble[1]), unit: UNITS[crumble[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [{ movement: ["walk"], difficulty: 2 }],
            others: false,
            hazard: null,
            saves: savePlan ? [{ when: ["initial"], plan: savePlan }] : [],
            damage: [{ when: "enter", formulas: [entering[1]] }],
            effect: null,
            modifiers: [],
            notes
        }
    };
}
