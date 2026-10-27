// What of the weather an item lets its user ignore, through PF2e Automatic Environment Resolution (2026-10-26, its session's contract: core
// 3315048, environment 823a3be): an Effect on the creature flagged `flags["pf2e-automatic-environment-resolution"].weatherIgnores =
// { ignores, source, weapon?, windUpTo? }` for a timed one — Ixamè's Eye's "see clearly through fog and mist for 1 minute; any creature
// concealed only by fog or mist is no longer concealed to you" — and, for one worn or wielded with it always on, scripts/weather.js's
// api.weatherIgnores: Cape of the Open Sky's "the weather (including wind and fog) doesn't affect your movement or vision", Wintershot's
// "When making a Strike with Wintershot, targets do not gain Concealment from the effects of mist or precipitation, and circumstance
// penalties to attacks of up to –2 imparted from strong winds are negated" (that weapon's Strikes only). The keys are the environment
// module's: sight, fog-mist, precipitation, concealment, wind-ranged, wind-movement. Pure.

const WORDS = { one: 1, a: 1, an: 1 };
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
export const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[\/r [^\]]*\]\](?:\{([^}]*)\})?/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?;])\s+(?=[a-zA-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

const FOG = /\bsee clearly through fog and mist\b|\bany creature concealed only by fog or mist is no longer concealed to you\b/i;
// (Goz Mask's "You ignore Concealment caused by fog, smoke, and other obscuring vapors for 1 minute", 2026-10-27: the weather's fog and mist,
// the environment module's; smoke and other vapors — a zone's or a spell's — on the Effect's words, its user's own to ignore: more.)
const VAPORS = /\bYou ignore Concealment caused by fog, smoke, and other obscuring vapors\b/i;
const ALL_WEATHER = /\bthe weather \(including wind and fog\) doesn't affect your movement or vision\b/i;
const STRIKE_CLEAR = /\bWhen making a Strike with [\w' -]+?, targets (?:do not|don't) gain concealment from the effects of mist or precipitation\b/i;
const WIND = /\bcircumstance penalties to attacks (?:of up to [–-](\d+) )?imparted from strong winds are negated\b/i;
const FOR = /\bfor (\d+|one|an?) (round|minute|hour)s?\b/i;

// The text → { ignores, windUpTo?, weapon?: true (that weapon's Strikes), duration?, said } or null.
export function readWeatherIgnores(text) {
    const ignores = new Set();
    const said = [];
    let windUpTo = null;
    let weapon = false;
    let duration = null;
    let more = null;
    for (const sentence of SENTENCES(text)) {
        let read = false;
        if (VAPORS.test(sentence)) {
            ignores.add("fog-mist");
            more = "concealment from smoke and other obscuring vapors too (its own to ignore)";
            read = true;
            const time = FOR.exec(sentence);
            if (time) duration = { mode: "fixed", value: WORDS[time[1].toLowerCase()] ?? Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start" };
        }
        if (FOG.test(sentence)) {
            ignores.add("fog-mist");
            read = true;
            const time = FOR.exec(sentence);
            if (time) duration = { mode: "fixed", value: WORDS[time[1].toLowerCase()] ?? Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start" };
        }
        if (ALL_WEATHER.test(sentence)) {
            for (const key of ["sight", "concealment", "wind-movement"]) ignores.add(key);
            read = true;
        }
        if (STRIKE_CLEAR.test(sentence)) {
            for (const key of ["precipitation", "fog-mist"]) ignores.add(key);
            weapon = true;
            read = true;
        }
        const wind = WIND.exec(sentence);
        if (wind) {
            ignores.add("wind-ranged");
            if (wind[1]) windUpTo = Number(wind[1]);
            read = true;
        }
        if (read) said.push(sentence);
    }
    if (!ignores.size) return null;
    return { ignores: [...ignores], ...(windUpTo ? { windUpTo } : {}), ...(weapon ? { weapon: true } : {}), ...(more ? { more } : {}), ...(duration ? { duration } : {}), said };
}

// In words: "Fog and mist don't hinder its sight", "The weather doesn't hinder its sight or movement".
const KEY_WORDS = { sight: "sight penalties", "fog-mist": "fog and mist", precipitation: "rain and snow concealing targets", concealment: "concealment", "wind-ranged": "wind penalties to ranged attacks", "wind-movement": "wind on its movement" };
export function weatherText(entry) {
    const words = entry.ignores.map((key) => KEY_WORDS[key] ?? key);
    return `Ignores the weather's ${words.join(", ")}${entry.windUpTo ? ` (wind penalties up to –${entry.windUpTo})` : ""}${entry.more ? `; ${entry.more}` : ""}`;
}

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
// (What else its sentence says, Ixamè's Eye's Hide and Sneak: the GM's, a note.)
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|check|DC|Strike|Speed|Hit Points|damage|condition|Hide|Sneak|hidden|undetected)\b/i;

// The plan, its (activation's or consumable's) html → the plan with plan.weatherIgnores (the item card's Effect for the environment
// module), its sentences no longer notes; an item worn or wielded with it always on is scripts/weather.js's, not a plan's.
export function withWeatherIgnores(plan, html) {
    if (!plan || plan.builtin || !plan.resolution) return plan;
    const body = plainOf(html).replace(/^.*?\b(?:Activate\b[^.]*?\b(?:Envision|Interact|command)\b\.?|Effect\b)\s*/s, "");
    const read = readWeatherIgnores(body);
    if (!read || read.weapon || !read.duration) return plan;
    const { said: sentences, ...entry } = read;
    const gone = (note) => sentences.some((sentence) => said(note).includes(sentence.replace(/[.;]$/, "")) || sentence.includes(said(note).replace(/[.;]$/, "")));
    const notes = (plan.notes ?? []).filter((note) => !gone(note));
    const unread = (plan.unread ?? []).filter((note) => !gone(note));
    // (Its other sentences that say a rule: Ixamè's Eye's "If such a creature was relying on the concealment to Hide or Sneak, …".)
    const others = SENTENCES(body).filter((sentence) => !sentences.includes(sentence) && RULE.test(sentence) && /\bconcealment\b|\bconcealed\b/i.test(sentence));
    // (Those are the GM's — whether a creature hid by the fog alone — so the plan stays partial for them.)
    const next = { ...plan, weatherIgnores: entry, notes: [...notes, ...others.filter((sentence) => !notes.includes(sentence))], ...(plan.unread ? { unread } : {}), ...(others.length ? { partial: true, automation: { ...(plan.automation ?? {}), level: "guided" } } : {}) };
    if (!next.notes.length) delete next.notes;
    return next;
}

// An item's passive text (before its activations) → its ignores while worn or wielded: { ignores, windUpTo?, weapon? } or null.
export function passiveWeatherOf(text) {
    const passive = String(text ?? "").split(/\bActivat(?:e|ion)\b/)[0];
    const read = readWeatherIgnores(passive);
    if (!read || read.duration) return null;
    const { said, ...entry } = read;
    return entry;
}
