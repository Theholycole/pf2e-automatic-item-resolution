// What a hit's riders lose when their creature Escapes (2026-10-25, docs/needs.md): the ability module's own shape (its src/compiler/row-
// extras.js since 0.9.0) — a condition's duration.escape { dc }, or { mode: "until-escape", escape } for one with no time, and a modifier's
// escape { dc } — which its live play ends on a successful Escape against that DC (its scripts/escape.js), on a save card's rows and on the
// riders the item module applies through it (scripts/foundry.js applyRiders). Its sentence is then read, not a note. Pure.
//   - Vine Arrow (src/compiler/item-data.js words it): "The penalty ends early if the target Escapes (DC 19)" — its Speed penalty, and the
//     critical hit's Immobilized "until it Escapes".
//   - Spring-Loaded Net Launcher (item-data.js too): "The Escape DC is 16 (it functions as an unattached Net)" — all a hit gives.
//   - Black Tendril Shot: "The ammunition's effects last until the target Escapes", which the ability compiler's save rows already carry.

const PENALTIES = /^The penalty ends early if the target Escapes \(DC (\d+)\)\.$/i;
const ALL = /^The Escape DC is (\d+) \(it functions as an unattached Net\)\.$/i;
const READ = /^The ammunition's effects last until the target Escapes\.$/i;
// (Ouroboros Flail's Chained Grasp, 2026-10-26: "A creature pulled to you is then Grabbed by the flail until the end of your next turn unless you
// move, your target Escapes, or you attack with the flail, whichever comes first" — the Escape's DC its link's, "[[/act escape dc=31]]"; its
// other two endings words on the grab, a note Effect on the rows that grab.)
const GRAB_UNLESS = /^A creature pulled to you is then Grabbed by the ([\w' ]+?) until the end of your next turn unless you move, your target Escapes, or you attack with the \1, whichever comes first\.$/i;
const DEGREES = ["criticalSuccess", "success", "failure", "criticalFailure"];
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// Every row of the plan and its Strike's save.
function rowsOf(plan) {
    const outcomes = [plan?.resolution?.outcomes, plan?.strike?.save?.resolution?.outcomes].filter(Boolean);
    return outcomes.flatMap((set) => DEGREES.map((degree) => set[degree]).filter(Boolean));
}
const ends = (row) => (row.effects ?? []).some((effect) => effect?.duration?.escape || effect?.duration?.mode === "until-escape") || (row.modifiers ?? []).some((modifier) => modifier?.escape);

// A condition's duration that also ends on the Escape (an untimed one only then); a modifier's.
const untilEscape = (effect, escape) => (effect?.kind !== "condition" ? effect : { ...effect, duration: effect.duration ? { ...effect.duration, escape } : { mode: "until-escape", escape } });

export function withEscapeEnds(given, html = "") {
    const notes = [...(given?.notes ?? []), ...(given?.strike?.notes ?? [])].map(said);
    const penalties = notes.map((note) => PENALTIES.exec(note)).find(Boolean);
    const all = notes.map((note) => ALL.exec(note)).find(Boolean);
    const read = notes.find((note) => READ.test(note));
    const grab = notes.map((note) => GRAB_UNLESS.exec(note)).find(Boolean);
    const grabDC = grab ? Number(/\[\[\/act escape dc=(\d+)\]\]/i.exec(String(html ?? ""))?.[1]) || null : null;
    if (!penalties && !all && !read && !grabDC) return given;
    const plan = JSON.parse(JSON.stringify(given));
    const done = [];
    if (grabDC) {
        const escape = { dc: grabDC };
        for (const row of rowsOf(plan)) {
            if (!(row.effects ?? []).some((effect) => effect?.kind === "condition" && effect.slug === "grabbed")) continue;
            row.effects = row.effects.map((effect) => (effect?.kind === "condition" && effect.slug === "grabbed" ? untilEscape(effect, escape) : effect));
            row.noteEffects = [...(row.noteEffects ?? []), { label: `Grabbed by the ${grab[1]}`, text: `The grab also ends if its grabber moves or attacks with the ${grab[1]}.`, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } }];
        }
        done.push(grab[0]);
    }
    if (penalties || all) {
        const escape = { dc: Number((penalties ?? all)[1]) };
        for (const row of rowsOf(plan)) {
            row.modifiers = (row.modifiers ?? []).map((modifier) => ({ ...modifier, escape }));
            // (Vine Arrow's: only the untimed condition its critical hit gives "until it Escapes"; the net's: every one.)
            row.effects = (row.effects ?? []).map((effect) => (all || (effect?.kind === "condition" && !effect.duration) ? untilEscape(effect, escape) : effect));
        }
        done.push((penalties ?? all)[0]);
    }
    if (read && rowsOf(plan).some(ends)) done.push(read);
    if (!done.length) return given;
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !done.includes(said(entry))) : list);
    if (plan.notes) plan.notes = kept(plan.notes);
    if (plan.strike?.notes) plan.strike.notes = kept(plan.strike.notes);
    if (!plan.notes?.length) delete plan.notes;
    const left = [...(plan.notes ?? []), ...(plan.unread ?? []), ...(plan.strike?.notes ?? []), ...rowsOf(plan).flatMap((row) => row.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete plan.partial;
        plan.automation = { ...(plan.automation ?? {}), level: "automatic" };
    }
    return plan;
}
