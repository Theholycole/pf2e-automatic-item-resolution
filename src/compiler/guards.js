// Last checks on a plan before it's played (the user's rule: never apply a rule wrongly; a note says it instead). Pure.

import { durationIn, selectorsOf } from "./rows.js";
//
// A valued condition read with no value — Gearbinder Oil's "increases its slowed condition", Mamlambo Scale's "As failure,
// but …" whose failure value didn't carry over — isn't applied: a note on the creature for that degree says it, and the
// GM sets the value. (Stunned for a time, "Stunned for 1 round", has no value by right.)

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"]);

const unvalued = (effect) => effect?.kind === "condition" && VALUED.has(effect.slug) && !Number.isFinite(effect.value) && !(effect.slug === "stunned" && effect.duration) && effect.recipient !== "self";

function guardOutcomes(resolution) {
    if (!resolution?.outcomes) return null;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter(unvalued);
        if (!bad.length) {
            outcomes[degree] = row;
            continue;
        }
        changed = true;
        outcomes[degree] = {
            ...row,
            effects: row.effects.filter((effect) => !bad.includes(effect)),
            noteEffects: [...(row.noteEffects ?? []), ...bad.map((effect) => ({ label: effect.slug, text: `${effect.slug.charAt(0).toUpperCase()}${effect.slug.slice(1)}: the item doesn't say how much; the GM sets it.`, duration: effect.duration ?? null }))]
        };
    }
    return changed ? { ...resolution, outcomes } : null;
}

// The plan with its unvalued conditions as notes (its own rows, and the saves it carries: a bomb's, a Strike's), marked
// partial; the same plan when there are none.
export function guardValues(plan) {
    if (!plan || plan.builtin) return plan;
    const own = guardOutcomes(plan.resolution);
    const itemSave = plan.item?.save?.plan ? guardOutcomes(plan.item.save.plan.resolution) : null;
    const strikeSave = plan.strike?.save ? guardOutcomes(plan.strike.save.resolution) : null;
    if (!own && !itemSave && !strikeSave) return plan;
    return {
        ...plan,
        ...(own ? { resolution: own } : {}),
        ...(itemSave ? { item: { ...plan.item, save: { ...plan.item.save, plan: { ...plan.item.save.plan, resolution: itemSave } } } } : {}),
        ...(strikeSave ? { strike: { ...plan.strike, save: { ...plan.strike.save, resolution: strikeSave } } } : {}),
        partial: true
    };
}

// A text whose target takes something outright and whose save is for others (the target takes damage and a condition, its
// allies nearby take damage with a basic save — Shei Long's Blade): one save plan can't hold both, so a save plan read
// from it isn't played (the ability module leaves it to the item side, 2026-10-15).
const TARGET_THEN_OTHERS = /\b(?:Your|The) target takes\b[^.]*\.\s*(?:All|Each|Any)\b[^.]*\b(?:allies|other creatures|creatures)\b[^.]*\b(?:save|saving throw)\b/i;
export function guardText(plan, text) {
    if (plan?.resolution?.kind === "save" && plan.resolution.check?.roll === "save" && TARGET_THEN_OTHERS.test(String(text ?? ""))) return null;
    return asRowPenalty(failsAlso(failureThenAlso(itsNextTurn(lineDamage(nextActionOnly(criticalTime(conditionFloors(sentenceTimes(asRowCopies(conditionalOnly(delayedConditions(whoTargeted(manualPenalties(untilRemoved(droppedRows(asFailureBut(lastingConditions(saveExtras(alreadyGated(equalTempHP(traitGated(plan, text), text), text), text), text), text), text), text), text), text), text), text), text), text), text), text), text)), text), text), text));
}

// A row "As success, but the penalty is -20 feet" — Hobbling Snare's critical failure — which the ability compiler leaves by hand: the earlier
// row's Speed penalties at that value, the line gone.
const AS_ROW_PENALTY = /^\{target\} \([^)]*\): As (success|failure), but the penalty is [-–−](\d+) feet\.(?: Effect: [^(]*?)?(?: \((?:success|failure): [^)]*\))?$/i;
function asRowPenalty(plan) {
    if (plan?.resolution?.kind !== "save" || !plan.resolution.outcomes) return plan;
    const outcomes = plan.resolution.outcomes;
    return eachRow(plan, (row) => {
        const index = (row?.manualInstructions ?? []).findIndex((line) => AS_ROW_PENALTY.test(String(line)));
        if (index < 0) return row;
        const match = AS_ROW_PENALTY.exec(String(row.manualInstructions[index]));
        const speeds = (outcomes[match[1].toLowerCase()]?.modifiers ?? []).filter((modifier) => /speed/.test(String(modifier.selector)) && Number(modifier.value) < 0);
        if (!speeds.length) return row;
        const lines = row.manualInstructions.filter((_, other) => other !== index);
        const { manualInstructions, ...rest } = row;
        return { ...rest, ...(lines.length ? { manualInstructions: lines } : {}), modifiers: [...(row.modifiers ?? []).filter((modifier) => !/speed/.test(String(modifier.selector))), ...speeds.map((modifier) => ({ ...modifier, value: -Number(match[2]) }))] };
    });
}

// A Speed penalty for whoever fails its save, said apart from its rows — Crackling Bubble Gum's pop, "A creature that fails its save is also
// bound with sticky gum, taking a -10-foot item penalty to its Speed for 1 minute. The creature can remove the gum with a total of 3 Interact
// actions" — the failing rows' penalty, its early end on the Effect for the GM (the ability's modifier.until).
const FAILS_ALSO = /\bA creature that fails its save is also [^,.]*, taking an? [-–−](\d+)-foot (item|status|circumstance) penalty to its Speed for (\d+|one|an?) (rounds?|minutes?)\.(?:\s+The creature can remove the [\w ]+? with a total of (\d+) Interact actions\b)?/i;
function failsAlso(plan, text) {
    const match = FAILS_ALSO.exec(String(text ?? ""));
    if (!match || plan?.resolution?.kind !== "save" || !plan.resolution.outcomes) return plan;
    const duration = { mode: "fixed", value: /^\d+$/.test(match[3]) ? Number(match[3]) : 1, unit: /^round/i.test(match[4]) ? "rounds" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const penalty = { selector: "all-speeds", value: -Number(match[1]), type: match[2].toLowerCase(), duration, ...(match[5] ? { until: `it, or other creatures helping, spends a total of ${match[5]} Interact actions removing it` } : {}) };
    return eachRow(plan, (row, degree) => (["failure", "criticalFailure"].includes(degree) && row && !(row.modifiers ?? []).some((modifier) => modifier.selector === "all-speeds") ? { ...row, modifiers: [...(row.modifiers ?? []), { ...penalty }] } : row));
}

// A failure's Speed penalty with a critical failure's condition beside it — Slumber Arrow's "On a failure, it takes a -5-foot status penalty
// to its Speeds for 1 round, and is also Slowed 1 for 1 round on a critical failure" — which the ability compiler reads as Slowed on both:
// the failure's penalty, the critical failure's penalty and condition.
const FAILURE_THEN_ALSO = /\bOn a failure, it takes an? [-–−](\d+)-foot (status|circumstance) penalty to its Speeds for (\d+|one|an?) (rounds?|minutes?), and is also (\w+)(?: (\d))? for (\d+|one|an?) (rounds?|minutes?) on a critical failure\./i;
function failureThenAlso(plan, text) {
    const match = FAILURE_THEN_ALSO.exec(String(text ?? ""));
    if (!match || plan?.resolution?.kind !== "save" || !plan.resolution.outcomes?.failure || !plan.resolution.outcomes?.criticalFailure) return plan;
    const time = (count, unit) => ({ mode: "fixed", value: /^\d+$/.test(count) ? Number(count) : 1, unit: /^round/i.test(unit) ? "rounds" : "minutes", expiry: "turn-start", anchor: "effect-start" });
    const penalty = { selector: "all-speeds", value: -Number(match[1]), type: match[2].toLowerCase(), duration: time(match[3], match[4]) };
    const condition = { kind: "condition", slug: match[5].toLowerCase(), value: match[6] ? Number(match[6]) : null, duration: time(match[7], match[8]) };
    const { failure, criticalFailure } = plan.resolution.outcomes;
    const strip = (row) => (row.effects ?? []).filter((effect) => !(effect?.kind === "condition" && effect.slug === condition.slug));
    return { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, failure: { ...failure, effects: strip(failure), modifiers: [...(failure.modifiers ?? []), penalty] }, criticalFailure: { ...criticalFailure, effects: [...strip(criticalFailure), condition], modifiers: [...(criticalFailure.modifiers ?? []), { ...penalty }] } } } };
}

// "Until the end of its next turn" in an item's row is the creature's own turn — Thunder Snare's "The target is deafened until the end of its
// next turn" — where the ability compiler, reading as for a monster ("its" the monster), counts it on its user's turns: the creature's.
const ITS_TURN = /\b(?:is|are|becomes?) [^.]*?\buntil the (end|start) of its next turn\b/i;
function itsNextTurn(plan, text) {
    if (plan?.resolution?.kind !== "save" || !plan.resolution.outcomes) return plan;
    const words = degreeWords(text);
    // (A row "As success, …" says it in the words of the row it copies: Thunder Snare's failure.)
    const own = (degree) => String(words[degree] ?? "");
    const wordsOf = (degree) => (ITS_TURN.test(own(degree)) ? own(degree) : own(DEGREE_KEYS[/^As (success|failure)\b/i.exec(own(degree))?.[1]?.replace(/^\w/, (letter) => letter.toUpperCase())] ?? ""));
    return eachRow(plan, (row, degree) => {
        const said = ITS_TURN.exec(wordsOf(degree));
        if (!said || /\byour next turn\b/i.test(said[0])) return row;
        const expiry = said[1].toLowerCase() === "end" ? "turn-end" : "turn-start";
        const own = (effect) => effect?.kind === "condition" && effect.duration?.anchor === "source-turn" && effect.duration.expiry === expiry && Number(effect.duration.value) === 1 && new RegExp(String.raw`\b${effect.slug}\b`, "i").test(said[0]);
        if (!(row?.effects ?? []).some(own)) return row;
        return { ...row, effects: row.effects.map((effect) => (own(effect) ? { ...effect, duration: { ...effect.duration, anchor: "target-turn" } } : effect)) };
    });
}

// Damage a row's GM line says in plain words — Fang Snare's "Failure The target takes 1 piercing damage and 2d8 poison damage", Thunder
// Snare's "As success, and the target also takes 1 sonic damage" — which the ability compiler leaves by hand: that row's damage (the earlier
// row's effects too), the line gone.
const AMOUNT = String.raw`(\d+(?:d\d+)?)( persistent)? ([a-z]+) damage`;
const ONLY_DAMAGE = new RegExp(String.raw`^\{target\} \([^)]*\): The (?:target|creature) takes ${AMOUNT}((?:,? and ${AMOUNT.replace(/\((?!\?)/g, "(?:")})*)\.$`);
const AS_ROW_AND = new RegExp(String.raw`^\{target\} \([^)]*\): As (success|failure), and the (?:target|creature) also takes ${AMOUNT}\.(?: Craft Requirements [^(]*?)?(?: \((?:success|failure): [^)]*\))?$`);
const formulaOf = (amount, persistent, type) => ({ formula: `${amount}[${persistent ? "persistent," : ""}${type.toLowerCase()}]` });
function lineDamage(plan) {
    if (plan?.resolution?.kind !== "save" || !plan.resolution.outcomes) return plan;
    const outcomes = plan.resolution.outcomes;
    return eachRow(plan, (row) => {
        if (!row?.manualInstructions?.length || (row.damage?.mode && row.damage.mode !== "none")) return row;
        for (const [index, line] of row.manualInstructions.entries()) {
            const only = ONLY_DAMAGE.exec(line);
            const also = only ? null : AS_ROW_AND.exec(line);
            if (!only && !also) continue;
            const formulas = only
                ? [formulaOf(only[1], only[2], only[3]), ...[...String(only[4] ?? "").matchAll(new RegExp(AMOUNT, "g"))].map((match) => formulaOf(match[1], match[2], match[3]))]
                : [formulaOf(also[2], also[3], also[4])];
            const earlier = also ? outcomes[also[1] === "success" ? "success" : "failure"] : null;
            const lines = row.manualInstructions.filter((_, other) => other !== index);
            const { manualInstructions, ...rest } = row;
            // (The earlier row's effects it doesn't have already: another guard may have copied them, src/compiler/guards.js asRowCopies.)
            const copied = (earlier?.effects ?? []).filter((effect) => !(row.effects ?? []).some((own) => own.kind === effect.kind && own.slug === effect.slug)).map((effect) => ({ ...effect }));
            return { ...rest, ...(lines.length ? { manualInstructions: lines } : {}), ...(copied.length ? { effects: [...(row.effects ?? []), ...copied] } : {}), damage: { mode: "formulas", formulas, rollScope: "outcome" } };
        }
        return row;
    });
}

// A condition for its next action only — Tusk and Fang Chain's "Success The creature is Confused on its next action." — which the
// ability compiler reads as that condition with no end: PF2e can't count one action, so a note Effect until the end of its next turn says it.
const NEXT_ACTION = /\b(Critical Success|Success|Failure|Critical Failure) The (?:creature|target) is (\w+) on its next action\./;
// (Its critical failure's "doesn't receive a flat check to end its confusion if it takes damage": a note Effect for that confusion's time.)
const NO_FLAT_CHECK = /\b(Critical Failure|Failure) [^.]*\bconfused\b[^.]*\band the creature doesn't receive a flat check to end its confusion if it takes damage\./i;
function nextActionOnly(given, text) {
    let plan = given;
    const flat = plan?.resolution?.kind === "save" ? NO_FLAT_CHECK.exec(String(text ?? "")) : null;
    if (flat) plan = eachRow(plan, (row, key) => {
        const confused = key === DEGREE_KEYS[flat[1].replace(/\b\w/g, (letter) => letter.toUpperCase())] ? (row?.effects ?? []).find((effect) => effect?.kind === "condition" && effect.slug === "confused") : null;
        return confused && !(row.noteEffects ?? []).some((note) => note.label === "No flat check") ? { ...row, noteEffects: [...(row.noteEffects ?? []), { label: "No flat check", text: "No flat check to end this confusion when it takes damage.", duration: confused.duration ?? null }] } : row;
    });
    const match = NEXT_ACTION.exec(String(text ?? ""));
    if (!match || plan?.resolution?.kind !== "save") return plan;
    const degree = DEGREE_KEYS[match[1]];
    const slug = match[2].toLowerCase();
    const lasting = (effect) => effect?.kind === "condition" && effect.slug === slug && !effect.duration;
    return eachRow(plan, (row, key) => (key === degree && (row?.effects ?? []).some(lasting)
        ? { ...row, effects: row.effects.filter((effect) => !lasting(effect)), noteEffects: [...(row.noteEffects ?? []), { label: `${match[2]} on its next action`, text: `${match[2]} for its next action only.`, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } }] }
        : row));
}

// A critical failure's own time for its condition — Spirit-Sealing Fulu (Greater)'s "save or be Paralyzed for 1 round. On a critical
// failure, the undead is paralyzed for 4 rounds." — which the ability compiler leaves at the failure's time: that row's.
const TIMED_SLUGS = "blinded|clumsy|confused|dazzled|deafened|enfeebled|fascinated|fleeing|frightened|immobilized|off-guard|paralyzed|sickened|slowed|stunned|stupefied";
const CRITICAL_TIME = new RegExp(String.raw`\bOn a critical failure, (?:the|it|that) [\w' -]*?\b(?:is|becomes)(?: instead)? (${TIMED_SLUGS})(?: (\d))? for (\d+|one|an?) (round|minute|hour)s?\.`, "i");
function criticalTime(plan, text) {
    const match = CRITICAL_TIME.exec(String(text ?? ""));
    if (!match || plan?.resolution?.kind !== "save") return plan;
    const slug = match[1].toLowerCase();
    const value = /^\d+$/.test(match[3]) ? Number(match[3]) : 1;
    const unit = `${match[4].toLowerCase()}s`;
    const timed = (effect) => effect?.kind === "condition" && effect.slug === slug && (!match[2] || Number(effect.value) === Number(match[2])) && effect.duration?.mode === "fixed" && (Number(effect.duration.value) !== value || effect.duration.unit !== unit);
    return eachRow(plan, (row, degree) => (degree === "criticalFailure" && (row?.effects ?? []).some(timed) ? { ...row, effects: row.effects.map((effect) => (timed(effect) ? { ...effect, duration: { ...effect.duration, value, unit } } : effect)) } : row));
}

// A condition its creature can't lower below a value for a while — the core's conditionFloor, played by the ability module (its floor
// Effect): Timpani of Panic's "can't reduce its frightened value below 1 for 1 round" (and "As failure" rows), Terrifying
// Ammunition's "… until it spends an action, which has the concentrate trait, to calm itself down", Gleaming Cuirass's "for the
// duration of the penalty" (the row's "the penalty lasts for 1 minute"), Putrescent Glob's "its sickened value can't be reduced
// below 2 until the end of its next turn" (src/compiler/item-data.js's words), "while the persistent fire damage lasts". The row's
// "by hand" line for it goes.
const FLOOR_SLUGS = ["clumsy", "drained", "enfeebled", "frightened", "sickened", "stupefied"];
function floorIn(words) {
    const said = String(words ?? "");
    const match = /\bcan't reduce its (\w+) value below (\d+) (for (\d+|one|an?) (rounds?|minutes?|hours?)|while the persistent (\w+) damage lasts|until it spends an action, which has the concentrate trait|for the duration of the penalty)/i.exec(said)
        ?? /\bits (\w+) value can't be reduced below (\d+) (until the end of its next turn)/i.exec(said);
    if (!match || !FLOOR_SLUGS.includes(match[1].toLowerCase())) return null;
    const floor = { slug: match[1].toLowerCase(), value: Number(match[2]) };
    const how = match[3].toLowerCase();
    if (match[4]) return { ...floor, lifetime: "fixed", duration: { value: /^\d+$/.test(match[4]) ? Number(match[4]) : 1, unit: { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" }[match[5].toLowerCase()] } };
    if (match[6]) return { ...floor, lifetime: "while-persistent", persistentDamage: match[6].toLowerCase() };
    if (/concentrate/.test(how)) return { ...floor, lifetime: "until-lifted", liftedBy: "it spends a concentrate action" };
    if (/until the end of its next turn/.test(how)) return { ...floor, lifetime: "fixed", duration: { value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } };
    const penalty = /\bthe penalty lasts for (\d+|one|an?) (rounds?|minutes?)\b/i.exec(said);
    return penalty ? { ...floor, lifetime: "fixed", duration: { value: /^\d+$/.test(penalty[1]) ? Number(penalty[1]) : 1, unit: /^round/i.test(penalty[2]) ? "rounds" : "minutes" } } : null;
}
function floorRows(plan, words, saveOr) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !plan.resolution.outcomes) return plan;
    const floors = {};
    for (const degree of ["success", "failure", "criticalFailure"]) {
        const own = words[degree] ?? "";
        const as = /^As (success|failure), (?:but|and|except)\b/i.exec(own);
        floors[degree] = floorIn(own) ?? (as ? floors[as[1].toLowerCase()] ?? null : null);
    }
    // (No rows: a "save or" sentence, the failure's and the critical failure's.)
    if (!Object.values(words).length && saveOr) floors.failure = floors.criticalFailure = saveOr;
    let changed = false;
    const outcomes = { ...plan.resolution.outcomes };
    for (const [degree, floor] of Object.entries(floors)) {
        const row = outcomes[degree];
        if (!floor || !row || row.conditionFloor) continue;
        // (Only a line that's the floor alone: one that says more — Gleaming Cuirass's penalty — stays.)
        const manual = (row.manualInstructions ?? []).filter((line) => !/^\{target\} \([^)]*\): The (?:target|creature) can't reduce its \w+ value below \d+[^.]*\.$/i.test(String(typeof line === "string" ? line : line?.text)));
        outcomes[degree] = { ...row, conditionFloor: floor, ...(row.manualInstructions ? { manualInstructions: manual } : {}) };
        changed = true;
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes } } : plan;
}
function conditionFloors(plan, text) {
    if (!plan || plan.builtin) return plan;
    const words = degreeWords(text);
    const saveOr = Object.keys(words).length ? null : floorIn(text);
    let next = floorRows(plan, words, saveOr);
    if (next?.strike?.save) {
        const save = floorRows(next.strike.save, words, saveOr);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save } };
    }
    if (next?.item?.save?.plan) {
        const save = floorRows(next.item.save.plan, words, saveOr);
        if (save !== next.item.save.plan) next = { ...next, item: { ...next.item, save: { ...next.item.save, plan: save } } };
    }
    return next;
}

// A row's condition with its time in its own sentence that the ability compiler left without one — Liar's Bangle's failure, "For the
// next minute, it is Stupefied 1 and …", Oneiric Crystals' "Stupefied 4 for 1 day" — that time, not forever.
const SENTENCE_TIME = /\b(?:for|For the next) (\d+ |one |an? )?(rounds?|minutes?|hours?|days?|weeks?)\b/;
const TIME_UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days", week: "weeks", weeks: "weeks" };
function sentenceTimes(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !plan.resolution.outcomes) return plan;
    const words = degreeWords(text);
    return eachRow(plan, (row, degree) => {
        const sentences = String(words[degree] ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/);
        let changed = false;
        const effects = (row?.effects ?? []).map((effect) => {
            // (Stunned with a value is spent by actions, never timed: Stunning Snare's "Off-Guard for 1 round and Stunned 1".)
            if (effect?.kind !== "condition" || effect.duration || ["drained", "doomed", "wounded", "prone", "dying", "unconscious"].includes(effect.slug) || (effect.slug === "stunned" && Number.isFinite(Number(effect.value)) && effect.value !== null)) return effect;
            const named = new RegExp(String.raw`\b${effect.slug}\b`, "i");
            const sentence = sentences.find((other) => named.test(other) && !/\buntil\b/i.test(other));
            const time = sentence ? SENTENCE_TIME.exec(sentence) : null;
            // (The time is for the conditions named before it: "Off-Guard for 1 round and Stunned 1" times only the off-guard; one that opens
            // its sentence is for all of it, Liar's Bangle's "For the next minute, it is Stupefied 1".)
            if (!time || (time.index > 0 && sentence.search(named) > time.index)) return effect;
            changed = true;
            const count = /^\d+/.test(time[1] ?? "") ? Number.parseInt(time[1], 10) : 1;
            return { ...effect, duration: { mode: "fixed", value: count, unit: TIME_UNITS[time[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } };
        });
        return changed ? { ...row, effects } : row;
    });
}

// A row "As success, but …" keeps the success row's conditions — The Waxworks' failure, "As success, but 4d6 persistent fire plus
// 4d6 persistent mental damage", is Confused as its success is — which the ability compiler sometimes leaves off: each one the
// row doesn't name again (a value or time of its own) or take away ("no longer", "instead of", "isn't").
// (Or "As failure, and …", Jawbreaker Shield's critical failure: the failure's damage too, when the row names none of its own.)
// (Its first sentence or after one of its own: Jawbreaker Shield's "You break the target's jaw. As failure, and …".)
const AS_ROW = /(?:^|[.!?]\s+)As (success|failure), (?:but|except|and)\b/i;
// (The row's own time for all of it — Wintershot's "As success, but …, and the light affects the creature for 1 minute" — in a
// sentence that names no condition; one that does, "the creature is slowed 1 for 1 minute", is that condition's.)
const ROW_TIME = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?)\b/i;
// (Exported alone for a bomb's or a Strike's save, src/compiler/bombs.js bombSave: the other guards are its plan's own.)
export function asRowCopies(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !plan.resolution.outcomes) return plan;
    const words = degreeWords(text);
    const outcomes = { ...plan.resolution.outcomes };
    let changed = false;
    // (In order, so a critical failure "As failure" gets what the failure got.)
    for (const degree of ["success", "failure", "criticalFailure"]) {
        let row = outcomes[degree];
        const own = words[degree] ?? "";
        // (Its own time for one condition: Lamentation of the Faithless' "As failure, but the duration of the blinded condition is 1
        // minute" — the ability compiler's blinded otherwise has none.)
        const lasts = /\bthe duration of the (\w+) condition is (\d+|one|an?) (rounds?|minutes?|hours?)\b/i.exec(own);
        if (row && lasts && (row.effects ?? []).some((effect) => effect?.slug === lasts[1].toLowerCase())) {
            const duration = durationIn(`for ${lasts[2]} ${lasts[3]}`, null);
            row = { ...row, effects: row.effects.map((effect) => (effect?.slug === lasts[1].toLowerCase() ? { ...effect, duration } : effect)) };
            outcomes[degree] = row;
            changed = true;
        }
        const as = AS_ROW.exec(own);
        const base = as ? outcomes[as[1].toLowerCase()] : null;
        if (!row || !base) continue;
        if ((!row.damage || row.damage.mode === "none") && base.damage?.mode === "formulas" && (base.damage.formulas ?? []).length && !/\d+d\d+|\bdamage\b/i.test(own.replace(AS_ROW, " "))) {
            row = { ...row, damage: structuredClone(base.damage) };
            outcomes[degree] = row;
            changed = true;
        }
        // (A condition it names again with a new value and no time of its own keeps the base row's time: Floppy Rag Doll's "As failure,
        // but Clumsy 2", its failure's clumsy until your next turn.)
        if (!ROW_TIME.test(own) && !/\buntil\b/i.test(own) && (row.effects ?? []).some((effect) => effect?.kind === "condition" && !effect.duration && (base.effects ?? []).some((other) => other?.slug === effect.slug && other.duration))) {
            row = { ...row, effects: row.effects.map((effect) => (effect?.kind === "condition" && !effect.duration ? { ...effect, duration: (base.effects ?? []).find((other) => other?.slug === effect.slug && other.duration)?.duration ?? null } : effect)) };
            outcomes[degree] = row;
            changed = true;
        }
        const missing = (base.effects ?? []).filter((effect) => effect?.kind === "condition"
            && !(row.effects ?? []).some((other) => other?.slug === effect.slug)
            && !new RegExp(String.raw`\b${effect.slug}\b`, "i").test(own)
            && !/\b(?:no longer|instead of being|isn't|is not)\b/i.test(own));
        if (!missing.length) continue;
        const timed = own.split(/(?<=[.!?])\s+|,\s*and\s+/).find((part) => ROW_TIME.test(part) && !NAMED.some((slug) => new RegExp(String.raw`\b${slug}\b`, "i").test(part)));
        const time = timed ? durationIn(timed, null) : null;
        outcomes[degree] = { ...row, effects: [...(row.effects ?? []), ...missing.map((effect) => (time && effect.duration ? { ...effect, duration: time } : effect))] };
        changed = true;
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes } } : plan;
}

// A condition a row names only under "if", "when" or "after" — Heart of Sarnax's critical failure, "… is Stunned 3. When it recovers
// from being stunned, it is Slowed 2 for 1 minute"; Hex Blaster's "If the target falls Unconscious from damage dealt by this Strike
// …, it remains unconscious for 1 day" — which the ability compiler applies with the rest: off the row, those sentences a note.
const CONDITIONAL = /^(?:If|When|Whenever|After|Once|At the (?:end|start|beginning)|The next time|Each time)\b/;
const NAMED = ["blinded", "clumsy", "confused", "controlled", "dazzled", "deafened", "doomed", "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened", "grabbed", "immobilized", "off-guard", "paralyzed", "petrified", "prone", "quickened", "restrained", "sickened", "slowed", "stunned", "stupefied", "unconscious", "wounded"];
function conditionalOnly(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin) return plan;
    const words = degreeWords(text);
    const found = {};
    for (const [degree, own] of Object.entries(words)) {
        const as = /^As (failure|success|critical failure), (?:but|except|and)\b/i.exec(own);
        const all = `${own} ${as ? words[as[1].toLowerCase().replace(/ (\w)/, (whole, letter) => letter.toUpperCase())] ?? "" : ""}`;
        const sentences = all.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
        const only = NAMED.filter((slug) => {
            const naming = sentences.filter((sentence) => new RegExp(String.raw`\b${slug}\b`, "i").test(sentence));
            return naming.length && naming.every((sentence) => CONDITIONAL.test(sentence));
        });
        if (only.length) found[degree] = { only, sentences: sentences.filter((sentence) => CONDITIONAL.test(sentence) && only.some((slug) => new RegExp(String.raw`\b${slug}\b`, "i").test(sentence))) };
    }
    if (!Object.keys(found).length) return plan;
    const next = eachRow(plan, (row, degree) => {
        const later = found[degree];
        const gone = (row?.effects ?? []).filter((effect) => effect?.kind === "condition" && later?.only.includes(effect.slug));
        if (!gone.length) return row;
        const said = (row.noteEffects ?? []).map((note) => note.text).join(" ");
        const notes = later.sentences.filter((sentence) => !said.includes(sentence)).map((sentence) => ({ label: gone.map((effect) => effect.slug).join(", "), text: `${sentence} (by hand)`, duration: null }));
        return { ...row, effects: row.effects.filter((effect) => !gone.includes(effect)), noteEffects: [...(row.noteEffects ?? []), ...notes] };
    });
    return next === plan ? plan : { ...next, partial: true };
}

// Conditions a row gives later, not now — Nap Gas Dispenser's failure, "At the end of their next turn, they fall Prone and fall
// Unconscious for 1 minute", which the ability compiler applies at once (and copies to "As failure, but …"): off those rows, and a
// note on the creature for when they come.
const LATER_CONDITIONS = /\bAt the end of (?:their|its|the creature's|the target's) next turn, (?:they|it|the creature|the target) (?:falls?|becomes?|is|are) ([^.]+)\./;
const DELAYABLE = ["prone", "unconscious", "asleep", "paralyzed", "stunned", "slowed", "petrified", "blinded", "deafened", "confused", "fascinated", "frightened", "sickened"];
function delayedConditions(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin) return plan;
    const words = degreeWords(text);
    const changed = {};
    for (const [degree, row] of Object.entries(words)) {
        const own = LATER_CONDITIONS.exec(row);
        const as = /^As (failure|success), but\b/i.exec(row);
        const base = own ? null : as ? LATER_CONDITIONS.exec(words[as[1].toLowerCase()] ?? "") : null;
        const later = own ?? base;
        if (!later) continue;
        const slugs = DELAYABLE.filter((slug) => new RegExp(String.raw`\b${slug}\b`, "i").test(later[1]));
        if (slugs.length) changed[degree] = { slugs, words: later[0] };
    }
    if (!Object.keys(changed).length) return plan;
    const next = eachRow(plan, (row, degree) => {
        const later = changed[degree];
        if (!later || !(row?.effects ?? []).some((effect) => later.slugs.includes(effect.slug))) return row;
        return { ...row, effects: row.effects.filter((effect) => !later.slugs.includes(effect.slug)), noteEffects: [...(row.noteEffects ?? []), { label: later.slugs.join(", "), text: `${later.words} Apply that then.`, duration: null }] };
    });
    return next === plan ? plan : { ...next, partial: true };
}

// Which creatures to target, in src/compiler/item-data.js's words for an aura's damage (Banner of Piercing Shards' "Target each
// enemy within the banner's aura that has been dealt damage since the end of your last turn"): the card's hint and a note.
const WHO_TARGETED = /\bTarget each (enem(?:y|ies)|creature|foe) within the banner's aura that ([^.]+)\./;
function whoTargeted(plan, text) {
    const match = WHO_TARGETED.exec(String(text ?? ""));
    if (!match || !plan || plan.builtin) return plan;
    const note = `${match[0].replace(/^Target each/, "Only each")}`;
    return { ...plan, targeting: { target: `each ${match[1]} in the aura that ${match[2]}`, range: "30 feet", area: null }, notes: [...(plan.notes ?? []).filter((other) => other !== note), note], partial: true };
}


// A save's row the ability compiler left to the GM that is one penalty its reader doesn't know the checks of — Stage Fright
// Missive's "The target takes a –1 status penalty to Deception, Diplomacy, Intimidation, and Performance checks for 1 hour",
// Captivating Rosebud's "-1 status penalty to Perception checks for 10 minutes" and "As success, but a –2 penalty" — that
// penalty as the row's modifiers (PF2e's selectors, src/compiler/rows.js), its "by hand" line gone.
const PENALTY_ROW = /^\{target\} \([^)]*\): The (?:target|creature) takes an? [-–−](\d+) (status|circumstance|item) penalty to ([\w ,]+?) for (\d+|one|an?) (rounds?|minutes?|hours?)\.$/i;
// (With a condition the row already holds: Nap Gas Dispenser's "takes a –2 status penalty to Perception checks and is Slowed 1 for 1
// round" — the penalty for that time.)
const PENALTY_AND = /^\{target\} \([^)]*\): The (?:target|creature) takes an? [-–−](\d+) (status|circumstance|item) penalty to ([\w ,]+?) and is (\w+)(?: \d+)? for (\d+|one|an?) (rounds?|minutes?|hours?)\.$/i;
const AS_BUT_PENALTY = /^\{target\} \([^)]*\): As (success|failure), but an? [-–−](\d+) penalty\.(?: \([^)]*\))?$/i;
const ROW_KEYS = { success: "success", failure: "failure" };
function manualPenalties(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !plan.resolution.outcomes) return plan;
    const words = degreeWords(text);
    const read = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const lines = row?.manualInstructions ?? [];
        if (lines.length !== 1 || (row.modifiers ?? []).length) continue;
        const line = String(typeof lines[0] === "string" ? lines[0] : lines[0]?.text ?? "");
        const both = PENALTY_AND.exec(line);
        const held = both && (row.effects ?? []).some((effect) => effect.slug === both[4].toLowerCase());
        const match = (held ? [both[0], both[1], both[2], both[3], both[5], both[6]] : null) ?? PENALTY_ROW.exec(line);
        if (!match) continue;
        const selectors = selectorsOf(match[3]);
        if (!selectors) continue;
        const duration = durationIn(`for ${match[4]} ${match[5]}`, null);
        read[degree] = selectors.map((selector) => ({ selector, value: -Number(match[1]), type: match[2].toLowerCase(), duration }));
    }
    // ("As success, but a –2 penalty", by hand; or with more the reader took, "… and the creature is Fascinated": its own words.)
    const also = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const lines = row?.manualInstructions ?? [];
        if (read[degree] || (row?.modifiers ?? []).length) continue;
        const manual = lines.length === 1 ? AS_BUT_PENALTY.exec(String(typeof lines[0] === "string" ? lines[0] : lines[0]?.text ?? "")) : null;
        const own = manual ? null : /^As (success|failure), but an? [-–−](\d+) penalty and\b/i.exec(words[degree] ?? "");
        const match = manual ?? own;
        const base = match ? read[ROW_KEYS[match[1].toLowerCase()]] : null;
        if (!base) continue;
        read[degree] = base.map((modifier) => ({ ...modifier, value: -Number(match[2]) }));
        if (own) also[degree] = true;
    }
    // (A critical failure with no row of its own is the failure's, as the reader takes one.)
    const critical = plan.resolution.outcomes.criticalFailure;
    // (Or the failure's penalties the ability compiler read itself, as it does since ability c03cc7a.)
    const failed = read.failure ?? (plan.resolution.outcomes.failure?.modifiers?.length ? plan.resolution.outcomes.failure.modifiers : null);
    if (failed && !read.criticalFailure && words.criticalFailure === undefined && critical && !(critical.effects ?? []).length && !(critical.manualInstructions ?? []).length && !(critical.modifiers ?? []).length && (critical.damage?.mode ?? "none") === "none") read.criticalFailure = failed;
    if (!Object.keys(read).length) return plan;
    return eachRow(plan, (row, degree) => (read[degree] ? { ...row, modifiers: read[degree], ...(also[degree] ? {} : { manualInstructions: [] }) } : row));
}

// A condition that lasts as long as another — Blindpepper Bomb's critical failure, "dazzled until it removes the sickened condition"
// — which the ability compiler leaves out: that condition on the row with no time of its own (it's the GM's to end with the other),
// and a note saying when it ends.
const UNTIL_REMOVES = /\bOn a (critical failure|failure)\b[^.]*\.\s*It's (blinded|dazzled|deafened|fatigued|off-guard) until it removes the (\w+) condition\b/i;
function untilRemoved(plan, text) {
    const match = UNTIL_REMOVES.exec(String(text ?? ""));
    if (!match || plan?.builtin || plan?.resolution?.kind !== "save") return plan;
    const degree = match[1].toLowerCase() === "failure" ? "failure" : "criticalFailure";
    const slug = match[2].toLowerCase();
    const changed = eachRow(plan, (row, at) => {
        if (at !== degree || (row?.effects ?? []).some((effect) => effect?.slug === slug) || !(row?.effects ?? []).some((effect) => effect?.slug === match[3].toLowerCase())) return row;
        return { ...row, effects: [...row.effects, { kind: "condition", slug, value: null, duration: null }], noteEffects: [...(row.noteEffects ?? []), { label: slug, text: `${match[2].charAt(0).toUpperCase()}${match[2].slice(1).toLowerCase()} until it's no longer ${match[3]}: remove it then.`, duration: null }] };
    });
    return changed;
}

// A degree row the ability compiler read nothing of — Captivating Rosebud's "The creature takes a -1 status penalty to Perception
// checks for 10 minutes", Animal Pheromones' attitude, Implosion Dust's size — would play as nothing: its words a note on that
// degree instead, for the GM ("As success, but …" with that row's words first). Not a row that says nothing happens.
const DEGREE_KEYS = { "Critical Success": "criticalSuccess", Success: "success", Failure: "failure", "Critical Failure": "criticalFailure" };
const NOTHING = /\bunaffected\b|\b(?:takes?|deals?) no (?:additional )?damage\b|\bcan act normally\b|\bdoes(?: not|n't) affect\b|^No effect\b/i;
function degreeWords(text) {
    const rows = {};
    const pattern = /\b(Critical Success|Success|Failure|Critical Failure)\s+(?=[A-Z])(.*?)(?=\s*\b(?:Critical Success|Success|Failure|Critical Failure)\s+[A-Z]|\s*\b(?:Craft Requirements|Activate|Destruction|Hardness)\b|$)/g;
    for (const match of String(text ?? "").matchAll(pattern)) if (!rows[DEGREE_KEYS[match[1]]]) rows[DEGREE_KEYS[match[1]]] = match[2].trim();
    return rows;
}
// (A floor, ability c03cc7a's row.conditionFloor, and a native Effect are results too.)
const emptyRow = (row) => !(row?.effects ?? []).length && !(row?.noteEffects ?? []).length && !(row?.nativeEffects ?? []).length && !(row?.manualInstructions ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement && !row?.conditionFloor && (row?.damage?.mode ?? "none") === "none" && !row?.healing && !row?.reduce;
function droppedIn(plan, rows) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || plan.resolution.check?.against?.statistic === "ac") return plan;
    let partial = false;
    const next = eachRow(plan, (row, degree) => {
        const words = rows[degree];
        if (!words || NOTHING.test(words) || !emptyRow(row)) return row;
        const as = /^As (success|failure|critical failure), (?:but|except|and)\b/i.exec(words);
        const base = as ? rows[DEGREE_KEYS[as[1].replace(/\b\w/g, (letter) => letter.toUpperCase())]] : null;
        partial = true;
        return { ...row, noteEffects: [{ label: degree, text: `${base ? `${base} ${words}` : words} (by hand)`, duration: null }] };
    });
    return partial ? { ...next, partial: true } : plan;
}
function droppedRows(plan, text) {
    const rows = degreeWords(text);
    if (!Object.keys(rows).length || !plan) return plan;
    let next = droppedIn(plan, rows);
    if (next?.strike?.save) {
        const save = droppedIn(next.strike.save, rows);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save }, partial: true };
    }
    if (next?.item?.save?.plan) {
        const save = droppedIn(next.item.save.plan, rows);
        if (save !== next.item.save.plan) next = { ...next, item: { ...next.item, save: { ...next.item.save, plan: save } }, partial: true };
    }
    return next;
}

// Each degree row of the plan's own resolution, changed by fn(row, degree) → row.
function eachRow(plan, fn) {
    if (!plan?.resolution?.outcomes || plan.builtin) return plan;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        outcomes[degree] = fn(row, degree);
        if (outcomes[degree] !== row) changed = true;
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes } } : plan;
}

// Drained, doomed and wounded last until they're reduced, not for the time of the condition beside them — Maw of Hungry
// Shadows' "Blinded for 1 round and Drained 1", Gloaming Arc's "Enfeebled 2 for 1 minute and Drained 1", which the ability
// compiler gives the sentence's time: without it, unless its own words give it one ("Drained 1 for 1 minute").
const LASTING = ["drained", "doomed", "wounded"];
// (The plan's own rows and the saves it carries: a Strike's, an item's.)
function lastingConditions(plan, text) {
    const timed = new Set(LASTING.filter((slug) => new RegExp(String.raw`\b${slug}(?: \d+)? (?:for|until)\b`, "i").test(String(text ?? ""))));
    let next = lastingRows(plan, timed);
    if (next?.strike?.save) {
        const save = lastingRows(next.strike.save, timed);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save } };
    }
    if (next?.item?.save?.plan) {
        const save = lastingRows(next.item.save.plan, timed);
        if (save !== next.item.save.plan) next = { ...next, item: { ...next.item, save: { ...next.item.save, plan: save } } };
    }
    return next;
}
function lastingRows(plan, timed) {
    return eachRow(plan, (row) => {
        const effects = row?.effects ?? [];
        if (!effects.some((effect) => effect?.kind === "condition" && LASTING.includes(effect.slug) && !timed.has(effect.slug) && effect.duration && effect.duration.unit !== "days")) return row;
        return { ...row, effects: effects.map((effect) => (effect?.kind === "condition" && LASTING.includes(effect.slug) && !timed.has(effect.slug) && effect.duration && effect.duration.unit !== "days" ? { ...effect, duration: null } : effect)) };
    });
}

// A critical failure "As failure, but" something in words only — Maw of Hungry Shadows' "the shadows also pull the creature into
// the tome, teleporting it to the Netherworld" — which the ability compiler leaves out: a note on that row.
const RULED = /\d|\b(?:damage|blinded|clumsy|confused|dazzled|deafened|doomed|drained|enfeebled|fascinated|fatigued|fleeing|frightened|grabbed|immobilized|off-guard|paralyzed|petrified|prone|restrained|sickened|slowed|stunned|stupefied|unconscious|wounded|persistent|instead)\b/i;
function asFailureBut(plan, text) {
    const match = /\bCritical Failure As failure, but ([^.]+)\./.exec(String(text ?? ""));
    if (!match || RULED.test(match[1]) || plan?.resolution?.kind !== "save") return plan;
    const words = `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)}.`;
    const changed = eachRow(plan, (row, degree) => (degree === "criticalFailure" && ![...(row?.noteEffects ?? []).map((note) => note.text), ...(row?.manualInstructions ?? [])].some((said) => said?.includes(words) || said?.includes(match[1])) ? { ...row, noteEffects: [...(row?.noteEffects ?? []), { label: "critical failure", text: `${words} The GM handles it.`, duration: null }] } : row));
    return changed === plan ? plan : { ...changed, partial: true };
}

// What a save's activation does beside its save that no row holds — Golden Gloves' "Unholy creatures take a –2 item penalty to
// their roll", "The halo then … attempts to counteract any one affliction you are currently suffering of your choice with a
// counteract rank of 9 and a counteract modifier of +31" — which the ability compiler leaves out: notes for the GM.
const SAVE_EXTRAS = [
    /^[A-Z][\w-]* creatures take an? [-–−]\d+ (?:item|status|circumstance) penalty to their (?:roll|saves?|saving throws?)\.$/,
    /\battempts? to counteract\b[^.]*\byou(?:'re| are) (?:currently )?suffering\b[^.]*\.$/i,
    // (Stage Fright Missive's "During this time, if the creature attempts to speak or perform in front of an audience, they become
    // Sickened 1": only if it does.)
    /^During this time, if the (?:creature|target)\b[^.]*\b(?:become|becomes|is|are)\b[^.]*\.$/i,
    // (Another damage instead for some creatures, the GM's to pick: a third-party item's alternative for a kind of creature.)
    /\bcreature takes \d+d\d+ \w+ damage instead of \w+ damage\b[^.]*\.$/i,
    // (Lance of Sun's Radiance's dragon, src/compiler/item-data.js: "A dragon takes 6d12 spirit damage instead".)
    /^An? [\w-]+ takes \(?\d+d\d+\)? \w+ damage instead\.$/i
];
function saveExtras(plan, text) {
    if (!plan?.resolution?.outcomes || plan.builtin || plan.resolution.kind !== "save") return plan;
    const sentences = String(text ?? "").replace(/\[\[\/r [^\]]*\]\]\{([^}]*)\}/g, "$1").split(/(?<=[.!?])\s+(?=[A-Z])/);
    const noted = (sentence) => `${sentence.trim().replace(/\.$/, "")} (by hand).`;
    const found = sentences.filter((sentence) => SAVE_EXTRAS.some((pattern) => pattern.test(sentence.trim())) && !(plan.notes ?? []).includes(noted(sentence)));
    if (!found.length) return plan;
    return { ...plan, notes: [...(plan.notes ?? []), ...found.map(noted)], partial: true };
}

// A worse result only for a creature already in a condition — Stony Hag Eye's "on a critical failure, if the creature is
// already slowed, it's permanently petrified" (its degree row, src/compiler/item-data.js) — which the ability compiler leaves
// out: the core's escalate on that row's own condition (live play applies the worse one to a creature already in it), else a
// note on that degree for the GM.
const ALREADY = /\b(?:on a (critical failure|failure), if|(Critical Failure|Failure) The target is [^.]+\. If) the (?:creature|target) is already (\w+), it's ([^.;]+)/i;
function alreadyGated(plan, text) {
    const match = ALREADY.exec(String(text ?? ""));
    if (!match || plan?.builtin || plan?.resolution?.kind !== "save") return plan;
    const degree = (match[1] ?? match[2]).toLowerCase() === "failure" ? "failure" : "criticalFailure";
    const row = plan.resolution.outcomes?.[degree];
    if (!row) return plan;
    const already = match[3].toLowerCase();
    const worse = /^(?:permanently )?(blinded|confused|controlled|paralyzed|petrified|stunned|unconscious)(?: (\d+))?$/i.exec(match[4].trim());
    if (worse && (row.effects ?? []).some((effect) => effect?.kind === "condition" && effect.slug === already)) {
        const escalate = { if: already, slug: worse[1].toLowerCase(), value: worse[2] ? Number(worse[2]) : null, duration: null };
        const effects = row.effects.map((effect) => (effect?.kind === "condition" && effect.slug === already ? { ...effect, escalate } : effect));
        return { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, [degree]: { ...row, effects } } } };
    }
    const note = { label: already, text: `If it was already ${match[3]} before this save, it's ${match[4].trim()}: the GM applies that.`, duration: null };
    return { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, [degree]: { ...row, noteEffects: [...(row.noteEffects ?? []), note] } } }, partial: true };
}

// Temporary Hit Points equal to the damage it deals — Life's Last Breath's "or take 4d6 void damage; you gain an equal amount of
// temporary Hit Points that last 1 minute" — which the ability compiler leaves out: a note for its user.
const EQUAL_TEMP = /\byou gain (?:an equal amount of|a number of) temporary Hit Points\b[^.;]*/i;
function equalTempHP(plan, text) {
    const match = EQUAL_TEMP.exec(String(text ?? ""));
    if (!match || !plan?.resolution?.outcomes || plan.builtin) return plan;
    // (Read as the card's typed amount, src/compiler/rows.js levelTempOf: Vampiric Scythe's half the damage it dealt.)
    if ((plan.levelTemp ?? plan.item?.levelTemp ?? []).some((entry) => entry.from === "amount")) return plan;
    if (Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.kind === "tempHP" || effect?.kind === "temp-hp"))) return plan;
    // (Equal to a creature's level, Bloodthirsty's: the card's own, plan.item.levelTemp; "the damage dealt" only when it's that.)
    if (/\bequal to (?:(?:half|twice|double|three times|four times) )?the (?:[a-z]+ )?(?:creature|foe|enemy|target)'s level\b/i.test(match[0])) return plan;
    const dealt = /\ban equal amount of\b|\bequal to (?:half )?the damage\b/i.test(match[0]);
    const note = `${match[0].charAt(0).toUpperCase()}${match[0].slice(1)}${dealt ? " (the damage dealt)" : ""}: add them by hand.`;
    return { ...plan, notes: [...(plan.notes ?? []), note], partial: true };
}

// A condition only for a creature with a trait — Lacquered Waist Drum's "if the creature has the ghost trait, it becomes
// Stupefied 1 for 1 minute" — isn't the ability compiler's to give every creature the save is for: its rows lose it, and
// plan.ifTarget gives it to those creatures at those degrees (src/live/if-target.js: their save card has it, 2026-10-25). One the compiler
// left out ("the ghost becomes Sickened 1 if it fails the save") is theirs at the failures.
const TRAIT_GATED = /\bif the (?:creature|undead|target)(?: also)? has the ([\w-]+) trait, (?:it|the [\w-]+) becomes ([A-Z][a-z-]+)((?: \d+)?[^.;]*)/g;
function traitGated(plan, text) {
    const gated = [...String(text ?? "").matchAll(TRAIT_GATED)].map((match) => ({ trait: match[1].toLowerCase(), slug: match[2].toLowerCase(), words: `${match[2]}${match[3]}`.trim() }));
    if (!gated.length || !plan?.resolution?.outcomes) return plan;
    const ifTarget = [];
    const outcomes = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter((effect) => effect?.kind === "condition" && gated.some((entry) => entry.slug === effect.slug));
        outcomes[degree] = bad.length ? { ...row, effects: row.effects.filter((effect) => !bad.includes(effect)) } : row;
        for (const effect of bad) ifTarget.push({ traits: [gated.find((one) => one.slug === effect.slug).trait], degree, effects: [effect] });
    }
    // (Left out by the compiler: its words' condition at the rows they name.)
    for (const entry of gated.filter((one) => !Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.slug === one.slug)))) {
        const degrees = /\bif it (?:critically )?fails\b/i.test(entry.words) ? (/\bcritically fails\b/i.test(entry.words) ? ["criticalFailure"] : ["failure", "criticalFailure"]) : [];
        const value = Number(/^[A-Z][a-z-]+ (\d+)\b/.exec(entry.words)?.[1]);
        for (const degree of degrees.filter((one) => outcomes[one])) ifTarget.push({ traits: [entry.trait], degree, effects: [{ kind: "condition", slug: entry.slug, value: Number.isFinite(value) ? value : null, duration: null }] });
    }
    return ifTarget.length ? { ...plan, resolution: { ...plan.resolution, outcomes }, ifTarget: [...(plan.ifTarget ?? []), ...ifTarget] } : plan;
}

// A spell the text only names as an example ("cannot be affected by any effect that requires an intact body to function,
// such as the Talking Corpse spell" — Mantis Embrace; "saves against mental effects … such as the Nightmare spell" —
// Restful Sleep Fulu): the ability compiler's cast of it isn't one (2026-10-15). True when every sentence naming it does
// so after "such as" or "like".
export function castMentionOnly(plan, html) {
    if (plan?.builtin !== "cast-spell" || !plan.spell?.name) return false;
    const name = plan.spell.name;
    const sentences = String(html ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => sentence.includes(name));
    return sentences.length > 0 && sentences.every((sentence) => new RegExp(String.raw`\b(?:such as|like) (?:an? |the )?(?:[\w-]+ ){0,3}?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "i").test(sentence));
}

