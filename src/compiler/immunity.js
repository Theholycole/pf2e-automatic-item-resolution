// A temporary immunity after a use (the user's answer to question 18, 2026-10-20): Serene Smelling Salts' "becomes temporarily immune to any
// serene smelling salts for 1 hour", Aetheric Irritant's "A creature that critically succeeds at the save is immune to all aetheric
// irritants for 24 hours", Fortune's Coin's "Either way, you're temporarily immune to fortune's coin for 1 hour". The ability module's own
// shape, trigger.immunity { scope, raw, duration, degrees, against, slug }: its save cards give the creature its "Immune:" Effect on Apply by
// degree (and, once it filters, leave out a creature already immune); the item module's other cards give the same Effect themselves and
// refuse a creature that has it (scripts/immunity.js). slug: the key both modules check — the item's name without its grade, so every grade
// shares it ("all aetheric irritants"), and an activation's own name for "this activation" or an ability it names.
// What isn't one whole-item immunity stays a note: immunity to one part ("immune to being blinded by poison fizz"), a time with no clock
// ("until the next lunar new year", "until it wakes up", "once its effects end", "1d4 days"). Not an immunity to the item at all: severe
// cold, a condition from other creatures, PF2e's own Demoralize or Battle Medicine immunities. Pure.

const UNITS = { round: "rounds", minute: "minutes", hour: "hours", day: "days", week: "weeks" };
const ALL = ["criticalSuccess", "success", "failure", "criticalFailure"];
const COUNT = { a: 1, an: 1, one: 1 };

// Its sentence: "temporarily immune …", or "immune to <its own> for N".
const SENTENCE = /[^.]*\b(?:temporarily immune\b|immune to [^.]*?\bfor (?:the next )?(?:\d+|an?|one) (?:round|minute|hour|day|week)s?\b)[^.]*(?:\.|$)/gi;
// (Not this item's: negated, another rule's time changed, the weather, PF2e's own action immunities.)
// (Nor an immunity to another's attempts to end it, Mindrender Baton's "temporarily immune to that character's attempts to remove the effect":
// a rule the GM keeps, a note — ATTEMPTS.)
const ATTEMPTS = /\bimmune to (?:that|the|their|this) [\w ]+?'s attempts\b/i;
const NOT_OURS = /\b(?:doesn't|does not|don't|isn't|aren't|won't|never) become\b|\bignores? any temporary immunity\b|\binstead of\b|\b(?:minor|severe|extreme|mild) (?:cold|heat)\b|\byour (?:Demoralize|Battle Medicine|Treat Wounds)\b/i;
// (Only one part of it: "immune to being blinded by poison fizz", "immune to the sickened condition caused by other durian bombs".)
const ONE_PART = /\bimmune to (?:being \w+|the \w+ condition)\b/i;
// (A time with no clock it can be held to.)
const NO_CLOCK = /\buntil (?:the next lunar new year|it wakes up|the next time it wakes|you eat|your next|it next|you get a full night's rest)\b|\bonce its effects end\b|\bwhen the effect ends\b|\bwhen the \d+ (?:rounds|minutes|hours) are up\b|\bentirely\b|\b\d+d\d+\b/i;
const DAILY = /\buntil (?:the next time (?:you|it) makes? (?:your|its) daily preparations|your next daily preparations)\b/i;

const slugOf = (words) => String(words ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// The item's name without its grade, "Aetheric Irritant (Lesser)" → "aetheric-irritant" — a kind kept, Spun Cloud (Red) not (Green); for "all"
// or "any" of them, without its kind too, "all heartening missives".
const GRADES = /\s*\((?:Minor|Lesser|Moderate|Greater|Major|True|Lower|Higher)\)\s*$/i;
export const familySlug = (name) => slugOf(String(name ?? "").replace(GRADES, ""));
const baseSlug = (name) => slugOf(String(name ?? "").replace(/\s*\([^)]*\)\s*$/, ""));

// Which results give it: a degree heading's, a critical success's, a success's; the degree paragraph it's in (headingOf: the degrees for that
// sentence, Pheromone Flare's "Failure … After this, it becomes temporarily immune for 24 hours" with "Critical Failure As failure, …"); every
// result otherwise.
function degreesOf(sentence, headingOf = () => null) {
    if (/^Critical Success\b|\bcritically succeeds?\b|\bOn a critical success\b/i.test(sentence)) return ["criticalSuccess"];
    if (/^Critical Failure\b|\bcritically fails?\b/i.test(sentence)) return ["criticalFailure"];
    if (/\bregardless\b|\beither way\b|\bwhether or not\b|\battempts? (?:this|the|its) save\b|\bafter which\b/i.test(sentence)) return [...ALL];
    if (/^Success\b|\bsucceed(?:s|ed)?\b|\bsuccessfully saves?\b|\bsuccessful save\b/i.test(sentence)) return ["criticalSuccess", "success"];
    return headingOf(sentence) ?? [...ALL];
}

// The degree paragraphs of the html ("<p><strong>Failure</strong> …</p>"): a sentence → the degrees of the one it's in, with each later one
// that's "As failure, …" of it; null when it's in none.
const DEGREE_KEYS = { "critical success": "criticalSuccess", success: "success", failure: "failure", "critical failure": "criticalFailure" };
export function degreeParagraphs(html) {
    const flatText = (words) => String(words ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const paragraphs = [...String(html ?? "").matchAll(/<p>\s*<strong>\s*(Critical Success|Success|Failure|Critical Failure)\s*<\/strong>([\s\S]*?)<\/p>/gi)].map((match) => ({ degree: DEGREE_KEYS[match[1].toLowerCase()], text: flatText(match[2]) }));
    return (sentence) => {
        const words = flatText(sentence).replace(/^(?:Critical Success|Success|Failure|Critical Failure)\s+/i, "").replace(/\.$/, "");
        const own = paragraphs.find((entry) => words && entry.text.includes(words));
        if (!own) return null;
        const copies = paragraphs.filter((entry) => entry !== own && new RegExp(String.raw`^(?:As|Same as|As with) (?:the |a )?${own.degree.replace(/([A-Z])/g, " $1").toLowerCase()}\b`, "i").test(entry.text)).map((entry) => entry.degree);
        return ALL.filter((degree) => degree === own.degree || copies.includes(degree));
    };
}

// Its time: "for 24 hours", "for the next 24 hours", "for 1 day", "until … daily preparations" (a day, said so).
function durationOf(sentence) {
    if (DAILY.test(sentence)) return { value: 1, unit: "days", daily: true };
    const time = [...sentence.matchAll(/\bfor (?:the next )?(\d+|an?|one) (round|minute|hour|day|week)s?\b/gi)].pop();
    if (!time) return null;
    const value = COUNT[time[1].toLowerCase()] ?? Number(time[1]);
    const unit = UNITS[time[2].toLowerCase()];
    // (A week in days, the unit PF2e's Effects keep.)
    return unit === "weeks" ? { value: value * 7, unit: "days" } : { value, unit };
}

// The text (plain, the activation's own) and the item (and the activation's name) → { immunity } with its slug, { unread: [sentences] }
// for what isn't one this module can hold to, or null when there's none.
export function readItemImmunity(text, { name = null, activation = null, headingOf = () => null } = {}) {
    // (From its Effect on: its Trigger's words — "Trigger The target critically fails its save …" — aren't the immunity's.)
    const plain = String(text ?? "").replace(/\s+/g, " ").replace(/^.*?\bTrigger\b.*?\bEffect\b\s*/, "");
    const family = familySlug(name);
    // (Without "temporarily", only an immunity to the item itself — "immune to all aetheric irritants", "to this effect", "to bottled omen
    // potions", "to Rise Up" — not a benefit, Velicarn's Cursed Coin's "you become immune to fear effects for 1 hour".)
    const words = family.split("-").filter((word) => word.length >= 4);
    const itself = (sentence) => {
        if (/\btemporarily immune\b/i.test(sentence)) return true;
        const to = /\bimmune to ([^,.;]+?)\s+for\b/i.exec(sentence)?.[1] ?? "";
        return /^(?:this|the|that|its|all|any|further|these|your)\b/i.test(to.trim()) || /^[A-Z]/.test(to.trim()) || words.some((word) => to.toLowerCase().includes(word));
    };
    const all = [...plain.matchAll(SENTENCE)].map((match) => match[0].trim());
    const attempts = all.filter((sentence) => ATTEMPTS.test(sentence));
    const found = all.filter((sentence) => !NOT_OURS.test(sentence) && !ATTEMPTS.test(sentence) && itself(sentence));
    if (!found.length && !attempts.length) return null;
    const own = activation ? `${family}-${slugOf(activation)}` : family;
    const unread = [...attempts];
    const also = [];
    let immunity = null;
    for (const sentence of found) {
        // (One held to; the same one again at other results joins it — Pheromone Flare's critical success and failure —, another stays a note.)
        const timed = ONE_PART.test(sentence) || (NO_CLOCK.test(sentence) && !DAILY.test(sentence)) ? null : durationOf(sentence);
        if (immunity && timed && !/\bimmune to\b/i.test(sentence) && timed.value === immunity.duration.value && timed.unit === immunity.duration.unit) {
            immunity = { ...immunity, degrees: ALL.filter((degree) => immunity.degrees.includes(degree) || degreesOf(sentence, headingOf).includes(degree)) };
            also.push(sentence);
            continue;
        }
        const duration = immunity ? null : timed;
        if (!duration) {
            unread.push(sentence);
            continue;
        }
        // (What it's immune to: an ability it names by name — "immune to Guarded Fortune", "to Disorienting Fugue" — that one; else the item.)
        const to = /\bimmune to ([^,.;]+?)\s+(?:for|until)\b/i.exec(sentence)?.[1] ?? "";
        const named = /^(?:the )?([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)*)$/.exec(to.trim())?.[1];
        const ownName = named && familySlug(named) !== family && !/^(?:this|the|that|its|all|any)\b/i.test(to.trim()) ? `${family}-${slugOf(named)}` : null;
        const slug = ownName ?? (/^(?:all|any)\b/i.test(to.trim()) ? baseSlug(name) : own);
        immunity = { scope: "target", raw: sentence, duration: { value: duration.value, unit: duration.unit }, ...(duration.daily ? { daily: true } : {}), degrees: degreesOf(sentence, headingOf), against: "all", slug };
    }
    return { ...(immunity ? { immunity } : {}), unread, ...(also.length ? { also } : {}) };
}

// Its sentence(s) — to take off a plan's notes once read.
export const immunitySaid = (sentence, immunity) => Boolean(immunity) && String(sentence ?? "").replace(/\s*\(by hand\)\.?$/, "").trim().replace(/\.$/, "") === String(immunity.raw ?? "").trim().replace(/\.$/, "");

// "immune to all stench auras": the key the ability module's monsters use for their Stench.
const SHARED = [[/\bimmune to all stench auras\b/i, "stench"]];

const ALL_DEGREES = (degrees) => ALL.every((degree) => (degrees ?? []).includes(degree));
const flat = (words) => String(words ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s*\(by hand\)\.?/g, "").replace(/^\{\w+\}(?: \([^)]*\))?:\s*/, "").replace(/\s+/g, " ").trim();
const holds = (entry, raw) => flat(typeof entry === "string" ? entry : entry?.text).includes(flat(raw).replace(/\.$/, ""));
const isSave = (node) => node?.resolution?.kind === "save" && node.resolution.check?.roll === "save";

// Every save plan in the plan (its own, a Strike's, a zone's, an aura's, a way's): the ones the ability module's cards roll.
function savesIn(node, found = [], seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return found;
    seen.add(node);
    if (isSave(node)) found.push(node);
    for (const value of Object.values(node)) if (value && typeof value === "object") savesIn(value, found, seen);
    return found;
}

// The plan without the immunity's own sentence in its notes, unread lines, GM lines, note Effects and a zone's notes — a note Effect left with
// nothing but flavor gone too.
function withoutSentence(node, raw, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) return node.map((value) => withoutSentence(value, raw, seen));
    const next = {};
    for (const [key, value] of Object.entries(node)) {
        if (["notes", "unread", "manualInstructions"].includes(key) && Array.isArray(value)) next[key] = value.filter((entry) => !holds(entry, raw));
        else if (key === "noteEffects" && Array.isArray(value)) next[key] = value.map((entry) => (holds(entry, raw) ? { ...entry, text: flat(entry.text).replace(flat(raw).replace(/\.$/, ""), "").replace(/\s*\.\s*$/, "").trim() } : entry)).filter((entry) => entry.text && /\b(?:bonus|penalty|damage|save|Hit Points|condition|immune|resistance|Speed|DC|check|attack|Strike|until|for \d+)\b/i.test(entry.text) && !/^(?:This|These)\b[^.]*\.?$/.test(entry.text));
        else next[key] = withoutSentence(value, raw, seen);
    }
    return next;
}

// What still makes the plan partial: its notes, unread lines, GM lines and note Effects anywhere in it.
function leftIn(node, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return 0;
    seen.add(node);
    let count = 0;
    for (const [key, value] of Object.entries(node)) {
        if (["notes", "unread", "manualInstructions", "noteEffects"].includes(key) && Array.isArray(value)) count += value.length;
        else if (value && typeof value === "object") count += leftIn(value, seen);
    }
    return count;
}

// A save's immunity from the ability compiler's own reading that isn't one to the item (Mindrender Baton's "temporarily immune to that
// character's attempts to remove the effect", read so before ability 9bc3db1): taken off, its sentence the reading's note.
function withoutMisread(plan) {
    for (const save of savesIn(plan).filter((entry) => entry.trigger?.immunity?.raw && (ATTEMPTS.test(entry.trigger.immunity.raw) || NOT_OURS.test(entry.trigger.immunity.raw)))) {
        const { immunity, ...trigger } = save.trigger;
        save.trigger = trigger;
    }
    return plan;
}

// The plan with its immunity held to: on every save plan its trigger.immunity (the ability module's cards give the "Immune:" Effect by degree
// and leave out a creature already immune); with no save, plan.item.immunity for the item module's own cards (scripts/immunity.js) — only
// when every result gives it, as there's no degree to tell. What can't be held to is a note, the plan partial; what's read no longer is.
// html: the activation's (or item's) own; names: { name, activation }.
export function withImmunity(given, html, names = {}) {
    if (!given || given.noteOnly || given.builtin === "no-effect") return given;
    const plan = withoutMisread(given);
    const text = String(html ?? "").replace(/<strong>\s*(Critical Success|Success|Failure|Critical Failure)\s*<\/strong>/gi, ". $1").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/(?:^|\s)\.\s+/g, ". ");
    const read = readItemImmunity(text, { ...names, headingOf: degreeParagraphs(html) });
    if (!read) return plan;
    const shared = read.immunity ? SHARED.find(([words]) => words.test(read.immunity.raw))?.[1] : null;
    const immunity = read.immunity ? { ...read.immunity, ...(shared ? { slug: shared } : {}) } : null;
    let next = immunity ? withoutSentence(plan, immunity.raw) : plan;
    for (const sentence of read.also ?? []) next = withoutSentence(next, sentence);
    const unread = [...read.unread];
    if (immunity) {
        const saves = savesIn(next);
        // (With no save, its card's own recipient's — not "a creature that begins its turn in the area", Nightmare's Lament's smoke, unless a
        // cast's: the creatures it's cast at.)
        const others = /^(?:A|Any|Each) creatures? (?:that|who|in|within)\b|^Creatures (?:that|who|in|within)\b|\bin the area\b/i.test(immunity.raw) && next.builtin !== "cast-spell";
        if (saves.length) for (const save of saves) save.trigger = { ...(save.trigger ?? { event: "use" }), immunity };
        else if (ALL_DEGREES(immunity.degrees) && !others) next = { ...next, item: { ...(next.item ?? {}), immunity } };
        else unread.push(immunity.raw);
    }
    const notes = unread.filter((sentence) => !(next.notes ?? []).some((note) => holds(note, sentence)));
    if (notes.length) return { ...next, notes: [...(next.notes ?? []), ...notes], partial: true, automation: { ...(next.automation ?? {}), level: "guided" } };
    // (Partial for its immunity alone: no longer.)
    if (plan.partial && !leftIn(next)) {
        const { partial, ...whole } = next;
        return { ...whole, ...(Array.isArray(whole.notes) && !whole.notes.length ? { notes: undefined } : {}), automation: { ...(whole.automation ?? {}), level: "automatic" } };
    }
    return next;
}
