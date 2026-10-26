// Protection from temperature (2026-10-25, the user's: items that interact with temperature work through PF2e Automatic Environment
// Resolution). An item's words → { counts, fatigueHours?, said } in the environment module's shape, agreed with its session:
// counts maps the temperature a creature feels (the core's TEMPERATURES keys: incredible-cold … normal … incredible-heat) to the one it
// counts as. Cooling Elixir's "protected from the effects of severe heat … also protected from extreme heat" is
// { "severe-heat": "mild-heat", "extreme-heat": "mild-heat" }; Warming Parka's negated severe cold and steps down from extreme and
// incredible, { "severe-cold": "mild-cold", "extreme-cold": "severe-cold", "incredible-cold": "extreme-cold" }; Traveler's Cloak's 2 hours
// more before fatigue, fatigueHours. The environment module reads it from an Effect's flags (a consumable's or an activation's, for its
// time: scripts/live.js) and from api.temperatureProtections(actor) (what its items do while worn, held or invested:
// scripts/temperature.js). Pure.

export const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";
const SIDE_KEYS = {
    cold: ["normal", "mild-cold", "severe-cold", "extreme-cold", "incredible-cold"],
    heat: ["normal", "mild-heat", "severe-heat", "extreme-heat", "incredible-heat"]
};
const STEP = { mild: 1, minor: 1, severe: 2, extreme: 3, incredible: 4 };
const keyOf = (side, step) => SIDE_KEYS[side][Math.max(0, Math.min(4, step))];
const LEVEL = "(?:mild|minor|severe|extreme|incredible)";
const LEVELS = `${LEVEL}(?:(?:,? (?:and|or)|,) ${LEVEL})*`;
const levelsIn = (words) => [...String(words).toLowerCase().matchAll(new RegExp(LEVEL, "g"))].map(([word]) => STEP[word]);

// (Not a protection: "The cloak offers no protection from extreme or incredible cold", "isn't powerful enough to reduce", an affliction's
// stage, the item's own material.)
const NOT = /\b(?:no protection|isn't powerful enough|has no effect at|doesn't protect|does not protect|but not)\b|\bStage \d\b|\b(?:the forge|the material|the metal|the ice)\b/i;

// Protected (or immune) from these levels of a side: each counts as mild — or, with mild itself protected, as normal (Environmental
// Endurance's own reading of "protected": severe and extreme to mild).
// (Protected from extreme cold is from severe too, Living Mantle (Greater)'s "no effects from extreme cold": every damaging level up to
// the harshest it names.)
function protect(counts, side, listed) {
    const steps = new Set(listed);
    for (let step = 2; step <= Math.max(...listed); step++) steps.add(step);
    const lowest = Math.min(...steps);
    for (const step of steps) counts[keyOf(side, step)] = keyOf(side, lowest <= 1 ? 0 : 1);
}

// "protected from the effects of severe heat", "protects you from the effects of severe cold", "also protects against extreme cold",
// "immune to minor and severe cold", "protection from severe cold and heat", "immunity to the effects of mild and severe cold temperatures",
// "protected from mild, severe, and extreme environmental heat", "rendering them immune to severe cold and heat".
const PROTECTED = new RegExp(String.raw`\b(?:protect(?:ed|s|ion)?|immun(?:e|ity))(?: you)? (?:to|from|against) (?:the )?(?:effects? of )?(?:environmental )?(${LEVELS}) (?:environmental )?(heat|cold)(?: (?:and|or) (heat|cold))?\b`, "gi");
// "You don't take damage from extreme heat or severe heat", "You also suffer no effects from extreme cold and severe heat": level and side
// each time.
const PAIRS = new RegExp(String.raw`\b(?:don't take damage from|suffer no effects from)\s+((?:${LEVEL} (?:heat|cold)(?:,? (?:and|or) )?)+)`, "gi");
// "negates the damage you would take from severe environmental cold", "negate the damage from severe environmental heat".
const NEGATES = /\bnegates? (?:the |any )?damage (?:you would take |you take )?from severe (?:environmental )?(heat|cold)\b/gi;
// "reduces the damage you take from extreme cold to that of severe cold", "reduce the damage from extreme heat to that of severe heat",
// "reduces damage you take from extreme cold to equal that of severe cold", "reduce the damage from incredible cold to extreme cold".
const REDUCES = new RegExp(String.raw`\breduces? (?:the )?damage (?:you take |you would take )?from (${LEVEL}) (?:environmental )?(heat|cold) to (?:equal )?(?:that of )?(?:particularly )?(${LEVEL}) (?:heat|cold)\b`, "gi");
// "you treat extreme cold as severe cold".
const TREATS = new RegExp(String.raw`\btreat (${LEVEL}) (heat|cold) as (${LEVEL}) (?:heat|cold)\b`, "gi");
// "reduces the effects of severe heat by one step to mild heat, and reduces extreme heat to severe heat".
const STEPS_DOWN = new RegExp(String.raw`\breduces (?:the effects of )?(${LEVEL}) (heat|cold) (?:by one step )?to (${LEVEL}) (?:heat|cold)\b`, "gi");
// "you treat the effects of environmental cold as one degree lower".
const ONE_LOWER = /\btreat the effects of environmental (heat|cold) as one (?:degree|step) lower\b/gi;
// "While exposed to incredible heat, you take only minor heat damage every hour, instead of moderate heat damage every minute": severe's.
const ONLY_MINOR = new RegExp(String.raw`\bWhile exposed to (${LEVEL}) (heat|cold), you (?:only take|take only) minor (?:heat|cold) damage every hour\b`, "gi");
// "you ignore all environmental effects due to temperature"; "immune to the effects of temperatures ranging from extreme cold to extreme heat";
// "survive comfortably … in severe or extreme cold or heat".
const ALL = /\bignore all environmental effects due to temperature\b/i;
const RANGING = new RegExp(String.raw`\bimmune to the effects of temperatures ranging from (${LEVEL}) cold to (${LEVEL}) heat\b`, "i");
const SURVIVE = new RegExp(String.raw`\bsurvive comfortably\b[^.]*?\bin (${LEVELS}) (heat|cold)(?: (?:and|or) (heat|cold))?\b`, "i");
// "increase the time it takes to become Fatigued from temperature effects by 2 hours" (and "no effect at extreme or incredible
// temperatures": upTo, the harshest step it still works at).
const FATIGUE = /\bincrease the time it takes to become Fatigued from temperature effects by (\d+) hours?\b/i;
const FATIGUE_LIMIT = new RegExp(String.raw`\bhas no effect at (${LEVELS}) temperatures\b`, "i");

const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
// (Its plain words: links as their labels, HTML gone.)
export const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@\w+\[[^\]]*\]/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// The plain text → { counts, fatigueHours?, fatigueUpTo?, said } or null. choose: "heat" | "cold" when the text lets its user pick one
// (Slithermaw's Bane's "severe and extreme heat or severe and extreme cold (your choice …)").
export function readTemperature(text, { choose = null } = {}) {
    const counts = {};
    const said = [];
    let fatigueHours = null;
    let fatigueUpTo = null;
    let choice = null;
    const chosen = (side) => !choose || side === choose;
    for (const sentence of SENTENCES(text)) {
        // ("A traveler's cloak has no effect at extreme or incredible temperatures": its fatigue's limit, not a protection.)
        const limit = FATIGUE_LIMIT.exec(sentence);
        if (limit) {
            fatigueUpTo = Math.min(...levelsIn(limit[1])) - 1;
            said.push(sentence);
            continue;
        }
        if (NOT.test(sentence) && !/\bbut not\b/i.test(sentence)) continue;
        // ("severe and extreme heat or severe and extreme cold (your choice when you activate this ability)": one side, its user's pick.)
        const either = new RegExp(String.raw`\b(${LEVELS}) (heat|cold) or (${LEVELS}) (heat|cold) \(your choice\b`, "i").exec(sentence);
        if (either && !choose) {
            choice = { [either[2].toLowerCase()]: {}, [either[4].toLowerCase()]: {} };
            protect(choice[either[2].toLowerCase()], either[2].toLowerCase(), levelsIn(either[1]));
            protect(choice[either[4].toLowerCase()], either[4].toLowerCase(), levelsIn(either[3]));
            said.push(sentence);
            continue;
        }
        const before = JSON.stringify(counts);
        for (const match of sentence.matchAll(PROTECTED)) {
            const steps = levelsIn(match[1]);
            for (const side of [match[2], match[3]].filter(Boolean).map((side) => side.toLowerCase())) if (chosen(side)) protect(counts, side, steps);
        }
        for (const match of sentence.matchAll(PAIRS)) {
            for (const [, level, side] of match[1].toLowerCase().matchAll(new RegExp(`(${LEVEL}) (heat|cold)`, "g"))) if (chosen(side)) protect(counts, side, [STEP[level]]);
        }
        for (const match of sentence.matchAll(NEGATES)) if (chosen(match[1].toLowerCase())) counts[keyOf(match[1].toLowerCase(), 2)] = keyOf(match[1].toLowerCase(), 1);
        for (const pattern of [REDUCES, TREATS, STEPS_DOWN]) {
            for (const match of sentence.matchAll(pattern)) {
                const side = match[2].toLowerCase();
                if (chosen(side) && STEP[match[3].toLowerCase()] < STEP[match[1].toLowerCase()]) counts[keyOf(side, STEP[match[1].toLowerCase()])] = keyOf(side, STEP[match[3].toLowerCase()]);
            }
        }
        for (const match of sentence.matchAll(ONE_LOWER)) {
            const side = match[1].toLowerCase();
            if (chosen(side)) for (let step = 1; step <= 4; step++) counts[keyOf(side, step)] ??= keyOf(side, step - 1);
        }
        for (const match of sentence.matchAll(ONLY_MINOR)) if (chosen(match[2].toLowerCase())) counts[keyOf(match[2].toLowerCase(), STEP[match[1].toLowerCase()])] = keyOf(match[2].toLowerCase(), 2);
        if (ALL.test(sentence)) for (const side of ["cold", "heat"]) for (let step = 1; step <= 4; step++) counts[keyOf(side, step)] = "normal";
        const ranging = RANGING.exec(sentence);
        if (ranging) {
            for (let step = 1; step <= STEP[ranging[1].toLowerCase()]; step++) counts[keyOf("cold", step)] = "normal";
            for (let step = 1; step <= STEP[ranging[2].toLowerCase()]; step++) counts[keyOf("heat", step)] = "normal";
        }
        const survive = SURVIVE.exec(sentence);
        if (survive) for (const side of [survive[2], survive[3]].filter(Boolean).map((side) => side.toLowerCase())) if (chosen(side)) protect(counts, side, levelsIn(survive[1]));
        const fatigue = FATIGUE.exec(sentence);
        if (fatigue) fatigueHours = Number(fatigue[1]);
        if (JSON.stringify(counts) !== before || fatigue) said.push(sentence);
    }
    if (!Object.keys(counts).length && !fatigueHours && !choice) return null;
    return { counts, ...(fatigueHours ? { fatigueHours } : {}), ...(Number.isFinite(fatigueUpTo) ? { fatigueUpTo } : {}), ...(choice ? { choice } : {}), said };
}

// An item's passive words: its text before its first Activate block, without its Craft Requirements.
export const passiveOf = (text) => String(text ?? "").split(/\bActivat(?:e|ion)\b\s*(?:[—–-]|\d|\(|Interact|command|envision|\[)/)[0].replace(/\s*\bCraft Requirements\b.*$/s, "");

// Its time, when it's a consumable's or an activation's: "For 24 hours", "for 8 hours after applying", "For 7 days", "for 1 hour", "For
// the next 8 hours" → the plan's duration; null when it says none.
// (Witch's Finger's "For 1 hour, you have cold resistance 3, and for 8 hours, the treat negates …": the time nearest before its protection.)
const TIME = /\b[Ff]or (?:the next )?(\d+|one|an?) (minutes?|hours?|days?)\b/g;
const PROTECTS = /\b(?:protect|immun|negates?|treat|reduces?|don't take|suffer no)/i;
export function temperatureDuration(text, said = []) {
    const words = { one: 1, a: 1, an: 1 };
    const nearest = (sentence) => {
        const at = sentence.search(PROTECTS);
        const times = [...sentence.matchAll(TIME)];
        return times.filter((time) => at < 0 || time.index < at).at(-1) ?? times[0] ?? null;
    };
    const found = (said.length ? said : []).map(nearest).find(Boolean) ?? nearest(String(text ?? ""));
    if (!found) return null;
    const value = words[found[1].toLowerCase()] ?? Number(found[1]);
    const unit = found[2].toLowerCase().replace(/s?$/, "s");
    return unit === "days" ? { mode: "fixed", value: value * 24, unit: "hours", expiry: "turn-start" } : { mode: "fixed", value, unit, expiry: "turn-start" };
}

// Whose it is and when (an item's passive words): "While wearing", "So long as you are wearing", "As long as it's invested", "When you hold
// … in your hand", "While holding", "While wielded", "While active" (on only after its activation, scripts/temperature.js) — else the item's
// own way of being used (PF2e's isEquipped and isInvested).
export function whileOf(text) {
    const plain = String(text ?? "");
    if (/\bWhile (?:it's |the [\w' -]+ is )?active\b|\bWhen the machine is active\b/i.test(plain)) return "active";
    if (/\bWhile (?:holding|wielded|you hold)\b|\bWhen you hold\b/i.test(plain)) return "held";
    if (/\b(?:As|So) long as (?:it's|it is|the [\w' -]+ (?:is|are)) invested\b/i.test(plain)) return "invested";
    return "equipped";
}

// An aura's: "You and allies within the banner's aura" (the banner's own Aura rule's radius), "giving all creatures within 15 feet".
export function auraOf(text, rules = []) {
    const plain = String(text ?? "");
    const within = /\b(?:all )?creatures within (\d+) feet\b/i.exec(plain);
    if (within && /\bimmunity to the effects of\b|\bprotect/i.test(plain)) return { radius: Number(within[1]), who: "all" };
    if (/\b(?:you and )?allies within the [\w' -]+?(?:'s)? aura\b/i.test(plain)) {
        const aura = (rules ?? []).find((rule) => rule?.key === "Aura" && Number.isFinite(Number(rule.radius)));
        return { radius: aura ? Number(aura.radius) : 30, who: "allies", self: /\bYou and allies\b/i.test(plain) };
    }
    return null;
}

// (The environment module's flag on an Effect: what the creature with it feels.)
export function temperatureFlag(reading, source) {
    return { counts: reading.counts, ...(reading.fatigueHours ? { fatigueHours: reading.fatigueHours } : {}), source };
}

// A protection's line on the card: "Severe heat counts as mild heat; extreme heat counts as mild heat", "2 more hours before fatigue".
export function temperatureText(reading) {
    const words = (key) => key.replace("-", " ");
    const counts = Object.entries(reading.counts ?? {}).map(([from, to]) => `${words(from).replace(/^./, (letter) => letter.toUpperCase())} counts as ${words(to)}`);
    return [...counts, ...(reading.fatigueHours ? [`${reading.fatigueHours} more hours before travel fatigue`] : [])].join("; ");
}

// A consumable's or an activation's plan with its protection (plan.temperature { counts, fatigueHours?, duration, only? }): the item card's
// own Effect on its recipient, flagged for the environment module (scripts/live.js). A plan that read nothing else becomes the item card's;
// one side its user picks (Slithermaw's Bane) a ways card, a way for each; the protection's sentences no longer left over.
// ("drinking this elixir while in mountainous terrain": only, a line on the card.)
const ONLY = /\bwhile (?:you are )?in ([a-z ]+?) terrain\b/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
// (Its other rule sentences — Slithermaw's Bane's difficult terrain and saves in the chosen environment — notes, the plan partial.)
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|terrain|condition|damage|action|reaction)\b/i;
function ownPlan(base, temperature, notes = []) {
    return { ...base, builtin: undefined, noteOnly: undefined, automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, temperature, ...(notes.length ? { notes, partial: true } : {}) };
}
const UNTIL = /\buntil your next daily preparations?\b/i;
// (A sentence that says more than its protection — Elixir of the Peaks' saves against high altitude — stays left over.)
const OTHER = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|Fatigued|Stride|Climb|Jump)\b/i;
const PATTERNS = () => [PROTECTED, PAIRS, NEGATES, REDUCES, TREATS, STEPS_DOWN, ONE_LOWER, ONLY_MINOR];
const onlyProtection = (sentence) => !OTHER.test(PATTERNS().reduce((rest, pattern) => rest.replace(new RegExp(pattern.source, "gi"), " "), sentence).replace(TIME, " "));
function withoutSaid(plan, all) {
    const sentences = all.filter(onlyProtection);
    const read = (entry) => !entry?.reminder && sentences.some((sentence) => said(entry).includes(sentence.replace(/\.$/, "")) || sentence.includes(said(entry).replace(/\.$/, "")));
    const notes = (plan.notes ?? []).filter((note) => !read(note));
    const unread = (plan.unread ?? []).filter((line) => !read(line));
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row ? { ...row, ...(row.noteEffects ? { noteEffects: row.noteEffects.filter((note) => !read(note)) } : {}), ...(row.manualInstructions ? { manualInstructions: row.manualInstructions.filter((line) => !read(line)) } : {}) } : row]));
    const result = { ...plan, notes: notes.length ? notes : undefined, unread: unread.length ? unread : undefined, ...(plan.resolution?.outcomes ? { resolution: { ...plan.resolution, outcomes } } : {}) };
    const left = [...notes, ...unread, ...Object.values(outcomes).flatMap((row) => [...(row?.manualInstructions ?? [])])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
export function withTemperature(plan, html, base) {
    const text = plainOf(html);
    const reading = readTemperature(text);
    // (Not an aura — Glowing Lantern Fruit's planted fruit, the creatures within 15 feet of it: not its user's own protection.)
    if (!reading || plan?.temperature || auraOf(reading.said.join(" "))) return plan;
    const duration = temperatureDuration(text, reading.said);
    const only = ONLY.exec(reading.said.join(" "))?.[1];
    const until = UNTIL.test(text) ? "Until its user's next daily preparations" : null;
    const of = (counts) => ({ counts, ...(reading.fatigueHours ? { fatigueHours: reading.fatigueHours } : {}), duration, ...(only ? { only: `Only drunk while in ${only} terrain` } : {}), ...(until && !duration ? { until } : {}) });
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    // (What else it says, when nothing else read it: notes.)
    const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const others = SENTENCES(body).filter((sentence) => !reading.said.includes(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence) && !UNTIL.test(sentence));
    if (reading.choice) {
        if (!empty) return plan;
        const ways = Object.entries(reading.choice).map(([side, counts]) => ({ name: side === "heat" ? "Heat" : "Cold", plan: ownPlan(base, of(counts), others) }));
        return { ...base, builtin: "ways", once: true, automation: { level: others.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(others.length ? { notes: others, partial: true } : {}) };
    }
    if (empty) return withoutSaid(ownPlan(base, of(reading.counts), others), reading.said);
    if (plan.builtin) return plan;
    return withoutSaid({ ...plan, temperature: of(reading.counts) }, reading.said);
}
