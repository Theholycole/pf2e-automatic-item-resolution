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
    return manualPenalties(untilRemoved(droppedRows(asFailureBut(lastingConditions(saveExtras(alreadyGated(equalTempHP(traitGated(plan, text), text), text), text), text), text), text), text), text);
}


// A save's row the ability compiler left to the GM that is one penalty its reader doesn't know the checks of — Stage Fright
// Missive's "The target takes a –1 status penalty to Deception, Diplomacy, Intimidation, and Performance checks for 1 hour",
// Captivating Rosebud's "-1 status penalty to Perception checks for 10 minutes" and "As success, but a –2 penalty" — that
// penalty as the row's modifiers (PF2e's selectors, src/compiler/rows.js), its "by hand" line gone.
const PENALTY_ROW = /^\{target\} \([\w ]+\): The (?:target|creature) takes an? [-–−](\d+) (status|circumstance|item) penalty to ([\w ,]+?) for (\d+|one|an?) (rounds?|minutes?|hours?)\.$/i;
const AS_BUT_PENALTY = /^\{target\} \([\w ]+\): As (success|failure), but an? [-–−](\d+) penalty\.(?: \([^)]*\))?$/i;
const ROW_KEYS = { success: "success", failure: "failure" };
function manualPenalties(plan, text) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !plan.resolution.outcomes) return plan;
    const words = degreeWords(text);
    const read = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const lines = row?.manualInstructions ?? [];
        if (lines.length !== 1 || (row.modifiers ?? []).length) continue;
        const line = String(typeof lines[0] === "string" ? lines[0] : lines[0]?.text ?? "");
        const match = PENALTY_ROW.exec(line);
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
    if (read.failure && !read.criticalFailure && words.criticalFailure === undefined && critical && !(critical.effects ?? []).length && !(critical.manualInstructions ?? []).length && !(critical.modifiers ?? []).length && (critical.damage?.mode ?? "none") === "none") read.criticalFailure = read.failure;
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
const emptyRow = (row) => !(row?.effects ?? []).length && !(row?.noteEffects ?? []).length && !(row?.manualInstructions ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement && (row?.damage?.mode ?? "none") === "none" && !row?.healing && !row?.reduce;
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
    /\bcreature takes \d+d\d+ \w+ damage instead of \w+ damage\b[^.]*\.$/i
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
    if (Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.kind === "tempHP" || effect?.kind === "temp-hp"))) return plan;
    const note = `${match[0].charAt(0).toUpperCase()}${match[0].slice(1)} (the damage dealt): add them by hand.`;
    return { ...plan, notes: [...(plan.notes ?? []), note], partial: true };
}

// A condition only for a creature with a trait — Lacquered Waist Drum's "if the creature has the ghost trait, it becomes
// Stupefied 1 for 1 minute" — isn't the ability compiler's to give every creature the save is for: its rows lose it, and a
// note on each says who it's for. One the compiler left out ("the ghost becomes Sickened 1 if it fails the save") is a note
// on the failures.
const TRAIT_GATED = /\bif the (?:creature|undead|target)(?: also)? has the ([\w-]+) trait, (?:it|the [\w-]+) becomes ([A-Z][a-z-]+)((?: \d+)?[^.;]*)/g;
function traitGated(plan, text) {
    const gated = [...String(text ?? "").matchAll(TRAIT_GATED)].map((match) => ({ trait: match[1].toLowerCase(), slug: match[2].toLowerCase(), words: `${match[2]}${match[3]}`.trim() }));
    if (!gated.length || !plan?.resolution?.outcomes) return plan;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter((effect) => effect?.kind === "condition" && gated.some((entry) => entry.slug === effect.slug));
        if (!bad.length) {
            outcomes[degree] = row;
            continue;
        }
        changed = true;
        outcomes[degree] = {
            ...row,
            effects: row.effects.filter((effect) => !bad.includes(effect)),
            noteEffects: [...(row.noteEffects ?? []), ...bad.map((effect) => {
                const entry = gated.find((one) => one.slug === effect.slug);
                return { label: effect.slug, text: `Only a creature with the ${entry.trait} trait: ${effect.slug.charAt(0).toUpperCase()}${effect.slug.slice(1)}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}. Apply it by hand.`, duration: effect.duration ?? null };
            })]
        };
    }
    // (Left out: a note on the rows it names.)
    for (const entry of gated.filter((one) => !Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.slug === one.slug)))) {
        const degrees = /\bif it (?:critically )?fails\b/i.test(entry.words) ? (/\bcritically fails\b/i.test(entry.words) ? ["criticalFailure"] : ["failure", "criticalFailure"]) : [];
        for (const degree of degrees.filter((one) => outcomes[one])) {
            changed = true;
            outcomes[degree] = { ...outcomes[degree], noteEffects: [...(outcomes[degree].noteEffects ?? []), { label: entry.slug, text: `Only a creature with the ${entry.trait} trait: ${entry.words.replace(/\s+if it (?:critically )?fails the save\b/i, "")}. Apply it by hand.`, duration: null }] };
        }
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes }, partial: true } : plan;
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

