// A wonder weapon's d% table, row by row (2026-10-28, docs/needs.md): Pistol of Wonder's Wonder Shot, "Choose a creature within 60 feet and
// roll a percentile die on the table below to determine the pistol's effect" (src/compiler/random-table.js reads the table, each row its words
// compiled). What its rows' readers left over, built on what plays it now:
// - its casts at the creature chosen within 60 feet ("If the spell's range is less than 60 feet, increase the range to 60 feet": castRange,
//   src/compiler/cast-range.js), each cast's own words read (withCastNotes: Uncontrollable Dance's 3 rounds, castDuration), Cloak of Colors'
//   "with a duration of 1d10 rounds" a rolled castDuration (valueRoll, scripts/cast-duration.js), Mountain Resilience's "the target ignores
//   the resistance you gain from this spell" a note Effect on its user (userEffects);
// - its rows at the creature: a cosmetic metal sheen and voice for a month and the shadows that make everything concealed to it for an hour
//   (note Effects at it, plan.atTarget), its push 30 feet away (forcedMovement, the ability module's card), Quickened only to Step or Stride (a
//   note Effect beside the condition);
// - "the first time you Strike the target with the pistol before the end of your next turn, roll the attack roll twice and take the highest
//   result": the creature marked (plan.item.mark, PF2e's TokenMark) and a note Effect on its user with PF2e's RollTwice for that Strike;
// - "Reroll two results and apply both in the order rolled; further results of 100 on these rerolls have no effect": the row's again
//   { count, skip } (scripts/table.js rolls the table that many times more, a skipped row doing nothing);
// - the rest the card's lines: what's cosmetic (playing cards, bullet holes, ashen plants), the pistol itself (its flag, its vanishing, the
//   ammunition gone), a week without food, the user's own push away from the creature and the falling damage of a creature stopped by
//   something on the way (one-offs, src/compiler/one-offs.js).
// The table plan → its rows rebuilt, done once every row plays or is a line. Pure.

import { withCastNotes } from "./honest.js";

const SIXTY = 60;
const ITS_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const YOUR_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const timeOf = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const slugOf = (item) => String(item?.system?.slug || item?.name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const feetOf = (range) => (/^touch$/i.test(String(range ?? "")) ? 0 : Number(/^(\d+) feet$/i.exec(String(range ?? ""))?.[1]) || null);

// A row's card at the creature chosen: an automatic row, its success what happens to it.
const atCreature = (own, success, extra = {}) => ({
    ...own,
    automation: { level: "automatic" },
    targeting: { target: "1 creature", range: `${SIXTY} feet`, area: null },
    trigger: { event: "use" },
    resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: { ...none(), ...success }, failure: none(), criticalFailure: none() } },
    ...extra
});

// The rows with no card of their own, read: their words → { plan?, lines?, again? } (own: the row plans' shared parts; item: the weapon).
const ROWS = [
    // (Its sheen and tinny voice: a note Effect at the creature for its month.)
    [/^The target becomes a shiny metal color \(bronze, copper, or iron\) and any sound or speech becomes tinny and robotic in nature; this effect lasts (\d+) months?\.$/, (found, own) => ({ plan: atCreature(own, { noteEffects: [{ label: "Metallic sheen", text: "It's coloured like shiny bronze, copper or iron, and every sound or word it makes comes out tinny and robotic.", duration: timeOf(Number(found[1]) * 30, "days") }] }, { atTarget: true }) })],
    // (Its shadows: everything concealed to it out of bright light, for the hour.)
    [/^Shadows crowd around the target, making all creatures Concealed to the target while not in bright light; this effect lasts for (\d+) hours?\.$/, (found, own) => ({ plan: atCreature(own, { noteEffects: [{ label: "Crowding shadows", text: "While it isn't in bright light, every creature is concealed to it.", duration: timeOf(Number(found[1]), "hours") }] }, { atTarget: true }) })],
    // (Pushed away from the pistol's user: the ability module's push; a creature or object in the way the one-off's falling damage, a line.)
    [/^The target is pushed (\d+) feet directly away from you; if it hits an object or creature, it stops, but takes falling damage equal to the distance it moved \(if it hits another creature, the other creature takes the same amount of falling damage\)\.$/, (found, own) => ({ plan: atCreature(own, { forcedMovement: { kind: "push", distance: Number(found[1]) } }, { notes: [`Stopped early by an object or a creature, it takes falling damage for the distance it was pushed, and a creature it hit takes the same (by hand).`] }) })],
    // (Its Quickened only to move: a note Effect beside the condition, as long.)
    [/^The target is Quickened for (\d+) minutes?\. It can use the extra action only to Step or Stride\.$/, (found, own) => {
        const time = timeOf(Number(found[1]), "minutes");
        return { plan: atCreature(own, { effects: [{ kind: "condition", slug: "quickened", value: null, duration: time }], noteEffects: [{ label: "Quickened to move", text: "Its extra action from Quickened is only for Step or Stride.", duration: time }] }) };
    }],
    // (The bullet with its name: the creature marked, a fortune on its user's first Strike at it with the pistol.)
    [/^The target knows you have a bullet with its name on it; the first time you Strike the target with the pistol before the end of your next turn, roll the attack roll twice and take the highest result \(this is a fortune effect\)\.$/, (_found, own, item) => {
        const slug = `${slugOf(item)}-mark`;
        const roll = { key: "RollTwice", selector: "strike-attack-roll", keep: "higher", predicate: [`target:mark:${slug}`, `item:slug:${slugOf(item)}`], removeAfterRoll: true };
        return { plan: { ...atCreature(own, { noteEffects: [{ label: "A bullet with its name", text: "Your first Strike with the pistol at the marked creature before the end of your next turn rolls twice and takes the higher result (a fortune effect).", duration: YOUR_TURN_END, rules: [roll] }] }), targeting: { target: "self", range: null, area: null }, notes: ["The creature knows you have a bullet with its name on it."], item: { ...(own.item ?? {}), recipient: "user", mark: { slug, duration: YOUR_TURN_END } } } };
    }],
    // (Two more rolls, both applied; a 100 on them nothing.)
    [/^Reroll (two|three) results and apply both in the order rolled; further results of (\d+) on these rerolls have no effect\.$/, (found) => ({ again: { count: { two: 2, three: 3 }[found[1]], skip: Number(found[2]) }, lines: ["Rolled twice more: both results apply, in order; another 100 does nothing."] })],
    // (The rest: the card's lines.)
    [/^A short rod protrudes from the pistol and unfurls a small flag that reads "Bang!"\. The pistol can't be fired until the flag is removed, which requires a single Interact action\.$/, () => ({ lines: ["A flag reading \"Bang!\" pops out of the barrel: the pistol can't fire until you spend an Interact action to remove it."] })],
    [/^You are pushed (\d+) feet directly away from the target; if you hit an object or creature, you stop, but take falling damage equal to the distance you moved \(if you hit a creature, it takes the same amount of falling damage\)\.$/, (found) => ({ lines: [`Move your token ${found[1]} feet straight away from the creature; stopped early by an object or a creature, you take falling damage for the distance moved, and a creature you hit takes the same (by hand).`] })],
    [/^You don't need to eat or drink for (\d+) weeks?\.$/, (found) => ({ lines: [`You don't need food or drink for ${found[1]} week.`] })],
    [/^Dozens of tattered, nonmagical playing cards burst from the pistol's barrel\.$/, () => ({ lines: ["A burst of worn playing cards from the barrel, nothing more."] })],
    [/^Normal vegetation within (\d+) feet of the target immediately dies and turns to ash\.$/, (found) => ({ lines: [`Ordinary plants within ${found[1]} feet of the creature wither to ash (the map's).`] })],
    [/^All non-artifact ammunition in your possession crumbles to dust\.$/, () => ({ lines: ["Every piece of ammunition you carry that isn't an artifact crumbles away: remove it from your inventory."] })],
    [/^Dozens of bullet holes appear in the target's nonmagical clothing\. The effect is purely cosmetic\.$/, () => ({ lines: ["Bullet holes riddle the creature's ordinary clothes (only for show)."] })],
    [/^The pistol vanishes, reappearing among your possessions once it can be activated again\.$/, () => ({ lines: ["The pistol is gone until its wait is over, then back among your things."] })]
];

// A cast row's words that are its card's lines (a look, its user's own choice or limit, a place on the map), by spell.
const CAST_LINES = [
    [/^The pistol casts Summon Animal \(3rd rank\) to produce a Hippogriff adjacent to you; only you can ride it\.$/, ["It's a hippogriff, beside you; only you can ride it."]],
    [/^The item casts a 6th-rank Rewrite Memory on the target\. to forget you ever existed; you can't Sustain the Spell\.$/, ["The creature forgets you ever existed; you can't Sustain the spell."]],
    [/^The pistol casts One with Plants on you, except you appear as a Medium wooden grave marker bearing your name and the current date; you can't Dismiss the spell for (\d+) rounds?\.$/, ["You look like a Medium wooden grave marker with your name and today's date on it, and you can't Dismiss the spell for its first round."]],
    [/^The pistol casts Mask of Terror, except the target appears as a more fearsome and violent version of itself to all observers\.$/, ["The creature looks like a fiercer, more violent version of itself to everyone."]],
    [/^The pistol casts Hydraulic Push \(4th rank\) as water streams from the pistol\.$/, ["Water streams from the pistol."]],
    [/^The pistol casts Translocate on you, teleporting you to the space adjacent to the target opposite your current position; if that space isn't clear, you instead teleport to the nearest open space\.$/, ["Your space: the one beside the creature on its far side from you, or the nearest open one if that's taken."]],
    [/^The pistol casts Dinosaur Form on you to transform you into a triceratops; the pistol protrudes from the base of your front horn, and you can fire \(but not reload\) the pistol while in this form\.$/, ["A triceratops, the pistol at the base of your front horn: you can fire it in this form, but not reload it."]],
    [/^The pistol casts a 4th-rank mist, but with swirling dust and sand instead of fog\.$/, ["Its mist is of swirling dust and sand."]],
    [/^The pistol casts Uncontrollable Dance with a duration of (\d+) rounds, even on a failure or critical failure\.$/, ["It lasts 3 rounds whatever the save."]]
];
const COLORS = /^The pistol casts Cloak of Colors on you with a duration of (\d+d\d+) (rounds)\.$/;
const RESILIENCE = /^The pistol casts Mountain Resilience on you, making your skin rough and leathery; the target ignores the resistance you gain from this spell, and the target's attacks don't reduce the spell's duration\.$/;

const LEATHERY = "Your skin turns rough and leathery.";
// (For the spell's own time, 20 minutes.)
const resilienceNote = (options) => {
    const minutes = Number(/^(\d+) minutes$/.exec(String(options?.spells?.["mountain resilience"]?.duration ?? ""))?.[1]) || 20;
    return { kind: "note", label: "Mountain Resilience: the pistol's target", text: "The creature the pistol was aimed at ignores this resistance, and its attacks don't shorten the spell.", duration: timeOf(minutes, "minutes") };
};

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// One cast row's plan → its plan with its words read, or null when something in them is still the GM's.
function castRow(plan, item, options) {
    const spell = options?.spells?.[String(plan.spell?.name ?? "").toLowerCase()] ?? null;
    let next = withCastNotes(plan, options, item);
    const notes = [];
    for (const note of plan.notes ?? []) {
        const words = said(note);
        const colors = COLORS.exec(words);
        if (colors) {
            // (Its time rolled as it's cast; 5 rounds where nothing rolls it.)
            next = { ...next, castDuration: { value: 5, unit: colors[2], valueRoll: colors[1], said: [colors[0]] } };
            continue;
        }
        // (Mountain Resilience cast, where PF2e's Spell Effect isn't indexed: the same note Effect on its user.)
        if (RESILIENCE.test(words)) {
            next = { ...next, userEffects: [...(next.userEffects ?? []), resilienceNote(options)] };
            notes.push(LEATHERY);
            continue;
        }
        const lines = CAST_LINES.find(([pattern]) => pattern.test(words));
        if (lines) {
            notes.push(...lines[1]);
            continue;
        }
        return null;
    }
    // (At the creature chosen within 60 feet, a spell of shorter range included.)
    const feet = feetOf(spell?.range);
    const ranged = !next.self && spell?.target && feet !== null && feet < SIXTY && !next.castRange ? { castRange: { feet: SIXTY, said: [] } } : {};
    return { ...next, ...ranged, notes: notes.length ? notes : undefined, partial: undefined, automation: { ...(next.automation ?? {}), level: "automatic" } };
}

// A spell Effect row (PF2e's own on its user) with words of its own → that row with them as a note Effect on its user, or null.
function effectRow(plan, options) {
    const notes = (plan.notes ?? []).map(said).filter(Boolean);
    if (!notes.length) return plan;
    if (notes.length !== 1 || !RESILIENCE.test(notes[0])) return null;
    return { ...plan, notes: [LEATHERY], userEffects: [...(plan.userEffects ?? []), resilienceNote(options)] };
}

// The table plan's own sentences its rows now play: a spell's rank (each cast's), its DC and attack (each cast's), its range (castRange).
const PLAYED = [/^If an entry lists a spell, the [\w' -]+? Casts that Spell at the indicated level \(or at its lowest level, if no level is listed\)\.$/, /^Any spell DC required is DC \d+, and any spell attack modifier required is \+\d+\.$/, /^If the spell's range is less than 60 feet, increase the range to 60 feet\.$/];

export function withWonderRows(plan, { kind, item, options }) {
    // (Still partial, or already its one-off's card lines — decided.js, its user's push and the falling damage: the rows built all the same.)
    if (kind !== "activation" || plan?.builtin !== "table" || !(plan.partial || plan.decided === "one-off") || plan.table?.uuid || item?.name !== "Pistol of Wonder") return plan;
    const own = { modelVersion: plan.modelVersion, source: plan.source, rank: plan.rank, traits: plan.traits, activation: plan.activation, item: plan.item };
    const rows = [];
    for (const row of plan.table.rows) {
        if (row.plan?.builtin === "cast-spell") {
            const cast = castRow(row.plan, item, options);
            if (!cast) return plan;
            rows.push({ ...row, plan: cast });
            continue;
        }
        if (row.plan?.resolution?.kind === "effect") {
            const effect = effectRow(row.plan, options);
            if (!effect) return plan;
            rows.push({ ...row, plan: effect });
            continue;
        }
        const reading = ROWS.find(([pattern]) => pattern.test(row.text));
        if (reading) {
            const { plan: built, lines, again } = reading[1](reading[0].exec(row.text), own, item);
            const { plan: _old, ...rest } = row;
            rows.push({ ...rest, ...(built ? { plan: built } : {}), ...(lines ? { lines } : {}), ...(again ? { again } : {}) });
            continue;
        }
        // (A row already played with no words left: kept.)
        if (row.plan && !row.plan.partial && !(row.plan.notes ?? []).length && !Object.values(row.plan.resolution?.outcomes ?? {}).some((outcome) => (outcome?.manualInstructions ?? []).length)) {
            rows.push(row);
            continue;
        }
        // (Its own user's Quickened, the extra action only to reload or fire: a line beside the condition.)
        if (row.plan && /^You are Quickened for \d+ minutes?\. You can use the extra action only to reload or fire the pistol\.$/.test(row.text)) {
            rows.push({ ...row, plan: { ...row.plan, notes: ["Your extra action from Quickened is only to reload or fire the pistol."] } });
            continue;
        }
        return plan;
    }
    const notes = (plan.notes ?? []).filter((note) => !PLAYED.some((pattern) => pattern.test(said(note))));
    return { ...plan, table: { ...plan.table, rows }, notes: notes.length ? notes : undefined, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}
