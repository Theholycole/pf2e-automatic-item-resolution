// Triggers, numbers from another roll, rerolls, use limits and results for some creatures only, in the adventure books' items (2026-10-27,
// docs/needs.md "Triggers", "Rerolls and fortune", "From events", "By kind"): an activation or a consumable read sentence by sentence, every
// sentence of its effect one of the reading's own — none dropped —, into what its card plays.
// - Results for some creatures only (plan.ifTarget, src/live/if-target.js): Smogger's thick smog, "creatures that must breathe and aren't holding
//   their breath take a -2 circumstance penalty to this save", and their Sickened 2 on a failure (ifTarget breathes: a creature that needs air
//   and has no Effect of holding its breath); Horn of the Sun Aurochs' "Creatures that are specifically vulnerable to sunlight are also
//   Frightened 1 if they fail this save" (ifTarget sunlight: an ability of theirs named for sunlight, or a vampire's vulnerabilities) — and the
//   horn's counteract against darkness and sleep, the counteract card beside its save card (plan.item.counteract, its rank half the horn's level).
// - Rerolls: Beckoning Cat Amulet's "any allies within 10 feet who also just failed or critically failed a Reflex saving throw from the same
//   source … can also reroll their saving throw and use the better result" (reroll.who "allies": each ally the presser targets, its latest
//   failed Reflex save — scripts/rerolls.js); Silvanshee Collar's reroll of the failed check, its result its user's pick (the higher of
//   the two, its user's sensible pick); Pyrefeather Token's "you reduce the triggering recovery check's DC by 1" (reroll.raise.dc, the reroll
//   card beside its item card's temporary Hit Points — scripts/live.js). Pure.

import { sentencesOf } from "./lasting.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const NEXT_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const TARGET_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const condition = (slug, value) => ({ kind: "condition", slug, value: Number(value), duration: null });

// The card's parts: a row of its own (note Effects, conditions) for its user, or — targets — for the creatures its presser targets (the item
// card's recipient "targets"); its lines.
const ownRow = ({ noteEffects = [], effects = [], notes = [], target = null, targets = false }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(targets ? { item: { recipient: "targets" } } : {})
});
// (A way of the ways card: its own plan, as the activation's.)
const wayPlan = ({ item: own, ...card }, { base, info }) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(own ?? {}) } });
// (A reroll card's plan, src/compiler/rerolls.js's shape.)
const rerollCard = (reroll, target = "self") => ({ builtin: "reroll", targeting: { target, range: reroll.within ? `${reroll.within} feet` : null, area: null }, reroll });
// (Its rows without the whole text's reminder, the rest now read.)
const withoutReminder = (outcomes) => Object.fromEntries(Object.entries(outcomes ?? {}).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((note) => !note.reminder) } : row]));
// (A save plan's rows as its reading expects them: each degree's condition slugs.)
const slugs = (row) => (row?.effects ?? []).filter((effect) => effect?.kind === "condition").map((effect) => effect.slug);

// Each reading: the source name it's for (an activation's "Item: Activation"; a pattern for an item's grades), whether it goes over a plan read
// before (over: the plan's test), a pattern for each of its effect's sentences — every sentence must be one, in order — and the card they make
// (from its matches, the plan read before, and { html, base, info, item, frequency }).
const READINGS = [
    // --- Results for some creatures only.
    {
        // (Every creature in the smog saves, its wearer too; those that need air and aren't holding their breath −2 and Sickened 2 on a failure.)
        name: "Smogger",
        over: (plan) => plan?.resolution?.kind === "save" && plan.resolution.check?.statistic === "fortitude",
        sentences: [
            /^The smog created by the smogger thickens into a toxic element that burns the eyes, blisters flesh, and causes fits of coughing\.$/,
            /^All creatures in the smog cloud, including you, must attempt a @Check\[fortitude\|dc:\d+\] save\s*[-–—]\s*creatures that must breathe and aren't holding their breath take an? [-–−](\d+) (circumstance|status) penalty to this save\.$/,
            /^Critical Success The creature is unaffected\.$/,
            /^Success The creature is sickened (\d+)\.$/,
            /^Failure The creature is sickened (\d+) \(or increases their sickened condition value to (\d+) if it isn't holding its breath\)\.$/,
            /^The creature also takes \d+d\d+ poison damage\.$/,
            /^Critical Failure As failure, but the creature takes \d+d\d+ poison damage\.$/
        ],
        card: ([, save, , , failed], plan) => {
            const rows = plan.resolution.outcomes ?? {};
            if (!["failure", "criticalFailure"].every((degree) => slugs(rows[degree]).includes("sickened"))) return null;
            const worse = Number(failed[2]);
            return {
                keep: true,
                partial: undefined,
                automation: { ...(plan.automation ?? {}), level: "automatic" },
                targeting: { target: null, range: null, area: { type: "emanation", value: 10 } },
                ifTarget: [
                    { breathes: true, bonus: { value: -Number(save[1]), type: save[2].toLowerCase() } },
                    { breathes: true, degree: "failure", effects: [condition("sickened", worse)] },
                    { breathes: true, degree: "criticalFailure", effects: [condition("sickened", worse)] }
                ],
                notes: [
                    "At every creature in the smog — 10 feet around its wearer, 5 in a strong wind —, its wearer too.",
                    `A creature holding its breath (the free action at its turn's start in the smog) has an Effect saying so — the environment module's Remaining Air, or one named for holding its breath: no −${save[1]} for it, and Sickened ${failed[1]} on a failure, as for one that needn't breathe.`
                ]
            };
        }
    },
    {
        // (Its enemies in the emanation save; those vulnerable to sunlight Frightened too; darkness and sleep there counteracted beside it.)
        name: "Horn of the Sun Aurochs",
        over: (plan) => plan?.resolution?.kind === "save" && plan.resolution.check?.basic === true,
        sentences: [
            /^The horn is clearly audible for hundreds of feet, but within a (\d+)-foot emanation, the sound causes agony in those who wish harm upon the user; the horn also sheds bright light in that area and dim light to the next (\d+) feet\.$/,
            /^Enemies of the user in this area take \d+d\d+ \w+ damage and \d+d\d+ \w+ damage \(@Check\[fortitude\|dc:\d+\|basic\] save\)\.$/,
            /^Creatures that are specifically vulnerable to sunlight are also Frightened (\d+) if they fail this save or Frightened (\d+) on a critical failure\.$/,
            /^This activation also attempts to counteract any darkness or sleep effects in the area \(\+(\d+) counteract check\)\.$/
        ],
        card: ([area, , sunlight, counteract], plan) => {
            const level = Number(plan.item?.level) || 1;
            const rank = Math.max(1, Math.ceil(level / 2));
            return {
                keep: true,
                partial: undefined,
                automation: { ...(plan.automation ?? {}), level: "automatic" },
                targeting: { target: null, range: null, area: { type: "emanation", value: Number(area[1]) } },
                ifTarget: [
                    { sunlight: true, degree: "failure", effects: [condition("frightened", sunlight[1])] },
                    { sunlight: true, degree: "criticalFailure", effects: [condition("frightened", sunlight[2])] }
                ],
                notes: [`Target its user's enemies within ${area[1]} feet.`, `As it sounds, the horn sheds bright light in that emanation and dim light ${area[2]} feet past it.`],
                item: { ...plan.item, counteract: { modifier: Number(counteract[1]), rank, conditions: [], traits: [], afflictions: [], free: { name: `each darkness or sleep effect in the ${area[1]}-foot emanation` }, pick: "one", notes: [`One roll against each of them; its counteract rank ${rank}, half the horn's level.`] } }
            };
        }
    },
    // --- Rerolls.
    {
        // (The allies within 10 feet who failed the same Reflex save: each ally targeted, its latest failed Reflex save rerolled, the better kept.)
        name: "Beckoning Cat Amulet",
        sentences: [
            /^Usage affixed to armor Activat(?:e|ion)\b.*?\bTrigger You use a feat or ability to reroll a failed or critically failed Reflex saving throw \(such as [^)]+\)\.$/,
            /^This clay figurine resembles a white cat with a paw outstretched\.$/,
            /^When it's activated, any allies within (\d+) feet who also just failed or critically failed a Reflex saving throw from the same source \(such as a fireball spell\) can also reroll their saving throw and use the better result\.$/
        ],
        // (Its line the reroll card's own, reroll.after: that card shows no plan notes.)
        card: ([, , allies]) => rerollCard({ what: "save", statistic: "reflex", keep: "higher", who: "allies", within: Number(allies[1]), failed: true, after: `Only allies whose failed Reflex save was against the same effect as its user's: target them.` }, `allies within ${allies[1]} feet`)
    },
    {
        // (A failed Lie or Make an Impression rerolled, its user's pick of the two: the higher.)
        name: "Silvanshee Collar: Awww!",
        sentences: [/^Your pet does something distracting or adorable at the precise moment you failed, allowing you to reroll the failed check and to use the result\s+of your choice as the actual result\.$/],
        card: () => rerollCard({ what: "check", statistic: ["deception", "diplomacy"], keep: "higher", who: "self" })
    },
    {
        // (A recovery check's DC 1 lower, its degree again — the reroll card beside the item card's 5 temporary Hit Points.)
        name: "Pyrefeather Token",
        over: (plan) => (plan?.resolution?.outcomes?.success?.effects ?? []).some((effect) => effect?.kind === "temp-hp"),
        sentences: [
            /^Trigger You succeed at, fail, or critically fail a recovery check while Dying by \d+\.$/,
            /^This pyrefowl feather, accentuated with beadwork, stores a spark of the bird's self-healing power\.$/,
            /^When you Activate the token, you reduce the triggering recovery check's DC by (\d+), potentially improving your check's degree of success\.$/,
            /^You also gain \d+ temporary Hit Points that last for \d+ minutes?\.$/,
            /^You can Activate this talisman even while Unconscious\.$/
        ],
        card: ([, , lower], plan) => ({
            keep: true,
            partial: undefined,
            unread: undefined,
            automation: { ...(plan.automation ?? {}), level: "automatic" },
            resolution: { ...plan.resolution, outcomes: withoutReminder(plan.resolution.outcomes) },
            reroll: { what: "check", keep: "new", who: "self", recovery: true, raise: { dc: -Number(lower[1]) } },
            notes: ["Usable even while Unconscious: its reroll card changes the recovery check just rolled."]
        })
    }
];

const named = (reading, name) => (reading.name instanceof RegExp ? reading.name.test(String(name ?? "")) : reading.name === name);
// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasTriggerReading = (name) => READINGS.some((reading) => named(reading, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (null, note-only or the GM's no-effect — or the one a reading goes over) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (an activation's, or a consumable's basePlan and itemInfo); html: its text; item:
// the item. (A card with keep: true goes over the plan read before, its fields changed, undefined ones gone.)
export function withTriggerReading(plan, { name, words, html = "", base, info, frequency = null, item = null }) {
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, base, info, item, frequency }) : null;
        if (!card) continue;
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(own ?? {}) }
        };
    }
    return plan;
}
