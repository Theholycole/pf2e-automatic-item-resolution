// Unique items' and artifacts' activations read sentence by sentence (2026-10-27, the user: their every effect built): every sentence of the
// effect one of the reading's own, none dropped, into what its card plays — as src/compiler/lasting.js's readings (its withSentenceReadings).
// Passage Pane's lock onto a Boneyard location (its user's own Religion check, plan.ownSave: the save card on its user, a success a note
// Effect on them, "Locked on"), its rift (a note Effect for its 24 hours at most, onto that location or else a random point of the Dead Roads)
// and its closing (that Effect ended, item.endsOwn). Pure.

import { withSentenceReadings } from "./lasting.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const ownRow = ({ noteEffects = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (Its user's own check against a DC, as the save card rolls it on them — PF2e's statistic of that name, a skill's too.)
const ownCheck = ({ statistic, dc, rows, notes = [] }) => ({
    targeting: { target: "self", range: null, area: null },
    ownSave: true,
    resolution: { kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: Object.fromEntries(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => [degree, { ...none(), ...(rows[degree] ? { noteEffects: rows[degree] } : {}) }])) },
    ...(notes.length ? { notes } : {})
});

const PANE_NEEDS = "Only while the mirror's mounted firmly on a solid surface and its user is bonded with it.";
const RIFT = "Rift to the Boneyard";
const LOCKED = "Locked on";

const READINGS = [
    {
        // (Its user's Religion check: a success locks the mirror onto the place they focus on, only they seeing it — their note Effect until it
        // opens its rift there.)
        name: "Passage Pane",
        sentences: [
            /^You focus on a location in the Boneyard that you wish to travel to\.$/,
            /^You must have either seen or visited this location before or be able to describe the location in detail and its purpose or name, as appropriate\.$/,
            /^Attempt a @Check\[(\w+)\|dc:(\d+)\] check\.$/,
            /^On a success, the mirror locks onto your desired location, and you \(and only you\) see this location reflected in the mirror's pane\.$/
        ],
        card: ([, , check]) => {
            const lock = [{ label: LOCKED, text: "The mirror is locked onto the Boneyard location its user focused on; only they see it reflected in its pane. Its rift opens there.", duration: null }];
            return ownCheck({
                statistic: check[1].toLowerCase(),
                dc: check[2],
                rows: { criticalSuccess: lock, success: lock },
                notes: ["Its user focuses on a Boneyard location they've seen or visited, or can describe in detail (its purpose or name).", PANE_NEEDS]
            });
        }
    },
    {
        // (Its rift, open for 24 hours at most: onto the location it's locked on, else a random point of the Dead Roads.)
        name: "Passage Pane",
        sentences: [
            /^You urge the mirror to open a rift to the Boneyard\.$/,
            /^Creatures can travel through this rift in either direction\.$/,
            /^If you've successfully forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to the Boneyard that opens onto that location\.$/,
            /^If you haven't forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to a random location on the Dead Roads\.$/,
            /^This rift remains open until you close it, up to a maximum of (\d+) (hours?|minutes?)\.$/,
            /^As long as the rift is open, the mirror is immovable, no one can form a bond with the mirror, and no one but you can Activate the mirror\.$/
        ],
        card: ([, , , , open]) => ownRow({
            noteEffects: [{ label: RIFT, text: `The mirror's pane is a rift to the Boneyard, which creatures can travel through either way: onto the location it's locked on (its user's ${LOCKED} Effect), or else onto a random point on the Dead Roads. It's open until its user closes it, ${open[1]} ${open[2]} at most. While it's open the mirror is immovable, no one can bond with it, and no one but its user can Activate it.`, duration: timeOf(open[1], open[2]) }],
            notes: [`Locked on (its user's ${LOCKED} Effect): the rift opens onto that location; otherwise onto a random point on the Dead Roads, the GM's pick.`, PANE_NEEDS]
        })
    },
    {
        // (Its rift closed: the Effect its other activation gave ended.)
        name: "Passage Pane",
        over: true,
        sentences: [/^You close the rift\.$/],
        card: () => ownRow({ notes: ["Only while the mirror is an open rift and its user is bonded with it."], item: { endsOwn: { label: RIFT } } })
    }
];

// The plan and its activation's { name, words, base, info, frequency } → the reading's card, or the same plan.
export const withSpecialSentences = (plan, given) => withSentenceReadings(READINGS, plan, given);
