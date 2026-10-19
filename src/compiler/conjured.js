// A creature an item becomes, linked to its PF2e stat block: Wondrous Figurine (Onyx Dog)'s "This simple onyx statue transforms into a
// @UUID[…]{Guard Dog} … remains in its form for up to 6 hours", Golden Lions' "it becomes a pair of adult @UUID[…]{Lions}", Fossil
// Fragments' "this fragment becomes a @UUID[…]{Giant Mosquito} when activated. It can be called upon once per day for up to 10 minutes"
// (with "the construct and earth traits"), Beetle Gel's "transforms into a @UUID[…]{Flash Beetle} … It remains in this beetle form for 10
// minutes", Marvelous Miniature (Horse)'s "uses all the statistics of a @UUID[…]{Riding Horse}". The ability module's conjure builtin: the
// creature's token beside its user, on their side, gone at 0 Hit Points (it reverts) and when its time is up; a minion takes no turns of its
// own (its user commands it). What else it says — when it can be used again, what it can't do — the card's notes. Pure.

const LINK = String.raw`@UUID\[(Compendium\.[\w.-]+\.Actor\.[A-Za-z0-9]+)\]\{([^}]+)\}`;
// "transforms into a @UUID…", "becomes a pair of adult @UUID…", "turns into a @UUID…", "becomes a fully grown @UUID…", "with the statistics
// of a @UUID…", "uses all the statistics of a @UUID…".
const BECOMES = new RegExp(String.raw`\b(?:becomes|transforms? into|turns into|(?:with|uses all) the statistics of)( a pair of)? (?:an? )?(?:[\w-]+ ){0,3}?${LINK}`, "i");
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds", hour: "hours", hours: "hours" };
const plainOf = (html) => String(html ?? "")
    .replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/@Check\[flat\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $1 flat check")
    .replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $2 $1")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const singular = (name) => (/(?:ss|us)$/i.test(name) ? name : name.replace(/ies$/i, "y").replace(/(?<=[^s])s$/i, ""));

// Its time: "for up to 10 minutes", "for no more than 1 hour", "remains in its form for up to 6 hours", "is active for 1 minute", "remains in
// this beetle form for 10 minutes", "remains for 24 hours", "obeys your spoken commands for up to 1 hour", "After 8 hours, it reverts" — not
// another time it gives, Bismuth Leopards' "Dazzled for 1 round".
function lastsOf(plain) {
    const said = /\b(?:remains?|remain in|active|called (?:up)?on|commands|used)\b[^.]*?\bfor (?:up to |no more than )?(\d+) (minutes?|rounds?|hours?)\b|\bAfter (\d+) (minutes?|hours?), it reverts\b/i.exec(plain);
    return said ? { mode: "fixed", value: Number(said[1] ?? said[3]), unit: UNITS[(said[2] ?? said[4]).toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : null;
}

// The activation's html (or the item's), its base, the item (its activation's block as its description), the whole item's html → the
// conjure plan, or null.
export function conjuredPlan(html, base, item, wholeHtml = null) {
    const text = String(html ?? "");
    const becomes = BECOMES.exec(text);
    if (!becomes) return null;
    // (A creature's stat block: not a vehicle, Marvelous Miniature (Boat)'s Cutter, nor a hazard, Dirt Sea in a Jar's quicksand.)
    if (/\.(?:vehicles|hazards)\./.test(becomes[2])) return null;
    // (Not one its hit makes, Viper Arrow's "After an activated viper arrow hits a target, the arrow transforms into a … Viper": the
    // activation comes before the Strike.)
    if (/\bhits an? (?:target|creature)\b[^.]*$/i.test(plainOf(text.slice(0, becomes.index)))) return null;
    const count = becomes[1] ? 2 : 1;
    const name = count > 1 ? singular(becomes[3]) : becomes[3];
    const whole = plainOf(item?.system?.description?.value ?? text);
    // (Not one that "ignores your commands", Ruby Hippopotamus's: it takes its own turns.)
    const own = /\bignores your commands\b/i.test(whole);
    const minion = !own && /\bhas the minion trait\b/i.test(whole);
    // (Fossil Fragments' "it has the construct and earth traits and lacks its normal creature type trait".)
    const added = /\bit has the (\w+) and (\w+) traits\b/i.exec(whole);
    const traits = [...(minion ? ["minion"] : []), ...(added ? [added[1].toLowerCase(), added[2].toLowerCase()] : [])];
    // (Its own entry, after the creature's sentence, for its time: the general text's "for 1 week" is how long until it can be used again.)
    const after = plainOf(text.slice(becomes.index));
    // (In a fight, "If it attempts an attack or otherwise engages in combat, it reverts to statuette form after 1d4 rounds": that, rolled — out
    // of combat it lasts until the GM ends it.)
    const fights = /\bIf it attempts an attack or otherwise engages? in combat, it reverts to [\w ]+? form after \[\[\/gmr (\d+d\d+) #rounds\]\]/i.exec(text.slice(becomes.index));
    // (Or said before its activation, Pyrite Rat's "the rat remains transformed for 1 hour".)
    const lasts = fights ? { mode: "fixed", value: null, unit: "rounds", expiry: "turn-start", anchor: "effect-start", formula: fights[1] } : lastsOf(after) ?? (wholeHtml ? lastsOf(plainOf(wholeHtml).replace(/\bActivat(?:e|ion)\b.*$/s, "")) : null);
    const sentences = after.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(1).map((sentence) => sentence.trim()).filter(Boolean);
    const notes = [
        ...(added && /\black(?:s)? its normal creature type trait\b/i.test(whole) ? [`It has the ${added[1]} and ${added[2]} traits in place of its creature type (remove that by hand).`] : []),
        ...(/\bIt's also immune to ([^.]+)\./i.test(whole) ? [`It's immune to ${/\bIt's also immune to ([^.]+)\./i.exec(whole)[1]} (add by hand).`] : []),
        ...(minion ? ["A minion: it acts when its user commands it (1 action for 2 of its own)."] : []),
        ...(own ? ["It acts on its own: it rolls initiative."] : []),
        ...(fights ? ["Out of combat it lasts 24 hours as a beast of burden or for transport (end it by hand)."] : []),
        ...(lasts?.unit === "hours" ? [`It lasts ${lasts.value} hour${lasts.value === 1 ? "" : "s"}: dismiss it when that's up.`] : []),
        ...sentences.filter((sentence) => !/\bhas the minion trait\.$/i.test(sentence))
    ];
    return {
        ...base,
        builtin: "conjure",
        automation: { level: "guided" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        creatures: [{ name, count, size: null, stats: null, from: { uuid: becomes[2] }, traits, initiative: own ? "roll" : null }],
        max: count,
        lasts,
        vanishAtZero: true,
        notes
    };
}
