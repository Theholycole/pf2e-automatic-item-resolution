// A creature an item becomes, linked to its PF2e stat block: Wondrous Figurine (Onyx Dog)'s "This simple onyx statue transforms into a
// @UUID[…]{Guard Dog} … remains in its form for up to 6 hours", Golden Lions' "it becomes a pair of adult @UUID[…]{Lions}", Fossil
// Fragments' "this fragment becomes a @UUID[…]{Giant Mosquito} when activated. It can be called upon once per day for up to 10 minutes"
// (with "the construct and earth traits"), Beetle Gel's "transforms into a @UUID[…]{Flash Beetle} … It remains in this beetle form for 10
// minutes", Marvelous Miniature (Horse)'s "uses all the statistics of a @UUID[…]{Riding Horse}". The ability module's conjure builtin: the
// creature's token beside its user, on their side, gone at 0 Hit Points (it reverts) and when its time is up; a minion takes no turns of its
// own (its user commands it). What else it says — when it can be used again, what it can't do — the card's notes. Pure.

// (A third-party module's short form too, "Compendium.pf2e.pathfinder-monster-core.<id>": a bestiary's, its Actor.)
const LINK = String.raw`@UUID\[(Compendium\.[\w.-]+\.Actor\.[A-Za-z0-9]+|Compendium\.pf2e\.(?:pathfinder-monster-core(?:-2)?|pathfinder-bestiary(?:-2|-3)?)\.[A-Za-z0-9]{16})\]\{([^}]+)\}`;
const fullUuid = (uuid) => (/\.Actor\./.test(uuid) ? uuid : uuid.replace(/\.([A-Za-z0-9]{16})$/, ".Actor.$1"));
// "transforms into a @UUID…", "becomes a pair of adult @UUID…", "turns into a @UUID…", "becomes a fully grown @UUID…", "with the statistics
// of a @UUID…", "uses all the statistics of a @UUID…".
const BECOMES = new RegExp(String.raw`\b(?:becomes|transforms? into|turns into|(?:with|uses all) the statistics of|causing)( a pair of)? (?:an? )?(?:[\w-]+ ){0,3}?${LINK}`, "i");
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
    // (A fragment naming its creature without a link, Fossil Fragment (Petrified Wood)'s "becomes an awakened tree when activated": found
    // by that name in the compendiums.)
    const named = BECOMES.exec(text) ? null : /\bthis [\w ]+? becomes an? ([a-z][a-z ]+?) when activated\b/i.exec(text);
    const becomes = BECOMES.exec(text) ?? (named && /^Fossil Fragment\b/.test(String(item?.name ?? base?.source?.name ?? "")) ? Object.assign([named[0], undefined, `name:${named[1]}`, named[1].replace(/\b\w/g, (letter) => letter.toUpperCase())], { index: named.index }) : null);
    if (!becomes) return null;
    // (A creature's stat block: not a vehicle, Marvelous Miniature (Boat)'s Cutter, nor a hazard, Dirt Sea in a Jar's quicksand.)
    if (/\.(?:vehicles|hazards)\./.test(becomes[2])) return null;
    // (Not one its hit makes, Viper Arrow's "After an activated viper arrow hits a target, the arrow transforms into a … Viper": the
    // activation comes before the Strike.)
    if (/\bhits an? (?:target|creature)\b[^.]*$/i.test(plainOf(text.slice(0, becomes.index)))) return null;
    const count = becomes[1] ? 2 : 1;
    const name = count > 1 ? singular(becomes[3]) : becomes[3];
    const whole = plainOf(item?.system?.description?.value ?? text);
    // (Not one that "ignores your commands", Ruby Hippopotamus's: it takes its own turns — as does one made to appear and attack, a third-party
    // vial's swarm.)
    const own = /\bignores your commands\b/i.test(whole);
    const appears = /^causing\b/i.test(becomes[0]) && /\bto appear\b/i.test(text.slice(becomes.index, becomes.index + becomes[0].length + 20));
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
        creatures: [{ name, count, size: null, stats: null, from: becomes[2].startsWith("name:") ? { name } : { uuid: fullUuid(becomes[2]) }, traits, initiative: own || appears ? "roll" : null }],
        max: count,
        lasts,
        vanishAtZero: true,
        notes
    };
}

// A creature an item lets out whose numbers its own text gives, not a stat block it links (Team+ Alchemists' Bottle-O-Ooze grades, a
// thrown bottle that swells into an ooze of the grade's size and stays put for its minute; their Canopic Canisters, a smashed jar whose
// zombie lasts a few rounds and Strikes beside its user each turn): the conjured token with that AC and those Hit Points, its saves the
// item's level when the text says so; the rest — its grab, its Strike, its immunities — the card's notes for the GM.
const SIZES = { tiny: "tiny", small: "small", medium: "medium", large: "large", huge: "huge", gargantuan: "gargantuan" };
const STATS = /\bAC (\d+); HP (\d+)\b/;
const SWELLS = /\bexpands into an? (tiny|small|medium|large|huge|gargantuan) sized (\w+) and holds its position for (\d+) (minutes?|rounds?)\b/i;
const LETS_OUT = /\bsmashed releases an? (\w+)\./i;
export function statedCreaturePlan(html, base, item) {
    const text = String(html ?? "");
    const plain = plainOf(text);
    const stats = STATS.exec(plain);
    if (!stats) return null;
    const level = Number(item?.system?.level?.value) || 0;
    const time = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
    const swells = SWELLS.exec(plain);
    if (swells) {
        const big = ["large", "huge", "gargantuan"].includes(swells[1].toLowerCase());
        const grab = /@Check\[reflex\|dc:(\d+)/i.exec(text)?.[1] ?? /\bCheck\[reflex\|dc:(\d+)/i.exec(text)?.[1];
        const defenses = /\bImmunities ([^;]+); Resistances ([^;]+); Weaknesses ([^.]+?)(?: Craft Requirements\b|$)/i.exec(plain);
        const saves = /\bsave modifier equal to its item level\b/i.test(plain) ? { fortitude: level, reflex: level, will: level } : null;
        return {
            ...base,
            builtin: "conjure",
            automation: { level: "guided" },
            targeting: { target: "self", range: null, area: null },
            trigger: { event: "use" },
            creatures: [{ name: `${swells[2].charAt(0).toUpperCase()}${swells[2].slice(1).toLowerCase()}`, count: 1, size: SIZES[swells[1].toLowerCase()], stats: { ac: Number(stats[1]), hp: Number(stats[2]), ...(saves ? { saves } : {}), speeds: { land: 0 } }, from: null, traits: [swells[2].toLowerCase()], initiative: null }],
            max: 1,
            lasts: time(swells[3], swells[4]),
            vanishAtZero: true,
            notes: [
                "It lands where the bottle was thrown: move its token there.",
                "It stays put; its spaces are difficult terrain to move through.",
                ...(big && grab ? [`A creature in its area or moving through its space: a DC ${grab} Reflex save or Grabbed until it Escapes (by hand).`] : []),
                ...(defenses ? [`Its immunities (${defenses[1].trim()}), resistances (${defenses[2].trim()}) and weaknesses (${defenses[3].trim()}) by hand.`] : [])
            ]
        };
    }
    const out = LETS_OUT.exec(plain);
    const lasts = /\blasts for (\d+) (minutes?|rounds?)\b/i.exec(plain.replace(/\blasts for the listed duration\b/i, ""));
    const strike = /\battack roll of \[\[\/r 1d20\+(\d+)\]\](?:\{[^}]*\})? and deals @Damage\[(\d+d\d+)\[(\w+)\]\]/i.exec(text);
    if (out && lasts) {
        const moves = /\bmoves up to (\d+) feet\b/i.exec(plain)?.[1];
        const defenses = /\bImmunities ([^;]+); Weaknesses ([^.]+?)(?: Craft Requirements\b|$)/i.exec(plain);
        return {
            ...base,
            builtin: "conjure",
            automation: { level: "guided" },
            targeting: { target: "self", range: null, area: null },
            trigger: { event: "use" },
            creatures: [{ name: `${out[1].charAt(0).toUpperCase()}${out[1].slice(1).toLowerCase()}`, count: 1, size: "medium", stats: { ac: Number(stats[1]), hp: Number(stats[2]), speeds: { land: Number(moves) || 0 } }, from: null, traits: [out[1].toLowerCase(), ...(/\bconsidered an undead creature\b/i.test(plain) ? ["undead"] : [])], initiative: null }],
            max: 1,
            lasts: time(lasts[1], lasts[2]),
            vanishAtZero: true,
            notes: [
                ...(moves ? [`It moves up to ${moves} feet in a direction of its user's choice, then stays there (move its token).`] : []),
                ...(strike ? [`At the start of each of its user's turns it Strikes an adjacent creature of their choice: +${strike[1]}, ${strike[2]} ${strike[3]} (by hand).`] : []),
                ...(/\bautomatically critically fails any saving throws\b/i.test(plain) ? ["It critically fails every save (by hand)."] : []),
                ...(defenses ? [`Its immunities (${defenses[1].trim()}) and weaknesses (${defenses[2].trim()}) by hand.`] : [])
            ]
        };
    }
    return null;
}
