// Snares: set in a square, and the first creature to enter it attempts the snare's save (its damage and conditions),
// then the snare is gone. As the ability module's zone builtin, which places the square and acts on entering:
// { builtin: "zone", zone: { area: { type: "square", value: 5 }, centre: "placed", range: 5, saves: [{ when: ["enter"],
// plan }], once: true, … } } — its startZone plays it (asked of its session: once, and a used-up item). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { readEndEarly, readRowWays } from "./end-early.js";
import { plainText } from "./rows.js";

const ROW_KEYS = ["criticalSuccess", "success", "failure", "criticalFailure"];

// The size a creature must be to set it off (2026-10-27): Alarm Snare's "When a Small or larger creature enters the square", Hoof Stakes Snare's
// "triggers only when a Large or larger creature enters its square" → PF2e's size slug, for the ability module's zone entries' only.minSize
// (ability 411cb9f): a smaller creature does nothing there, and the snare stays set.
const SIZES = { small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
const SIZE_GATE = /\b(?:When an?|triggers only when an?) (Small|Medium|Large|Huge|Gargantuan) or larger creature enters (?:the|its) square\b/i;
export const sizeGate = (plain) => SIZES[SIZE_GATE.exec(String(plain ?? ""))?.[1]?.toLowerCase()] ?? null;
// (Or that size or smaller, Trip Snare's "A Medium or smaller creature that enters this snare's square": only.maxSize, ability 4461e8f.)
const SIZE_CAP = /\bAn? (Tiny|Small|Medium|Large|Huge) or smaller creature (?:that )?enters\b/i;
const SMALLER = { ...SIZES, tiny: "tiny" };
export const sizeCap = (plain) => SMALLER[SIZE_CAP.exec(String(plain ?? ""))?.[1]?.toLowerCase()] ?? null;
const SIZE_WORDS = { tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" };
const firstTo = (gate, cap = null) => (gate ? `The first ${SIZE_WORDS[gate]} or larger creature` : cap ? `The first ${SIZE_WORDS[cap]} or smaller creature` : "The first creature");

export const isSnare = (item) => item?.type === "consumable" && (item.system?.category === "snare" || (item.system?.traits?.value ?? []).includes("snare") || /\bsnare\b/i.test(item.name ?? ""));

// A snare's outright damage, no save: Boom Snare's "The target and all creatures in adjacent squares take @Damage[1d4[persistent,fire]]
// damage". The zone's damage on the creature that enters; the adjacent creatures' a note.
const OUTRIGHT = /\bThe target(?: and all creatures in adjacent squares)? takes? (@Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})?) damage\./i;
function damageSnare(item) {
    const text = String(item?.system?.description?.value ?? "");
    const outright = OUTRIGHT.exec(text);
    if (!outright || /@Check\[/.test(text)) return null;
    const adjacent = /\band all creatures in adjacent squares\b/i.test(outright[0]);
    return {
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null,
            saves: [],
            damage: [{ when: "enter", formulas: [outright[2]] }],
            effect: null,
            modifiers: [],
            notes: ["The first creature to enter the square sets it off; then it's spent.", ...(adjacent ? [`Each creature adjacent to that square takes the same damage (roll it for them by hand).`] : [])],
            once: true
        }
    };
}

// A snare that attacks: Flying Blade Wheel Snare's "When a creature enters the square, a … wheel of spinning blades launches at it,
// making a [[/r 1d20+35]]{Strike} with an attack modifier of +35 and dealing @Damage[8d8[slashing]] damage". The zone's attack on the
// creature that enters — the ability module's card, the snare's own +35 against its AC, the damage on a hit (doubled on a critical hit);
// its later Strikes and how long it spins notes.
const ATTACKS = /\bmaking an? (?:\[\[\/r 1d20\+\d+\]\](?:\{[^}]*\})?|Strike) with an attack modifier of \+(\d+) and dealing @Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})? damage\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
function attackSnare(item) {
    const text = String(item?.system?.description?.value ?? "");
    const attack = ATTACKS.exec(text);
    if (!attack) return null;
    const plain = text.replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1").replace(/@\w+\[(?:[^[\]]|\[[^\]]*\])*\](?:\{([^}]*)\})?/g, (all, label) => label ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const hit = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["0"] }, effects: [], modifiers: [] });
    const plan = {
        modelVersion: MODEL_VERSION,
        source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits: [...(item.system?.traits?.value ?? [])],
        activation: { time: null, traits: [] },
        automation: { level: "guided" },
        trigger: { event: "zone" },
        targeting: { target: "the creature that enters the snare's square", range: null, area: null },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: Number(attack[1]) }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: attack[2], type: null, category: null }] }, outcomes: { criticalSuccess: hit(2), success: hit(1), failure: none(), criticalFailure: none() } }
    };
    const after = plain.slice(plain.search(/\bdealing\b/i)).split(/(?<=[.!?])\s+(?=[A-Z])/).slice(1).map((sentence) => sentence.trim()).filter(Boolean);
    return {
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null,
            saves: [{ when: ["enter"], plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: ["The first creature to enter the square sets it off.", ...after],
            once: true
        }
    };
}

// (Barbs lodged in the creature's feet, Poison Barbs Snare's "On a failed save, several barbs lodge in the creature's feet. For 1 minute (or until
// a creature or an ally spends three Interact actions to remove the barbs), the barbs deal 1d4 poison damage to the creature each time it Strides
// more than half its Speed": a note Effect for that time on the failing rows, its PF2e RollOption "air-move-damage:<dice>:<type>:half" what
// scripts/move-damage.js rolls each time its creature moves farther than half its Speed; the three Interact actions, the end-early card's.
// 2026-10-27.)
const BARBS = /\bOn a failed save, [^.]*?\blodge in the creature's feet\. For (\d+) (minutes?|rounds?) \(or until a creature or an ally spends (one|two|three|\d) Interact actions to remove the (\w+)\), the \4 deal (\d+d\d+) (\w+) damage to the creature each time it Strides more than half its Speed\./i;
const WORD_COUNT = { one: 1, two: 2, three: 3 };
function barbedRows(read, text) {
    const barbs = BARBS.exec(text);
    const outcomes = read?.resolution?.outcomes;
    if (!barbs || !outcomes) return null;
    const [, value, unit, count, what, dice, type] = barbs;
    const actions = WORD_COUNT[count.toLowerCase()] ?? Number(count);
    const note = { label: `${what.charAt(0).toUpperCase()}${what.slice(1)} in its feet`, text: `Each time it Strides more than half its Speed, it takes ${dice} ${type.toLowerCase()} damage (rolled as it moves). ${actions} Interact actions, its own or an ally's, remove the ${what.toLowerCase()}.`, duration: { mode: "fixed", value: Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" }, rules: [{ key: "RollOption", domain: "all", option: `air-move-damage:${dice}:${type.toLowerCase()}:half` }] };
    const failing = ["failure", "criticalFailure"].filter((degree) => outcomes[degree]);
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, failing.includes(degree) ? { ...row, noteEffects: [...(row.noteEffects ?? []), note] } : row]));
    const said = barbs[0].replace(/^On a failed save, [^.]*?\. /i, "");
    return { read: { ...read, resolution: { ...read.resolution, outcomes: rows } }, endEarly: { how: { kind: "actions", count: actions, helped: true }, conditions: [], degrees: failing, said: [said] } };
}

// (A mark left on the creature, Marking Snare's "Either type of marking grants a +2 circumstance bonus to Track the creature for up to 24 hours or
// until the dye or scent is washed off …" and its rows' "The snare marks the creature": a note Effect for that time on each row that marks it —
// a bonus to others' Track checks against it, not PF2e's to play — and the row's line gone. 2026-10-27.)
const MARKING = /\bEither type of marking grants a \+(\d+) circumstance bonus to Track the creature for up to (\d+) hours or until ([^.(]+?)(?: \(([^)]*)\))?\./i;
const MARKS = /^(?:\{target\}(?: \([^)]*\))?:\s*)?The snare marks the creature\.$/i;
function markedRows(read, text) {
    const marking = MARKING.exec(text);
    const outcomes = read.resolution?.outcomes;
    if (!marking || !outcomes) return read;
    const [, bonus, hours, until, needs] = marking;
    const note = { label: "Marked", text: `Marked by the snare (a dye or a scent, as its maker chose): a +${bonus} circumstance bonus to Track this creature, until ${until}${needs ? ` (${needs})` : ""}.`, duration: { mode: "fixed", value: Number(hours), unit: "hours", expiry: "turn-start", anchor: "effect-start" } };
    const rows = [...String(text).matchAll(/\b(Critical Success|Critical Failure|Success|Failure) (.*?)(?= (?:Critical Success|Critical Failure|Success|Failure) |$)/g)];
    const LABELS = { criticalSuccess: "Critical Success", success: "Success", failure: "Failure", criticalFailure: "Critical Failure" };
    const marked = (degree) => rows.some(([, label, row]) => label === LABELS[degree] && /^The snare marks the creature\b/.test(row));
    const next = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (!row || !marked(degree)) return [degree, row];
        const kept = (row.manualInstructions ?? []).filter((line) => !MARKS.test(String(line?.text ?? line).trim()));
        const { manualInstructions, ...rest } = row;
        return [degree, { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), noteEffects: [...(row.noteEffects ?? []), note] }];
    }));
    return { ...read, resolution: { ...read.resolution, outcomes: next } };
}

// (Greased, Grease Snare's failure: "For 1 minute, the creature is clumsy 1 and must roll twice and use the worse result whenever attempting a
// Thievery check. If the target rolls a failure at a Thievery check, it gets a critical failure instead. This is a misfortune effect.", its
// critical failure "As failure, but the effects last for 1 hour instead of 1 minute, and removing the grease from the triggering creature
// requires a 1-minute activity instead of three Interact actions": a note Effect on those rows for the clumsy's time with PF2e's RollTwice
// (keep lower) and AdjustDegreeOfSuccess on Thievery; the critical failure's way to end it a 1-minute activity (endEarly.byDegree). And its
// squares, "The square with the snare, as well as three adjacent squares you determine when you set the snare, become difficult terrain when
// a creature triggers the snare": the area it leaves (zone.then), a 10-foot square of difficult terrain, until wiped. 2026-10-27.)
const GREASED = /\bFailure For (\d+) (minutes?|rounds?|hours?), the creature is clumsy 1 and must roll twice and use the worse result whenever attempting an? (\w+) check\. If the target rolls a failure at an? \3 check, it gets a critical failure instead\. This is a misfortune effect\./i;
const GREASED_LONGER = /\bCritical Failure As failure, but the effects last for (\d+) (minutes?|rounds?|hours?) instead of \d+ (?:minutes?|rounds?|hours?), and removing the grease from the triggering creature requires a (\d+)-minute activity instead of three Interact actions\./i;
const GREASED_SQUARES = /\bThe square with the snare, as well as three adjacent squares you determine when you set the snare, become difficult terrain when a creature triggers the snare\./i;
const unitOf = (unit) => (/^min/i.test(unit) ? "minutes" : /^hour/i.test(unit) ? "hours" : "rounds");
function greasedRows(read, text) {
    const greased = GREASED.exec(text);
    const outcomes = read?.resolution?.outcomes;
    if (!greased || !outcomes?.failure) return null;
    const longer = GREASED_LONGER.exec(text);
    const skill = greased[3].toLowerCase();
    const time = (value, unit) => ({ mode: "fixed", value: Number(value), unit: unitOf(unit), expiry: "turn-start", anchor: "effect-start" });
    const name = `${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;
    const note = (duration) => ({ label: "Greased", text: `It rolls twice and takes the worse result on ${name} checks, and a failure at one is a critical failure instead (misfortune).`, duration, rules: [{ key: "RollTwice", selector: skill, keep: "lower" }, { key: "AdjustDegreeOfSuccess", selector: skill, adjustment: { failure: "one-degree-worse" } }] });
    const rows = { ...outcomes, failure: { ...outcomes.failure, noteEffects: [...(outcomes.failure.noteEffects ?? []), note(time(greased[1], greased[2]))] } };
    if (longer && outcomes.criticalFailure) rows.criticalFailure = { ...outcomes.criticalFailure, noteEffects: [...(outcomes.criticalFailure.noteEffects ?? []), note(time(longer[1], longer[2]))] };
    const notes = (read.notes ?? []).filter((entry) => !/^(?:Critical )?Failure (?:For \d+|As failure, but the effects last)\b/i.test(String(entry).trim()));
    const squares = GREASED_SQUARES.test(text);
    return {
        // (Its sentences, said: what the zone's untraced check finds them in.)
        read: { ...read, resolution: { ...read.resolution, outcomes: rows }, notes: notes.length ? notes : undefined, greased: { said: [greased[0], ...(longer ? [longer[0]] : []), ...(squares ? [GREASED_SQUARES.exec(text)[0]] : [])] } },
        byDegree: longer ? { criticalFailure: { kind: "activity", minutes: Number(longer[3]) } } : null,
        then: squares ? { area: { type: "square", value: 10 }, lasts: null, concealed: false, terrain: [{ movement: ["walk"], difficulty: 2 }], notes: ["The snare's square and three squares beside it, as its setter chose them: move the area if they're others.", "Three Interact actions wipe the grease from one square."] } : null
    };
}

// The snare's save as the zone's: the ability compiler's plan, on the creature that enters. (Or its outright damage, or its attack.)
export function snareZone(item, read) {
    // (Not a square stepped into: Fire Box's "Anyone who opens the box triggers …" — its save card at those its cone reaches, src/compiler/opened.js.)
    if (OPENED.test(plainText(item?.system?.description?.value))) return null;
    if (isSnare(item) && read?.resolution?.kind !== "save") {
        const attack = attackSnare(item);
        if (attack) return { ...attack, source: read?.source ?? attack.zone.saves[0].plan.source };
        const damage = damageSnare(item);
        if (damage) return { ...damage, source: read?.source ?? { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type } };
    }
    if (!isSnare(item) || read?.resolution?.kind !== "save" || read.resolution.check?.against?.dc !== "fixed") return null;
    if (!ROW_KEYS.some((degree) => read.resolution.outcomes?.[degree])) return null;
    // (How a creature ends it early, Fire-Douse Snare's flat checks, Grease Snare's three Interact actions: plan.endEarly, the item module's
    // end-early card once the save card has applied — src/compiler/end-early.js.)
    // (Or a way for each row its modifiers say, Glittering Snare's Interact action or longer activities: endEarly.byDegree.)
    const endEarly = readEndEarly(plainText(item.system?.description?.value)) ?? readRowWays(read.resolution?.outcomes);
    // (A larger area, and only a creature of a trait, Spirit Trap's "You set this snare up in a 10-foot-by-10-foot area. The first creature with the
    // spirit trait that steps into the area must attempt …": the zone that size, its save only for that trait — the ability module's only.traits,
    // 2026-10-27.)
    const whole = plainText(item.system?.description?.value);
    const setArea = /\bYou set this snare up in an? (\d+)-foot-by-\1-foot area\./i.exec(whole);
    const traitGate = /\bThe first creature with the ([a-z]+) trait that steps into the area\b/i.exec(whole)?.[1]?.toLowerCase() ?? null;
    // (Barbs that hurt each long Stride, Poison Barbs Snare's: a note Effect on its failing rows, src/compiler/snares.js barbedRows.)
    const barbs = barbedRows(read, whole);
    const greased = barbs ? null : greasedRows(read, whole);
    const plan = { ...markedRows(barbs?.read ?? greased?.read ?? read, whole), trigger: { event: "zone" }, targeting: { target: "the creature that enters the snare's square", range: null, area: null }, ...(endEarly ?? barbs?.endEarly ? { endEarly: greased?.byDegree && endEarly ? { ...endEarly, byDegree: { ...(endEarly.byDegree ?? {}), ...greased.byDegree } } : endEarly ?? barbs.endEarly } : {}), ...(setArea ? { notes: (read.notes ?? []).filter((note) => !String(note).includes(setArea[0])) } : {}) };
    const gate = sizeGate(plainText(item.system?.description?.value));
    const cap = sizeCap(plainText(item.system?.description?.value));
    const only = gate || cap || traitGate ? { only: { ...(gate ? { minSize: gate } : {}), ...(cap ? { maxSize: cap } : {}), ...(traitGate ? { traits: [traitGate] } : {}) } } : {};
    // (A save for everyone around its square when it's set off, Shrapnel Snare's "Everyone in a 10-foot radius of the snare's square must
    // attempt …", Puff Dragon's gas "in a 10-foot emanation. Those within the emanation when the snare is activated must attempt …", Bomb Snare's
    // "The target and all creatures in adjacent squares must attempt …": the ability module's zone.burst (ability 5e46e0e) — one card of the
    // save for the creature that set it off and every other creature the area reaches, its damage rolled once; no save of its own.)
    const burst = burstOf(whole);
    // (The creature that set it off worse off than the others, Piercing Whistle Snare's "The triggering creature is deafened for 1 minute on a
    // failure, or 1 hour on a critical failure": its own save card with those times — zone.saves — and the burst for the others alone
    // (zone.burst.othersOnly, the ability module's), 2026-10-27.)
    const setter = burst ? setterPlan(plan, whole) : null;
    const shared = setter ? { ...plan, notes: setter.notes.length ? setter.notes : undefined, ...(plan.unread ? { unread: setter.unread.length ? setter.unread : undefined } : {}) } : plan;
    // (Again for a while after it's set off, Bleeding Spines Snare's "After the initial trigger, the spines retract and protrude again repeatedly
    // for 1 minute, forcing any creature that enters the space or ends its turn in the space to take damage from the spines (attempting the same
    // basic Reflex save)": the area it leaves — zone.then — with the same save for that time, 2026-10-27.)
    const again = /\bAfter the initial trigger, [^.]*?\brepeatedly for (\d+) (minutes?|rounds?), forcing any creature that enters the space or ends its turn in the space to take damage from the [\w ]+? \(attempting the same basic \w+ save\)\./i.exec(plainText(item.system?.description?.value));
    const then = again ? { area: { type: "square", value: 5 }, lasts: { mode: "fixed", value: Number(again[1]), unit: /^min/i.test(again[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" }, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [{ when: ["enter", "end"], plan: { ...plan, targeting: { target: "a creature that enters the space or ends its turn there", range: null, area: null } } }], damage: [], effect: null, modifiers: [], notes: ["The spines strike again at any creature that enters the space or ends its turn there."] } : null;
    // (Or hidden in a container, Glittering Snare's "The first creature to enter the square or open the container": its line says so — the
    // one who opens it put on the square.)
    const container = /\bThe first creature to enter the square or open the container\b/i.test(whole);
    return withContainerLine({
        builtin: "zone",
        source: read.source,
        actions: null,
        zone: {
            area: { type: "square", value: setArea ? Number(setArea[1]) : 5 },
            centre: "placed",
            range: 5,
            lasts: null,
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: burst ? (setter ? [{ when: ["enter"], plan: setter.plan, ...only }] : []) : [{ when: ["enter"], plan, ...only }],
            ...(burst ? { burst: { area: burst.area, ...(burst.from ? { from: burst.from } : {}), ...(setter ? { othersOnly: true } : {}), plan: { ...shared, targeting: { target: "every creature in the area", range: null, area: burst.area }, ...(burst.said ? { notes: (shared.notes ?? []).filter((note) => !String(note).includes(burst.said.replace(/^(?:in )?an? /i, "").slice(0, 30))) } : {}) }, ...only } } : {}),
            damage: [],
            effect: null,
            modifiers: [],
            // (Expulsion Snare's "moved into an adjacent square (chosen by you when you craft the snare)": that square its crafter's.)
            notes: [burst && ["cone", "line"].includes(burst.area.type) ? `${firstTo(gate, cap)} to enter the square sets it off: its ${burst.area.value}-foot ${burst.area.type} aims back the way that creature came, and everyone in it attempts the save; then it's spent.` : burst ? `${firstTo(gate, cap)} to enter the square sets it off: everyone within ${burst.area.value} feet of ${burst.from === "creature" ? "it" : "its square"} attempts the save${setter ? ` (that creature on a card of its own, ${setter.slug} for longer)` : ""}; then it's spent.` : then ? `${firstTo(gate, cap)} to enter the square sets it off; then the spines keep striking there.` : traitGate ? `The first creature with the ${traitGate} trait to enter its ${setArea ? `${setArea[1]}-foot square ` : ""}area sets it off; then it's spent.` : `${firstTo(gate, cap)} to enter the square sets it off; then it's spent.`, ...(/\bchosen by you when you craft the snare\b/i.test(String(item.system?.description?.value ?? "")) ? ["Its crafter chose the square it's pushed into: move its token there."] : []), ...(/\bYou determine the direction the rocket faces when crafting the snare\b/i.test(String(item.system?.description?.value ?? "")) ? ["Its crafter set the way the rocket faces: a push goes that way (move its token so)."] : []), ...leftOnTheGround(item)],
            once: true,
            ...(then ?? greased?.then ? { then: then ?? greased.then } : {})
        }
    }, container);
}

function withContainerLine(plan, container) {
    if (!container) return plan;
    const notes = (plan.zone.notes ?? []).map((note, at) => (at === 0 ? String(note).replace(/ to enter the square sets it off\b/, " to enter the square (or to open the container it's hidden in: put that creature on the square) sets it off") : note));
    return { ...plan, zone: { ...plan.zone, notes } };
}

// A square that only makes a noise when set off (2026-10-27): Alarm Snare's "When a Small or larger creature enters the square, the snare
// makes a noise loud enough that it can be heard by all creatures in the range you designated" (100 to 500 feet, chosen as it's made),
// Popdust's "sprinkle popdust in an empty square adjacent to you. The first creature that applies pressure to the popdust … causes it to
// emit a series of thunderous cracks". The zone, gone once set off, its set-off a note to the GM (the ability module's note save) — who
// hears it is the GM's to tell. Alarm Snare's size: a Tiny creature doesn't set it off (only.minSize, ability 411cb9f).
const ALARM = /\bWhen a Small or larger creature enters the square, the snare makes a noise loud enough that it can be heard by all creatures in the range you designated\./i;
// (And Flare Snare's "When a Small or larger creature enters the square, this flare shoots into the sky. To creatures with a clear view of the
// sky, this flare is visible from up to 2 miles away on a clear day or up to 5 miles away on a clear night": who sees it, the GM's.)
const FLARE = /\bWhen a Small or larger creature enters the square, this flare shoots into the sky\. To creatures with a clear view of the sky, this flare is visible from up to (\d+) miles away on a clear day or up to (\d+) miles away on a clear night\./i;
const POPDUST = /\bsprinkle \w+ in an empty square adjacent to you\. The first creature that applies pressure to the \w+, such as by moving into that square, causes it to emit a series of thunderous cracks\./i;
export function alarmZone(item, base) {
    const plain = plainText(item?.system?.description?.value);
    const flare = isSnare(item) ? FLARE.exec(plain) : null;
    const alarm = (isSnare(item) && ALARM.test(plain)) || !!flare;
    const gate = alarm ? sizeGate(plain) : null;
    if (!alarm && !(item?.type === "consumable" && POPDUST.test(plain))) return null;
    const range = alarm ? /\bdesignate a range between (\d+) (?:to|and) (\d+) feet\b/i.exec(plain) : null;
    const note = flare ? `Its flare shoots up into the sky, seen ${flare[1]} miles off by day or ${flare[2]} miles off on a clear night by those under an open sky.`
        : alarm ? `It makes a noise loud enough for every creature within the range its crafter chose${range ? ` (${range[1]} to ${range[2]} feet)` : ""} to hear it.` : "It gives off a string of loud, thunderous cracks for those around to hear.";
    return {
        ...base,
        builtin: "zone",
        actions: null,
        automation: { level: "automatic" },
        trigger: { event: "use" },
        zone: {
            area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null,
            saves: [{ when: ["enter"], note, ...(gate ? { only: { minSize: gate } } : {}) }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [alarm ? `${firstTo(gate)} to enter the square sets it off; then it's spent.` : "The first creature to step into the square sets it off; then it's spent."],
            once: true
        }
    };
}

// The area a snare's save reaches when it's set off: { area, from? } or null.
function burstOf(plain) {
    const radius = /\bEveryone in an? (\d+)-foot radius of the snare's square must attempt\b/i.exec(plain) ?? /\bThe snare deals [^.;]*? damage \([^)]*\) to creatures within (\d+) feet\b/i.exec(plain);
    if (radius) return { area: { type: "emanation", value: Number(radius[1]) } };
    const emanation = /\bin an? (\d+)-foot emanation\. Those within the emanation when the snare is activated must attempt\b/i.exec(plain);
    if (emanation) return { area: { type: "emanation", value: Number(emanation[1]) } };
    if (/\bThe target and all creatures in adjacent squares must attempt\b/i.test(plain)) return { area: { type: "emanation", value: 5 }, from: "creature" };
    // (Or aimed back the way the creature came, Flame Drake Snare's "a 15-foot cone in the direction from which the creature entered", Frost Worm
    // Snare's "a 30-foot line of frost in the direction from which the creature entered the square": a cone or line, the ability module's to aim
    // (ability baa2411). said: the sentence, no longer a note.)
    const aimed = /\b(?:in )?an? (\d+)-foot (cone|line)(?: of \w+)? in the direction from which the creature entered(?: the square)?\./i.exec(plain);
    if (aimed) return { area: { type: aimed[2].toLowerCase(), value: Number(aimed[1]) }, said: aimed[0] };
    return null;
}

export const OPENED = /\bAnyone who opens the (?:box|chest|lid) triggers\b/i;

// The save of the creature that set the snare off, its condition for longer than the others': "The triggering creature is deafened for 1 minute on
// a failure, or 1 hour on a critical failure." (a sentence of its text, or already a note) → { plan, notes, unread, slug } (its rows with those
// times, the plan's other notes) or null.
const SETTER = /^The triggering creature is (\w+) for (\d+) (round|minute|hour)s? on a failure, or (\d+) (round|minute|hour)s? on a critical failure\.$/i;
function setterPlan(plan, text) {
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const found = [...(plan.notes ?? []), ...(plan.unread ?? []), ...sentences].map((note) => [note, SETTER.exec(String(note).trim())]).find(([, match]) => match);
    const outcomes = plan.resolution?.outcomes;
    if (!found || !outcomes) return null;
    const [, slug, failValue, failUnit, critValue, critUnit] = found[1];
    const times = { failure: [failValue, failUnit], criticalFailure: [critValue, critUnit] };
    const condition = slug.toLowerCase();
    if (!["failure", "criticalFailure"].every((degree) => (outcomes[degree]?.effects ?? []).some((effect) => effect.kind === "condition" && effect.slug === condition))) return null;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        const time = times[degree];
        if (!time) return [degree, row];
        const effects = row.effects.map((effect) => (effect.kind === "condition" && effect.slug === condition ? { ...effect, duration: { ...effect.duration, mode: "fixed", value: Number(time[0]), unit: `${time[1].toLowerCase()}s` } } : effect));
        return [degree, { ...row, effects }];
    }));
    const notes = (plan.notes ?? []).filter((note) => note !== found[0]);
    const unread = (plan.unread ?? []).filter((note) => note !== found[0]);
    return { plan: { ...plan, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread: unread.length ? unread : undefined } : {}), resolution: { ...plan.resolution, outcomes: rows } }, notes, unread, slug: condition };
}

// What a snare leaves behind, Ice Slick Snare's "to create a slippery patch of ice on the ground": a note, the GM's.
function leftOnTheGround(item) {
    const left = /\bto create (an? [^.]*?) on the ground\b/i.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))?.[1];
    return left ? [`It leaves ${left} on the ground (the GM's).`] : [];
}

// A snare whose damage type its crafter chose, Striking Snare's "The creature must attempt a @Check[reflex|…|basic] saving throw.
// If you choose stones, the snare deals @Damage[9d8[bludgeoning]] damage; if you choose spikes, it deals @Damage[9d8[piercing]]
// damage": one text for each choice, its damage with that save, for the item card's ways (src/compiler/ways.js) — its user picks
// one before placing it. → [{ name, html }] or null.
const DAMAGE = String.raw`@Damage\[(?:[^\[\]]|\[[^\]]*\])*\]`;
const CHOSEN = new RegExp(String.raw`\bThe creature must attempt an? (@Check\[[^\]]*\]) saving throw\.\s*If you choose (\w+), the snare deals (${DAMAGE}) damage; if you choose (\w+), it deals (${DAMAGE}) damage\.`, "i");
export function snareChoices(html) {
    const text = String(html ?? "");
    const match = CHOSEN.exec(text);
    if (!match) return null;
    const [, check, first, firstDamage, second, secondDamage] = match;
    const typeOf = (damage) => /\[(\w+)\]\]$/.exec(damage)?.[1] ?? null;
    return [[first, firstDamage], [second, secondDamage]].map(([name, damage]) => ({
        name: `${name.charAt(0).toUpperCase()}${name.slice(1)}${typeOf(damage) ? `: ${typeOf(damage)}` : ""}`,
        html: `${text.slice(0, match.index)}The creature takes ${damage} damage with a ${check} saving throw.${text.slice(match.index + match[0].length)}`
    }));
}

// A snare that leaves an area where it was once set off, doing nothing to the creature itself: the ability module's zone.then (ability
// d6e48fb), the area made at the snare's square. Smoke Screen Snare's "releases a dense cloud of smoke when a creature enters the square
// … All creatures within that area are Concealed … The smoke lasts for 1 minute", its area "the snare's square and all adjacent squares"
// (Lesser) or "a 20-foot burst centered on the snare's square" (Greater); Hampering Snare's 10-foot square of difficult terrain "for 1d4
// rounds after the snare is triggered"; Shadow Cloak Snare's darkness in its square for 1 minute (its lighting a note). → the zone
// builtin, or null.
const minutesOr = (count, unit) => ({ mode: "fixed", value: Number(count), unit: /^round/i.test(unit) ? "rounds" : "minutes", expiry: "turn-start", anchor: "effect-start" });
const SMOKE = /\breleases a dense cloud of smoke when a creature enters the square\b[^.]*\.\s*All creatures within that area are (?:@UUID\[[^\]]*\]\{)?Concealed\}?, and all other creatures are concealed to them\.\s*The smoke lasts for (\d+) (minutes?|rounds?)( or until (?:dispersed|dissipated) by a strong wind)?\./i;
const HAMPERING = /\bThe square with this snare, as well as three adjacent squares \(to form a @Template\[square\|distance:(\d+)\](?:\{[^}]*\})?\), become difficult terrain when the first creature enters the snare's square\.[\s\S]*?\blasts for (?:\[\[\/\w+ (\d+d\d+) #rounds\]\]\{[^}]*\}|(\d+) rounds?) after the snare is triggered\./i;
const DARKNESS = /\bWhen a creature enters the snare's square, it is plunged into an unnatural darkness for (\d+) (minutes?|rounds?)\.\s*/i;
export function snareThen(item, base) {
    if (!isSnare(item)) return null;
    const html = String(item.system?.description?.value ?? "");
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    let then = null;
    const smoke = SMOKE.exec(html.replace(/<\/p>\s*<p>/g, " "));
    if (smoke) {
        const burst = /\bThe smoke fills a @Template\[burst\|distance:(\d+)\](?:\{[^}]*\})? centered on the snare's square\b/i.exec(html);
        const adjacent = /\bThe smoke fills the snare's square and all adjacent squares\b/i.test(html);
        if (!burst && !adjacent) return null;
        then = { area: burst ? { type: "burst", value: Number(burst[1]) } : { type: "square", value: 15 }, lasts: minutesOr(smoke[1], smoke[2]), concealed: true, terrain: [], notes: smoke[3] ? ["A strong wind disperses it."] : [] };
    }
    const hampering = !then ? HAMPERING.exec(html) : null;
    if (hampering) {
        const rolled = hampering[2];
        const lasts = rolled ? { ...minutesOr(Math.floor((Number(rolled.split("d")[0]) * (Number(rolled.split("d")[1]) + 1)) / 2), "rounds"), valueRoll: rolled } : minutesOr(hampering[3], "rounds");
        then = { area: { type: "square", value: Number(hampering[1]) }, lasts, concealed: false, terrain: [{ movement: ["walk"], difficulty: 2 }], notes: /\bInteract action to clear the difficult terrain\b/i.test(plain) ? ["An Interact action clears one square of it early."] : [] };
    }
    const darkness = !then ? DARKNESS.exec(plain) : null;
    if (darkness) {
        const rest = plain.slice(darkness.index + darkness[0].length).replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
        then = { area: { type: "square", value: 5 }, lasts: minutesOr(darkness[1], darkness[2]), concealed: false, terrain: [], notes: [`Darkness: ${rest}`.trim()] };
    }
    if (!then) return null;
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: { area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: ["The first creature to enter the square sets it off; then it's spent, and its area appears there."], once: true, then }
    };
}
