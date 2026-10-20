// A new save at the creature's turns (2026-10-20): the ability module's duration.saveEnds on a row's condition and note.saveEnds on a note
// Effect (ability 1610bff, src/live/recurring.js), played at the end of each of the bearer's turns by the active GM's save card.
//   end:      Tusk and Fang Chain's "At the end of each of its turns, it attempts a new Will save, ending the effect on a success", Golden
//             Silencer (Greater)'s "can attempt a new Fortitude save at the end of each of its turns to end the duration early" (its note
//             Effect), Jawbreaker Shield's "At the end of its turn, it can attempt a Fortitude save to regain the ability to make Strikes
//             using its mouth" (a note Effect for that minute);
//   reduce:   Spirit-Sealing Fulu (Greater)'s "… to reduce the remaining duration by 1 round, or end it entirely on a critical success";
//   escalate: Gearbinder Oil's same save again "at the end of any round during which the target took an action with the attack,
//             manipulate, or move trait" for up to 6 rounds (its rows' steps; a GM gate for the actions), Dreaming Round's "another
//             Fortitude save at the end of each of its turns" (slowed up by 1 on a failure, down by 1 on a success, its fatigued gone at 0).
// The sentence read is no longer a note or a line by hand. Pure.

const SAVE_NAMES = { will: "will", fortitude: "fortitude", reflex: "reflex" };
const HEADING = /(?:^|(?<=[.!?]\s))(Critical Success|Critical Failure|Success|Failure) (?=[A-Z@])/g;
const DEGREE = { "Critical Success": "criticalSuccess", Success: "success", Failure: "failure", "Critical Failure": "criticalFailure" };
const FAILING = ["failure", "criticalFailure"];

const END_ON_SUCCESS = /\bAt the end of each of its turns, (?:it|the creature|the target) attempts a new (Will|Fortitude|Reflex) save, ending the effect on a success\./i;
const END_EARLY = /\bThe (?:\w+ )?creature can attempt a new (Will|Fortitude|Reflex) save at the end of each of its turns to end the (?:duration|effect)(?: early)?\./i;
const REGAIN = /\bAs failure, and the creature can't make Strikes using its mouth for (\d+) (minute|round)s?\. At the end of its turn, it can attempt a (Will|Fortitude|Reflex) save to regain the ability to make Strikes using its mouth\./i;
const REDUCE = /\bAt the end of each of its turns, it can attempt a new (Will|Fortitude|Reflex) save to reduce the remaining duration by 1 round, or end it entirely on a critical success\./i;
const EACH_ROUND = /\bat the end of any round during which the target took an action with the ([\w, ]+?) trait, it must attempt a (?:@Check\[(\w+)[^\]]*\]|(Will|Fortitude|Reflex)) save\./i;
const FUNCTIONS = /\bfunctions for up to (\d+) rounds\b/i;
const ESCALATING = /\bmust attempt another (Will|Fortitude|Reflex) save at the end of each of its turns\. If it fails, its (\w+) condition increases by (\d+)\. A successful save reduces the \2 condition by (\d+)\. If the \2 condition is removed or reduced to 0, the effect and the (\w+) condition end\./i;
const MECHANISM = /\bA mechanism that's Slowed (\d) or more by [\w ]+? also can't use reactions\./i;

// Each degree's text, and the text before the first ("lead").
function degreeTexts(text) {
    const plain = String(text ?? "");
    const marks = [...plain.matchAll(HEADING)].map((match) => ({ degree: DEGREE[match[1]], at: match.index }));
    const parts = { lead: plain.slice(0, marks[0]?.at ?? plain.length) };
    marks.forEach((mark, index) => {
        parts[mark.degree] = plain.slice(mark.at, marks[index + 1]?.at ?? plain.length);
    });
    return parts;
}
// The degrees the sentence is for: its own row's, or the failing ones for a sentence before the rows.
function degreesOf(parts, sentence) {
    const own = Object.keys(DEGREE).map((key) => DEGREE[key]).filter((degree) => parts[degree]?.includes(sentence));
    return own.length ? own : parts.lead.includes(sentence) ? FAILING : [];
}

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "");
// The plan without the sentences read: a note that says one goes, a line by hand loses it (Jawbreaker Shield's "As failure, and …" keeps
// "As failure."). read: [{ sentence, instead? }].
function withoutSaid(plan, read) {
    const has = (entry, { sentence }) => said(entry).includes(sentence.slice(0, 60));
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => {
        if (!row?.manualInstructions) return [degree, row];
        const lines = row.manualInstructions.map((line) => {
            const found = read.find((entry) => has(line, entry));
            if (!found) return line;
            const left = line.replace(found.sentence, found.instead ?? "").replace(/\s+/g, " ").trim();
            return /^\{target\}(?: \([^)]*\))?:$/.test(left) ? null : left;
        }).filter(Boolean);
        const { manualInstructions, ...rest } = row;
        return [degree, lines.length ? { ...rest, manualInstructions: lines } : rest];
    }));
    const notes = Array.isArray(plan.notes) ? plan.notes.filter((note) => !read.some((entry) => has(note, entry))) : plan.notes;
    const { notes: _notes, ...rest } = plan;
    return { ...rest, ...(notes?.length ? { notes } : {}), resolution: { ...plan.resolution, outcomes } };
}

// A row's conditions of that slug (or any timed one) with saveEnds on their duration.
function onConditions(row, saveEnds, { slug = null, unlimited = false } = {}) {
    let changed = false;
    const effects = (row?.effects ?? []).map((effect) => {
        if (effect?.kind !== "condition" || (slug ? effect.slug !== slug : effect.duration?.mode !== "fixed")) return effect;
        if (!unlimited && effect.duration?.mode !== "fixed") return effect;
        changed = true;
        return { ...effect, duration: { ...(effect.duration ?? { mode: "unlimited" }), saveEnds } };
    });
    return changed ? { ...row, effects } : row;
}

// (A row's own save at its turns, with its DC — Bewildering Spellgun's success, "The target is confused for 1 minute but can attempt a
// @Check[will|dc:25] save at the end of each of its turns to end the effect" — whatever the plan's own check: a spellgun's is an attack.)
const BUT_CAN_SAVE = /\bbut can attempt an? @Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\] save at the end of each of its turns to end the effect\./i;
function rowSave(plan, text) {
    const plain = String(text ?? "");
    const match = BUT_CAN_SAVE.exec(plain);
    if (!match || !plan?.resolution?.outcomes) return plan;
    const parts = degreeTexts(plain);
    const degrees = degreesOf(parts, match[0]).filter((degree) => degree !== "lead" && plan.resolution.outcomes[degree]);
    if (!degrees.length) return plan;
    const saveEnds = { save: SAVE_NAMES[match[1].toLowerCase()], dc: Number(match[2]), mode: "end" };
    const outcomes = { ...plan.resolution.outcomes };
    for (const degree of degrees) outcomes[degree] = onConditions(outcomes[degree], saveEnds);
    if (degrees.every((degree) => outcomes[degree] === plan.resolution.outcomes[degree])) return plan;
    return withoutSaid({ ...plan, resolution: { ...plan.resolution, outcomes } }, [{ sentence: match[0] }]);
}

// One save plan (the item's, or its Strike's save) with what its text says.
function savePlan(given, text) {
    const plan = rowSave(given, text);
    if (plan?.resolution?.kind !== "save" || plan.resolution.check?.roll !== "save" || !plan.resolution.outcomes) return plan;
    const plain = String(text ?? "");
    const parts = degreeTexts(plain);
    const outcomes = { ...plan.resolution.outcomes };
    const read = [];
    const gm = [];
    const put = (degrees, change) => {
        for (const degree of degrees) if (outcomes[degree]) outcomes[degree] = change(outcomes[degree], degree);
    };
    // (A success ends it: the timed conditions of its rows, or the note Effects that say it.)
    for (const pattern of [END_ON_SUCCESS, END_EARLY]) {
        const match = pattern.exec(plain);
        if (!match) continue;
        const saveEnds = { save: SAVE_NAMES[match[1].toLowerCase()], dc: null, mode: "end" };
        const degrees = degreesOf(parts, match[0]);
        let used = false;
        put(degrees, (row) => {
            const notes = (row.noteEffects ?? []).map((note) => (said(note).includes(match[0]) ? ((used = true), { ...note, saveEnds }) : note));
            const next = onConditions({ ...row, ...(row.noteEffects ? { noteEffects: notes } : {}) }, saveEnds);
            if (next.effects !== row.effects) used = true;
            return next;
        });
        if (used) read.push({ sentence: match[0] });
    }
    const regain = REGAIN.exec(plain);
    if (regain && outcomes.criticalFailure) {
        const note = { label: "Can't Strike with its mouth", text: "It can't make Strikes using its mouth.", duration: { mode: "fixed", value: Number(regain[1]), unit: `${regain[2].toLowerCase()}s`, expiry: "turn-start", anchor: "effect-start" }, saveEnds: { save: SAVE_NAMES[regain[3].toLowerCase()], dc: null, mode: "end" } };
        outcomes.criticalFailure = { ...outcomes.criticalFailure, noteEffects: [...(outcomes.criticalFailure.noteEffects ?? []), note] };
        read.push({ sentence: regain[0], instead: "As failure." });
    }
    const reduce = REDUCE.exec(plain);
    if (reduce) {
        const saveEnds = { save: SAVE_NAMES[reduce[1].toLowerCase()], dc: null, mode: "reduce" };
        const before = JSON.stringify(outcomes);
        put(degreesOf(parts, reduce[0]), (row) => onConditions(row, saveEnds));
        if (JSON.stringify(outcomes) !== before) read.push({ sentence: reduce[0] });
    }
    // (The same save again at each round's end, its rows' steps on its condition: Gearbinder Oil.)
    const round = EACH_ROUND.exec(plain);
    const lasts = FUNCTIONS.exec(plain);
    if (round && lasts) {
        const stacked = (degree) => (outcomes[degree]?.effects ?? []).find((effect) => effect?.kind === "condition" && Number.isFinite(Number(effect.stack?.by)));
        const slug = stacked("failure")?.slug;
        const ends = /\b(?:the effect ends|becomes inert)\b/i.test(parts.criticalSuccess ?? "");
        if (slug && [stacked("success"), stacked("criticalFailure")].every((effect) => effect?.slug === slug) && ends) {
            const max = Number(stacked("failure").stack.max);
            const saveEnds = {
                save: SAVE_NAMES[(round[2] ?? round[3]).toLowerCase()],
                dc: null,
                mode: "escalate",
                escalate: { criticalSuccess: "end", success: Number(stacked("success").stack.by), failure: Number(stacked("failure").stack.by), criticalFailure: Number(stacked("criticalFailure").stack.by) },
                ...(Number.isFinite(max) ? { max } : {}),
                rounds: Number(lasts[1]),
                gate: `it took an action with the ${round[1]} trait this round`
            };
            put(FAILING, (row) => onConditions(row, saveEnds, { slug, unlimited: true }));
            read.push({ sentence: round[0] });
            // (Its success's "If the slowed condition's value is 0, the effect ends": the escalate's own end at 0.)
            const mechanism = MECHANISM.exec(plain);
            if (mechanism) {
                // (A behaviour rule beside its row's condition: a line by hand, the rest of a row the card plays.)
                put(FAILING, (row, degree) => ({ ...row, manualInstructions: [...(row.manualInstructions ?? []), `{target} (${degree === "failure" ? "failure" : "critical failure"}, the rest by hand): While ${slug.charAt(0).toUpperCase()}${slug.slice(1)} ${mechanism[1]} or more by it, it also can't use reactions.`] }));
                read.push({ sentence: mechanism[0] });
            }
        }
    }
    // (Another save at each of its turns from a row, its condition up on a failure and down on a success: Dreaming Round.)
    const escalating = ESCALATING.exec(plain);
    if (escalating) {
        const slug = escalating[2].toLowerCase();
        const saveEnds = {
            save: SAVE_NAMES[escalating[1].toLowerCase()],
            dc: null,
            mode: "escalate",
            escalate: { criticalFailure: Number(escalating[3]), failure: Number(escalating[3]), success: -Number(escalating[4]), criticalSuccess: -Number(escalating[4]) },
            alsoEnds: [escalating[5].toLowerCase()]
        };
        // (Its row, and a critical failure "As failure, except …" too.)
        const degrees = degreesOf(parts, escalating[0]);
        if (degrees.includes("failure") && /^Critical Failure As failure\b/.test(parts.criticalFailure ?? "")) degrees.push("criticalFailure");
        const before = JSON.stringify(outcomes);
        put(degrees, (row) => onConditions(row, saveEnds, { slug, unlimited: true }));
        if (JSON.stringify(outcomes) !== before) {
            read.push({ sentence: escalating[0] });
            // (What else its row says of it — Dreaming Round's sleep once its actions are 0, and waking — the GM's: a note.)
            const row = degrees.map((degree) => parts[degree]).find((words) => words?.includes(escalating[0])) ?? "";
            const rest = row.slice(row.indexOf(escalating[0]) + escalating[0].length).trim();
            if (rest) gm.push(rest);
        }
    }
    if (!read.length) return plan;
    const next = withoutSaid({ ...plan, resolution: { ...plan.resolution, outcomes } }, read);
    if (!gm.length) return next;
    const notes = [...(next.notes ?? []).filter((note) => !gm.some((words) => note.includes(words.slice(0, 60)) || words.includes(note))), ...gm];
    return { ...next, notes, partial: true, automation: { ...(next.automation ?? {}), level: "guided" } };
}

// Partial no longer once its reading left nothing — no note, unread sentence or line by hand (Bewildering Spellgun's only note was its save).
function settled(before, after) {
    if (after === before || !after?.partial) return after;
    const left = [...(after.notes ?? []), ...(after.unread ?? []), ...Object.values(after.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (left.length) return after;
    const { partial, ...rest } = after;
    return { ...rest, automation: { ...(after.automation ?? {}), level: "automatic" } };
}

// The plan with its saves at the creature's turns; its Strike's save (Golden Silencer, Jawbreaker Shield) too. text: its plain text.
export function withSaveEnds(plan, text) {
    if (!plan || plan.builtin) return plan;
    let next = savePlan(plan, text);
    if (next?.strike?.save) {
        const save = savePlan(next.strike.save, text);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save } };
    }
    return settled(plan, next);
}
